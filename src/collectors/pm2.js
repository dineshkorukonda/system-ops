const { execFile } = require('child_process');

/**
 * Helper to run shell commands safely via execFile.
 */
function runCommand(file, args, timeoutMs = 5000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      if (error) {
        resolve({ success: false, stdout: stdout || '', stderr: stderr || error.message, code: error.code });
      } else {
        resolve({ success: true, stdout: stdout || '', stderr: stderr || '', code: 0 });
      }
    });
  });
}

/**
 * Format bytes to human-readable format.
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

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
 * TTL: 10 minutes — avoids repeated `find` scans on every auto-refresh.
 */
const pm2BinaryCache = {};
const PM2_CACHE_TTL_MS = 10 * 60 * 1000;

/*
 * Find the working PM2 binary path by trying the allowed sudoers paths.
 * We try them directly via sudo to avoid bash environment issues.
 */
async function resolvePm2Binary(user) {
  const cached = pm2BinaryCache[user];
  if (cached && (Date.now() - cached.ts) < PM2_CACHE_TTL_MS) {
    return cached.path;
  }

  // 1. Check if user explicitly provided a path in .env
  const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  if (process.env[envVarName]) {
    pm2BinaryCache[user] = { path: process.env[envVarName], ts: Date.now() };
    return process.env[envVarName];
  }

  const homeDir = (user === 'root') ? '/root' : '/home/' + user;

  // 2. Discover NVM paths via glob
  const nvmGlobCmd = 'ls -t "' + homeDir + '/.nvm/versions/node/"*/bin/pm2 2>/dev/null | head -5';
  const nvmRes = await runCommand('sudo', ['-n', '-u', user, 'bash', '-c', nvmGlobCmd], 3000);
  const nvmPaths = nvmRes.stdout ? nvmRes.stdout.split('\n').map(l => l.trim()).filter(Boolean) : [];

  // 3. Compile all candidates
  const candidates = [
    ...nvmPaths,
    '/usr/local/bin/pm2',
    '/usr/bin/pm2',
    homeDir + '/.npm-global/bin/pm2',
    homeDir + '/.yarn/bin/pm2',
    '/opt/node/bin/pm2',
    '/usr/bin/env pm2'
  ];

  for (const candidate of candidates) {
    const args = ['-n', '-u', user];
    const cmdParts = candidate.split(' ');
    args.push(...cmdParts);
    args.push('jlist');

    // Run directly via sudo to avoid bash startup errors (like .bashrc permission denied)
    const res = await runCommand('sudo', args, 4000);
    if (res.success && res.stdout.trim().startsWith('[')) {
      pm2BinaryCache[user] = { path: candidate, ts: Date.now() };
      console.log(`[pm2] Found working binary for '${user}': ${candidate}`);
      return candidate;
    }
  }

  console.warn(`[pm2] Exhausted all candidate paths for '${user}'. User can set ${envVarName} in .env`);
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
 *
 * Uses 2-step resolution:
 *   1. Find binary path (running as target user via sudo)
 *   2. Call <binary> jlist with full absolute path (no PATH dependency)
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
      error: `PM2 binary not found. Set ${envVarName}='/path/to/pm2' in .env file and restart.`,
      pm2Path: null
    };
  }

  // Step 2: Call pm2 jlist with the resolved working command
  const args = ['-n', '-u', user];
  args.push(...pm2Path.split(' '));
  args.push('jlist');

  const res = await runCommand('sudo', args, 10000);


  if (!res.success && !res.stdout) {
    const errStr = res.stderr || '';

    // Clear cache if the binary was not found or path changed
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
function parsePm2Json(user, stdout) {
  try {
    const raw = JSON.parse(stdout);
    if (!Array.isArray(raw)) {
      return { user, processes: [], error: 'Invalid PM2 JSON response format' };
    }

    const processes = raw.map(proc => {
      const pm2Env = proc.pm2_env || {};
      const monit = proc.monit || {};
      const memBytes = monit.memory || 0;

      return {
        name: proc.name || 'unnamed',
        status: pm2Env.status || 'unknown',
        pid: proc.pid || 0,
        cpu: typeof monit.cpu === 'number' ? `${monit.cpu}%` : '0%',
        memoryBytes: memBytes,
        formattedMemory: formatBytes(memBytes),
        uptime: formatUptime(pm2Env.pm_uptime),
        restarts: pm2Env.restart_time || 0,
        script: pm2Env.pm2_exec_path || pm2Env.script?.path || 'N/A',
        mode: pm2Env.exec_mode || 'fork',
        nodeVersion: pm2Env.node_version || 'N/A'
      };
    });

    return { user, processes, error: null };
  } catch (err) {
    return { user, processes: [], error: `JSON parse error: ${err.message}` };
  }
}

/**
 * GET /api/v2/pm2/snapshot — Aggregated snapshot across all configured users.
 */
async function getPm2Snapshot() {
  const users = getPm2Users();
  const results = await Promise.all(users.map(u => getPm2UserProcesses(u)));

  return {
    timestamp: new Date().toISOString(),
    users: results
  };
}

/**
 * GET /api/v2/pm2/logs — Tail PM2 logs for a specific app under a user.
 */
async function getPm2Logs(user, appName, lines = 80) {
  const allowedUsers = getPm2Users();

  if (!user || !allowedUsers.includes(user)) {
    return { user, app: appName, lines: 0, output: '', error: `User '${user}' is not in PM2_USERS list` };
  }

  if (!appName || !/^[a-zA-Z0-9_.-]+$/.test(appName)) {
    return { user, app: appName, lines: 0, output: '', error: 'Invalid app name format' };
  }

  const sanitizedLines = Math.min(Math.max(parseInt(lines, 10) || 80, 1), 500);

  const pm2Path = await resolvePm2Binary(user);

  if (!pm2Path) {
    const envVarName = 'PM2_PATH_' + user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return {
      user, app: appName, lines: sanitizedLines, output: '',
      error: `PM2 binary not found. Set ${envVarName} in .env file.`
    };
  }

  const args = ['-n', '-u', user];
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
 * Expose cache invalidation so tests / admin routes can clear stale cache entries.
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
