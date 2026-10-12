// Superpowers PM2 discovery plugin
// This file moves the existing PM2 collector logic into a Superpowers skill.

const { runCommand } = require('../../../../src/utils/exec');
const { formatBytes } = require('../../../../src/utils/formatters');
const path = require('path');
const fs = require('fs');

/** Format uptime in milliseconds into a readable string. */
function formatUptime(uptimeMs) {
  if (!uptimeMs || uptimeMs <= 0) return 'N/A';
  const totalSeconds = Math.floor((Date.now() - uptimeMs) / 1000);
  if (totalSeconds < 0) return 'Just started';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${mins}m`);
  return parts.join(' ');
}

// In‑memory cache for PM2 binary paths per user
const pm2BinaryCache = {};
const PM2_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const os = require('node:os');
const { collectionSignal } = require('../../../../src/core/collectionContext');
const userHome = user => process.env['PM2_HOME_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_')] ||
  (user === os.userInfo().username && process.env.PM2_HOME) ||
  path.join(accountHome(user), '.pm2');
function accountHome(user) {
  try {
    const entry = fs.readFileSync('/etc/passwd', 'utf8').split('\n').find(line => line.split(':')[0] === user);
    if (entry) return entry.split(':')[5];
  } catch {}
  return user === 'root' ? '/root' : `/home/${user}`;
}
function validUser(user) { return typeof user === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(user); }
const helper = (user, action, args = [], timeout = 5000) => runCommand('sudo', ['-n', '/usr/local/libexec/system-ops/pm2-read', user, action, ...args], timeout);
const probeDaemon = user => user === os.userInfo().username
  ? asUser(user, 'test', ['-S', path.join(userHome(user), 'rpc.sock')], 1000) : helper(user, 'probe', [], 1000);
async function asUser(user, file, args, timeoutMs) {
  collectionSignal()?.throwIfAborted();
  if (user === os.userInfo().username) return runCommand(file, args, timeoutMs);
  return runCommand('sudo', ['-n', '-H', '-u', user, file, ...args], timeoutMs);
}
async function runPm2Command(user, pm2Path, subCommand, extraArgs = [], timeoutMs = 10000) {
  if (!validUser(user) || typeof pm2Path !== 'string' || !path.isAbsolute(pm2Path) || pm2Path.includes('\0') || !['jlist', 'logs'].includes(subCommand)) {
    return { success: false, stdout: '', stderr: 'Invalid PM2 command configuration' };
  }
  if (user !== os.userInfo().username) return helper(user, subCommand, extraArgs.map(String), timeoutMs);
  const binDir = path.dirname(pm2Path);
  const prefix = pm2Path.includes('/lib/node_modules/') ? pm2Path.split('/lib/node_modules/')[0] + '/bin:' : '';
  return asUser(user, 'env', [`PATH=${prefix}${binDir}:${process.env.PATH || '/usr/bin:/bin'}`,
    `PM2_HOME=${userHome(user)}`, pm2Path, subCommand, ...extraArgs.map(String)], timeoutMs);
}
async function resolvePm2Binary(user) {
  const cached = pm2BinaryCache[user];
  if (cached && Date.now() - cached.ts < (cached.path ? PM2_CACHE_TTL_MS : 60000)) return cached.path;
  if (user !== os.userInfo().username) {
    const result = await helper(user, 'binary', [], 1000);
    if (!result.success) throw new Error(result.stderr || 'Cross-user PM2 helper is not configured');
    const binary = result.stdout.trim();
    if (!path.isAbsolute(binary)) throw new Error('Invalid PM2 helper binary path');
    pm2BinaryCache[user] = { path: binary, ts: Date.now() }; return binary;
  }
  const variable = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const explicit = process.env[variable] || (user === 'root' ? process.env.PM2_PATH : null);
  if (explicit) {
    if (!path.isAbsolute(explicit) || explicit.includes('\0')) throw new Error(`${variable} must be an absolute binary path`);
    pm2BinaryCache[user] = { path: explicit, ts: Date.now() }; return explicit;
  }
  // One cached login-shell lookup handles NVM/Volta/custom account homes without
  // invoking PM2 (which would otherwise start a daemon during discovery).
  const which = await asUser(user, 'bash', ['--noprofile', '-lc', 'command -v pm2'], 2000);
  const candidate = which.success ? which.stdout.trim().split('\n').at(-1) : null;
  if (candidate && path.isAbsolute(candidate)) { pm2BinaryCache[user] = { path: candidate, ts: Date.now() }; return candidate; }
  const home = accountHome(user);
  const candidates = ['/usr/local/bin/pm2', '/usr/bin/pm2', '/opt/node/bin/pm2', path.join(home, '.volta/bin/pm2'), path.join(home, '.npm-global/bin/pm2')];
  try {
    for (const version of fs.readdirSync(path.join(home, '.nvm/versions/node')).slice(-10).reverse()) candidates.push(path.join(home, '.nvm/versions/node', version, 'bin/pm2'));
  } catch {}
  for (const binary of candidates) {
    const exists = await asUser(user, 'test', ['-x', binary], 1000);
    if (exists.success) { pm2BinaryCache[user] = { path: binary, ts: Date.now() }; return binary; }
  }
  pm2BinaryCache[user] = { path: null, ts: Date.now() }; return null;
}
function getPm2Users() {
  const users = new Set((process.env.PM2_USERS || '').split(',').map(user => user.trim()).filter(validUser));
  try {
    for (const entry of fs.readFileSync('/etc/passwd', 'utf8').split('\n')) {
      const [user, , uid, , , home] = entry.split(':');
      if (validUser(user) && (user === 'root' || Number(uid) >= 1000) && home && fs.existsSync(path.join(home, '.pm2'))) users.add(user);
    }
  } catch {}
  if (process.env.PM2_HOME) users.add(os.userInfo().username);
  try {
    for (const entry of fs.readFileSync('/etc/system-ops/pm2-monitor.conf', 'utf8').split('\n')) {
      const user = entry.split('|')[0]; if (validUser(user)) users.add(user);
    }
  } catch {}
  return [...users].slice(0, 16);
}
function getPm2DiscoveryPaths() {
  const paths = getPm2Users().flatMap(user => [userHome(user), process.env['PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_')]]).filter(Boolean);
  try {
    const config = '/etc/system-ops/pm2-monitor.conf';
    if (fs.statSync(config).size <= 65536) for (const line of fs.readFileSync(config, 'utf8').split('\n').slice(0, 64)) {
      const [user, home, binary] = line.split('|');
      if (validUser(user)) paths.push(home, binary);
    }
  } catch {}
  return [...new Set(paths.filter(value => value && path.isAbsolute(value)))].slice(0, 32);
}
async function getPm2UserProcesses(user) {
  if (!validUser(user)) return { user, processes: [], error: 'Invalid user name', pm2Path: null };
  try {
    const home = userHome(user);
    const socket = await probeDaemon(user);
    if (!socket.success) return { user, pm2Home: home, processes: [], pm2Path: null,
      error: socket.stderr || 'PM2 daemon socket is absent or inaccessible; monitoring will not start a daemon.' };
    const pm2Path = await resolvePm2Binary(user);
    if (!pm2Path) return { user, pm2Home: home, processes: [], pm2Path: null, error: 'PM2 binary not found; configure PM2_PATH_' + user.toUpperCase() };
    const res = await runPm2Command(user, pm2Path, 'jlist', [], 5000);
    if (!res.success) return { user, processes: [], pm2Path, pm2Home: home, error: res.stderr || 'PM2 collection failed' };
    return { ...parsePm2Json(user, res.stdout), pm2Path, pm2Home: home };
  } catch (error) { return { user, processes: [], pm2Path: null, error: error.message }; }
}
/** Parse JSON output from `pm2 jlist`. */
function parsePm2Json(user, raw) {
  try {
    const trimmed = (raw || '').trim();
    if (!trimmed) return { user, processes: [], error: 'Empty output from PM2' };
    const first = trimmed.indexOf('[');
    const last = trimmed.lastIndexOf(']');
    if (first === -1 || last === -1 || last <= first) return { user, processes: [], error: 'Unexpected PM2 output format' };
    const json = trimmed.slice(first, last + 1);
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return { user, processes: [], error: 'PM2 output is not an array' };
    if (arr.length > 500 || arr.some(p => !p || typeof p !== 'object')) throw new Error('PM2 process list exceeds the supported schema');
    const processes = arr.map(p => {
      const mon = p.monit || {};
      const env = p.pm2_env || {};
      const mem = mon.memory || 0;
      const uptime = env.pm_uptime || 0;
      return {
        name: p.name || 'unnamed',
        pm_id: p.pm_id !== undefined ? p.pm_id : null,
        pid: p.pid || null,
        status: env.status || 'unknown',
        cpu: mon.cpu !== undefined ? mon.cpu : 0,
        memory: mem,
        memoryFormatted: mem > 0 ? formatBytes(mem) : '0 B',
        formattedMemory: mem > 0 ? formatBytes(mem) : '0 B',
        restart_time: env.restart_time || 0,
        unstable_restarts: env.unstable_restarts || 0,
        uptime,
        uptimeText: formatUptime(uptime),
        user
      };
    });
    return { user, processes, error: null };
  } catch (e) {
    return { user, processes: [], error: `JSON Parse error: ${e.message}` };
  }
}

/** Aggregate snapshot across all discovered users. */
async function collectPm2Snapshot({ userNames = getPm2Users(), collectUser = getPm2UserProcesses } = {}) {
  const results = [];
  for (const user of userNames) { collectionSignal()?.throwIfAborted(); results.push(await collectUser(user)); }

  // activeUsers: those with processes running OR binary confirmed (no error)
  const activeUsers = results.filter(
    (r) => (r.processes && r.processes.length > 0) || (r.pm2Path && !r.error)
  );

  let totalProcesses = 0, onlineCount = 0, errorCount = 0, totalMemory = 0;
  for (const r of results) {
    (r.processes || []).forEach(p => {
      totalProcesses++;
      if (p.status === 'online') onlineCount++;
      if (p.status === 'errored' || p.status === 'stopped') errorCount++;
      totalMemory += p.memory || 0;
    });
  }

  return {
    totalProcesses,
    onlineCount,
    errorCount,
    totalMemory,
    totalMemoryFormatted: formatBytes(totalMemory),
    // `users` keeps backward-compat: only users with active processes/binary
    users: activeUsers,
    // `allUsers` exposes every discovered user including those with errors
    allUsers: results,
    // raw count of PM2 home dirs/env users found (even if binary resolution failed)
    detectedUserCount: userNames.length,
    incomplete: results.some(result => result.error),
    failedUserCount: results.filter(result => result.error).length,
    source: 'pm2:per-user-cli',
  };
}

/** Fetch PM2 logs for a given app. */
async function getPm2Logs(user, appName, lines = 100) {
  if (!user || !/^[a-zA-Z0-9_-]+$/.test(user)) {
    return { user, app: appName, lines, output: '', error: 'Invalid user name' };
  }
  if (!appName || !/^[a-zA-Z0-9_.-]+$/.test(appName)) {
    return { user, app: appName, lines, output: '', error: 'Invalid application name' };
  }
  const sanitized = Math.min(Math.max(parseInt(lines, 10) || 100, 1), 1000);
  const socket = await probeDaemon(user);
  if (!socket.success) return { user, app: appName, output: '', error: 'PM2 daemon is absent or inaccessible' };
  const pm2Path = await resolvePm2Binary(user);
  if (!pm2Path) {
    const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return { user, app: appName, lines: sanitized, output: '', error: `PM2 binary not found. Set ${envVarName} in .env.` };
  }
  const res = await runPm2Command(user, pm2Path, 'logs', [appName, '--nostream', '--lines', String(sanitized)], 14000);
  if (!res.success && !res.stdout) {
    const err = res.stderr || '';
    const msg = err.includes('password is required') || err.includes('terminal is required')
      ? `Sudo password required for user '${user}'.`
      : (err || 'Failed to fetch PM2 logs');
    return { user, app: appName, lines: sanitized, output: '', error: msg };
  }
  return { user, app: appName, lines: sanitized, output: res.stdout || res.stderr || 'No log lines returned.' };
}

/** Invalidate cache (optional external use). */
function clearPm2Cache(user) {
  if (user) delete pm2BinaryCache[user]; else Object.keys(pm2BinaryCache).forEach(k => delete pm2BinaryCache[k]);
}

module.exports = {
  collectPm2Snapshot,
  getPm2Logs,
  getPm2Users,
  getPm2DiscoveryPaths,
  clearPm2Cache,
  runPm2Command,
  parsePm2Json,
  getPm2UserProcesses,
};
