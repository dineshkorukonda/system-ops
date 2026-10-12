const fs = require('node:fs');
const path = require('node:path');

// Discovery is read-only and bounded. It never starts daemons or optional collectors.
function discover({ env = process.env, io = fs, platform = process.platform,
  snapshots = {}, stats = {}, enabled = {}, pm2Users = [], pm2Paths = [], logPaths = [], sslPaths = [] } = {}) {
  const inspect = target => {
    if (!target) return null;
    try { io.accessSync(target, fs.constants.R_OK); return { target, readable: true }; }
    catch (error) { return error.code === 'EACCES' || error.code === 'EPERM'
      ? { target, readable: false, error: 'Permission denied' } : null; }
  };
  const binary = name => (env.PATH || '').split(path.delimiter).filter(Boolean).slice(0, 64)
    .map(dir => inspect(path.join(dir, platform === 'win32' ? `${name}.exe` : name))).find(Boolean);
  const dockerSocket = env.DOCKER_SOCKET || (env.DOCKER_HOST?.startsWith('unix://') ? env.DOCKER_HOST.slice(7) :
    env.XDG_RUNTIME_DIR ? path.join(env.XDG_RUNTIME_DIR, 'docker.sock') : '/var/run/docker.sock');
  const candidates = {
    docker: [binary('docker'), inspect(env.DOCKER_PATH), inspect(dockerSocket)],
    pm2: [binary('pm2'), inspect(env.PM2_PATH), inspect(env.PM2_HOME), ...pm2Paths.slice(0, 32).map(inspect),
      ...pm2Users.slice(0, 16).flatMap(user => {
        const suffix = user.toUpperCase().replace(/[^A-Z0-9]/g, '_');
        return [inspect(env[`PM2_PATH_${suffix}`]), inspect(env[`PM2_HOME_${suffix}`] ||
          path.join(user === 'root' ? '/root' : `/home/${user}`, '.pm2'))];
      })],
    traffic: [...new Set([env.NGINX_LOG_PATH, ...logPaths])].slice(0, 8).map(inspect),
    tls: [...new Set(sslPaths)].slice(0, 50).map(inspect),
    systemd: [inspect('/run/systemd/system')], backups: [inspect(env.BACKUPS_DIR || env.BACKUP_DIR)],
    ollama: [binary('ollama')], databases: [binary('psql'), binary('redis-cli'), binary('mysql')],
    security: [binary('ufw'), binary('fail2ban-client')], osUpdates: [binary('apt')], certbot: [binary('certbot'), inspect('/etc/letsencrypt/live')],
  };
  const configured = {
    docker: !!(env.DOCKER_HOST || env.DOCKER_SOCKET || env.DOCKER_PATH),
    pm2: !!(env.PM2_USERS || env.PM2_HOME || env.PM2_PATH), traffic: !!env.NGINX_LOG_PATH,
    tls: !!env.TLS_HOSTS, backups: !!(env.BACKUPS_DIR || env.BACKUP_DIR || env.LOG_SOURCES),
    ollama: !!env.OLLAMA_URL,
  };
  const result = { timestamp: new Date().toISOString(), discovery: 'read-only-filesystem-and-monitored-evidence' };
  for (const [name, raw] of Object.entries(candidates)) {
    const key = name === 'systemd' ? 'services' : name === 'tls' ? 'system' : name;
    const snapshot = snapshots[key];
    const metadata = stats[key] || {};
    const evidence = raw.filter(Boolean);
    const count = name === 'pm2' ? snapshot?.totalProcesses : name === 'docker' ? snapshot?.total :
      name === 'tls' ? snapshot?.tls?.length : snapshot?.count;
    const successfulEvidence = name === 'docker' ? snapshot?.daemonReachable === true :
      name === 'pm2' ? snapshot?.allUsers?.some(user => !user.error && user.pm2Path) :
      name === 'traffic' ? snapshot?.processing?.trackedFiles > 0 : name === 'tls' ? count > 0 : snapshot?.available === true;
    const detected = evidence.length > 0 || !!successfulEvidence;
    const monitoring = name === 'tls' || enabled[key] === true;
    const sourceErrors = name === 'pm2' ? snapshot?.allUsers?.filter(user => user.error).map(user => `${user.user}: ${user.error}`) || [] : [];
    const error = metadata.lastError || snapshot?.error || sourceErrors.join('; ') || evidence.find(item => !item.readable)?.error || null;
    const fresh = metadata.fresh ?? (metadata.lastSuccess && Date.now() - Date.parse(metadata.lastSuccess) < (metadata.intervalMs || 30000) * 3);
    const status = error ? 'error' : !detected ? configured[name] ? 'configured' : 'not-detected' :
      !monitoring ? 'disabled' : !metadata.lastSuccess ? 'detected' : !fresh ? 'stale' : 'monitoring';
    result[name] = { available: detected, installed: evidence.length > 0, configured: !!configured[name],
      enabled: monitoring, status, evidence, needsSetup: !detected || !!error,
      permissionIssue: evidence.some(item => !item.readable) || snapshot?.permissionIssue === true,
      error, count: Number.isFinite(count) ? count : null, lastSuccess: metadata.lastSuccess || null,
      hint: name === 'pm2' ? 'For other accounts, configure the root-owned PM2 helper. Discovery cannot read private homes automatically.' :
        name === 'docker' ? 'Check Docker context, socket access and DOCKER_HOST. A CLI alone does not prove the daemon is running.' :
          name === 'traffic' ? 'Set NGINX_LOG_PATH to a readable access log; custom Nginx access_log paths are also discovered.' :
            name === 'tls' ? 'Certificates come from active Nginx configuration, TLS_HOSTS or monitored TLS results.' : null };
  }
  return result;
}
module.exports = { discover };
