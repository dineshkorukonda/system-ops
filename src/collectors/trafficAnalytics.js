const fs = require('fs');
const readline = require('readline');
const path = require('path');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const { discoverNginxDomains, discoverDockerDomains, discoverNginxLogFiles } = require('../utils/domainDiscovery');

/**
 * Standard OS classifier
 */
function normalizeOS(osName) {
  if (!osName) return 'Other';
  const name = osName.toLowerCase();
  if (name.includes('android')) return 'Android';
  if (name.includes('ios') || name.includes('iphone') || name.includes('ipad')) return 'iOS';
  if (name.includes('windows')) return 'Windows';
  if (name.includes('mac') || name.includes('os x')) return 'Mac';
  if (name.includes('linux') || name.includes('ubuntu') || name.includes('debian')) return 'Linux';
  return 'Other';
}

/**
 * Clean & validate IP string (e.g., from Cloudflare or X-Forwarded-For)
 */
function extractValidIP(cfIp, remoteUser) {
  if (cfIp && cfIp !== '-' && cfIp !== 'unknown') {
    const firstIp = cfIp.split(',')[0].trim();
    if (firstIp && firstIp !== '-' && !firstIp.includes(':') && /^\d{1,3}(\.\d{1,3}){3}$/.test(firstIp)) {
      return firstIp;
    }
    if (firstIp && firstIp.includes(':')) return firstIp; // IPv6
  }
  if (remoteUser && remoteUser !== '-' && /^\d{1,3}(\.\d{1,3}){3}$/.test(remoteUser)) {
    return remoteUser.trim();
  }
  return null;
}

/**
 * Generate human-friendly label from domain name
 */
function formatDomainLabel(domain) {
  if (!domain) return 'Default';
  const parts = domain.split('.');
  if (parts.length >= 2) {
    const sub = parts[0];
    if (sub === 'www') return parts[1].toUpperCase();
    return sub.charAt(0).toUpperCase() + sub.slice(1);
  }
  return domain;
}

/**
 * Get configured target domains or auto-discover from Nginx & Docker configs
 */
async function getResolvedDomains() {
  const map = {};

  // 1. Check explicit .env configuration
  if (process.env.TRACKED_DOMAINS) {
    process.env.TRACKED_DOMAINS.split(',').forEach(entry => {
      const parts = entry.split(':');
      const domain = parts[0].trim().toLowerCase();
      const label = parts[1] ? parts[1].trim() : formatDomainLabel(domain);
      if (domain) map[domain] = label;
    });
  }

  // 2. Auto-discover from Nginx sites-enabled & conf.d
  const nginxDomains = discoverNginxDomains();
  nginxDomains.forEach(dom => {
    if (!map[dom] && !dom.includes('example.com')) {
      map[dom] = formatDomainLabel(dom);
    }
  });

  // 3. Auto-discover from Docker containers
  try {
    const dockerDomains = await discoverDockerDomains();
    dockerDomains.forEach(dom => {
      if (!map[dom] && !dom.includes('example.com')) {
        map[dom] = formatDomainLabel(dom);
      }
    });
  } catch (e) {}

  return map;
}

/**
 * Parse Nginx access logs line-by-line using streaming readline
 */
async function parseTrafficAnalytics(customLogPath = null) {
  const TARGET_DOMAINS = await getResolvedDomains();
  const logFiles = customLogPath ? [customLogPath] : discoverNginxLogFiles();

  const domainSummaries = {};
  const domainUniqueDevices = {};

  // Initialize discovered domains
  Object.entries(TARGET_DOMAINS).forEach(([dom, label]) => {
    domainSummaries[dom] = { name: label, hits: 0, unique: 0, mobile_hits: 0, web_hits: 0, bytes: 0 };
    domainUniqueDevices[dom] = new Set();
  });

  const summary = {
    total_hits: 0,
    total_mobile_hits: 0,
    total_web_hits: 0,
    total_bytes: 0,
    unique_devices: 0,
    domains: domainSummaries
  };

  const status_codes = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0
  };

  const browsers = {};
  const endpointMap = new Map();
  const ipMap = new Map();
  const hourlyMap = new Map();

  const os_stats = {
    Android: 0,
    iOS: 0,
    Windows: 0,
    Mac: 0,
    Linux: 0,
    Other: 0
  };

  const uniqueDevicesGlobal = new Set();
  const locationMap = new Map();
  const recentVisitors = [];

  const existingLogs = logFiles.filter(f => fs.existsSync(f));

  if (existingLogs.length === 0) {
    return {
      summary,
      status_codes,
      top_endpoints: [],
      top_ips: [],
      browsers: {},
      hourly_distribution: [],
      os_stats,
      locations: [],
      recent_visitors: [],
      error: `No Nginx access logs found in /var/log/nginx/`
    };
  }

  const hostLogRegex = /^(\S+)\s+(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;
  const standardLogRegex = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

  for (const logPath of existingLogs) {
    try {
      const fileStream = fs.createReadStream(logPath, { encoding: 'utf8' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
      });

      // Default fallback host if log is standard combined
      const nonExampleHost = Object.keys(TARGET_DOMAINS).find(d => !d.includes('example.com'));
      const defaultHost = nonExampleHost || Object.keys(TARGET_DOMAINS)[0] || path.basename(logPath).replace(/\.access\.log|\.log/, '') || 'primary';

      for await (const line of rl) {
        if (!line || !line.trim()) continue;

        let host = defaultHost;
        let clientIp = null;
        let timeLocal = '';
        let requestStr = '';
        let statusCode = 0;
        let bodyBytes = 0;
        let userAgent = '';

        const hostMatch = line.match(hostLogRegex);
        if (hostMatch) {
          const rawHost = hostMatch[1].toLowerCase().split(':')[0];
          const cfIp = hostMatch[2];
          const remoteUser = hostMatch[3];
          timeLocal = hostMatch[4];
          requestStr = hostMatch[5];
          statusCode = parseInt(hostMatch[6], 10) || 0;
          bodyBytes = parseInt(hostMatch[7], 10) || 0;
          userAgent = hostMatch[9] || '';

          if (/^\d{1,3}(\.\d{1,3}){3}$/.test(rawHost)) {
            clientIp = rawHost;
            host = defaultHost;
          } else {
            host = rawHost;
            clientIp = extractValidIP(cfIp, remoteUser) || cfIp;
          }
        } else {
          const stdMatch = line.match(standardLogRegex);
          if (stdMatch) {
            clientIp = stdMatch[1];
            timeLocal = stdMatch[3];
            requestStr = stdMatch[4];
            statusCode = parseInt(stdMatch[5], 10) || 0;
            bodyBytes = parseInt(stdMatch[6], 10) || 0;
            userAgent = stdMatch[8] || '';
            host = defaultHost;
          } else {
            continue;
          }
        }

        // If TRACKED_DOMAINS is explicitly configured, filter out non-target domains
        if (process.env.TRACKED_DOMAINS && !TARGET_DOMAINS[host]) continue;

        // Dynamically track domain if not already in summary
        if (!summary.domains[host]) {
          summary.domains[host] = {
            name: TARGET_DOMAINS[host] || formatDomainLabel(host),
            hits: 0,
            unique: 0,
            mobile_hits: 0,
            web_hits: 0,
            bytes: 0
          };
          domainUniqueDevices[host] = new Set();
        }

        summary.total_hits += 1;
        summary.domains[host].hits += 1;
        summary.total_bytes += bodyBytes;
        summary.domains[host].bytes += bodyBytes;

        // Status code grouping
        if (statusCode >= 200 && statusCode < 300) status_codes['2xx'] += 1;
        else if (statusCode >= 300 && statusCode < 400) status_codes['3xx'] += 1;
        else if (statusCode >= 400 && statusCode < 500) status_codes['4xx'] += 1;
        else if (statusCode >= 500) status_codes['5xx'] += 1;

        // Device unique keys
        const deviceKey = `${clientIp || 'no-ip'}|${userAgent}|${host}`;
        const globalDeviceKey = `${clientIp || 'no-ip'}|${userAgent}`;

        domainUniqueDevices[host].add(deviceKey);
        uniqueDevicesGlobal.add(globalDeviceKey);

        // Parse User-Agent
        const uaParser = new UAParser(userAgent);
        const uaResult = uaParser.getResult();
        const rawOs = uaResult.os.name || '';
        const osCategory = normalizeOS(rawOs);
        const browserName = uaResult.browser.name || 'Other';
        const deviceType = uaResult.device.type || (osCategory === 'Android' || osCategory === 'iOS' ? 'mobile' : 'desktop');

        browsers[browserName] = (browsers[browserName] || 0) + 1;

        const isMobileDevice = (deviceType === 'mobile' || deviceType === 'tablet' || osCategory === 'Android' || osCategory === 'iOS');

        if (isMobileDevice) {
          summary.domains[host].mobile_hits += 1;
          summary.total_mobile_hits += 1;
        } else {
          summary.domains[host].web_hits += 1;
          summary.total_web_hits += 1;
        }

        os_stats[osCategory] = (os_stats[osCategory] || 0) + 1;

        // Extract Request Path
        const reqParts = requestStr.split(/\s+/);
        const requestPath = reqParts.length >= 2 ? reqParts[1].split('?')[0] : '/';
        const epKey = `${host}|${requestPath}`;
        if (endpointMap.has(epKey)) {
          endpointMap.get(epKey).hits += 1;
        } else {
          endpointMap.set(epKey, { path: requestPath, host, hits: 1 });
        }

        // GeoIP Lookup
        let geoData = null;
        if (clientIp && !clientIp.startsWith('127.') && !clientIp.startsWith('10.') && !clientIp.startsWith('192.168.')) {
          geoData = geoip.lookup(clientIp);
        }

        const lat = geoData && geoData.ll ? geoData.ll[0] : null;
        const lon = geoData && geoData.ll ? geoData.ll[1] : null;
        const city = geoData && geoData.city ? geoData.city : 'Unknown';
        const country = geoData && geoData.country ? geoData.country : 'Unknown';

        if (clientIp) {
          if (ipMap.has(clientIp)) {
            ipMap.get(clientIp).hits += 1;
          } else {
            ipMap.set(clientIp, { ip: clientIp, hits: 1, city, country });
          }
        }

        // Hourly Distribution
        const timeMatch = timeLocal.match(/:(\d{2}):\d{2}:\d{2}/);
        if (timeMatch) {
          const hour = `${timeMatch[1]}:00`;
          hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
        }

        // Geo location marker
        if (lat !== null && lon !== null && lat !== 0 && lon !== 0) {
          locationMap.set(deviceKey, {
            lat,
            lon,
            city,
            country,
            host,
            host_label: summary.domains[host]?.name || host,
            device: deviceType,
            os: osCategory,
            browser: browserName,
            ip: clientIp,
            last_seen: timeLocal
          });
        }

        // Recent visitors
        recentVisitors.push({
          timestamp: timeLocal,
          host,
          host_label: summary.domains[host]?.name || host,
          ip: clientIp || 'Unknown',
          city,
          country,
          os: osCategory,
          device: deviceType,
          browser: browserName
        });

        if (recentVisitors.length > 20) {
          recentVisitors.shift();
        }
      }
    } catch (err) {}
  }

  // Assign unique devices counts
  Object.keys(summary.domains).forEach(dom => {
    if (domainUniqueDevices[dom]) {
      summary.domains[dom].unique = domainUniqueDevices[dom].size;
    }
    if (dom.includes('example.com') && summary.domains[dom].hits === 0 && !process.env.TRACKED_DOMAINS) {
      delete summary.domains[dom];
    }
  });
  summary.unique_devices = uniqueDevicesGlobal.size;

  const top_endpoints = Array.from(endpointMap.values())
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 25);

  const top_ips = Array.from(ipMap.values())
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 25);

  const locations = Array.from(locationMap.values());

  return {
    summary,
    status_codes,
    top_endpoints,
    top_ips,
    browsers,
    hourly_distribution: Array.from(hourlyMap.entries()).map(([hour, hits]) => ({ hour, hits })),
    os_stats,
    locations,
    recent_visitors: recentVisitors.reverse()
  };
}

module.exports = {
  parseTrafficAnalytics,
  normalizeOS,
  extractValidIP,
  formatDomainLabel,
  getResolvedDomains
};
