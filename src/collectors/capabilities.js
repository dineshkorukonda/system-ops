const net = require('net');
const fs = require('fs');
const { runCommand } = require('../utils/exec');
const { runDocker, socketExists, buildDockerError } = require('../utils/dockerExec');
const { collectPm2Snapshot } = require('../../plugins/superpowers/skills/pm2_discovery');
const { discoverNginxDomains } = require('../utils/domainDiscovery');

/**
 * Check if a TCP port is open locally
 */
function probePort(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

function pathReadable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect host capabilities. Only mark features available when genuinely present.
 */
async function getCapabilities() {
  const [
    dockerCap,
    pm2Cap,
    ollamaCap,
    systemdCap,
    backupsCap,
    trafficCap,
    databasesCap,
    securityCap,
    osUpdatesCap,
    certbotCap,
    monixCap,
  ] = await Promise.all([
    detectDocker(),
    detectPm2(),
    detectOllama(),
    detectSystemd(),
    detectBackups(),
    detectTraffic(),
    detectDatabases(),
    detectSecurity(),
    detectOsUpdates(),
    detectCertbot(),
    detectMonix(),
  ]);

  return {
    docker: dockerCap,
    pm2: pm2Cap,
    ollama: ollamaCap,
    systemd: systemdCap,
    backups: backupsCap,
    traffic: trafficCap,
    databases: databasesCap,
    security: securityCap,
    osUpdates: osUpdatesCap,
    certbot: certbotCap,
    monix: monixCap,
    timestamp: new Date().toISOString(),
  };
}

async function detectDocker() {
  try {
    const res = await runDocker(['ps', '-q'], 2500);
    if (res.success) {
      const runningIds = res.stdout.trim().split('\n').filter(Boolean);
      const netRes = await runDocker(['network', 'ls', '-q'], 2500);
      const networkCount = netRes.success
        ? netRes.stdout.trim().split('\n').filter(Boolean).length
        : 0;
      return {
        available: true,
        daemonReachable: true,
        count: runningIds.length,
        running: runningIds.length,
        networkCount,
        usedSudo: res.usedSudo,
        permissionIssue: false,
      };
    }

    const errInfo = buildDockerError(res);
    const hasSocket = socketExists();

    return {
      available: hasSocket && errInfo.permissionIssue,
      daemonReachable: false,
      count: 0,
      running: 0,
      networkCount: 0,
      usedSudo: res.usedSudo,
      permissionIssue: errInfo.permissionIssue,
      error: errInfo.error,
      hint: errInfo.hint,
    };
  } catch (err) {
    return {
      available: false,
      daemonReachable: false,
      count: 0,
      running: 0,
      networkCount: 0,
      permissionIssue: false,
      error: err.message,
    };
  }
}

async function detectPm2() {
  try {
    const snapshot = await collectPm2Snapshot();
    const users = snapshot?.users || [];
    let totalProcesses = 0;
    let workingUsers = 0;

    for (const u of users) {
      const procs = u.processes || [];
      totalProcesses += procs.length;
      if (procs.length > 0 && !u.error) workingUsers++;
      if (!u.error && u.pm2Path) workingUsers++;
    }

    const available = totalProcesses > 0 || workingUsers > 0;
    return {
      available,
      count: totalProcesses,
      users: users.length,
      workingUsers,
    };
  } catch (err) {
    return { available: false, count: 0, users: 0, workingUsers: 0 };
  }
}

async function detectOllama() {
  try {
    if (process.env.ENABLE_OLLAMA === 'true') {
      return { available: true, running: true, reason: 'enabled via ENABLE_OLLAMA' };
    }

    const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    try {
      const https = require('http');
      const health = await new Promise((resolve) => {
        const req = https.get(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, { timeout: 2000 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
      });
      if (health) {
        return { available: true, running: true, reason: 'api responding' };
      }
    } catch {
      // continue
    }

    if (process.platform !== 'win32') {
      const whichRes = await runCommand('which', ['ollama'], 1500);
      if (whichRes.success && whichRes.stdout.trim()) {
        const activeRes = await runCommand('systemctl', ['is-active', 'ollama'], 1500);
        const running = activeRes.success && activeRes.stdout.trim() === 'active';
        return { available: true, running, reason: 'binary installed' };
      }
    }

    return { available: false, running: false };
  } catch (err) {
    return { available: false, running: false };
  }
}

async function detectSystemd() {
  try {
    if (process.platform === 'win32') {
      return { available: true, count: 0 };
    }
    const isSystemd = fs.existsSync('/run/systemd/system');
    return { available: isSystemd, count: 0 };
  } catch (err) {
    return { available: false, count: 0 };
  }
}

async function detectBackups() {
  try {
    const backupDir = process.env.BACKUPS_DIR || process.env.BACKUP_DIR || '';
    let dirExists = false;
    let fileCount = 0;

    if (backupDir && fs.existsSync(backupDir)) {
      dirExists = true;
      try {
        const entries = fs.readdirSync(backupDir, { withFileTypes: true });
        fileCount = entries.filter((e) => e.isFile()).length;
      } catch {
        // unreadable
      }
    }

    const logSourcesEnv = process.env.LOG_SOURCES || '';
    let configuredSources = 0;
    let readableSources = 0;

    if (logSourcesEnv.trim()) {
      const entries = logSourcesEnv.split(',').map((s) => s.trim()).filter(Boolean);
      configuredSources = entries.length;
      for (const entry of entries) {
        const parts = entry.split(':');
        const target = parts.find((p) => p.startsWith('/'));
        if (target && pathReadable(target)) readableSources++;
      }
    }

    const available = dirExists || readableSources > 0;

    return {
      available,
      backupDir: backupDir || null,
      dirExists,
      fileCount,
      configuredSources,
      readableSources,
    };
  } catch (err) {
    return { available: false, dirExists: false, fileCount: 0 };
  }
}

async function detectTraffic() {
  try {
    const logPath = process.env.NGINX_LOG_PATH || '/var/log/nginx/access.log';
    const logExists = fs.existsSync(logPath);
    const logReadable = logExists && pathReadable(logPath);
    const nginxDomains = discoverNginxDomains();

    const available = logReadable || nginxDomains.length > 0;

    return {
      available,
      logPath,
      logExists,
      logReadable,
      domainCount: nginxDomains.length,
    };
  } catch (err) {
    return { available: false, logExists: false, logReadable: false, domainCount: 0 };
  }
}

async function detectDatabases() {
  try {
    const { checkPostgres, checkRedis, checkMysql } = require('./databases');
    const [pg, redis, mysql] = await Promise.all([
      checkPostgres(parseInt(process.env.POSTGRES_PORT, 10) || 5432),
      checkRedis(parseInt(process.env.REDIS_PORT, 10) || 6379),
      checkMysql(parseInt(process.env.MYSQL_PORT, 10) || 3306),
    ]);
    const count = [pg, redis, mysql].filter((e) => e.available).length;
    return { available: count > 0, count, postgresql: pg.available, redis: redis.available, mysql: mysql.available };
  } catch {
    return { available: false, count: 0 };
  }
}

async function detectSecurity() {
  try {
    const { getSecuritySnapshot } = require('./security');
    const snap = await getSecuritySnapshot();
    return {
      available: snap.available,
      ufw: snap.ufw?.available === true,
      fail2ban: snap.fail2ban?.available === true,
    };
  } catch {
    return { available: false };
  }
}

async function detectOsUpdates() {
  try {
    if (process.platform === 'win32') return { available: false, pendingCount: 0 };
    const which = await runCommand('which', ['apt'], 1500);
    return { available: which.success && !!which.stdout.trim(), pendingCount: 0 };
  } catch {
    return { available: false, pendingCount: 0 };
  }
}

async function detectCertbot() {
  try {
    const which = await runCommand('which', ['certbot'], 1500);
    const installed = which.success && !!which.stdout.trim();
    return { available: installed, installed };
  } catch {
    return { available: false, installed: false };
  }
}

async function detectMonix() {
  try {
    const baseUrl = (process.env.MONIX_URL || '').trim();
    if (!baseUrl) return { available: false, configured: false };
    const { getMonixSnapshot } = require('./monix');
    const snap = await getMonixSnapshot();
    return {
      available: snap.available,
      configured: true,
      siteCount: snap.siteCount || 0,
      baseUrl: snap.baseUrl,
    };
  } catch {
    return { available: false, configured: !!(process.env.MONIX_URL || '').trim() };
  }
}

module.exports = {
  getCapabilities,
  detectDocker,
  detectPm2,
  detectOllama,
  detectSystemd,
  detectBackups,
  detectTraffic,
  detectDatabases,
  detectSecurity,
  detectOsUpdates,
  detectCertbot,
  detectMonix,
};
