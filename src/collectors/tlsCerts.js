const fs = require('fs');
const tls = require('tls');
const path = require('path');
const { runCommand } = require('../utils/exec');
const { discoverNginxDomains, discoverNginxSslMap } = require('../utils/domainDiscovery');

function extractHostname(value) {
  const cleaned = String(value || '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .trim()
    .toLowerCase();
  return cleaned;
}

async function readCertFromFile(certPath) {
  if (!certPath || !fs.existsSync(certPath)) return null;

  const opensslRes = await runCommand('openssl', ['x509', '-enddate', '-noout', '-in', certPath], 3000);
  if (!opensslRes.success || !opensslRes.stdout.includes('notAfter=')) return null;

  const dateStr = opensslRes.stdout.replace('notAfter=', '').trim();
  const validTo = new Date(dateStr);
  if (Number.isNaN(validTo.getTime())) return null;

  const daysRemaining = Math.floor((validTo - Date.now()) / (1000 * 60 * 60 * 24));
  const isValid = daysRemaining > 0;

  return {
    target: path.basename(path.dirname(certPath)),
    certPath,
    source: 'file',
    valid: isValid,
    daysRemaining,
    validTo: validTo.toISOString(),
    formattedValidTo: validTo.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    statusText: isValid ? `${daysRemaining} days remaining` : 'EXPIRED',
    issuer: null,
  };
}

function checkNetworkTlsCert(hostname, port = 443, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const host = extractHostname(hostname);
    if (!host || !host.includes('.')) {
      resolve(null);
      return;
    }

    const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(host);
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let socket;
    try {
      socket = tls.connect(
        {
          host,
          port,
          servername: isIp ? undefined : host,
          rejectUnauthorized: false,
        },
        () => {
          try {
            const cert = socket.getPeerCertificate();
            socket.destroy();

            if (!cert || !cert.valid_to) {
              finish(null);
              return;
            }

            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.floor((validTo - Date.now()) / (1000 * 60 * 60 * 24));
            const isValid = daysRemaining > 0;
            const issuer =
              typeof cert.issuer === 'object'
                ? cert.issuer.O || cert.issuer.CN || null
                : cert.issuer || null;

            finish({
              target: host,
              source: 'https',
              valid: isValid,
              daysRemaining,
              validTo: validTo.toISOString(),
              formattedValidTo: validTo.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              }),
              statusText: isValid ? `${daysRemaining} days remaining` : 'EXPIRED',
              issuer,
            });
          } catch {
            finish(null);
          }
        }
      );

      socket.setTimeout(timeoutMs);
      socket.on('timeout', () => {
        socket.destroy();
        finish(null);
      });
      socket.on('error', () => {
        socket.destroy();
        finish(null);
      });
    } catch {
      finish(null);
    }
  });
}

function discoverLetsencryptLiveCerts() {
  const liveDir = '/etc/letsencrypt/live';
  const map = new Map();

  if (!fs.existsSync(liveDir)) return map;

  try {
    const entries = fs.readdirSync(liveDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'README') continue;
      const certPath = path.join(liveDir, entry.name, 'cert.pem');
      if (fs.existsSync(certPath)) {
        map.set(entry.name.toLowerCase(), certPath);
      }
    }
  } catch {
    // unreadable without permissions
  }

  return map;
}

async function inspectHostTls(hostOrPath, sslMap, letsencryptMap) {
  const hostname = extractHostname(hostOrPath);
  const certCandidates = [];

  if (hostOrPath.includes('/') && fs.existsSync(hostOrPath)) {
    certCandidates.push(hostOrPath);
  }

  const mappedPath = sslMap.get(hostname);
  if (mappedPath) certCandidates.push(mappedPath);

  const lePath = letsencryptMap.get(hostname);
  if (lePath) certCandidates.push(lePath);

  if (!hostOrPath.includes('/')) {
    certCandidates.push(`/etc/letsencrypt/live/${hostname}/cert.pem`);
  }

  const uniqueCandidates = [...new Set(certCandidates)];

  const [networkResult, ...fileResults] = await Promise.all([
    hostname.includes('.') ? checkNetworkTlsCert(hostname) : Promise.resolve(null),
    ...uniqueCandidates.map((p) => readCertFromFile(p)),
  ]);

  const fileResult = fileResults.find(Boolean);

  if (networkResult) {
    return {
      ...networkResult,
      target: hostname || hostOrPath,
      filePath: fileResult?.certPath || null,
      source: fileResult ? `${networkResult.source}+file` : networkResult.source,
    };
  }

  if (fileResult) {
    return {
      ...fileResult,
      target: hostname || hostOrPath,
    };
  }

  return {
    target: hostname || hostOrPath,
    source: 'unknown',
    valid: false,
    daysRemaining: 0,
    validTo: null,
    formattedValidTo: 'N/A',
    statusText: 'Could not verify certificate (check DNS, nginx SSL, or TLS_HOSTS)',
    issuer: null,
  };
}

/**
 * Inspect TLS certificate validity for hostnames or cert paths.
 * Prefers live HTTPS probes (works with Cloudflare, reverse proxies, and unreadable cert files).
 */
async function getTlsCertStatus() {
  const envHosts = process.env.TLS_HOSTS || '';
  let hosts = envHosts.split(',').map((h) => h.trim()).filter(Boolean);

  if (hosts.length === 0) {
    hosts = discoverNginxDomains().filter(
      (d) => !d.includes('example.com') && !d.includes('example.org')
    );
  }

  const sslMap = discoverNginxSslMap();
  const letsencryptMap = discoverLetsencryptLiveCerts();

  const normalized = [...new Set(hosts.map((h) => extractHostname(h) || h))];

  const results = await Promise.all(
    normalized.map((host) => inspectHostTls(host, sslMap, letsencryptMap))
  );

  return results.sort((a, b) => a.target.localeCompare(b.target));
}

module.exports = {
  getTlsCertStatus,
  checkNetworkTlsCert,
  extractHostname,
};
