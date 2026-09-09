const os = require('os');
const fs = require('fs');
const net = require('net');
const { runCommand } = require('../utils/exec');
const { formatBytes } = require('../utils/formatters');
const { sampleProcesses } = require('./processCollector');
const { getTlsCertStatus } = require('./tlsCerts');
const goCollectorClient = require('../services/goCollectorClient');

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
 * Fetch Disk usage for configured paths using a single bulk `df` call.
 */
async function getDiskUsage() {
  const envPaths = process.env.DISK_PATHS || '/,/var';
  const paths = [...new Set(envPaths.split(',').map((p) => p.trim()).filter(Boolean))];

  const existingPaths = paths.filter(p => fs.existsSync(p));
  const missingPaths = paths.filter(p => !fs.existsSync(p));

  const results = missingPaths.map(p => ({
    path: p,
    exists: false,
    status: 'missing',
    total: 'N/A',
    used: 'N/A',
    available: 'N/A',
    percent: 0
  }));

  if (existingPaths.length === 0) {
    return results;
  }

  // Single bulk df call for all existing paths
  const res = await runCommand('df', ['-B1', ...existingPaths], 3000);
  if (!res.success || !res.stdout) {
    existingPaths.forEach(p => {
      results.push({
        path: p,
        exists: true,
        status: 'error',
        total: 'N/A',
        used: 'N/A',
        available: 'N/A',
        percent: 0
      });
    });
    return results;
  }

  const lines = res.stdout.trim().split('\n');
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length >= 6) {
      const filesystem = parts[0];
      const total = parseInt(parts[1], 10) || 0;
      const used = parseInt(parts[2], 10) || 0;
      const avail = parseInt(parts[3], 10) || 0;
      const pct = parseInt(parts[4].replace('%', ''), 10) || 0;
      const mountPoint = parts[5];

      // Match against requested paths
      const matchedReqPath = existingPaths.find(p => p === mountPoint || p === parts[parts.length - 1]) || mountPoint;

      results.push({
        path: matchedReqPath,
        filesystem,
        mountPoint,
        exists: true,
        status: 'ok',
        totalBytes: total,
        usedBytes: used,
        availableBytes: avail,
        formattedTotal: formatBytes(total),
        formattedUsed: formatBytes(used),
        formattedAvailable: formatBytes(avail),
        percent: pct
      });
    }
  }

  return results;
}

/**
 * Query status of key systemd units in a single bulk call.
 */
async function getSystemdUnits() {
  const envUnits = process.env.SYSTEMD_UNITS || 'system-ops';
  const units = envUnits.split(',').map(u => u.trim()).filter(Boolean);
  const fullUnitNames = units.map(u => u.endsWith('.service') ? u : `${u}.service`);

  const showRes = await runCommand('systemctl', [
    'show',
    ...fullUnitNames,
    '-p',
    'Id,ActiveState,SubState,MainPID,MemoryCurrent,ExecMainStartTimestamp'
  ], 4000);

  const unitMap = new Map();

  if (showRes.success && showRes.stdout) {
    const blocks = showRes.stdout.split(/\n\s*\n/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const props = {};
      block.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx !== -1) {
          props[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
        }
      });

      const id = props.Id;
      if (id) {
        const isActive = props.ActiveState === 'active';
        const memoryBytes = parseInt(props.MemoryCurrent, 10) || 0;
        const baseName = id.replace(/\.service$/, '');

        unitMap.set(baseName, {
          unit: baseName,
          fullUnit: id,
          activeState: props.ActiveState || 'unknown',
          subState: props.SubState || 'unknown',
          isActive: isActive,
          pid: parseInt(props.MainPID, 10) || 0,
          memoryBytes: memoryBytes,
          formattedMemory: memoryBytes > 0 ? formatBytes(memoryBytes) : 'N/A'
        });
      }
    }
  }

  return units.map(u => {
    const baseName = u.replace(/\.service$/, '');
    if (unitMap.has(baseName)) return unitMap.get(baseName);
    return {
      unit: baseName,
      fullUnit: `${baseName}.service`,
      activeState: 'unknown',
      subState: 'stopped',
      isActive: false,
      pid: 0,
      memoryBytes: 0,
      formattedMemory: 'N/A'
    };
  });
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
  let targetPorts = [];

  if (process.env.MONITORED_PORTS) {
    // Format: "Name:Port,Name2:Port2" e.g. "Web:80,HTTPS:443,Postgres:5432"
    targetPorts = process.env.MONITORED_PORTS.split(',').map(item => {
      const parts = item.trim().split(':');
      if (parts.length >= 2) {
        return { name: parts[0].trim(), port: parseInt(parts[1], 10) };
      }
      return null;
    }).filter(Boolean);
  } else {
    // Standard system infrastructure ports
    targetPorts = [
      { name: 'System Ops (Self)', port: parseInt(process.env.PORT, 10) || 9080 },
      { name: 'Web (HTTP)', port: 80 },
      { name: 'Web (HTTPS)', port: 443 },
      { name: 'SSH', port: parseInt(process.env.SSH_PORT, 10) || 22 }
    ];

    // Only monitor Ollama port if explicitly requested or enabled via env
    if (process.env.OLLAMA_PORT || process.env.ENABLE_OLLAMA === 'true') {
      targetPorts.push({ name: 'Ollama API', port: parseInt(process.env.OLLAMA_PORT, 10) || 11434 });
    }
  }

  const results = await Promise.all(targetPorts.map(async (p) => {
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
 * Fetch running system processes. Delegates to sampleProcesses (/proc Linux fast path).
 */
async function getSystemProcesses(options = {}) {
  return await sampleProcesses(options);
}

/**
 * GET /api/v2/system/snapshot - Combined System Snapshot.
 */
async function getSystemSnapshot() {
  const goSnapshot = await goCollectorClient.getSystemSnapshot();
  if (goSnapshot) {
    goSnapshot.tls = await getTlsCertStatus();
    return goSnapshot;
  }

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
  getSystemProcesses,
  getUptimeAndLoad,
  getMemoryAndSwap,
  getDiskUsage,
  getSystemdUnits,
  getListeningPorts,
  getTlsCertStatus
};
