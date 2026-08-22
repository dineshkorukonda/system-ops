const test = require('node:test');
const assert = require('node:assert');
const { getSystemProcesses } = require('../src/collectors/system');

test('getSystemProcesses returns non-empty processes list', async () => {
  const result = await getSystemProcesses({ limit: 10, sortBy: 'cpu' });
  assert.ok(result);
  assert.ok(Array.isArray(result.processes));
  assert.ok(typeof result.total === 'number');

  if (result.processes.length > 0) {
    const proc = result.processes[0];
    assert.ok(typeof proc.pid === 'number');
    assert.ok(typeof proc.user === 'string');
    assert.ok(typeof proc.cpuPercent === 'number');
    assert.ok(typeof proc.memPercent === 'number');
    assert.ok(typeof proc.formattedRss === 'string');
    assert.ok(typeof proc.command === 'string');
  }
});

test('getSystemProcesses respects memory sorting and limits', async () => {
  const result = await getSystemProcesses({ limit: 5, sortBy: 'mem' });
  assert.ok(result.processes.length <= 5);
});
