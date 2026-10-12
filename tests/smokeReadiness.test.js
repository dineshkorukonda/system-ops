const { test } = require('node:test');
const assert = require('node:assert/strict');
const { waitForSystemSnapshot } = require('../scripts/smoke-readiness');
const healthy = { memory: {}, uptime: {}, collection: { status: 'healthy', lastSuccess: new Date().toISOString(), source: 'fixture' } };
const response = (status, data) => ({ status, json: async () => data });

test('production smoke waits for the first sample after HTTP liveness', async () => {
  let calls = 0;
  const headers = { Cookie: 'fixture-session' };
  const data = await waitForSystemSnapshot(async (route, options) => {
    assert.equal(route, '/api/v2/system/snapshot');
    assert.equal(options.headers, headers);
    assert.ok(options.signal instanceof AbortSignal);
    return ++calls < 3 ? response(503, { collection: { status: 'collecting' } }) : response(200, healthy);
  }, headers, { pollMs: 1 });
  assert.equal(data, healthy);
  assert.equal(calls, 3);
});

test('production smoke bounds an unavailable collector and reports its last state', async () => {
  await assert.rejects(waitForSystemSnapshot(async () => response(503, { collection: { status: 'error' } }), {}, {
    timeoutMs: 20, pollMs: 1,
  }), /did not become healthy.*HTTP 503 \(error\)/);
});

test('production smoke does not accept unauthorized, broken or unhealthy snapshots', async () => {
  for (const status of [401, 500]) {
    await assert.rejects(waitForSystemSnapshot(async () => response(status, {}), {}), new RegExp(`HTTP ${status}`));
  }
  await assert.rejects(waitForSystemSnapshot(async () => response(200, { ...healthy, collection: { status: 'error' } }), {}), /not healthy/);
  await assert.rejects(waitForSystemSnapshot(async () => response(200, {}), {}), /structure missing/);
});
