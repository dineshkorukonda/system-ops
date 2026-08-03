const { execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const net = require('net');
const tls = require('tls');

/**
 * Execute command with execFile.
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
 * Format bytes to human readable format.
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format uptime seconds into human-readable text.
 */
function formatUptimeText(seconds) {
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
  parts.push(`${mins} min${mins > 1 ? 's' : ''}`);
  return parts.join(', ');
}

/**
 * Read Uptime & Load Average.
 */
function getUptimeAndLoad() {
  const uptimeSec = os.uptime();
  const cpus = os.cpus().length || 1;
  const load = os.loadavg(); // [1m, 5m, 15m]

  return {
    uptimeSeconds: uptimeSec,
    uptimeText: formatUptimeText(uptimeSec),
    cpus,
    load1m: load[0].toFixed(2),
    load5m: load[1].toFixed(2),
    load15m: load[2].toFixed(2),
    loadPercent1m: Math.min(100, Math.round((load[0] / cpus) * 100))
  };
}

/**
 * Read Memory & Swap info from /proc/meminfo or os.
 */
function getMemoryAndSwap() {
  try {
    if (fs.existsSync('/proc/meminfo')) {
      const content = fs.readFileSync('/proc/meminfo', 'utf8');
      const lines = content.split('\n');
      const info = {};
      lines.forEach(line => {
        const parts = line.split(':');
        if (parts.length === 2) {
          const key = parts[0].trim();
          const val = parseInt(parts[1].trim(), 10) * 1024; // kB -> bytes
          if (!isNaN(val)) info[key] = val;
        }
      });

      const total = info.MemTotal || os.totalmem();
      const free = info.MemFree || os.freemem();
      const available = info.MemAvailable || free;
      const used = total - available;
      const memPercent = Math.round((used / total) * 100);

      const swapTotal = info.SwapTotal || 0;
      const swapFree = info.SwapFree || 0;
      const swapUsed = swapTotal - swapFree;
      const swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;

      return {
        memory: {
          totalBytes: total,
          usedBytes: used,
          availableBytes: available,
          formattedTotal: formatBytes(total),
          formattedUsed: formatBytes(used),
          formattedAvailable: formatBytes(available),
          usagePercent: memPercent
        },
        swap: {
          totalBytes: swapTotal,
          usedBytes: swapUsed,
          freeBytes: swapFree,
          formattedTotal: formatBytes(swapTotal),
          formattedUsed: formatBytes(swapUsed),
          formattedFree: formatBytes(swapFree),
          usagePercent: swapPercent
        }
      };
    }
  } catch (e) {}

  // Fallback to os methods
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  const memPercent = Math.round((used / total) * 100);

  return {
    memory: {
      totalBytes: total,
      usedBytes: used,
      availableBytes: free,
      formattedTotal: formatBytes(total),
      formattedUsed: formatBytes(used),
      formattedAvailable: formatBytes(free),
      usagePercent: memPercent
    },
    swap: {
      totalBytes: 0,
      usedBytes: 0,
      freeBytes: 0,
      formattedTotal: '0 B',
      formattedUsed: '0 B',
      formattedFree: '0 B',
      usagePercent: 0
    }
  };
}

/**
 * Fetch Disk usage for configured paths.
 */
async function getDiskUsage() {
  const envPaths = process.env.DISK_PATHS || '/,/var,/root/backups';
  const paths = envPaths.split(',').map(p => p.trim()).filter(Boolean);

  const results = await Promise.all(paths.map(async (diskPath) => {
    // Check if path exists
    if (!fs.existsSync(diskPath)) {
      return {
        path: diskPath,
        exists: false,
        status: 'missing',
        total: 'N/A',
        used: 'N/A',
        available: 'N/A',
        percent: 0
      };
    }

    const res = await runCommand('df', ['-B1', diskPath]);
    if (!res.success || !res.stdout) {
      return {
        path: diskPath,
        exists: true,
        status: 'error',
        total: 'N/A',
        used: 'N/A',
        available: 'N/A',
        percent: 0
      };
    }

    const lines = res.stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      if (parts.length >= 6) {
        const total = parseInt(parts[1], 10) || 0;
        const used = parseInt(parts[2], 10) || 0;
        const avail = parseInt(parts[3], 10) || 0;
        const pctStr = parts[4].replace('%', '');
        const pct = parseInt(pctStr, 10) || 0;

        return {
          path: diskPath,
          filesystem: parts[0],
          mountPoint: parts[5],
          exists: true,
          status: 'ok',
          totalBytes: total,
          usedBytes: used,
          availableBytes: avail,
          formattedTotal: formatBytes(total),
          formattedUsed: formatBytes(used),
          formattedAvailable: formatBytes(avail),
          percent: pct
        };
      }
    }

    return {
      path: diskPath,
      exists: true,
      status: 'parse_error',
      total: 'N/A',
      used: 'N/A',
      available: 'N/A',
      percent: 0
    };
  }));

  return results;
}

/**
 * Query status of key systemd units.
 */
async function getSystemdUnits() {
  const envUnits = process.env.SYSTEMD_UNITS || 'nginx,ollama,system-ops,postgresql';
  const units = envUnits.split(',').map(u => u.trim()).filter(Boolean);

  const results = await Promise.all(units.map(async (unit) => {
    const fullUnit = unit.endsWith('.service') ? unit : `${unit}.service`;
    
    // Try systemctl show
    const showRes = await runCommand('systemctl', [
      'show',
      fullUnit,
      '-p',
      'ActiveState,SubState,MainPID,MemoryCurrent,ExecMainStartTimestamp'
    ]);

    if (showRes.success && showRes.stdout) {
      const props = {};
      showRes.stdout.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx !== -1) {
          props[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
        }
      });

      const isActive = props.ActiveState === 'active';
      const memoryBytes = parseInt(props.MemoryCurrent, 10) || 0;

      return {
        unit: unit,
        fullUnit: fullUnit,
        activeState: props.ActiveState || 'unknown',
        subState: props.SubState || 'unknown',
        isActive: isActive,
        pid: parseInt(props.MainPID, 10) || 0,
        memoryBytes: memoryBytes,
        formattedMemory: memoryBytes > 0 ? formatBytes(memoryBytes) : 'N/A'
      };
    }

    // Fallback to systemctl is-active
    const isActRes = await runCommand('systemctl', ['is-active', fullUnit]);
    const state = isActRes.stdout.trim() || 'unknown';

    return {
      unit: unit,
      fullUnit: fullUnit,
      activeState: state,
      subState: state === 'active' ? 'running' : 'stopped',
      isActive: state === 'active',
      pid: 0,
      memoryBytes: 0,
      formattedMemory: 'N/A'
    };
  }));

  return results;
}

/**
 * Check TCP loopback ports sanity.
 */
function checkPortListener(port, host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, host, listening: true, statusText: `Listening on ${host}:${port}` });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, host, listening: false, statusText: `Timeout connecting to ${host}:${port}` });
    });

    socket.on('error', (err) => {
      socket.destroy();
      resolve({ port, host, listening: false, statusText: `Not listening (${err.code || err.message})` });
    });

    socket.connect(port, host);
  });
}

async function getListeningPorts() {
  const defaultPorts = [
    { name: 'Ollama API', port: 11434 },
    { name: 'System Ops (Self)', port: parseInt(process.env.PORT, 10) || 9080 },
    { name: 'Dev API', port: 8100 }
  ];

  const results = await Promise.all(defaultPorts.map(async (p) => {
    const res = await checkPortListener(p.port, '127.0.0.1');
    return {
      name: p.name,
      port: p.port,
      host: '127.0.0.1',
      listening: res.listening,
      statusText: res.statusText
    };
  }));

  return results;
}

/**
 * Inspect TLS certificate validity for hostnames or cert paths.
 */
async function getTlsCertStatus() {
  const envHosts = process.env.TLS_HOSTS || 'system-health.iskconcommunity';
  const hosts = envHosts.split(',').map(h => h.trim()).filter(Boolean);

  const results = await Promise.all(hosts.map(async (hostOrPath) => {
    // 1. Check if it's a file path under /etc/letsencrypt or custom path
    let certPath = hostOrPath;
    if (!certPath.includes('/')) {
      certPath = `/etc/letsencrypt/live/${hostOrPath}/cert.pem`;
    }

    if (fs.existsSync(certPath)) {
      const opensslRes = await runCommand('openssl', ['x509', '-enddate', '-noout', '-in', certPath]);
      if (opensslRes.success && opensslRes.stdout.includes('notAfter=')) {
        const dateStr = opensslRes.stdout.replace('notAfter=', '').trim();
        const validTo = new Date(dateStr);
        const daysRemaining = Math.floor((validTo - Date.now()) / (1000 * 60 * 60 * 24));
        const isValid = daysRemaining > 0;

        return {
          target: hostOrPath,
          source: 'file',
          valid: isValid,
          daysRemaining: daysRemaining,
          validTo: validTo.toISOString(),
          formattedValidTo: validTo.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
          statusText: isValid ? `${daysRemaining} days remaining` : 'EXPIRED'
        };
      }
    }

    // 2. Try network connection if hostname has dots and no slashes
    if (hostOrPath.includes('.') && !hostOrPath.includes('/')) {
      const netCert = await checkNetworkTlsCert(hostOrPath);
      if (netCert) return netCert;
    }

    return {
      target: hostOrPath,
      source: 'unknown',
      valid: false,
      daysRemaining: 0,
      validTo: null,
      formattedValidTo: 'N/A',
      statusText: `Certificate file or endpoint not found (${certPath})`
    };
  }));

  return results;
}

function checkNetworkTlsCert(hostname, port = 443) {
  return new Promise((resolve) => {
    const socket = tls.connect(port, hostname, { servername: hostname, rejectUnauthorized: false, timeout: 3000 }, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        if (cert && cert.valid_to) {
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo - Date.now()) / (1000 * 60 * 60 * 24));
          const isValid = daysRemaining > 0;
          resolve({
            target: hostname,
            source: 'https',
            valid: isValid,
            daysRemaining: daysRemaining,
            validTo: validTo.toISOString(),
            formattedValidTo: validTo.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
            statusText: isValid ? `${daysRemaining} days remaining` : 'EXPIRED'
          });
          return;
        }
      } catch (e) {}
      resolve(null);
    });

    socket.on('error', () => { resolve(null); });
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
}

/**
 * GET /api/v2/system/snapshot - Combined System Snapshot.
 */
async function getSystemSnapshot() {
  const uptimeLoad = getUptimeAndLoad();
  const memorySwap = getMemoryAndSwap();
  
  const [disk, services, ports, tlsStatus] = await Promise.all([
    getDiskUsage(),
    getSystemdUnits(),
    getListeningPorts(),
    getTlsCertStatus()
  ]);

  return {
    timestamp: new Date().toISOString(),
    uptime: uptimeLoad,
    memory: memorySwap.memory,
    swap: memorySwap.swap,
    disk: disk,
    services: services,
    ports: ports,
    tls: tlsStatus
  };
}

module.exports = {
  getSystemSnapshot,
  getUptimeAndLoad,
  getMemoryAndSwap,
  getDiskUsage,
  getSystemdUnits,
  getListeningPorts,
  getTlsCertStatus
};
