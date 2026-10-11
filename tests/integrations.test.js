const { test } = require('node:test');
const assert = require('node:assert/strict');
const { CollectorManager } = require('../src/core/collectorManager');
const { StateStore } = require('../src/core/stateStore');
const { integrationDefaults, validateIntegrations } = require('../src/core/integrationConfig');

test('optional integration configuration defaults off and rejects unknown or nonboolean keys', () => {
  assert.equal(integrationDefaults({}).docker, false);
  assert.equal(integrationDefaults({ ENABLE_DOCKER: 'true' }).docker, true);
  assert.equal(validateIntegrations({ docker: false }), true);
  assert.equal(validateIntegrations({ docker: 'false' }), false);
  assert.equal(validateIntegrations({ system: false }), false);
});

test('disabled integrations never collect, including manual rescans, and toggles apply without restart', async () => {
  const manager = new CollectorManager(new StateStore());
  let calls = 0;
  manager.register({ name: 'fixture', enabled: false, collect: async () => ({ count: ++calls }) });
  await manager.startAll();
  await manager.rescan('fixture');
  assert.equal(calls, 0);
  manager.setEnabled('fixture', true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  manager.setEnabled('fixture', false);
  assert.equal(manager.timers.size, 0);
  await manager.rescan();
  assert.equal(calls, 1);
  manager.stopAll();
});
