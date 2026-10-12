const fs = require('fs');
const path = require('path');
const { runCommand } = require('./exec');

function nginxConfigFiles() {
  const dirs = (process.env.NGINX_CONFIG_DIRS || '/etc/nginx/sites-enabled,/etc/nginx/conf.d').split(',').filter(Boolean).slice(0, 8);
  const files = new Set();
  for (const dir of dirs) {
    try { for (const name of fs.readdirSync(dir).slice(0, 64)) files.add(path.join(dir, name)); } catch {}
  }
  return [...files].slice(0, 64);
}
function configContents() {
  return nginxConfigFiles().flatMap(file => {
    try { const stat = fs.statSync(file); return stat.isFile() && stat.size <= 256 * 1024
      ? [fs.readFileSync(file, 'utf8').replace(/#[^\n]*/g, '')] : []; } catch { return []; }
  });
}

/**
 * Discover domains configured in Nginx (sites-enabled, conf.d, nginx.conf)
 */
function discoverNginxDomains() {
  const discovered = new Set();
  const searchDirs = (process.env.NGINX_CONFIG_DIRS || '/etc/nginx/sites-enabled,/etc/nginx/conf.d').split(',').slice(0, 8);

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).slice(0, 64);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile() || stat.size > 256 * 1024) continue;
          const content = fs.readFileSync(fullPath, 'utf8').replace(/#[^\n]*/g, '');

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
 * Map hostnames to ssl_certificate paths parsed from nginx server blocks.
 */
function discoverNginxSslMap() {
  const map = new Map();
  const searchDirs = (process.env.NGINX_CONFIG_DIRS || '/etc/nginx/sites-enabled,/etc/nginx/conf.d').split(',').slice(0, 8);

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).slice(0, 64);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (!stat.isFile() || stat.size > 256 * 1024) continue;
          const content = fs.readFileSync(fullPath, 'utf8').replace(/#[^\n]*/g, '');
          parseNginxServerBlocks(content, map);
        } catch (e) {}
      }
    } catch (e) {}
  }

  return map;
}

function parseNginxServerBlocks(content, map) {
  const blocks = content.split(/\bserver\s*\{/i).slice(1);

  for (const block of blocks) {
    let depth = 1, endIdx = block.length;
    for (let i = 0; i < block.length; i++) {
      if (block[i] === '{') depth++;
      if (block[i] === '}' && --depth === 0) { endIdx = i; break; }
    }
    const body = block.slice(0, endIdx);

    const certMatch = body.match(/ssl_certificate\s+([^;\s]+)/i);
    if (!certMatch || !certMatch[1] || certMatch[1].includes('ssl_certificate_key')) continue;

    const certPath = certMatch[1].trim().replace(/^["']|["']$/g, '');
    if (certPath.endsWith('.key')) continue;

    const nameMatches = body.matchAll(/server_name\s+([^;]+);/gi);
    for (const match of nameMatches) {
      const domainList = match[1].trim().split(/\s+/);
      for (const dom of domainList) {
        const cleanDom = dom.toLowerCase().replace(/^\*\./, '').trim();
        if (
          cleanDom &&
          cleanDom !== '_' &&
          cleanDom !== 'localhost' &&
          cleanDom !== 'default_server' &&
          !/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanDom) &&
          cleanDom.includes('.')
        ) {
          map.set(cleanDom, certPath);
        }
      }
    }
  }
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
  for (const content of configContents()) {
    for (const match of content.matchAll(/\baccess_log\s+["']?([^\s;"']+)/g)) {
      if (path.isAbsolute(match[1]) && !match[1].includes('$')) files.add(match[1]);
    }
  }

  const logDir = '/var/log/nginx';
  if (fs.existsSync(logDir)) {
    try {
      const dirFiles = fs.readdirSync(logDir).slice(0, 64);
      for (const f of dirFiles) {
        if (f.endsWith('.log') && (f.includes('access') || !f.includes('error'))) {
          files.add(path.join(logDir, f));
        }
      }
    } catch (e) {}
  }

  return Array.from(files).slice(0, 8);
}

module.exports = {
  discoverNginxDomains,
  discoverNginxSslMap,
  discoverDockerDomains,
  discoverNginxLogFiles
};
