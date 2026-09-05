const net = require('net');
const fs = require('fs');
const { runCommand } = require('../utils/exec');
const { collectPm2Snapshot } = require('../../plugins/superpowers/skills/pm2_discovery');

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

/**
 * Detect host capabilities: Docker, PM2, Ollama, and Systemd.
 * All probes run concurrently with bounded timeouts.
 */
async function getCapabilities() {
  const [dockerCap, pm2Cap, ollamaCap, systemdCap] = await Promise.all([
    detectDocker(),
    detectPm2(),
    detectOllama(),
    detectSystemd()
  ]);

  return {
    docker: dockerCap,
    pm2: pm2Cap,
    ollama: ollamaCap,
    systemd: systemdCap,
    timestamp: new Date().toISOString()
  };
}

async function detectDocker() {
  try {
    // Quick probe: docker ps with minimal format
    const res = await runCommand('docker', ['ps', '-q'], 2500);
    if (res.success) {
      const runningIds = res.stdout.trim().split('\n').filter(Boolean);
      return {
        available: true,
        count: runningIds.length,
        running: runningIds.length
      };
    }

    // Check if docker daemon is present or socket exists
    if (fs.existsSync('/var/run/docker.sock')) {
      return { available: true, count: 0, running: 0 };
    }

    return { available: false, count: 0, running: 0 };
  } catch (err) {
    return { available: false, count: 0, running: 0 };
  }
}

async function detectPm2() {
  try {
    const snapshot = await collectPm2Snapshot();
    const users = snapshot?.users || [];
    let totalProcesses = 0;
    let hasBinary = false;

    for (const u of users) {
      const procs = u.processes || [];
      totalProcesses += procs.length;
      if (u.binaryPath) hasBinary = true;
    }

    const available = totalProcesses > 0 || hasBinary;
    return {
      available,
      count: totalProcesses
    };
  } catch (err) {
    return { available: false, count: 0 };
  }
}

async function detectOllama() {
  try {
    // Check 1: Port listener probe on 11434
    const portActive = await probePort(11434, '127.0.0.1', 800);
    if (portActive) {
      return { available: true, running: true };
    }

    // Check 2: systemctl status ollama (Linux)
    if (process.platform !== 'win32') {
      const sysRes = await runCommand('systemctl', ['is-active', 'ollama'], 1500);
      if (sysRes.success && sysRes.stdout.trim() === 'active') {
        return { available: true, running: true };
      }
      // Check if unit file exists
      const unitRes = await runCommand('systemctl', ['status', 'ollama'], 1500);
      if (unitRes.stdout && !unitRes.stdout.includes('Unit ollama.service could not be found')) {
        return { available: true, running: false };
      }

      // Check if binary exists
      const whichRes = await runCommand('which', ['ollama'], 1500);
      if (whichRes.success && whichRes.stdout.trim()) {
        return { available: true, running: false };
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
      // In dev environment on Windows, allow systemd to simulate/display
      return { available: true, count: 4 };
    }
    const isSystemd = fs.existsSync('/run/systemd/system');
    return { available: isSystemd, count: 0 };
  } catch (err) {
    return { available: false, count: 0 };
  }
}

module.exports = {
  getCapabilities,
  detectDocker,
  detectPm2,
  detectOllama,
  detectSystemd
};
