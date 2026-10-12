const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function readNativeInventory(io = fs) {
  const filename = '/etc/system-ops/runtime-discovery.json';
  try {
    const stat = io.statSync(filename);
    if (stat.uid !== 0 || (stat.mode & 0o022) || stat.size > 65536) return {};
    const data = JSON.parse(io.readFileSync(filename, 'utf8'));
    return { dockerSockets: Array.isArray(data.dockerSockets) ? data.dockerSockets.filter(value => typeof value === 'string' && path.isAbsolute(value) && !/[\r\n\0]/.test(value)) : [],
      dockerBinary: typeof data.dockerBinary === 'string' && path.isAbsolute(data.dockerBinary) && !/[\r\n\0]/.test(data.dockerBinary) ? data.dockerBinary : undefined };
  } catch { return {}; }
}

function dockerConnection(env = process.env, { io = fs, inventory = readNativeInventory(io), home = os.homedir() } = {}) {
  if (env.DOCKER_CONTEXT) return { args: ['--context', env.DOCKER_CONTEXT], socket: null, target: `context:${env.DOCKER_CONTEXT}` };
  if (env.DOCKER_HOST) return { args: ['--host', env.DOCKER_HOST], socket: env.DOCKER_HOST.startsWith('unix://') ? env.DOCKER_HOST.slice(7) : null, target: env.DOCKER_HOST };
  if (!env.DOCKER_SOCKET) {
    try {
      const configDir = env.DOCKER_CONFIG || path.join(home, '.docker');
      const filename = path.join(configDir, 'config.json');
      if (io.statSync(filename).size <= 65536) {
        const context = JSON.parse(io.readFileSync(filename, 'utf8')).currentContext;
        if (typeof context === 'string' && context && context !== 'default' && !/[\r\n\0]/.test(context)) {
          return { args: ['--config', configDir, '--context', context], socket: null, target: `context:${context}` };
        }
      }
    } catch {}
  }
  const candidates = [env.DOCKER_SOCKET, env.XDG_RUNTIME_DIR && path.join(env.XDG_RUNTIME_DIR, 'docker.sock'), '/var/run/docker.sock', ...(inventory.dockerSockets || [])].filter(Boolean);
  const socket = env.DOCKER_SOCKET || candidates.find(target => {
    try { return io.statSync(target).isSocket(); }
    catch (error) { return ['EACCES', 'EPERM'].includes(error.code); }
  }) || '/var/run/docker.sock';
  return { args: ['--host', `unix://${socket}`], socket, target: `unix://${socket}` };
}

module.exports = { dockerConnection, readNativeInventory };
