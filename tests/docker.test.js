const test = require('node:test');
const assert = require('node:assert/strict');
const { getDockerSnapshot, getDockerLogs, isValidContainerId } = require('../src/collectors/docker');
const { isPermissionError, buildDockerError } = require('../src/utils/dockerExec');

test('getDockerSnapshot returns valid schema even if Docker is stopped or missing', async () => {
  const snap = await getDockerSnapshot();
  assert.ok(typeof snap === 'object' && snap !== null);
  assert.ok(typeof snap.available === 'boolean');
  assert.ok(typeof snap.daemonReachable === 'boolean');
  assert.ok(typeof snap.permissionIssue === 'boolean');
  assert.ok(Array.isArray(snap.containers));
  assert.ok(Array.isArray(snap.networks));
  assert.ok(typeof snap.total === 'number');
  assert.ok(typeof snap.running === 'number');
  assert.ok(typeof snap.exited === 'number');
  assert.ok(typeof snap.networkCount === 'number');
  assert.ok(typeof snap.memoryFormatted === 'string');
});

test('getDockerLogs validates container ID against injection', async () => {
  await assert.rejects(async () => {
    await getDockerLogs('invalid; rm -rf /');
  }, /Invalid container identifier/);
});

test('isPermissionError detects docker socket permission failures', () => {
  assert.strictEqual(
    isPermissionError({ stderr: 'permission denied while trying to connect to the Docker daemon socket' }),
    true
  );
  assert.strictEqual(
    isPermissionError({ stderr: 'Cannot connect to the Docker daemon' }),
    true
  );
  assert.strictEqual(isPermissionError({ stderr: 'container not found' }), false);
});

test('buildDockerError returns permission hint for denied access', () => {
  const err = buildDockerError({
    stderr: 'permission denied while trying to connect to the docker daemon socket',
  });
  assert.strictEqual(err.permissionIssue, true);
  assert.ok(err.hint.includes('docker group'));
});
