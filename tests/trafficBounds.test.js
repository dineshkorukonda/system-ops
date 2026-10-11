const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IncrementalTrafficEngine } = require('../src/collectors/trafficAnalytics');
const line = (id, host = 'fixture.local') => `${host} 10.0.${Math.floor(id / 256) % 256}.${id % 256} - - [10/Oct/2026:12:00:00 +0000] "GET /${id} HTTP/1.1" 200 128 "-" "agent/${id}"`;

test('incremental reads retain split lines, do not skip complete next lines, and detect rotation/truncation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'traffic-bounds-'));
  const log = path.join(directory, 'access.log');
  const engine = new IncrementalTrafficEngine({ logPaths: [log], resolveDomains: async () => ({}) });
  try {
    const first = line(1); fs.writeFileSync(log, first.slice(0, 50));
    assert.equal((await engine.processLogs()).summary.total_hits, 0);
    fs.appendFileSync(log, first.slice(50) + '\n' + line(2) + '\n');
    assert.equal((await engine.processLogs()).summary.total_hits, 2);
    fs.appendFileSync(log, line(3) + '\n');
    assert.equal((await engine.processLogs()).summary.total_hits, 3);
    fs.renameSync(log, log + '.1'); fs.writeFileSync(log, line(4) + '\n');
    assert.equal((await engine.processLogs()).summary.total_hits, 4);
    fs.writeFileSync(log, ''); await engine.processLogs();
    fs.appendFileSync(log, line(5) + '\n');
    assert.equal((await engine.processLogs()).summary.total_hits, 5);
    assert.equal(engine.counters.rotations, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('high-cardinality state has fixed caps, enrichment is optional, and retention expires', async () => {
  delete process.env.TRACKED_DOMAINS;
  delete process.env.TRAFFIC_PARSE_USER_AGENT;
  let now = 0;
  const engine = new IncrementalTrafficEngine({ now: () => now, windowMs: 1000, logPaths: [], resolveDomains: async () => ({}) });
  const hostRegex = /^(\S+)\s+(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;
  for (let i = 0; i < 30000; i++) engine._parseLine(line(i, `host${i % 100}.local`), hostRegex, /never/, 'fixture.local', {});
  assert.equal(Object.keys(engine.aggregatedState.summary.domains).length, 50);
  assert.ok(engine.aggregatedState.uniqueDevicesGlobal.size <= 5000);
  assert.ok(engine.aggregatedState.endpointMap.size <= 500);
  assert.ok(engine.aggregatedState.ipMap.size <= 500);
  assert.equal(engine.uaCache.size, 0);
  assert.ok(engine.counters.domainLimitHits > 0);
  assert.ok(engine.counters.cardinalityLimitHits > 0);
  now = 1001; await engine.processLogs();
  assert.equal(engine.aggregatedState.uniqueDevicesGlobal.size, 0);
  assert.equal(engine.aggregatedState.summary.total_hits, 0);
});

test('per-cycle bytes/lines and oversized partial lines stay bounded with visible drops', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'traffic-budget-'));
  const log = path.join(directory, 'access.log');
  const engine = new IncrementalTrafficEngine({ maxBytes: 20000, maxLines: 2, logPaths: [log], resolveDomains: async () => ({}) });
  try {
    fs.writeFileSync(log, Array.from({ length: 10 }, (_, i) => line(i) + '\n').join(''));
    let data = await engine.processLogs();
    assert.equal(data.summary.total_hits, 2);
    assert.equal(data.processing.droppedLines, 8);
    fs.appendFileSync(log, 'x'.repeat(10000)); await engine.processLogs();
    assert.ok(engine.fileStates.get(log).pending.length <= 8192);
    fs.appendFileSync(log, '\n' + line(11) + '\n');
    data = await engine.processLogs();
    assert.equal(data.summary.total_hits, 3);
    assert.ok(data.processing.droppedBytes >= 10000);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
