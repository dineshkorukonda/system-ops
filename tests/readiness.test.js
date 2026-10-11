const test = require('node:test');
const assert = require('node:assert/strict');
const { StateStore } = require('../src/core/stateStore');
const { CollectorManager } = require('../src/core/collectorManager');

function fixture(collect = async () => ({ value: 0, source: 'fixture' })) {
  const store = new StateStore();
  const manager = new CollectorManager(store);
  manager.register({ name: 'core', intervalMs: 1000, critical: true, collect });
  return { store, manager };
}

test('readiness distinguishes initialization, collecting and fresh zero-valued data', async () => {
  let finish;
  const { store, manager } = fixture(() => new Promise(resolve => { finish = resolve; }));
  assert.equal(manager.getHealth().ok, false);
  assert.equal(manager.getCollectorHealth('core').status, 'initializing');
  const running = manager.runCollector('core');
  assert.equal(manager.getCollectorHealth('core').status, 'collecting');
  assert.equal(manager.getHealth().ok, false);
  finish({ value: 0, source: 'fixture' });
  await running;
  assert.equal(manager.getHealth().ok, true);
  assert.equal(store.get('core').value, 0);
  assert.equal(manager.getCollectorHealth('core').source, 'fixture');
});

test('freshness expires at a defined boundary and follows interval changes', async () => {
  const { manager, store } = fixture();
  await manager.runCollector('core');
  const successAt = Date.parse(store.get('metadata.collectorStats.core').lastSuccess);
  assert.equal(manager.getHealth(successAt + 15000).ok, true);
  assert.equal(manager.getCollectorHealth('core', successAt + 15001).status, 'stale');
  assert.equal(manager.getHealth(successAt + 15001).ok, false);
  manager.setInterval('core', 30000);
  assert.equal(manager.getHealth(successAt + 15001).ok, true);
});

test('failed collection preserves last good data/time/source and recovery clears the error', async () => {
  let fail = false;
  const { manager, store } = fixture(async () => {
    if (fail) throw new Error('fixture collection failure');
    return { value: 0, source: 'fixture' };
  });
  await manager.runCollector('core');
  const success = manager.getCollectorHealth('core');
  fail = true;
  await manager.runCollector('core');
  const failed = manager.getCollectorHealth('core');
  assert.equal(manager.getHealth().ok, false);
  assert.equal(failed.status, 'error');
  assert.equal(failed.lastSuccess, success.lastSuccess);
  assert.equal(failed.source, success.source);
  assert.equal(failed.lastError, 'fixture collection failure');
  assert.deepEqual(store.get('core'), { value: 0, source: 'fixture' });
  fail = false;
  await manager.runCollector('core');
  assert.equal(manager.getHealth().ok, true);
  assert.equal(manager.getCollectorHealth('core').lastError, null);
});

test('failure payloads do not become successful samples', async () => {
  for (const payload of [null, { error: 'fixture failure' }, { ok: false }, { success: false },
    { available: false }, { unsupported: true }]) {
    const { manager } = fixture(async () => payload);
    const result = await manager.runCollector('core');
    assert.equal(result.success, false);
    assert.equal(manager.getHealth().ok, false);
    assert.equal(manager.getCollectorHealth('core').lastSuccess, null);
    assert.notEqual(manager.getCollectorHealth('core').status, 'healthy');
  }
});

test('optional unavailable/unsupported and disabled critical collectors do not fail readiness', async () => {
  const { manager } = fixture();
  manager.register({ name: 'missing', intervalMs: 1000, collect: async () => ({ available: false }) });
  manager.register({ name: 'unsupported', intervalMs: 1000, collect: async () => ({ unsupported: true }) });
  manager.register({ name: 'disabled', intervalMs: 1000, critical: true, enabled: false, collect: async () => null });
  await manager.runCollector('core');
  await manager.runCollector('missing');
  await manager.runCollector('unsupported');
  const health = manager.getHealth();
  assert.equal(health.ok, true);
  assert.equal(health.collectors.missing.status, 'unavailable');
  assert.equal(health.collectors.unsupported.status, 'unsupported');
  assert.equal(health.collectors.disabled.status, 'disabled');
  assert.equal(health.collectors.disabled.fresh, false);
});

test('a running refresh cannot hide stale previous data', async () => {
  const { manager, store } = fixture();
  await manager.runCollector('core');
  const successAt = Date.parse(store.get('metadata.collectorStats.core').lastSuccess);
  let finish;
  manager.collectors.get('core').collect = () => new Promise(resolve => { finish = resolve; });
  const running = manager.runCollector('core');
  assert.equal(manager.getCollectorHealth('core', successAt + 15001).status, 'stale');
  assert.equal(manager.getHealth(successAt + 15001).ok, false);
  finish({ value: 1 });
  await running;
});

test('no enabled critical collectors cannot assert monitoring readiness', () => {
  const { manager } = fixture();
  manager.collectors.get('core').enabled = false;
  assert.equal(manager.getHealth().ok, false);
});

test('system history records zero utilization and skips unknown metrics without substituting load', () => {
  const store = new StateStore();
  store.recordSystemHistory({ uptime: { cpuPercent: 0, load1m: '3.25' }, memory: { usagePercent: 0 }, swap: { usagePercent: 0 } }, 123);
  store.recordSystemHistory({ uptime: { cpuPercent: null, load1m: '2.00' }, memory: { usagePercent: NaN }, swap: { usagePercent: undefined } }, 456);
  assert.deepEqual(store.history.cpu.getAll(), [{ time: 123, value: 0 }]);
  assert.deepEqual(store.history.ram.getAll(), [{ time: 123, value: 0 }]);
  assert.deepEqual(store.history.swap.getAll(), [{ time: 123, value: 0 }]);
});
