const test = require('node:test');
const assert = require('node:assert/strict');
const { getCapabilities } = require('../src/collectors/capabilities');

test('getCapabilities returns expected capability structure with booleans', async () => {
  const caps = await getCapabilities();
  assert.ok(typeof caps === 'object' && caps !== null);
  assert.ok('docker' in caps, 'docker key present');
  assert.ok('pm2' in caps, 'pm2 key present');
  assert.ok('ollama' in caps, 'ollama key present');
  assert.ok('systemd' in caps, 'systemd key present');
  assert.ok(typeof caps.docker.available === 'boolean', 'docker.available is boolean');
  assert.ok(typeof caps.pm2.available === 'boolean', 'pm2.available is boolean');
  assert.ok(typeof caps.ollama.available === 'boolean', 'ollama.available is boolean');
  assert.ok(typeof caps.systemd.available === 'boolean', 'systemd.available is boolean');
});
