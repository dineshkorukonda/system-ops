const { runCommand } = require('../utils/exec');
const { formatBytes } = require('../utils/formatters');
const path = require('path');

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
 * In-memory cache: { [user]: { path: '/home/deploy/.nvm/.../bin/pm2', ts: Date.now() } }
 * TTL: 10 minutes
 */
const pm2BinaryCache = {};
const PM2_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Execute a PM2 command for a user with PATH & PM2_HOME properly exported
 * Uses --noprofile --norc to prevent .bashrc permission issues
 */
async function runPm2Command(user, pm2Path, subCommand, extraArgs = [], timeoutMs = 10000) {
  if (!pm2Path || typeof pm2Path !== 'string') {
    return { success: false, stdout: '', stderr: 'Invalid PM2 path' };
  }

  // Deploy user must never execute root's binaries due to 0700 permissions
  if (user !== 'root' && pm2Path.startsWith('/root')) {
    return { success: false, stdout: '', stderr: `User '${user}' cannot execute binary in /root` };
  }

  const binDir = path.dirname(pm2Path);
  const homeDir = (user === 'root') ? '/root' : `/home/${user}`;
  const allArgs = [subCommand, ...extraArgs].map(a => `"${a}"`).join(' ');
  const bashScript = `export PATH="${binDir}:$PATH"; export PM2_HOME="${homeDir}/.pm2"; "${pm2Path}" ${allArgs}`;

  return await runCommand('sudo', ['-n', '-H', '-u', user, 'bash', '--noprofile', '--norc', '-c', bashScript], timeoutMs);
}

/*
 * Find the working PM2 binary path for a given user.
 */
async function resolvePm2Binary(user) {
  const cached = pm2BinaryCache[user];
  if (cached && (Date.now() - cached.ts) < PM2_CACHE_TTL_MS) {
    // Quick validation of cached path
    const testRes = await runPm2Command(user, cached.path, 'jlist', [], 3000);
    if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
      return cached.path;
    }
    delete pm2BinaryCache[user];
  }

  const homeDir = (user === 'root') ? '/root' : `/home/${user}`;

  // 1. Check explicit user-specific or global PM2_PATH env var, but VALIDATE it first!
  const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const envCandidate = process.env[envVarName] || (user === 'root' ? process.env.PM2_PATH : null);
  if (envCandidate) {
    const testRes = await runPm2Command(user, envCandidate, 'jlist', [], 4000);
    if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
      pm2BinaryCache[user] = { path: envCandidate, ts: Date.now() };
      return envCandidate;
    }
  }

  // 2. Discover exact binary path from systemd unit (pm2-<user>.service or pm2.service)
  for (const serviceName of [`pm2-${user}.service`, `pm2-${user}`, 'pm2.service', 'pm2']) {
    try {
      const showRes = await runCommand('sudo', ['-n', 'systemctl', 'show', serviceName, '--property=ExecStart'], 3000);
      if (showRes.success && showRes.stdout) {
        const pathMatch = showRes.stdout.match(/path=([^\s;]+pm2)/i) || showRes.stdout.match(/argv\[\]=([^\s;]+pm2)/i);
        if (pathMatch && pathMatch[1]) {
          const candidate = pathMatch[1].trim();
          if (user === 'root' || !candidate.startsWith('/root')) {
            const testRes = await runPm2Command(user, candidate, 'jlist', [], 4000);
            if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
              pm2BinaryCache[user] = { path: candidate, ts: Date.now() };
              return candidate;
            }
          }
        }
      }
    } catch (e) {}
  }

  // 3. Try global & standard system paths
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
    const res = await runPm2Command(user, candidate, 'jlist', [], 3000);
    if (res.success && res.stdout && res.stdout.trim().startsWith('[')) {
      pm2BinaryCache[user] = { path: candidate, ts: Date.now() };
      return candidate;
    }
  }

  // 4. Try dynamic find across user's home directory
  try {
    const findRes = await runCommand('sudo', ['-n', 'find', homeDir, '-name', 'pm2', '-type', 'f'], 4000);
    if (findRes.success && findRes.stdout) {
      const discoveredPaths = findRes.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const p of discoveredPaths) {
        if (!p.includes('/bin/pm2') && !p.endsWith('/pm2')) continue;
        const testRes = await runPm2Command(user, p, 'jlist', [], 4000);
        if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
          pm2BinaryCache[user] = { path: p, ts: Date.now() };
          return p;
        }
      }
    }
  } catch (e) {}

  // 5. Try global search in /usr, /opt, /snap
  try {
    const globalFind = await runCommand('sudo', ['-n', 'find', '/usr', '/opt', '/snap', '-name', 'pm2', '-type', 'f'], 4000);
    if (globalFind.success && globalFind.stdout) {
      const discoveredPaths = globalFind.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const p of discoveredPaths) {
        if (!p.includes('/bin/pm2') && !p.endsWith('/pm2')) continue;
        const testRes = await runPm2Command(user, p, 'jlist', [], 4000);
        if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
          pm2BinaryCache[user] = { path: p, ts: Date.now() };
          return p;
        }
      }
    }
  } catch (e) {}

  // 5. Try login shell 'which pm2'
  try {
    const whichRes = await runCommand('sudo', ['-n', '-H', '-u', user, 'bash', '--noprofile', '-lc', 'which pm2'], 3000);
    if (whichRes.success && whichRes.stdout && whichRes.stdout.trim().startsWith('/')) {
      const resolved = whichRes.stdout.trim();
      const testRes = await runPm2Command(user, resolved, 'jlist', [], 4000);
      if (testRes.success && testRes.stdout && testRes.stdout.trim().startsWith('[')) {
        pm2BinaryCache[user] = { path: resolved, ts: Date.now() };
        return resolved;
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
      error: `PM2 binary not found in standard paths or ~/.nvm for '${user}'. Set ${envVarName}='/path/to/pm2' in .env.`,
      pm2Path: null
    };
  }

  // Call pm2 jlist with PATH & PM2_HOME exported
  const res = await runPm2Command(user, pm2Path, 'jlist', [], 10000);

  if (!res.success && !res.stdout) {
    delete pm2BinaryCache[user];
    const errStr = res.stderr || '';
    const errMsg = errStr.includes('password is required') || errStr.includes('terminal is required')
      ? `Sudo password required for user '${user}'. Check /etc/sudoers.d/system-ops.`
      : (errStr.trim() || `Failed to execute PM2 for user '${user}'`);

    return { user, processes: [], error: errMsg, pm2Path };
  }

  const parsed = parsePm2Json(user, res.stdout);
  if (parsed.error) {
    delete pm2BinaryCache[user];
  }
  return { ...parsed, pm2Path };
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
      error: `PM2 binary not found. Set ${envVarName} in .env.`
    };
  }

  const res = await runPm2Command(user, pm2Path, 'logs', [appName, '--nostream', '--lines', String(sanitizedLines)], 14000);

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
  clearPm2Cache,
  runPm2Command
};
