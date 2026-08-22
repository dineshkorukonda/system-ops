const fs = require('fs');
const readline = require('readline');
const path = require('path');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');

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
 * Get configured target domains or fallback to generic defaults
 */
function getTrackedDomains() {
  if (process.env.TRACKED_DOMAINS) {
    const map = {};
    process.env.TRACKED_DOMAINS.split(',').forEach(entry => {
      const parts = entry.split(':');
      const domain = parts[0].trim();
      const label = parts[1] ? parts[1].trim() : domain;
      if (domain) map[domain] = label;
    });
    if (Object.keys(map).length > 0) return map;
  }
  return {
    'app.example.com': 'App API',
    'api.example.com': 'Backend API',
    'web.example.com': 'Web App'
  };
}

/**
 * Parse Nginx access.log line-by-line using streaming readline
 * Supports both Host-prefixed ($host $http_cf_connecting_ip ...) and standard combined formats.
 */
async function parseTrafficAnalytics(customLogPath = null) {
  const logPath = customLogPath || process.env.NGINX_LOG_PATH || '/var/log/nginx/access.log';
  const TARGET_DOMAINS = getTrackedDomains();

  const domainSummaries = {};
  const domainUniqueDevices = {};
  Object.entries(TARGET_DOMAINS).forEach(([dom, label]) => {
    domainSummaries[dom] = { name: label, hits: 0, unique: 0, mobile_hits: 0, web_hits: 0, bytes: 0 };
    domainUniqueDevices[dom] = new Set();
  });

  const defaultHost = Object.keys(TARGET_DOMAINS)[0] || 'localhost';

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
  const endpointMap = new Map(); // key: path, val: { path, host, hits }
  const ipMap = new Map(); // key: ip, val: { ip, hits, city, country }
  const hourlyMap = new Map(); // key: HH, val: hits

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

  if (!fs.existsSync(logPath)) {
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
      error: `Log file not found at ${logPath}`
    };
  }

  try {
    const fileStream = fs.createReadStream(logPath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    // 1. Host-prefixed format: $host $http_cf_connecting_ip - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
    const hostLogRegex = /^(\S+)\s+(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

    // 2. Standard combined format: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
    const standardLogRegex = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

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

        // If first token is actually an IP address, fallback to standard combined format
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

      // Check if domain is one of target domains
      if (TARGET_DOMAINS && !TARGET_DOMAINS[host]) continue;

      // Ensure domain exists in summary
      if (!summary.domains[host]) {
        summary.domains[host] = {
          name: TARGET_DOMAINS[host] || host,
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

      // Device keys
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

      // GeoIP Lookup & IP Stats
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

      // Geo marker
      if (lat !== null && lon !== null && lat !== 0 && lon !== 0) {
        locationMap.set(deviceKey, {
          lat,
          lon,
          city,
          country,
          host,
          host_label: TARGET_DOMAINS[host] || host,
          device: deviceType,
          os: osCategory,
          browser: browserName,
          ip: clientIp,
          last_seen: timeLocal
        });
      }

      // Recent visitors (up to 15)
      recentVisitors.push({
        timestamp: timeLocal,
        host,
        host_label: TARGET_DOMAINS[host] || host,
        ip: clientIp || 'Unknown',
        city,
        country,
        os: osCategory,
        device: deviceType,
        browser: browserName
      });

      if (recentVisitors.length > 15) {
        recentVisitors.shift();
      }
    }

    // Assign unique devices counts
    Object.keys(domainSummaries).forEach(dom => {
      if (domainUniqueDevices[dom]) {
        domainSummaries[dom].unique = domainUniqueDevices[dom].size;
      }
    });
    summary.unique_devices = uniqueDevicesGlobal.size;

    // Top endpoints sorted by hits desc (limit 25)
    const top_endpoints = Array.from(endpointMap.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 25);

    // Top IPs sorted by hits desc (limit 25)
    const top_ips = Array.from(ipMap.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 25);

    // Locations array for map
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
  } catch (error) {
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
      error: `Failed reading access log: ${error.message}`
    };
  }
}

module.exports = {
  parseTrafficAnalytics,
  normalizeOS,
  extractValidIP
};
