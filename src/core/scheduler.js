const { collectorManager } = require('../core/collectorManager');
const { stateStore } = require('../core/stateStore');

// Existing collectors
const { getSystemSnapshot } = require('../collectors/system');
const { sampleProcesses } = require('../collectors/processCollector');
const { getServicesSnapshot } = require('../collectors/services');
const { collectPm2Snapshot } = require('../../plugins/superpowers/skills/pm2_discovery');
const { parseTrafficAnalytics } = require('../collectors/trafficAnalytics');
const { listBackupFiles } = require('../collectors/backupFiles');
const { checkApiHealth, getCliModelList } = require('../services/ollamaService');
const { getCapabilities } = require('../collectors/capabilities');
const { getDockerSnapshot } = require('../collectors/docker');
const { getDatabaseSnapshot } = require('../collectors/databases');
const { getSecuritySnapshot } = require('../collectors/security');
const { getOsUpdatesSnapshot } = require('../collectors/osUpdates');
const { getCertbotSnapshot } = require('../collectors/certbot');
const { getServiceStatus, checkPortListener, getHostMetrics } = require('../services/systemService');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const OLLAMA_SERVICE = process.env.OLLAMA_SERVICE_NAME || 'ollama';

/**
 * Register all background collectors with appropriate intervals.
 * Intervals are configurable via environment variables.
 */
function registerAllCollectors() {
  // 1. System Health (CPU, RAM, Swap, Ports, TLS, Disks) - Fast cycle (default: 4s)
  const systemInterval = parseInt(process.env.SYSTEM_OPS_SYSTEM_INTERVAL, 10) || 4000;
  collectorManager.register({
    name: 'system',
    stateKey: 'system',
    intervalMs: systemInterval,
    critical: true,
    collect: async () => {
      const snap = await getSystemSnapshot();
      // Push history points to StateStore BoundedHistory
      if (snap.uptime?.load1m) {
        stateStore.history.cpu.push({
          time: Date.now(),
          value: parseFloat(snap.uptime.load1m) || 0
        });
      }
      if (snap.memory?.usagePercent !== undefined) {
        stateStore.history.ram.push({
          time: Date.now(),
          value: snap.memory.usagePercent
        });
      }
      if (snap.swap?.usagePercent !== undefined) {
        stateStore.history.swap.push({
          time: Date.now(),
          value: snap.swap.usagePercent
        });
      }
      return snap;
    }
  });

  // 2. Process Monitor (Pure /proc Linux, 0 subprocesses) - Fast cycle (default: 5s)
  const processInterval = parseInt(process.env.SYSTEM_OPS_PROCESS_INTERVAL, 10) || 5000;
  collectorManager.register({
    name: 'processes',
    stateKey: 'processes',
    intervalMs: processInterval,
    critical: true,
    collect: async () => {
      return await sampleProcesses({ limit: 50, sortBy: 'cpu' });
    }
  });

  // 3. PM2 Fleet Discovery & Monitoring (default: 15s)
  const pm2Interval = parseInt(process.env.SYSTEM_OPS_PM2_INTERVAL, 10) || 15000;
  collectorManager.register({
    name: 'pm2',
    stateKey: 'pm2',
    intervalMs: pm2Interval,
    critical: false,
    collect: async () => {
      return await collectPm2Snapshot();
    }
  });

  // 4. Systemd Services Fleet (default: 20s)
  const serviceInterval = parseInt(process.env.SYSTEM_OPS_SERVICE_INTERVAL, 10) || 20000;
  collectorManager.register({
    name: 'services',
    stateKey: 'services',
    intervalMs: serviceInterval,
    critical: false,
    collect: async () => {
      return await getServicesSnapshot();
    }
  });

  // 5. Traffic Analytics (Incremental log reader) (default: 10s)
  const trafficInterval = parseInt(process.env.SYSTEM_OPS_TRAFFIC_INTERVAL, 10) || 10000;
  collectorManager.register({
    name: 'traffic',
    stateKey: 'traffic',
    intervalMs: trafficInterval,
    critical: false,
    collect: async () => {
      return await parseTrafficAnalytics();
    }
  });

  // 6. Backups Files (default: 60s)
  const backupInterval = parseInt(process.env.SYSTEM_OPS_BACKUP_INTERVAL, 10) || 60000;
  collectorManager.register({
    name: 'backups',
    stateKey: 'backups',
    intervalMs: backupInterval,
    critical: false,
    collect: async () => {
      return await listBackupFiles();
    }
  });

  // 7. Ollama Runtime Health & Models (default: 30s)
  const ollamaInterval = parseInt(process.env.SYSTEM_OPS_OLLAMA_INTERVAL, 10) || 30000;
  collectorManager.register({
    name: 'ollama',
    stateKey: 'ollama',
    intervalMs: ollamaInterval,
    critical: false,
    collect: async () => {
      const [sysStatus, listener, apiHealth, hostMetrics, cliList] = await Promise.all([
        getServiceStatus(OLLAMA_SERVICE).catch(() => ({ isActive: false, activeState: 'offline' })),
        checkPortListener(11434, '127.0.0.1').catch(() => ({ listening: false })),
        checkApiHealth(OLLAMA_URL, 3000).catch(err => ({ ok: false, error: err.message, models: [] })),
        Promise.resolve(getHostMetrics()),
        getCliModelList().catch(() => ({ success: false, output: '' }))
      ]);

      return {
        status: {
          timestamp: new Date().toISOString(),
          systemd: sysStatus,
          listener,
          ollamaApi: apiHealth,
          hostMetrics
        },
        models: {
          apiOk: apiHealth.ok,
          latencyMs: apiHealth.latencyMs,
          models: apiHealth.models || [],
          cliOutput: cliList.output || ''
        }
      };
    }
  });

  // 8. Dynamic System Capabilities (default: 30s)
  const capabilitiesInterval = parseInt(process.env.SYSTEM_OPS_CAPABILITIES_INTERVAL, 10) || 30000;
  collectorManager.register({
    name: 'capabilities',
    stateKey: 'capabilities',
    intervalMs: capabilitiesInterval,
    critical: false,
    collect: async () => {
      return await getCapabilities();
    }
  });

  // 9. Docker Containers (default: 10s)
  const dockerInterval = parseInt(process.env.SYSTEM_OPS_DOCKER_INTERVAL, 10) || 10000;
  collectorManager.register({
    name: 'docker',
    stateKey: 'docker',
    intervalMs: dockerInterval,
    critical: false,
    collect: async () => {
      return await getDockerSnapshot();
    }
  });

  // 10. Database engines (default: 20s)
  const dbInterval = parseInt(process.env.SYSTEM_OPS_DATABASE_INTERVAL, 10) || 20000;
  collectorManager.register({
    name: 'databases',
    stateKey: 'databases',
    intervalMs: dbInterval,
    critical: false,
    collect: async () => getDatabaseSnapshot(),
  });

  // 11. Security (UFW / Fail2ban) (default: 30s)
  const securityInterval = parseInt(process.env.SYSTEM_OPS_SECURITY_INTERVAL, 10) || 30000;
  collectorManager.register({
    name: 'security',
    stateKey: 'security',
    intervalMs: securityInterval,
    critical: false,
    collect: async () => getSecuritySnapshot(),
  });

  // 12. OS package updates (default: 5m)
  const osUpdatesInterval = parseInt(process.env.SYSTEM_OPS_OS_UPDATES_INTERVAL, 10) || 300000;
  collectorManager.register({
    name: 'osUpdates',
    stateKey: 'osUpdates',
    intervalMs: osUpdatesInterval,
    critical: false,
    collect: async () => getOsUpdatesSnapshot(),
  });

  // 13. Certbot certificates (default: 5m)
  const certbotInterval = parseInt(process.env.SYSTEM_OPS_CERTBOT_INTERVAL, 10) || 300000;
  collectorManager.register({
    name: 'certbot',
    stateKey: 'certbot',
    intervalMs: certbotInterval,
    critical: false,
    collect: async () => getCertbotSnapshot(),
  });
}

module.exports = {
  registerAllCollectors
};
