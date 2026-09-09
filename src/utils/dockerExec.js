const fs = require('fs');
const { runCommand } = require('./exec');

const DOCKER_BIN = process.env.DOCKER_PATH || 'docker';
const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

function isPermissionError(res) {
  const msg = `${res.stderr || ''} ${res.stdout || ''}`.toLowerCase();
  return (
    /permission denied/.test(msg) ||
    /cannot connect to the docker daemon/.test(msg) ||
    /got permission denied while trying to connect/.test(msg)
  );
}

function socketExists() {
  try {
    return fs.existsSync(DOCKER_SOCKET);
  } catch {
    return false;
  }
}

/**
 * Run a docker CLI command, falling back to sudo when the ops user lacks socket access.
 */
async function runDocker(args, timeoutMs = 5000) {
  if (process.env.DOCKER_USE_SUDO === 'true') {
    const sudoRes = await runCommand('sudo', [DOCKER_BIN, ...args], timeoutMs);
    return { ...sudoRes, usedSudo: true };
  }

  const direct = await runCommand(DOCKER_BIN, args, timeoutMs);
  if (direct.success) {
    return { ...direct, usedSudo: false };
  }

  if (isPermissionError(direct) && process.platform !== 'win32') {
    const sudoRes = await runCommand('sudo', [DOCKER_BIN, ...args], timeoutMs);
    return { ...sudoRes, usedSudo: true };
  }

  return { ...direct, usedSudo: false };
}

function buildDockerError(res) {
  const stderr = (res.stderr || '').trim();
  const stdout = (res.stdout || '').trim();
  const message = stderr || stdout || 'Docker command failed';

  if (isPermissionError(res)) {
    return {
      error: message,
      permissionIssue: true,
      hint: 'Add the ops user to the docker group: sudo usermod -aG docker ops && sudo systemctl restart system-ops.service',
    };
  }

  if (!socketExists() && process.platform !== 'win32') {
    return {
      error: 'Docker socket not found at /var/run/docker.sock',
      permissionIssue: false,
      hint: 'Install Docker or set DOCKER_SOCKET if using a custom socket path.',
    };
  }

  return {
    error: message,
    permissionIssue: false,
    hint: 'Run: sudo bash /opt/system-ops/scripts/debug-docker.sh',
  };
}

module.exports = {
  runDocker,
  isPermissionError,
  socketExists,
  buildDockerError,
  DOCKER_BIN,
  DOCKER_SOCKET,
};
