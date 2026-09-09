const test = require('node:test');
const assert = require('node:assert');

const {
  isNewerVersion,
  getCurrentVersion,
  detectInstallType,
  parseLogOutcome,
  extractLastUpdateSession,
} = require('../src/services/updateService');

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

test('parseLogOutcome detects success and failure from deploy log', () => {
  const success = parseLogOutcome('===\n  Deployment Complete!\n===');
  assert.strictEqual(success.phase, 'success');
  assert.strictEqual(success.needsRefresh, true);

  const failed = parseLogOutcome('ERROR: npm run build failed\nEACCES: permission denied');
  assert.strictEqual(failed.phase, 'failed');
  assert.strictEqual(failed.needsRefresh, false);

  const exitOk = parseLogOutcome('=== Update finished with exit code 0 ===');
  assert.strictEqual(exitOk.phase, 'success');
});

test('parseLogOutcome uses only the last update session in the log', () => {
  const log = [
    '=== Update started at old ===',
    'EACCES: permission denied',
    'ERROR: npm run build failed',
    '=== Update finished with exit code 1 ===',
    '=== Update started at new ===',
    '  Deployment Complete!',
    '=== Update finished with exit code 0 ===',
  ].join('\n');
  assert.strictEqual(parseLogOutcome(log).phase, 'success');
  assert.ok(extractLastUpdateSession(log).includes('Deployment Complete!'));
  assert.ok(!extractLastUpdateSession(log).includes('ERROR: npm run build failed'));
});

test('detectInstallType identifies local dev install', () => {
  const type = detectInstallType();
  assert.ok(['systemd', 'docker', 'unknown'].includes(type));
});

test('fetchLatestFromMain returns version from GitHub package.json', async () => {
  const { fetchLatestFromMain } = require('../src/services/updateService');
  const info = await fetchLatestFromMain();
  assert.ok(info.latest, 'should return a version string');
  assert.ok(/^\d+\.\d+\.\d+/.test(info.latest));
  assert.strictEqual(info.source, 'main-branch');
  assert.ok(info.remoteCommit, 'should include remote commit sha');
});
