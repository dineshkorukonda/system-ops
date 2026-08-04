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
 * Get configured PM2 users list from environment (e.g., 'deploy' or 'deploy,root').
 */
function getPm2Users() {
  const envUsers = process.env.PM2_USERS || 'deploy';
  return envUsers.split(',').map(u => u.trim()).filter(Boolean);
}

/**
 * Fetch PM2 process list for a single user via `sudo -u <user> -H pm2 jlist`.
 */
async function getPm2UserProcesses(user) {
  // Validate username format (alphanumeric and dashes/underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(user)) {
    return { user, processes: [], error: 'Invalid user name format' };
  }

  // Execute sudo -n -u <user> -H pm2 jlist
  const res = await runCommand('sudo', ['-n', '-u', user, '-H', 'pm2', 'jlist']);

  if (!res.success) {
    // Try without sudo if running as the same user
    const directRes = await runCommand('pm2', ['jlist']);
    if (directRes.success) {
      return parsePm2Json(user, directRes.stdout);
    }
    const errMsg = res.stderr.includes('password is required') || res.stderr.includes('terminal is required')
      ? `Sudo password required for user '${user}'. Please verify /etc/sudoers.d/system-ops configuration.`
      : (res.stderr || 'Failed to execute PM2 for user');
    return { user, processes: [], error: errMsg };
  }

  return parsePm2Json(user, res.stdout);
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
        uptime: formatUptime(pm2Env.pm2_uptime),
        restarts: pm2Env.restart_time || 0,
        script: pm2Env.pm2_exec_path || pm2Env.script?.path || 'N/A',
        mode: pm2Env.exec_mode || 'fork',
        nodeVersion: pm2Env.node_version || 'N/A'
      };
    });

    return { user, processes, error: null };
  } catch (err) {
    return { user, processes: [], error: `JSON Parse error: ${err.message}` };
  }
}

/**
 * GET /api/v2/pm2/snapshot - Aggregated snapshot across all configured users.
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
 * GET /api/v2/pm2/logs - Tail PM2 logs for a specific app under a user.
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

  // Execute sudo -n -u <user> -H pm2 logs <name> --nostream --lines N
  const res = await runCommand('sudo', [
    '-n',
    '-u', user,
    '-H', 'pm2',
    'logs', appName,
    '--nostream',
    '--lines', String(sanitizedLines)
  ], 8000);

  if (!res.success && !res.stdout) {
    const errMsg = res.stderr.includes('password is required') || res.stderr.includes('terminal is required')
      ? `Sudo password required for user '${user}'. Please verify /etc/sudoers.d/system-ops configuration.`
      : (res.stderr || 'Failed to fetch PM2 logs');
    return {
      user,
      app: appName,
      lines: sanitizedLines,
      output: '',
      error: errMsg
    };
  }

  return {
    user,
    app: appName,
    lines: sanitizedLines,
    output: res.stdout || res.stderr || 'No log lines returned.'
  };
}

module.exports = {
  getPm2Snapshot,
  getPm2Logs,
  getPm2Users
};
