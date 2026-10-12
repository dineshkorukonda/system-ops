const { test } = require('node:test');
const assert = require('node:assert/strict');
const { dockerConnection, readNativeInventory } = require('../src/utils/dockerConnection');
const io = sockets => ({ statSync(target) { if (!sockets.includes(target.replaceAll('\\', '/'))) throw new Error('missing'); return { isSocket: () => true }; } });

test('Docker context/host/socket overrides agree with the CLI target', () => {
  assert.deepEqual(dockerConnection({ DOCKER_CONTEXT: 'mine', DOCKER_HOST: 'tcp://host:2376' }).args, ['--context', 'mine']);
  assert.deepEqual(dockerConnection({ DOCKER_HOST: 'tcp://host:2376' }).args, ['--host', 'tcp://host:2376']);
  assert.deepEqual(dockerConnection({ DOCKER_SOCKET: '/custom/docker.sock' }).args, ['--host', 'unix:///custom/docker.sock']);
});

test('rootless and root-owned discovery evidence select the same socket for collection', () => {
  assert.equal(dockerConnection({ XDG_RUNTIME_DIR: '/run/user/1000' }, { io: io(['/run/user/1000/docker.sock']) }).socket.replaceAll('\\', '/'), '/run/user/1000/docker.sock');
  assert.equal(dockerConnection({}, { io: io(['/run/user/1000/docker.sock']), inventory: { dockerSockets: ['/run/user/1000/docker.sock'] } }).target, 'unix:///run/user/1000/docker.sock');
  assert.equal(dockerConnection({ XDG_RUNTIME_DIR: '/missing' }, { io: io(['/var/run/docker.sock']) }).socket, '/var/run/docker.sock');
});

test('untrusted native inventory cannot choose privileged Docker executables or sockets', () => {
  for (const stat of [{ uid: 1001, mode: 0o644, size: 50 }, { uid: 0, mode: 0o666, size: 50 }, { uid: 0, mode: 0o644, size: 100000 }]) {
    assert.deepEqual(readNativeInventory({ statSync: () => stat, readFileSync() { throw new Error('must not read'); } }), {});
  }
});

test('saved Docker contexts are retained unless an explicit endpoint is configured', () => {
  const configIo = { statSync: () => ({ size: 100 }), readFileSync: () => JSON.stringify({ currentContext: 'rootless', auths: {} }) };
  const saved = dockerConnection({}, { io: configIo, inventory: {}, home: '/home/ops' });
  assert.equal(saved.target, 'context:rootless');
  assert.equal(saved.args.at(-1), 'rootless');
  assert.equal(dockerConnection({ DOCKER_SOCKET: '/custom.sock' }, { io: configIo }).target, 'unix:///custom.sock');
});
