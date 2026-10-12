const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { once } = require('node:events');
const { stateStore } = require('../src/core/stateStore');
const { collectorManager } = require('../src/core/collectorManager');

let server;
let base;
const headers = { Authorization: 'Bearer fixture-health-api-password' };
const request = (route, options = {}) => fetch(`${base}${route}`, { ...options, signal: AbortSignal.timeout(5000) });

test('optional snapshot viewers cannot start a disabled collector', async () => {
  let calls = 0;
  collectorManager.register({ name: 'docker', enabled: false, collect: async () => ({ count: ++calls }) });
  stateStore.state.docker = null;
  for (let i = 0; i < 5; i++) {
    const response = await request('/api/v2/docker/snapshot', { headers });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.disabled, true);
    assert.equal(data.collection.status, 'disabled');
  }
  assert.equal(calls, 0);
});

test('PM2 partial inventory stays explicit without hiding disabled or failed collector state', async t => {
  const col = collectorManager.collectors.get('pm2');
  const previous = { enabled: col.enabled, cached: stateStore.state.pm2 };
  t.after(() => { col.enabled = previous.enabled; stateStore.state.pm2 = previous.cached; });
  col.enabled = true;
  stateStore.set('pm2', { incomplete: true, totalProcesses: 2, allUsers: [{ user: 'root', error: 'denied' }] }, { status: 'healthy', source: 'fixture' });
  let data = await (await request('/api/v2/pm2/snapshot', { headers })).json();
  assert.equal(data.collection.status, 'partial'); assert.equal(data.collection.fresh, false);
  col.enabled = false;
  data = await (await request('/api/v2/pm2/snapshot', { headers })).json();
  assert.equal(data.collection.status, 'disabled');
  col.enabled = true;
  stateStore.set('pm2', stateStore.get('pm2'), { status: 'error', error: 'fixture runtime failure' });
  data = await (await request('/api/v2/pm2/snapshot', { headers })).json();
  assert.equal(data.collection.status, 'error'); assert.equal(data.collection.lastError, 'fixture runtime failure');
});

before(async () => {
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_GO_COLLECTOR = 'false';
  process.env.APP_PASSWORD = 'fixture-health-api-password';
  process.env.SESSION_SECRET = 'fixture-health-api-secret';
  process.env.PORT = String(port);
  process.env.HOST = '127.0.0.1';
  ({ server } = require('../src/server'));
  if (!server.listening) await once(server, 'listening');
  base = `http://127.0.0.1:${port}`;
});

beforeEach(() => {
  stateStore.state.metadata.collectorStats = {};
  stateStore.state.system = null;
  stateStore.state.processes = null;
});

after(async () => {
  collectorManager.stopAll();
  await new Promise(resolve => server.close(resolve));
});

function readySamples() {
  stateStore.set('system', { uptime: { cpuPercent: 0 }, memory: { usagePercent: 0 } }, { status: 'healthy', source: 'fixture' });
  stateStore.set('processes', { processes: [], total: 0 }, { status: 'healthy', source: 'fixture' });
}

test('liveness remains OK while initial readiness returns minimal 503', async () => {
  for (const route of ['/health', '/api/health']) {
    const response = await request(route);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  }
  const ready = await request('/ready');
  assert.equal(ready.status, 503);
  assert.equal(ready.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await ready.json(), { ok: false });
  assert.equal((await request('/api/v2/ops/health')).status, 401);
});

test('critical failure/staleness/recovery changes readiness without exposing private errors', async () => {
  readySamples();
  assert.equal((await request('/ready')).status, 200);
  stateStore.set('system', stateStore.get('system'), { status: 'error', error: 'private-fixture-error' });
  const notReady = await request('/ready');
  assert.equal(notReady.status, 503);
  assert.deepEqual(await notReady.json(), { ok: false });
  const details = await (await request('/api/v2/ops/health', { headers })).json();
  assert.equal(details.collectors.system.lastError, 'private-fixture-error');
  assert.equal(details.collectors.system.source, 'fixture');
  readySamples();
  stateStore.get('metadata.collectorStats.system').lastSuccess = new Date(Date.now() - 60000).toISOString();
  assert.equal((await request('/ready')).status, 503);
  readySamples();
  assert.equal((await request('/ready')).status, 200);
});

test('cached system snapshot returns failure provenance with last good zero metrics', async () => {
  readySamples();
  const success = stateStore.get('metadata.collectorStats.system').lastSuccess;
  stateStore.set('system', stateStore.get('system'), { status: 'error', error: 'fixture failure' });
  const response = await request('/api/v2/system/snapshot', { headers });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.uptime.cpuPercent, 0);
  assert.equal(data.collection.lastSuccess, success);
  assert.equal(data.collection.fresh, false);
  assert.equal(data.collection.status, 'error');
  assert.equal(data.monitoringHealth.ok, false);
});

test('a failed initial system collection returns 503 with no manufactured snapshot', async t => {
  const col = collectorManager.collectors.get('system');
  const previous = col.collect;
  t.after(() => { col.collect = previous; });
  col.collect = async () => ({ error: 'fixture startup failure' });
  const response = await request('/api/v2/system/snapshot', { headers });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.collection.lastSuccess, null);
  assert.equal(data.collection.status, 'error');
  assert.equal(data.memory, undefined);
});

test('a failed initial process collection returns 503 rather than a successful empty list', async t => {
  const col = collectorManager.collectors.get('processes');
  const previous = col.collect;
  t.after(() => { col.collect = previous; });
  col.collect = async () => ({ available: false, error: 'fixture process backend unavailable', processes: [] });
  const response = await request('/api/v2/system/processes', { headers });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.collection.lastSuccess, null);
  assert.equal(data.collection.status, 'unavailable');
  assert.equal(data.processes, undefined);
});
