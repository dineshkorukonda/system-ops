const test = require('node:test');
const assert = require('node:assert/strict');
const { socketExists, DOCKER_SOCKET } = require('../src/utils/dockerExec');

test('socketExists returns boolean without throwing', () => {
  const result = socketExists();
  assert.strictEqual(typeof result, 'boolean');
});

test('DOCKER_SOCKET defaults to standard path', () => {
  assert.ok(DOCKER_SOCKET.includes('docker.sock'));
});
