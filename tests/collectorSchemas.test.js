const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertSystemSnapshot, assertProcessSnapshot } = require('../src/core/collectorSchemas');
test('system boundary rejects malformed, nonfinite and invalid-unit metrics, accepting unknown CPU', () => {
  const valid = { uptime: { cpuPercent: null }, memory: { totalBytes: 0, usagePercent: 0 } };
  assert.doesNotThrow(() => assertSystemSnapshot(valid));
  assert.throws(() => assertSystemSnapshot({ ...valid, memory: { totalBytes: 0, usagePercent: 101 } }));
  assert.throws(() => assertSystemSnapshot({ ...valid, uptime: { cpuPercent: Infinity } }));
  assert.throws(() => assertSystemSnapshot({ uptime: {} }));
});
test('process boundary rejects invalid rows and unbounded snapshots', () => {
  assert.doesNotThrow(() => assertProcessSnapshot({ processes: [{ pid: 1, rssBytes: 0, cpuPercent: null }] }));
  assert.throws(() => assertProcessSnapshot({ processes: [{ pid: -1, rssBytes: 0 }] }));
  assert.throws(() => assertProcessSnapshot({ processes: new Array(501).fill({ pid: 1, rssBytes: 0 }) }));
});
