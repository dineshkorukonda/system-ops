const test = require('node:test');
const assert = require('node:assert/strict');
const { getConfiguredServices, inspectService, getServiceLogs } = require('../src/collectors/services');

test('getConfiguredServices returns array of services from environment or default', () => {
  const services = getConfiguredServices();
  assert.ok(Array.isArray(services));
  assert.ok(services.length > 0);
});

test('inspectService returns structured status object for any service unit', async () => {
  const info = await inspectService('nonexistent_test_unit');
  assert.ok(info.unit.endsWith('.service'));
  assert.strictEqual(typeof info.active, 'boolean');
  assert.strictEqual(typeof info.formattedMemory, 'string');
});

test('getServiceLogs validates invalid service name characters', async () => {
  const result = await getServiceLogs('invalid; rm -rf /; service', 50);
  assert.ok(result.error);
});
