const http = require('http');
const https = require('https');
const { discoverNginxDomains } = require('../utils/domainDiscovery');

function getMonixBaseUrl() {
  const raw = process.env.MONIX_URL || '';
  return raw.replace(/\/$/, '');
}

function getConfiguredSlugs() {
  const explicit = (process.env.MONIX_STATUS_SLUGS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (explicit.length > 0) return explicit;

  if (process.env.MONIX_AUTO_DISCOVER === 'true') {
    return discoverNginxDomains().filter(
      (d) => !d.includes('example.com') && !d.includes('example.org')
    );
  }

  return [];
}

function fetchJson(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function fetchMonixStatus(baseUrl, slug) {
  const url = `${baseUrl}/api/status/${encodeURIComponent(slug)}`;
  try {
    const data = await fetchJson(url);
    if (!data?.site) return null;

    return {
      slug,
      name: data.site.name,
      url: data.site.url,
      status: data.site.status,
      responseTimeMs: data.site.currentResponseTimeMs,
      statusCode: data.site.currentStatusCode,
      lastCheckedAt: data.site.lastCheckedAt,
      uptime24h: data.site.uptimePercentage24h,
      uptime30d: data.site.uptimePercentage30d,
      certDaysRemaining: data.site.certDaysRemaining,
      certIssuer: data.site.certIssuer,
      certWarning: data.site.certWarning === true,
      incidents: (data.incidents || []).slice(0, 5),
      statusPageUrl: `${baseUrl}/status/${slug}`,
      monixManaged: true,
    };
  } catch {
    return null;
  }
}

async function getMonixSnapshot() {
  const baseUrl = getMonixBaseUrl();
  if (!baseUrl) {
    return {
      available: false,
      configured: false,
      baseUrl: null,
      sites: [],
    };
  }

  const slugs = getConfiguredSlugs();
  if (slugs.length === 0) {
    return {
      available: false,
      configured: true,
      baseUrl,
      sites: [],
      hint: 'Set MONIX_STATUS_SLUGS or MONIX_AUTO_DISCOVER=true',
    };
  }

  const results = await Promise.all(slugs.map((slug) => fetchMonixStatus(baseUrl, slug)));
  const sites = results.filter(Boolean);

  const downCount = sites.filter((s) => s.status === 'down').length;
  const degradedCount = sites.filter((s) => s.certWarning).length;

  return {
    available: sites.length > 0,
    configured: true,
    baseUrl,
    timestamp: new Date().toISOString(),
    siteCount: sites.length,
    downCount,
    degradedCount,
    sites,
  };
}

module.exports = {
  getMonixSnapshot,
  getMonixBaseUrl,
  getConfiguredSlugs,
};
