const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const childProcess = require('node:child_process');
const { CollectorManager } = require('../src/core/collectorManager');
const { StateStore } = require('../src/core/stateStore');
const { runCommand } = require('../src/utils/exec');
const { combinedSignal } = require('../src/core/collectionContext');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('deadline kills a real child and prevents overlapping retries until it closes', { timeout: 10000 }, async t => {
  const manager = new CollectorManager(new StateStore());
  let childPid;
  const spawn = childProcess.spawn;
  t.mock.method(childProcess, 'spawn', (...args) => {
    const child = spawn(...args);
    // The OS supplies this immediately, even if Node startup is slower than
    // the collection deadline. Do not depend on the child printing in time.
    childPid = child.pid;
    return child;
  });
  let commandClosed, releaseCollection;
  const closed = new Promise(resolve => { commandClosed = resolve; });
  const release = new Promise(resolve => { releaseCollection = resolve; });
  t.after(() => { releaseCollection(); manager.stopAll(); });
  manager.register({ name: 'child', timeoutMs: 150, collect: async () => {
    const result = await runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 10000);
    commandClosed(result);
    await release;
    return result;
  } });
  try {
    const result = await manager.runCollector('child');
    assert.equal(result.success, false);
    assert.match(result.error, /deadline/);
    const command = await closed;
    assert.equal(command.success, false);
    assert.match(command.stderr, /cancelled/);
    assert.ok(Number.isInteger(childPid) && childPid > 0);
    assert.throws(() => process.kill(childPid, 0));
    assert.equal(manager.active, 1);
    assert.deepEqual(await manager.runCollector('child'), { skipped: true, reason: 'Already running' });
  } finally { releaseCollection(); }
  // Let the held collection settle and the manager release its slot.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(manager.active, 0);
});

test('hanging optional I/O is cancelled and leaves room for critical collection', async () => {
  let connected;
  const connection = new Promise(resolve => { connected = resolve; });
  const sockets = new Set();
  const server = http.createServer((req, res) => connected());
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const manager = new CollectorManager(new StateStore());
  manager.register({ name: 'network', timeoutMs: 1000, collect: async () => {
    await fetch(`http://127.0.0.1:${server.address().port}`, { signal: combinedSignal() });
    return { ok: true };
  } });
  manager.register({ name: 'host', critical: true, collect: async () => ({ ok: true }) });
  manager.register({ name: 'other', collect: async () => ({ ok: true }) });
  try {
    const pending = manager.runCollector('network');
    await connection;
    assert.equal((await manager.runCollector('other')).skipped, true);
    assert.equal((await manager.runCollector('host')).success, true);
    manager.stopAll();
    assert.equal((await pending).success, false);
    await sleep(50);
    assert.equal(manager.active, 0);
  } finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); }
});

test('subprocess output is bounded and killed when it exceeds the limit', async () => {
  const result = await runCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(1024*1024)); setInterval(()=>{},1000)']);
  assert.equal(result.success, false);
  assert.match(result.stderr, /output limit/);
  assert.ok(result.stdout.length <= 256 * 1024);
});
