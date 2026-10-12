const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { updateRule, installUpdatePermissions } = require('../scripts/setup-update-permissions');
const { updateLaunchArgs } = require('../src/services/updateService');

test('dashboard sudo permission matches the exact background command and rejects unsafe roots/users', () => {
  const args = updateLaunchArgs('/opt/system-ops/scripts/deploy.sh');
  assert.equal(args[0], '-n');
  assert.equal(updateRule('/opt/system-ops', 'ops').split('\n')[1], `ops ALL=(root:root) NOPASSWD: ${args.slice(1).join(' ')}`);
  assert.match(updateRule('/srv/ops-console', 'monitor'), /monitor ALL=.*\/srv\/ops-console\/scripts\/deploy.sh --background/);
  for (const root of ['/opt/ops\nALL', '/opt/../etc', '/opt/ops *', 'relative', '/']) assert.throws(() => updateRule(root, 'ops'), /Invalid install/);
  for (const user of ['ops ALL', 'ops\nroot', '-ops', 'ops,*']) assert.throws(() => updateRule('/opt/system-ops', user), /Invalid service/);
});

test('sudo rule validation precedes replacement and preserves existing policy on rejection', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-policy-test-'));
  const destination = path.join(dir, 'system-ops-update');
  t.after(() => { fs.unlinkSync(destination); fs.rmdirSync(dir); });
  fs.writeFileSync(destination, 'existing policy');
  assert.throws(() => installUpdatePermissions({ root: '/opt/system-ops', destination, execute(file, args) {
    assert.equal(file, '/usr/sbin/visudo');
    assert.equal(args[0], '-cf');
    assert.match(fs.readFileSync(args[1], 'utf8'), /--background/);
    throw new Error('Invalid sudoers');
  } }), /Invalid sudoers/);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'existing policy');
  const calls = [];
  installUpdatePermissions({ root: '/opt/system-ops', destination, execute(file, args) {
    calls.push(file);
    if (file === '/usr/bin/install') fs.copyFileSync(args.at(-2), args.at(-1));
  } });
  assert.deepEqual(calls, ['/usr/sbin/visudo', '/usr/bin/install']);
  assert.equal(fs.readFileSync(destination, 'utf8'), updateRule('/opt/system-ops', 'ops'));
  assert.deepEqual(fs.readdirSync(dir), ['system-ops-update']);
});
