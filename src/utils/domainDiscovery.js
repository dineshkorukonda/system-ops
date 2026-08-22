const fs = require('fs');
const path = require('path');
const { runCommand } = require('./exec');

/**
 * Discover domains configured in Nginx (sites-enabled, conf.d, nginx.conf)
 */
function discoverNginxDomains() {
  const discovered = new Set();
  const searchDirs = ['/etc/nginx/sites-enabled', '/etc/nginx/conf.d', '/etc/nginx/sites-available'];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile()) continue;
          const content = fs.readFileSync(fullPath, 'utf8');

          // Match server_name domain1 domain2 ...;
          const matches = content.matchAll(/server_name\s+([^;]+);/g);
          for (const match of matches) {
            const domainList = match[1].trim().split(/\s+/);
            for (const dom of domainList) {
              const cleanDom = dom.toLowerCase().replace(/^\*?\./, '').trim();
              if (
                cleanDom &&
                cleanDom !== '_' &&
                cleanDom !== 'localhost' &&
                cleanDom !== 'default_server' &&
                !/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanDom) &&
                cleanDom.includes('.')
              ) {
                discovered.add(cleanDom);
              }
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  return Array.from(discovered);
}

/**
 * Discover domains from Docker containers (VIRTUAL_HOST / Traefik / labels)
 */
async function discoverDockerDomains() {
  const domains = new Set();
  try {
    const res = await runCommand('docker', ['ps', '--format', '{{.Names}}\t{{.Labels}}'], 3000);
    if (res.success && res.stdout) {
      const lines = res.stdout.split('\n');
      for (const line of lines) {
        // Look for VIRTUAL_HOST=domain.com or Host(`domain.com`)
        const vhostMatch = line.match(/VIRTUAL_HOST=([^,\s]+)/i);
        if (vhostMatch && vhostMatch[1]) {
          domains.add(vhostMatch[1].toLowerCase().trim());
        }
        const traefikMatch = line.match(/Host\(`([^`]+)`\)/i);
        if (traefikMatch && traefikMatch[1]) {
          domains.add(traefikMatch[1].toLowerCase().trim());
        }
      }
    }
  } catch (e) {}
  return Array.from(domains);
}

/**
 * Discover all access log file candidates in /var/log/nginx/
 */
function discoverNginxLogFiles() {
  const files = new Set();
  const defaultLog = process.env.NGINX_LOG_PATH || '/var/log/nginx/access.log';
  if (fs.existsSync(defaultLog)) files.add(defaultLog);

  const logDir = '/var/log/nginx';
  if (fs.existsSync(logDir)) {
    try {
      const dirFiles = fs.readdirSync(logDir);
      for (const f of dirFiles) {
        if (f.endsWith('.log') && (f.includes('access') || !f.includes('error'))) {
          files.add(path.join(logDir, f));
        }
      }
    } catch (e) {}
  }

  return Array.from(files);
}

module.exports = {
  discoverNginxDomains,
  discoverDockerDomains,
  discoverNginxLogFiles
};
