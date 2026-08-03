const { execFile } = require('child_process');
const net = require('net');
const os = require('os');
const fs = require('fs');

/**
 * Executes a shell command securely via execFile with standard options and timeouts.
 */
function runCommand(file, args, timeoutMs = 4000) {
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
 * Formats byte counts into human readable strings (MB, GB).
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Inspect systemd service status for Ollama
 */
async function getServiceStatus(serviceName = 'ollama') {
  // Try systemctl show
  const showResult = await runCommand('systemctl', [
    'show',
    serviceName,
    '-p',
    'ActiveState,SubState,MainPID,User,MemoryCurrent,ExecMainStartTimestamp'
  ]);

  if (showResult.success && showResult.stdout) {
    const props = {};
    showResult.stdout.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx !== -1) {
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        props[key] = value;
      }
    });

    const isActive = props.ActiveState === 'active';
    const memoryBytes = parseInt(props.MemoryCurrent, 10) || 0;
    const pid = parseInt(props.MainPID, 10) || 0;

    return {
      service: serviceName,
      activeState: props.ActiveState || 'unknown',
      subState: props.SubState || 'unknown',
      isActive: isActive,
      pid: pid,
      user: props.User || 'ollama', // Default expected user per spec
      memoryBytes: memoryBytes,
      formattedMemory: formatBytes(memoryBytes),
      startTimestamp: props.ExecMainStartTimestamp || null
    };
  }

  // Fallback to systemctl is-active
  const isActiveResult = await runCommand('systemctl', ['is-active', serviceName]);
  const activeState = isActiveResult.stdout.trim() || 'unknown';

  return {
    service: serviceName,
    activeState: activeState,
    subState: activeState === 'active' ? 'running' : 'stopped',
    isActive: activeState === 'active',
    pid: 0,
    user: 'ollama',
    memoryBytes: 0,
    formattedMemory: 'N/A',
    startTimestamp: null
  };
}

/**
 * Checks TCP port listening status on local host
 */
function checkPortListener(port = 11434, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isConnected = false;

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      isConnected = true;
      socket.destroy();
      resolve({
        listening: true,
        host: host,
        port: port,
        statusText: `Listening on ${host}:${port} (local only)`
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        listening: false,
        host: host,
        port: port,
        statusText: `Connection timeout to ${host}:${port}`
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({
        listening: false,
        host: host,
        port: port,
        statusText: `Not listening (${err.code || err.message})`
      });
    });

    socket.connect(port, host);
  });
}

/**
 * Retrieve recent systemd logs using journalctl
 */
async function getJournalLogs(serviceName = 'ollama', lineCount = 100) {
  const maxLines = Math.min(Math.max(parseInt(lineCount, 10) || 100, 10), 500);

  // Attempt direct journalctl call
  let result = await runCommand('journalctl', [
    '-u',
    serviceName,
    '-n',
    String(maxLines),
    '--no-pager',
    '-o',
    'short-iso'
  ]);

  // If direct failed (permission denied), attempt sudo journalctl
  if (!result.success && result.stderr.includes('Permission denied')) {
    result = await runCommand('sudo', [
      'journalctl',
      '-u',
      serviceName,
      '-n',
      String(maxLines),
      '--no-pager',
      '-o',
      'short-iso'
    ]);
  }

  if (!result.success && !result.stdout) {
    return {
      success: false,
      linesCount: 0,
      logs: `Failed to fetch logs for unit ${serviceName}:\n${result.stderr || 'No output or permission denied. Ensure ops user is added to systemd-journal / adm group or sudoers.'}`
    };
  }

  const rawLogs = result.stdout.trim();
  const logLines = rawLogs ? rawLogs.split('\n') : [];

  return {
    success: true,
    linesCount: logLines.length,
    requestedLines: maxLines,
    logs: rawLogs || `No log entries found for unit ${serviceName}.`
  };
}

/**
 * Read memory and swap statistics from /proc/meminfo or os module
 */
function getHostMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let swapTotal = 0;
  let swapFree = 0;

  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const swapTotalMatch = meminfo.match(/^SwapTotal:\s+(\d+)\s+kB/m);
    const swapFreeMatch = meminfo.match(/^SwapFree:\s+(\d+)\s+kB/m);
    if (swapTotalMatch) swapTotal = parseInt(swapTotalMatch[1], 10) * 1024;
    if (swapFreeMatch) swapFree = parseInt(swapFreeMatch[1], 10) * 1024;
  } catch (e) {
    // If not readable (e.g. non-Linux host during dev), fallback
  }

  const swapUsed = swapTotal - swapFree;

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    uptimeSeconds: Math.floor(os.uptime()),
    loadAvg: os.loadavg().map(n => n.toFixed(2)),
    memory: {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      formattedTotal: formatBytes(totalMem),
      formattedUsed: formatBytes(usedMem),
      formattedFree: formatBytes(freeMem),
      usagePercent: ((usedMem / totalMem) * 100).toFixed(1)
    },
    swap: {
      total: swapTotal,
      used: swapUsed,
      free: swapFree,
      formattedTotal: formatBytes(swapTotal),
      formattedUsed: formatBytes(swapUsed),
      formattedFree: formatBytes(swapFree),
      usagePercent: swapTotal > 0 ? ((swapUsed / swapTotal) * 100).toFixed(1) : '0'
    }
  };
}

module.exports = {
  getServiceStatus,
  checkPortListener,
  getJournalLogs,
  getHostMetrics,
  formatBytes
};
