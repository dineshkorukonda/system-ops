const test = require('node:test');
const assert = require('node:assert');

const { isNewerVersion, getCurrentVersion, detectInstallType } = require('../src/services/updateService');

test('isNewerVersion compares semver correctly', () => {
  assert.strictEqual(isNewerVersion('2.0.0', '2.1.0'), true);
  assert.strictEqual(isNewerVersion('2.1.0', '2.0.0'), false);
  assert.strictEqual(isNewerVersion('2.0.0', '2.0.0'), false);
  assert.strictEqual(isNewerVersion('1.9.9', '2.0.0'), true);
  assert.strictEqual(isNewerVersion('2.0.0', 'v2.1.0'), true);
});

test('getCurrentVersion reads package.json version', () => {
  const version = getCurrentVersion();
  assert.ok(/^\d+\.\d+\.\d+/.test(version));
});

test('detectInstallType identifies local dev install', () => {
  const type = detectInstallType();
  assert.ok(['systemd', 'docker', 'unknown'].includes(type));
});
