const { runCommand } = require('../utils/exec');
const { formatBytes } = require('../utils/formatters');
const fs = require('fs');

/**
 * Format uptime in milliseconds into a readable string.
 */
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

/**
 * In-memory cache: { [user]: { path: '/home/deploy/.nvm/.../pm2', ts: Date.now() } }
 * TTL: 10 minutes
 */
const pm2BinaryCache = {};
const PM2_CACHE_TTL_MS = 10 * 60 * 1000;

/*
 * Find the working PM2 binary path for a given user.
 */
async function resolvePm2Binary(user) {
  const cached = pm2BinaryCache[user];
  if (cached && (Date.now() - cached.ts) < PM2_CACHE_TTL_MS) {
    return cached.path;
  }

  // 1. Check explicit user-specific or global PM2_PATH env var
  const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (process.env[envVarName]) {
    pm2BinaryCache[user] = { path: process.env[envVarName], ts: Date.now() };
    return process.env[envVarName];
  }
  if (process.env.PM2_PATH) {
    pm2BinaryCache[user] = { path: process.env.PM2_PATH, ts: Date.now() };
    return process.env.PM2_PATH;
  }

  const homeDir = (user === 'root') ? '/root' : '/home/' + user;

  // 2. Try global & standard system paths
  const standardCandidates = [
    '/usr/local/bin/pm2',
    '/usr/bin/pm2',
    '/opt/node/bin/pm2',
    '/snap/bin/pm2',
    homeDir + '/.npm-global/bin/pm2',
    homeDir + '/.yarn/bin/pm2',
    homeDir + '/.nvm/current/bin/pm2'
  ];

  for (const candidate of standardCandidates) {
    const res = await runCommand('sudo', ['-n', '-H', '-u', user, candidate, 'jlist'], 3000);
    if (res.success && res.stdout && res.stdout.trim().startsWith('[')) {
      pm2BinaryCache[user] = { path: candidate, ts: Date.now() };
      return candidate;
    }
  }

  // 3. Try dynamic find across user's home directory (detects all NVM / fnm / asdf versions)
  try {
    const findRes = await runCommand('sudo', ['-n', 'find', homeDir, '-name', 'pm2', '-type', 'f', '-path', '*/bin/pm2'], 4000);
    if (findRes.success && findRes.stdout) {
      const discoveredPaths = findRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const p of discoveredPaths) {
        const testRes = await runCommand('sudo', ['-n', '-H', '-u', user, p, 'jlist'], 4000);
        if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
          pm2BinaryCache[user] = { path: p, ts: Date.now() };
          return p;
        }
      }
    }
  } catch (e) {}

  // 4. Try global find in /root, /home, /usr if still not found
  try {
    const globalFind = await runCommand('sudo', ['-n', 'find', '/root/.nvm', '/home', '-name', 'pm2', '-type', 'f', '-path', '*/bin/pm2'], 4000);
    if (globalFind.success && globalFind.stdout) {
      const allPaths = globalFind.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const p of allPaths) {
        const testRes = await runCommand('sudo', ['-n', '-H', '-u', user, p, 'jlist'], 4000);
        if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
          pm2BinaryCache[user] = { path: p, ts: Date.now() };
          return p;
        }
      }
    }
  } catch (e) {}

  console.warn(`[pm2] Exhausted all candidate paths for '${user}'. Set PM2_PATH or ${envVarName} in .env`);
  return null;
}

/**
 * Get configured PM2 users list from environment (e.g., 'deploy,root').
 */
function getPm2Users() {
  const envUsers = process.env.PM2_USERS || 'deploy,root';
  return envUsers.split(',').map(u => u.trim()).filter(Boolean);
}

/**
 * Fetch PM2 process list for a single user.
 */
async function getPm2UserProcesses(user) {
  if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
    return { user, processes: [], error: 'Invalid user name format', pm2Path: null };
  }

  const pm2Path = await resolvePm2Binary(user);

  if (!pm2Path) {
    const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return {
      user,
      processes: [],
      error: `PM2 binary not found. Set PM2_PATH='/path/to/pm2' or ${envVarName} in .env.`,
      pm2Path: null
    };
  }

  // Use -H flag to set target user's HOME directory so ~/.pm2 socket is found!
  const args = ['-n', '-H', '-u', user];
  args.push(...pm2Path.split(' '));
  args.push('jlist');

  const res = await runCommand('sudo', args, 10000);

  if (!res.success && !res.stdout) {
    const errStr = res.stderr || '';

    if (errStr.includes('No such file') || errStr.includes('not found') ||
        errStr.includes('command not found')) {
      delete pm2BinaryCache[user];
    }

    const errMsg = errStr.includes('password is required') || errStr.includes('terminal is required')
      ? `Sudo password required for user '${user}'. Check /etc/sudoers.d/system-ops.`
      : (errStr.trim() || `Failed to execute PM2 for user '${user}'`);

    return { user, processes: [], error: errMsg, pm2Path };
  }

  return { ...parsePm2Json(user, res.stdout), pm2Path };
}

/**
 * Parse PM2 JSON output into structured process list.
 */
function parsePm2Json(user, rawJson) {
  try {
    const trimmed = (rawJson || '').trim();
    if (!trimmed) {
      return { user, processes: [], error: 'Empty output from PM2' };
    }

    const firstBracket = trimmed.indexOf('[');
    const lastBracket = trimmed.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket === -1 || lastBracket <= firstBracket) {
      return { user, processes: [], error: 'Unexpected PM2 output format' };
    }

    const jsonSlice = trimmed.slice(firstBracket, lastBracket + 1);
    const parsed = JSON.parse(jsonSlice);

    if (!Array.isArray(parsed)) {
      return { user, processes: [], error: 'PM2 output is not an array' };
    }

    const processes = parsed.map(proc => {
      const mon = proc.monit || {};
      const env = proc.pm2_env || {};
      const memBytes = mon.memory || 0;
      const uptimeMs = env.pm_uptime || 0;

      return {
        name: proc.name || 'unnamed',
        pm_id: proc.pm_id !== undefined ? proc.pm_id : null,
        pid: proc.pid || null,
        status: env.status || 'unknown',
        cpu: mon.cpu !== undefined ? mon.cpu : 0,
        memory: memBytes,
        memoryFormatted: memBytes > 0 ? formatBytes(memBytes) : '0 B',
        restart_time: env.restart_time || 0,
        unstable_restarts: env.unstable_restarts || 0,
        uptime: uptimeMs,
        uptimeText: formatUptime(uptimeMs),
        user
      };
    });

    return { user, processes, error: null };
  } catch (err) {
    return { user, processes: [], error: `JSON Parse error: ${err.message}` };
  }
}

/**
 * Multi-user PM2 snapshot
 */
async function getPm2Snapshot() {
  const users = getPm2Users();
  const results = await Promise.all(users.map(u => getPm2UserProcesses(u)));

  let totalProcesses = 0;
  let onlineCount = 0;
  let errorCount = 0;
  let totalMemory = 0;

  results.forEach(u => {
    (u.processes || []).forEach(p => {
      totalProcesses += 1;
      if (p.status === 'online') onlineCount += 1;
      if (p.status === 'errored' || p.status === 'stopped') errorCount += 1;
      totalMemory += (p.memory || 0);
    });
  });

  return {
    totalProcesses,
    onlineCount,
    errorCount,
    totalMemory,
    totalMemoryFormatted: formatBytes(totalMemory),
    users: results
  };
}

/**
 * Fetch logs for a specific PM2 app
 */
async function getPm2Logs(user, appName, lines = 100) {
  if (!user || !/^[a-zA-Z0-9_-]+$/.test(user)) {
    return { user, app: appName, lines, output: '', error: 'Invalid user name' };
  }
  if (!appName || !/^[a-zA-Z0-9_.-]+$/.test(appName)) {
    return { user, app: appName, lines, output: '', error: 'Invalid application name' };
  }

  const sanitizedLines = Math.min(Math.max(parseInt(lines, 10) || 100, 1), 1000);
  const pm2Path = await resolvePm2Binary(user);

  if (!pm2Path) {
    const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return {
      user, app: appName, lines: sanitizedLines, output: '',
      error: `PM2 binary not found. Set PM2_PATH in .env.`
    };
  }

  const args = ['-n', '-H', '-u', user];
  args.push(...pm2Path.split(' '));
  args.push('logs', appName, '--nostream', '--lines', String(sanitizedLines));

  const res = await runCommand('sudo', args, 14000);

  if (!res.success && !res.stdout) {
    const errStr = res.stderr || '';
    const errMsg = errStr.includes('password is required') || errStr.includes('terminal is required')
      ? `Sudo password required for user '${user}'.`
      : (errStr || 'Failed to fetch PM2 logs');
    return { user, app: appName, lines: sanitizedLines, output: '', error: errMsg };
  }

  return {
    user,
    app: appName,
    lines: sanitizedLines,
    output: res.stdout || res.stderr || 'No log lines returned.'
  };
}

/**
 * Expose cache invalidation
 */
function clearPm2Cache(user) {
  if (user) {
    delete pm2BinaryCache[user];
  } else {
    Object.keys(pm2BinaryCache).forEach(k => delete pm2BinaryCache[k]);
  }
}

module.exports = {
  getPm2Snapshot,
  getPm2Logs,
  getPm2Users,
  clearPm2Cache
};
