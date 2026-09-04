const { runCommand } = require('../utils/exec');
const { formatBytes } = require('../utils/formatters');
const { getPm2Snapshot } = require('./pm2');

// Cached list of discovered service units to avoid running list-units on every quick interval
let cachedDiscoveredUnits = [];
let lastUnitsDiscoveryTime = 0;
const DISCOVERY_TTL_MS = 60 * 1000; // Rescan unit list at most once every 60s

/**
 * Get configured systemd services from environment or auto-discover running services.
 * Cached to prevent running `systemctl list-units` constantly.
 */
async function discoverAllServices(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedDiscoveredUnits.length > 0 && (now - lastUnitsDiscoveryTime) < DISCOVERY_TTL_MS) {
    return cachedDiscoveredUnits;
  }

  const configured = (process.env.SYSTEMD_UNITS || 'nginx,ollama,system-ops,postgresql')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  const unitsSet = new Set(configured);

  try {
    const res = await runCommand('sudo', [
      '-n', 'systemctl', 'list-units', '--type=service', '--state=running,failed,active', '--no-legend', '--no-pager', '--plain'
    ], 3000);

    if (res.success && res.stdout) {
      const lines = res.stdout.split('\n');
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const unitName = parts[0];
        if (unitName && unitName.endsWith('.service')) {
          const cleanName = unitName.replace(/\.service$/, '');
          // Auto-include user/app units, PM2 units, database units, docker/container units
          if (
            cleanName.startsWith('pm2') ||
            cleanName.startsWith('node') ||
            cleanName.startsWith('app') ||
            cleanName.startsWith('api') ||
            cleanName.startsWith('web') ||
            cleanName.startsWith('worker') ||
            cleanName.includes('bot') ||
            cleanName === 'docker' ||
            cleanName === 'containerd' ||
            cleanName === 'redis' ||
            cleanName === 'mysql' ||
            cleanName === 'mongodb' ||
            cleanName === 'caddy'
          ) {
            unitsSet.add(cleanName);
          }
        }
      }
    }
  } catch (e) {}

  cachedDiscoveredUnits = Array.from(unitsSet);
  lastUnitsDiscoveryTime = now;
  return cachedDiscoveredUnits;
}

/**
 * Inspect multiple systemd units in a single bulk `systemctl show` command.
 * Reduces N child processes to 1 child process.
 */
async function inspectServicesBulk(units) {
  if (!units || units.length === 0) return [];

  const fullUnitNames = units.map(u => u.endsWith('.service') ? u : `${u}.service`);

  // Run single bulk show command: systemctl show unit1 unit2 unit3 ...
  const showRes = await runCommand('sudo', [
    '-n', 'systemctl', 'show', ...fullUnitNames,
    '--property=Id,ActiveState,SubState,MainPID,MemoryCurrent,CPUUsageNSec,User,UnitFileState,Description'
  ], 5000);

  const unitMap = new Map();

  if (showRes.success && showRes.stdout) {
    // systemctl show outputs blank line or separate blocks for multiple units
    const blocks = showRes.stdout.split(/\n\s*\n/);
    for (const block of blocks) {
      if (!block.trim()) continue;
      const props = {};
      block.split('\n').forEach(line => {
        const idx = line.indexOf('=');
        if (idx > 0) {
          props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        }
      });

      const unitId = props.Id;
      if (unitId) {
        const baseName = unitId.replace(/\.service$/, '');
        const activeState = props.ActiveState || 'unknown';
        const subState = props.SubState || 'unknown';
        const pid = parseInt(props.MainPID, 10) || 0;
        const memoryBytes = parseInt(props.MemoryCurrent, 10) || 0;

        unitMap.set(baseName, {
          name: baseName,
          unit: unitId,
          description: props.Description || baseName,
          active: activeState === 'active',
          activeState,
          subState,
          pid: pid > 0 ? pid : null,
          user: props.User || 'system',
          enabled: props.UnitFileState === 'enabled',
          memoryBytes: memoryBytes > 0 && memoryBytes < 1e14 ? memoryBytes : 0,
          formattedMemory: memoryBytes > 0 && memoryBytes < 1e14 ? formatBytes(memoryBytes) : '--'
        });
      }
    }
  }

  // Fallback for any unit not parsed by bulk
  return units.map(u => {
    const baseName = u.replace(/\.service$/, '');
    if (unitMap.has(baseName)) return unitMap.get(baseName);
    return {
      name: baseName,
      unit: `${baseName}.service`,
      description: baseName,
      active: false,
      activeState: 'unknown',
      subState: 'stopped',
      pid: null,
      user: 'system',
      enabled: false,
      memoryBytes: 0,
      formattedMemory: '--'
    };
  });
}

/**
 * Inspect status and resource consumption for a single systemd unit (backward compatibility).
 */
async function inspectService(unitName) {
  const results = await inspectServicesBulk([unitName]);
  return results[0];
}

/**
 * Snapshot of all tracked systemd services + PM2 fleet if present.
 */
async function getServicesSnapshot() {
  const units = await discoverAllServices();
  const serviceList = await inspectServicesBulk(units);

  let pm2Fleet = null;
  try {
    pm2Fleet = await getPm2Snapshot();
  } catch (e) {}

  const activeCount = serviceList.filter(s => s.active).length;
  const failedCount = serviceList.filter(s => s.activeState === 'failed').length;
  const totalMemory = serviceList.reduce((acc, s) => acc + s.memoryBytes, 0);

  return {
    total: serviceList.length,
    activeCount,
    failedCount,
    totalMemoryBytes: totalMemory,
    formattedTotalMemory: formatBytes(totalMemory),
    services: serviceList,
    pm2Fleet: pm2Fleet?.users?.length > 0 ? pm2Fleet : null
  };
}

/**
 * Fetch journalctl logs for a specific service.
 */
async function getServiceLogs(serviceName, lines = 100) {
  if (!serviceName || !/^[a-zA-Z0-9_.-]+$/.test(serviceName)) {
    return { service: serviceName, output: '', error: 'Invalid service name format' };
  }

  const fullUnit = serviceName.endsWith('.service') ? serviceName : `${serviceName}.service`;
  const sanitizedLines = Math.min(Math.max(parseInt(lines, 10) || 100, 1), 1000);

  const res = await runCommand('sudo', [
    '-n', 'journalctl', '-u', fullUnit, '-n', String(sanitizedLines), '--no-pager'
  ], 8000);

  return {
    service: serviceName,
    unit: fullUnit,
    lines: sanitizedLines,
    output: res.stdout || res.stderr || 'No journal logs found for this unit.'
  };
}

function getConfiguredServices() {
  return (process.env.SYSTEMD_UNITS || 'nginx,ollama,system-ops,postgresql')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);
}

module.exports = {
  getServicesSnapshot,
  getServiceLogs,
  discoverAllServices,
  getConfiguredServices,
  inspectService,
  inspectServicesBulk
};
