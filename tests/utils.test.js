const test = require('node:test');
const assert = require('node:assert');
const { runCommand } = require('../src/utils/exec');
const { formatBytes } = require('../src/utils/formatters');

test('formatBytes formats byte values correctly', () => {
  assert.strictEqual(formatBytes(0), '0 B');
  assert.strictEqual(formatBytes(null), '0 B');
  assert.strictEqual(formatBytes(500), '500.00 B');
  assert.strictEqual(formatBytes(1024), '1.00 KB');
  assert.strictEqual(formatBytes(1048576), '1.00 MB');
  assert.strictEqual(formatBytes(1073741824), '1.00 GB');
});

test('runCommand executes command and returns stdout', async () => {
  const isWin = process.platform === 'win32';
  const file = isWin ? 'cmd.exe' : 'echo';
  const args = isWin ? ['/c', 'echo', 'hello'] : ['hello'];

  const res = await runCommand(file, args);
  assert.strictEqual(res.success, true);
  assert.ok(res.stdout.includes('hello'));
});
