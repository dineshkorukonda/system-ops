const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore, BoundedHistory } = require('../src/core/stateStore');
const { CollectorManager } = require('../src/core/collectorManager');
const { sampleProcesses, parseProcStat, parseProcStatus } = require('../src/collectors/processCollector');

test('BoundedHistory - maintains max size and evicts oldest items', () => {
  const history = new BoundedHistory(5);
  for (let i = 1; i <= 10; i++) {
    history.push(i);
  }
  assert.strictEqual(history.length, 5);
  assert.deepStrictEqual(history.getAll(), [6, 7, 8, 9, 10]);
});

test('StateStore - sets and retrieves nested keys and diagnostics', () => {
  const store = new StateStore();
  store.set('system', { uptime: 100 }, { durationMs: 12, status: 'healthy' });
  store.set('ollama.status', { active: true });

  assert.deepStrictEqual(store.get('system'), { uptime: 100 });
  assert.deepStrictEqual(store.get('ollama.status'), { active: true });

  const diag = store.getDiagnostics();
  assert.ok(diag.systemOpsMemory);
  assert.ok(diag.systemOpsMemory.rssBytes > 0);
  assert.ok(diag.collectorStats.system);
  assert.strictEqual(diag.collectorStats.system.executions, 1);
  assert.strictEqual(diag.collectorStats.system.status, 'healthy');
});

test('CollectorManager - prevents overlapping executions and isolates errors', async () => {
  const store = new StateStore();
  const manager = new CollectorManager(store);

  let runCount = 0;
  let resolveSlow;
  const slowPromise = new Promise(resolve => { resolveSlow = resolve; });

  manager.register({
    name: 'slowCollector',
    stateKey: 'slow',
    intervalMs: 1000,
    collect: async () => {
      runCount++;
      await slowPromise;
      return { ok: true };
    }
  });

  // Start first run (will hang until resolveSlow is called)
  const run1 = manager.runCollector('slowCollector');

  // Attempt concurrent second run
  const run2 = await manager.runCollector('slowCollector');
  assert.strictEqual(run2.skipped, true);
  assert.strictEqual(run2.reason, 'Already running');

  // Complete first run
  resolveSlow();
  const res1 = await run1;
  assert.strictEqual(res1.success, true);
  assert.strictEqual(runCount, 1);

  // Test error isolation
  manager.register({
    name: 'failingCollector',
    stateKey: 'fail',
    intervalMs: 1000,
    collect: async () => {
      throw new Error('Simulated hardware/network failure');
    }
  });

  const failRes = await manager.runCollector('failingCollector');
  assert.strictEqual(failRes.success, false);
  assert.strictEqual(failRes.error, 'Simulated hardware/network failure');
  assert.strictEqual(store.get('metadata.collectorStats.fail.status'), 'error');
});

test('ProcessCollector - parseProcStat correctly parses process name with spaces and parens', () => {
  const statLine = '1234 (Web Content (1)) S 1000 1234 1000 0 -1 4194304 100 0 0 0 50 25 0 0 20 0 1 0 500000 1234567 500';
  const parsed = parseProcStat(statLine);
  assert.ok(parsed);
  assert.strictEqual(parsed.pid, 1234);
  assert.strictEqual(parsed.comm, 'Web Content (1)');
  assert.strictEqual(parsed.state, 'S');
  assert.strictEqual(parsed.ppid, 1000);
  assert.strictEqual(parsed.utime, 50);
  assert.strictEqual(parsed.stime, 25);
});
