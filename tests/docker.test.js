const test = require('node:test');
const assert = require('node:assert/strict');
const { getDockerSnapshot, getDockerLogs } = require('../src/collectors/docker');

test('getDockerSnapshot returns valid schema even if Docker is stopped or missing', async () => {
  const snap = await getDockerSnapshot();
  assert.ok(typeof snap === 'object' && snap !== null);
  assert.ok(typeof snap.available === 'boolean');
  assert.ok(Array.isArray(snap.containers));
  assert.ok(typeof snap.total === 'number');
  assert.ok(typeof snap.running === 'number');
  assert.ok(typeof snap.exited === 'number');
  assert.ok(typeof snap.memoryFormatted === 'string');
});

test('getDockerLogs validates container ID against injection', async () => {
  await assert.rejects(async () => {
    await getDockerLogs('invalid; rm -rf /');
  }, /Invalid container identifier/);
});
