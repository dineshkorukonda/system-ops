const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const p = path.posix;
const validUser = user => /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(user || '');
const validPath = value => typeof value === 'string' && /^\/[A-Za-z0-9_./-]+$/.test(value) && p.normalize(value) === value;

// Runs during root-owned native setup, never during dashboard polling. Read
// existing sockets and executables only: do not invoke PM2 or start daemons.
function runtimeInventory({ accounts, env = {}, io = fs, serviceUser = 'ops' }) {
  const executable = target => { try { io.accessSync(target, fs.constants.X_OK); return true; } catch { return false; } };
  const socket = target => { try { return io.statSync(target).isSocket(); } catch { return false; } };
  const trustedPath = (target, uid) => {
    try {
      for (let current of [target, io.realpathSync(target)]) {
        while (true) {
          const stat = io.lstatSync ? io.lstatSync(current) : io.statSync(current);
          if (![0, uid].includes(stat.uid) || (!stat.isSymbolicLink?.() && (stat.mode & 0o022))) return false;
          if (current === '/') break;
          current = p.dirname(current);
        }
      }
      return true;
    } catch { return false; }
  };
  const users = [], issues = [];
  const dockerSockets = new Set(['/var/run/docker.sock', '/run/docker.sock'].filter(socket));
  const explicitUsers = (env.PM2_USERS || '').split(',').map(user => user.trim());
  for (const account of accounts.slice(0, 512)) {
    if (!validUser(account.user) || !validPath(account.home) || !Number.isInteger(account.uid) || account.uid < 0) continue;
    if (socket(`/run/user/${account.uid}/docker.sock`)) dockerSockets.add(`/run/user/${account.uid}/docker.sock`);
    if (!(account.uid === 0 || account.uid >= 1000 || explicitUsers.includes(account.user))) continue;
    const suffix = account.user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const home = env[`PM2_HOME_${suffix}`] || (account.user === serviceUser && env.PM2_HOME) || p.join(account.home, '.pm2');
    if (!validPath(home) || !socket(p.join(home, 'rpc.sock'))) continue;
    let socketOwner;
    try { socketOwner = io.statSync(p.join(home, 'rpc.sock')).uid; } catch { continue; }
    if (socketOwner !== account.uid || !trustedPath(home, account.uid)) {
      issues.push(`${account.user}: PM2 home ownership is unsafe for automatic helper configuration.`); continue;
    }
    const candidates = [env[`PM2_PATH_${suffix}`], env.PM2_PATH, p.join(account.home, '.volta/bin/pm2'), p.join(account.home, '.npm-global/bin/pm2')];
    try {
      for (const version of io.readdirSync(p.join(account.home, '.nvm/versions/node')).sort().slice(-16).reverse()) {
        if (/^[A-Za-z0-9_.-]+$/.test(version)) candidates.push(p.join(account.home, '.nvm/versions/node', version, 'bin/pm2'));
      }
    } catch {}
    candidates.push('/usr/local/bin/pm2', '/usr/bin/pm2', '/opt/node/bin/pm2');
    const binary = candidates.filter(validPath).find(target => executable(target) && trustedPath(target, account.uid));
    if (!binary) { issues.push(`${account.user}: running PM2 socket found, but no safely owned binary. Configure PM2_PATH_${suffix}.`); continue; }
    const nodeDir = [env[`PM2_NODE_DIR_${suffix}`], p.dirname(binary), '/usr/bin', '/usr/local/bin'].filter(validPath).find(dir => executable(p.join(dir, 'node')) && trustedPath(p.join(dir, 'node'), account.uid));
    if (!nodeDir) { issues.push(`${account.user}: Node executable not found for ${binary}.`); continue; }
    users.push({ user: account.user, home, binary, nodeDir });
  }
  const dockerBinary = [env.DOCKER_PATH, '/usr/bin/docker', '/usr/local/bin/docker', '/snap/bin/docker', '/opt/docker/bin/docker'].filter(validPath).find(target => executable(target) && trustedPath(target, 0)) || null;
  if (dockerSockets.size && !dockerBinary) issues.push('Docker sockets found, but no safely owned CLI. Configure DOCKER_PATH for native inventory access.');
  return { users: users.slice(0, 16), dockerSockets: [...dockerSockets].slice(0, 32), dockerBinary, issues };
}

function mergePm2Config(existing, users) {
  const configured = new Set(existing.split('\n').filter(line => !line.startsWith('#')).map(line => line.split('|')[0]));
  return existing.trimEnd() + '\n' + users.filter(entry => !configured.has(entry.user))
    .map(entry => `${entry.user}|${entry.home}|${entry.binary}|${entry.nodeDir}`).join('\n') + '\n';
}

function readOnlyPolicy(user, inventory) {
  if (!validUser(user)) throw new Error('Invalid service account');
  const rules = [`${user} ALL=(root:root) NOPASSWD: /usr/local/libexec/system-ops/pm2-read *`];
  // Only read-only commands against observed local sockets. No Docker mutation
  // permission, arbitrary hosts, or user-selected executables are added.
  if (inventory.dockerBinary && validPath(inventory.dockerBinary)) {
    for (const socket of inventory.dockerSockets.filter(validPath)) {
      for (const command of ['ps', 'network ls', 'stats', 'logs']) {
        rules.push(`${user} ALL=(root:root) NOPASSWD: ${inventory.dockerBinary} --host unix\\:${'//' + socket} ${command} *`);
      }
    }
  }
  return '# Managed native runtime inventory readers\n' + rules.join('\n') + '\n';
}

function writeRootFile(filename, content, mode = 0o644) {
  const next = filename + '.next';
  fs.writeFileSync(next, content, { mode, flush: true });
  fs.chownSync(next, 0, 0); fs.chmodSync(next, mode); fs.renameSync(next, filename);
}

function setupRuntimeDiscovery({ root, user = 'ops', execute = execFileSync }) {
  if (process.platform !== 'linux' || process.getuid() !== 0) throw new Error('Run native runtime discovery setup as root on Linux');
  if (!validPath(root) || !validUser(user)) throw new Error('Invalid native setup configuration');
  const env = require('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const accounts = fs.readFileSync('/etc/passwd', 'utf8').split('\n').map(line => {
    const [user, , uid, , , home] = line.split(':'); return { user, uid: Number(uid), home };
  });
  const inventory = runtimeInventory({ accounts, env, serviceUser: user });
  const configDir = '/etc/system-ops';
  execute('/usr/bin/install', ['-d', '-o', 'root', '-g', 'root', '-m', '0755', configDir, '/usr/local/libexec/system-ops'], { stdio: 'inherit' });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ops-runtime-policy-'));
  const candidate = path.join(scratch, 'policy');
  const policyNext = '/etc/sudoers.d/.system-ops-runtime.next';
  try {
    fs.writeFileSync(candidate, readOnlyPolicy(user, inventory), { mode: 0o600 });
    execute('/usr/sbin/visudo', ['-cf', candidate], { stdio: 'inherit' });
    execute('/usr/bin/install', ['-o', 'root', '-g', 'root', '-m', '0755', path.join(root, 'scripts/pm2-read.sh'), '/usr/local/libexec/system-ops/pm2-read'], { stdio: 'inherit' });
    const config = path.join(configDir, 'pm2-monitor.conf');
    const existing = fs.existsSync(config) ? fs.readFileSync(config, 'utf8') : '# account|PM2_HOME|PM2 binary|Node bin directory\n';
    writeRootFile(config, mergePm2Config(existing, inventory.users));
    writeRootFile(path.join(configDir, 'runtime-discovery.json'), JSON.stringify(inventory));
    execute('/usr/bin/install', ['-o', 'root', '-g', 'root', '-m', '0440', candidate, policyNext], { stdio: 'inherit' });
    fs.renameSync(policyNext, '/etc/sudoers.d/system-ops-runtime');
  } finally {
    if (fs.existsSync(policyNext)) fs.unlinkSync(policyNext);
    fs.unlinkSync(candidate); fs.rmdirSync(scratch);
  }
  return inventory;
}

if (require.main === module) {
  try {
    const root = process.env.INSTALL_DIR || fs.realpathSync(path.join(__dirname, '..'));
    console.log(JSON.stringify(setupRuntimeDiscovery({ root, user: process.env.OPS_USER || 'ops' }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { runtimeInventory, mergePm2Config, readOnlyPolicy, setupRuntimeDiscovery };
