const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

function updateRule(root, user) {
  if (!/^\/[A-Za-z0-9_./-]+$/.test(root) || path.posix.normalize(root) !== root || root === '/') throw new Error('Invalid install directory for sudoers');
  if (!/^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(user)) throw new Error('Invalid service account for sudoers');
  return `# Managed dashboard updater permission; other sudo rules are preserved.\n${user} ALL=(root:root) NOPASSWD: /usr/bin/bash ${root}/scripts/deploy.sh --background\n`;
}

function installUpdatePermissions({ root, user = 'ops', destination = '/etc/sudoers.d/system-ops-update', execute = execFileSync }) {
  const rule = updateRule(root, user);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'system-ops-sudoers-'));
  const candidate = path.join(scratch, 'policy');
  const next = path.join(path.dirname(destination), `.system-ops-update-${path.basename(scratch)}`);
  try {
    fs.writeFileSync(candidate, rule, { mode: 0o600 });
    execute('/usr/sbin/visudo', ['-cf', candidate], { stdio: 'inherit' });
    execute('/usr/bin/install', ['-o', 'root', '-g', 'root', '-m', '0440', candidate, next], { stdio: 'inherit' });
    fs.renameSync(next, destination);
  } finally {
    if (fs.existsSync(next)) fs.unlinkSync(next);
    if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
    fs.rmdirSync(scratch);
  }
}

if (require.main === module) {
  try {
    if (process.platform !== 'linux' || process.getuid() !== 0) throw new Error('Run this helper as root on Linux');
    const root = fs.realpathSync(process.env.INSTALL_DIR || path.join(__dirname, '..'));
    installUpdatePermissions({ root, user: process.env.OPS_USER || 'ops' });
    console.log('Dashboard update permission installed.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { updateRule, installUpdatePermissions };
