const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runtimeInventory, mergePm2Config, readOnlyPolicy } = require('../scripts/setup-runtime-discovery');
const fs = require('node:fs');

function fixture({ unsafe = false } = {}) {
  const sockets = new Set(['/root/.pm2/rpc.sock', '/home/dinesh/.pm2/rpc.sock', '/var/run/docker.sock', '/run/user/1000/docker.sock']);
  const executables = new Set(['/root/.nvm/versions/node/v24.0.0/bin/pm2', '/root/.nvm/versions/node/v24.0.0/bin/node', '/home/dinesh/.volta/bin/pm2', '/home/dinesh/.volta/bin/node', '/usr/bin/docker', '/home/ops/untrusted-pm2']);
  return {
    realpathSync: target => target,
    accessSync(target) { if (!executables.has(target)) throw Object.assign(new Error(), { code: 'ENOENT' }); },
    statSync(target) {
      const uid = target.startsWith('/home/dinesh') ? 1000 : target.startsWith('/home/ops') ? 1001 : 0;
      return { uid, mode: unsafe && target.startsWith('/root/.nvm') ? 0o777 : 0o755, isSocket: () => sockets.has(target) };
    },
    readdirSync(target) { if (target === '/root/.nvm/versions/node') return ['v24.0.0']; throw new Error('Not found'); },
  };
}
const accounts = [{ user: 'root', uid: 0, home: '/root' }, { user: 'dinesh', uid: 1000, home: '/home/dinesh' }, { user: 'ops', uid: 1001, home: '/home/ops' }];

test('root setup finds root and dinesh daemons, NVM/Volta binaries and rootless Docker sockets without launching CLIs', () => {
  const inventory = runtimeInventory({ accounts, io: fixture() });
  assert.deepEqual(inventory.users.map(entry => entry.user), ['root', 'dinesh']);
  assert.equal(inventory.users[0].nodeDir, '/root/.nvm/versions/node/v24.0.0/bin');
  assert.equal(inventory.users[1].binary, '/home/dinesh/.volta/bin/pm2');
  assert.ok(inventory.dockerSockets.includes('/run/user/1000/docker.sock'));
  assert.equal(inventory.dockerBinary, '/usr/bin/docker');
  assert.deepEqual(inventory.issues, []);
});

test('automatic privileged config rejects a service-user-controlled or writable PM2 binary', () => {
  const inventory = runtimeInventory({ accounts, env: { PM2_PATH_ROOT: '/home/ops/untrusted-pm2' }, io: fixture({ unsafe: true }) });
  assert.deepEqual(inventory.users.map(entry => entry.user), ['dinesh']);
  assert.match(inventory.issues[0], /root:.*safely owned binary/);
});

test('a service-owned symlink to a trusted root binary cannot authorize later root execution', () => {
  const fake = fixture({ unsafe: true });
  fake.realpathSync = target => target === '/home/ops/untrusted-pm2' ? '/usr/bin/docker' : target;
  const inventory = runtimeInventory({ accounts, env: { PM2_PATH_ROOT: '/home/ops/untrusted-pm2' }, io: fake });
  assert.ok(!inventory.users.some(entry => entry.user === 'root'));
});

test('existing explicit PM2 configuration is preserved when automatic accounts are added', () => {
  const existing = '# operator config\ndinesh|/custom/home|/custom/pm2|/custom/node\n';
  const merged = mergePm2Config(existing, runtimeInventory({ accounts, io: fixture() }).users);
  assert.ok(merged.includes('dinesh|/custom/home|/custom/pm2|/custom/node'));
  assert.equal(merged.match(/dinesh\|/g).length, 1);
  assert.match(merged, /root\|\/root\/.pm2\|/);
});

test('generated Docker permission is confined to read-only commands on observed sockets', () => {
  const policy = readOnlyPolicy('ops', runtimeInventory({ accounts, io: fixture() }));
  assert.ok(policy.includes('/usr/bin/docker --host unix\\:///var/run/docker.sock ps *'));
  assert.ok(policy.includes('/usr/bin/docker --host unix\\:///run/user/1000/docker.sock logs *'));
  assert.ok(!/docker \*|prune|exec |start |stop |rm /.test(policy));
  assert.throws(() => readOnlyPolicy('ops ALL', {}), /Invalid service account/);
});

test('native sudoers parser accepts generated runtime policy', { skip: process.platform !== 'linux' || !fs.existsSync('/usr/sbin/visudo') }, t => {
  const os = require('node:os'), path = require('node:path');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-policy-syntax-'));
  const filename = path.join(scratch, 'policy');
  t.after(() => { fs.unlinkSync(filename); fs.rmdirSync(scratch); });
  fs.writeFileSync(filename, readOnlyPolicy('ops', runtimeInventory({ accounts, io: fixture() })));
  require('node:child_process').execFileSync('/usr/sbin/visudo', ['-cf', filename]);
});
