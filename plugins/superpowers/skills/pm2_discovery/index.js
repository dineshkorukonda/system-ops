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

/** Execute a PM2 command for a user with proper PATH and PM2_HOME. */
async function runPm2Command(user, pm2Path, subCommand, extraArgs = [], timeoutMs = 10000) {
  if (!pm2Path || typeof pm2Path !== 'string') {
    return { success: false, stdout: '', stderr: 'Invalid PM2 path' };
  }
  // Prevent non‑root users from running root binaries
  if (user !== 'root' && pm2Path.startsWith('/root')) {
    return { success: false, stdout: '', stderr: `User '${user}' cannot execute binary in /root` };
  }

  let binDir = path.dirname(pm2Path);
  if (pm2Path.includes('/lib/node_modules/')) {
    const nodeRoot = pm2Path.split('/lib/node_modules/')[0];
    binDir = `${nodeRoot}/bin:${binDir}`;
  }

  const homeDir = user === 'root' ? '/root' : `/home/${user}`;
  const allArgs = [subCommand, ...extraArgs].map(a => `"${a}"`).join(' ');
  const bashScript = `export PATH=\"${binDir}:$PATH\"; export PM2_HOME=\"${homeDir}/.pm2\"; \"${pm2Path}\" ${allArgs}`;
  return await runCommand('sudo', ['-n', '-H', '-u', user, 'bash', '--noprofile', '--norc', '-c', bashScript], timeoutMs);
}

/** Find the PM2 binary for a given user, using cache and discovery steps. */
async function resolvePm2Binary(user) {
  const cached = pm2BinaryCache[user];
  if (cached && (Date.now() - cached.ts) < PM2_CACHE_TTL_MS) {
    const test = await runPm2Command(user, cached.path, 'jlist', [], 3000);
    if (test.success && test.stdout && test.stdout.trim().startsWith('[')) {
      return cached.path;
    }
    delete pm2BinaryCache[user];
  }

  const homeDir = user === 'root' ? '/root' : `/home/${user}`;
  const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const envCandidate = process.env[envVarName] || (user === 'root' ? process.env.PM2_PATH : null);
  if (envCandidate) {
    const test = await runPm2Command(user, envCandidate, 'jlist', [], 4000);
    if (test.success && test.stdout && test.stdout.trim().startsWith('[')) {
      pm2BinaryCache[user] = { path: envCandidate, ts: Date.now() };
      return envCandidate;
    }
  }

  // Systemd unit inspection
  for (const svc of [`pm2-${user}.service`, `pm2-${user}`, 'pm2.service', 'pm2']) {
    try {
      const show = await runCommand('sudo', ['-n', 'systemctl', 'show', svc, '--property=ExecStart'], 3000);
      if (show.success && show.stdout) {
        const m = show.stdout.match(/path=([^\s;]+pm2)/i) || show.stdout.match(/argv\[\]=([^\s;]+pm2)/i);
        if (m && m[1]) {
          const cand = m[1].trim();
          if (user === 'root' || !cand.startsWith('/root')) {
            const test = await runPm2Command(user, cand, 'jlist', [], 4000);
            if (test.success && test.stdout && test.stdout.trim().startsWith('[')) {
              pm2BinaryCache[user] = { path: cand, ts: Date.now() };
              return cand;
            }
          }
        }
      }
    } catch (e) {}
  }

  // Home directory find & NVM fast path (detect NVM/fnm/Volta etc.)
  try {
    const find = await runCommand('sudo', ['-n', 'find', `${homeDir}/.nvm`, homeDir, '-maxdepth', '6', '-name', 'pm2', '-type', 'f'], 4000);
    if (find.success && find.stdout) {
      const paths = find.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const p of paths) {
        if (!p.includes('bin/pm2')) continue;
        if (user !== 'root' && p.startsWith('/root')) continue;
        const test = await runPm2Command(user, p, 'jlist', [], 4000);
        if (test.success && test.stdout && test.stdout.trim().startsWith('[')) {
          pm2BinaryCache[user] = { path: p, ts: Date.now() };
          return p;
        }
      }
    }
  } catch (e) {}

  // Standard system locations
  const std = [
    '/usr/local/bin/pm2',
    '/usr/bin/pm2',
    '/opt/node/bin/pm2',
    '/snap/bin/pm2',
    `${homeDir}/.npm-global/bin/pm2`,
    `${homeDir}/.yarn/bin/pm2`,
    `${homeDir}/.nvm/current/bin/pm2`
  ];
  for (const c of std) {
    const r = await runPm2Command(user, c, 'jlist', [], 3000);
    if (r.success && r.stdout && r.stdout.trim().startsWith('[')) {
      pm2BinaryCache[user] = { path: c, ts: Date.now() };
      return c;
    }
  }

  // Fallback to 'which pm2' in a login shell
  try {
    const which = await runCommand('sudo', ['-n', '-H', '-u', user, 'bash', '--noprofile', '-lc', 'which pm2'], 3000);
    if (which.success && which.stdout && which.stdout.trim().startsWith('/')) {
      const resolved = which.stdout.trim();
      const test = await runPm2Command(user, resolved, 'jlist', [], 4000);
      if (test.success && test.stdout && test.stdout.trim().startsWith('[')) {
        pm2BinaryCache[user] = { path: resolved, ts: Date.now() };
        return resolved;
      }
    }
  } catch (e) {}

  console.warn(`[pm2] No binary found for '${user}'. Set ${envVarName} in .env`);
  return null;
}

/** Discover PM2 users (default deploy and root plus any with ~/.pm2). */
function getPm2Users() {
  const users = new Set(['deploy', 'root']);
  if (process.env.PM2_USERS) {
    process.env.PM2_USERS.split(',').forEach(u => {
      const clean = u.trim();
      if (clean) users.add(clean);
    });
  }
  try {
    if (fs.existsSync('/home')) {
      const dirs = fs.readdirSync('/home');
      for (const d of dirs) {
        if (fs.existsSync(`/home/${d}/.pm2`)) users.add(d);
      }
    }
  } catch (e) {}
  return Array.from(users);
}

/** Fetch PM2 process list for a single user. */
async function getPm2UserProcesses(user) {
  if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
    return { user, processes: [], error: 'Invalid user name format', pm2Path: null };
  }
  const pm2Path = await resolvePm2Binary(user);
  if (!pm2Path) {
    const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return { user, processes: [], error: `PM2 binary not found for '${user}'. Set ${envVarName} in .env.`, pm2Path: null };
  }
  const res = await runPm2Command(user, pm2Path, 'jlist', [], 10000);
  if (!res.success && !res.stdout) {
    delete pm2BinaryCache[user];
    const err = res.stderr || '';
    const msg = err.includes('password is required') || err.includes('terminal is required')
      ? `Sudo password required for user '${user}'. Check /etc/sudoers.d/system-ops.`
      : (err.trim() || `Failed to execute PM2 for user '${user}'`);
    return { user, processes: [], error: msg, pm2Path };
  }
  const parsed = parsePm2Json(user, res.stdout);
  if (parsed.error) delete pm2BinaryCache[user];
  return { ...parsed, pm2Path };
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
async function collectPm2Snapshot() {
  const users = getPm2Users();
  const results = await Promise.all(users.map(u => getPm2UserProcesses(u)));
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
    users: results
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
  clearPm2Cache,
  runPm2Command
};
