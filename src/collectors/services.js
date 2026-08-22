const { runCommand } = require('../utils/exec');
const { formatBytes } = require('../utils/formatters');

/**
 * Get configured systemd services from environment
 */
function getConfiguredServices() {
  const envUnits = process.env.SYSTEMD_UNITS || 'nginx,ollama,system-ops,postgresql';
  return envUnits.split(',').map(u => u.trim()).filter(Boolean);
}

/**
 * Inspect status and resource consumption for a single systemd unit
 */
async function inspectService(unitName) {
  const fullUnit = unitName.endsWith('.service') ? unitName : `${unitName}.service`;
  const baseName = unitName.replace(/\.service$/, '');

  const showRes = await runCommand('sudo', [
    '-n', 'systemctl', 'show', fullUnit,
    '--property=ActiveState,SubState,MainPID,MemoryCurrent,CPUUsageNSec,User,UnitFileState,Description'
  ], 3000);

  const props = {};
  if (showRes.success && showRes.stdout) {
    showRes.stdout.split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });
  }

  const activeState = props.ActiveState || 'unknown';
  const subState = props.SubState || 'unknown';
  const pid = parseInt(props.MainPID, 10) || 0;
  const memoryBytes = parseInt(props.MemoryCurrent, 10) || 0;

  return {
    name: baseName,
    unit: fullUnit,
    description: props.Description || baseName,
    active: activeState === 'active',
    activeState,
    subState,
    pid: pid > 0 ? pid : null,
    user: props.User || 'system',
    enabled: props.UnitFileState === 'enabled',
    memoryBytes: memoryBytes > 0 && memoryBytes < 1e14 ? memoryBytes : 0,
    formattedMemory: memoryBytes > 0 && memoryBytes < 1e14 ? formatBytes(memoryBytes) : '--'
  };
}

/**
 * Snapshot of all tracked systemd services
 */
async function getServicesSnapshot() {
  const units = getConfiguredServices();
  const serviceList = await Promise.all(units.map(u => inspectService(u)));

  const activeCount = serviceList.filter(s => s.active).length;
  const failedCount = serviceList.filter(s => s.activeState === 'failed').length;
  const totalMemory = serviceList.reduce((acc, s) => acc + s.memoryBytes, 0);

  return {
    total: serviceList.length,
    activeCount,
    failedCount,
    totalMemoryBytes: totalMemory,
    formattedTotalMemory: formatBytes(totalMemory),
    services: serviceList
  };
}

/**
 * Fetch journalctl logs for a specific service
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

module.exports = {
  getServicesSnapshot,
  getServiceLogs,
  getConfiguredServices,
  inspectService
};
