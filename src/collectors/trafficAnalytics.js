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
    // If comma-separated (e.g., proxied multiple times), pick first IP
    const firstIp = cfIp.split(',')[0].trim();
    if (firstIp && firstIp !== '-') return firstIp;
  }
  if (remoteUser && remoteUser !== '-' && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(remoteUser)) {
    return remoteUser.trim();
  }
  return null;
}

/**
 * Target domain definitions
 */
const TARGET_DOMAINS = {
  'iskconcommunity.com': 'Mobile App',
  'dev.iskconcommunity.com': 'Web Dev',
  'msf.iskconcommunity.com': 'Web MSF'
};

/**
 * Parse Nginx access.log line-by-line using streaming readline
 * Nginx format: $host $http_cf_connecting_ip - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
 */
async function parseTrafficAnalytics(customLogPath = null) {
  const logPath = customLogPath || process.env.NGINX_LOG_PATH || '/var/log/nginx/access.log';

  const summary = {
    total_hits: 0,
    total_mobile_hits: 0,
    total_web_hits: 0,
    total_bytes: 0,
    unique_devices: 0,
    domains: {
      'iskconcommunity.com': { name: 'Mobile App', hits: 0, unique: 0, mobile_hits: 0, web_hits: 0, bytes: 0 },
      'dev.iskconcommunity.com': { name: 'Web Dev', hits: 0, unique: 0, mobile_hits: 0, web_hits: 0, bytes: 0 },
      'msf.iskconcommunity.com': { name: 'Web MSF', hits: 0, unique: 0, mobile_hits: 0, web_hits: 0, bytes: 0 }
    }
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
  const domainUniqueDevices = {
    'iskconcommunity.com': new Set(),
    'dev.iskconcommunity.com': new Set(),
    'msf.iskconcommunity.com': new Set()
  };

  const locationMap = new Map(); // key: compoundKey, val: locObj
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

    // Regex matching log line structure
    // $host $http_cf_connecting_ip - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
    const logRegex = /^(\S+)\s+(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

    for await (const line of rl) {
      if (!line || !line.trim()) continue;

      const match = line.match(logRegex);
      if (!match) continue;

      let host = match[1].toLowerCase().split(':')[0]; // Strip optional port
      const cfIp = match[2];
      const remoteUser = match[3];
      const timeLocal = match[4];
      const requestStr = match[5];
      const statusCode = parseInt(match[6], 10) || 0;
      const bodyBytes = parseInt(match[7], 10) || 0;
      const userAgent = match[9];

      // Check if domain is one of target domains
      if (!TARGET_DOMAINS[host]) continue;

      const clientIp = extractValidIP(cfIp, remoteUser);
      summary.total_hits += 1;
      summary.domains[host].hits += 1;
      summary.total_bytes += bodyBytes;
      summary.domains[host].bytes += bodyBytes;

      // Status code grouping
      if (statusCode >= 200 && statusCode < 300) status_codes['2xx'] += 1;
      else if (statusCode >= 300 && statusCode < 400) status_codes['3xx'] += 1;
      else if (statusCode >= 400 && statusCode < 500) status_codes['4xx'] += 1;
      else if (statusCode >= 500) status_codes['5xx'] += 1;

      // Unique device key: (IP + UserAgent + Host)
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
      if (clientIp) {
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

      // Hourly Distribution (Nginx time_local e.g. "21/Aug/2026:17:00:00 +0530")
      const timeMatch = timeLocal.match(/:(\d{2}):\d{2}:\d{2}/);
      if (timeMatch) {
        const hour = `${timeMatch[1]}:00`;
        hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1);
      }

      // Keep geographic locations if valid coords exist
      if (lat !== null && lon !== null && lat !== 0 && lon !== 0) {
        locationMap.set(deviceKey, {
          lat,
          lon,
          city,
          country,
          host,
          host_label: TARGET_DOMAINS[host],
          device: deviceType,
          os: osCategory,
          browser: browserName,
          ip: clientIp,
          last_seen: timeLocal
        });
      }

      // Add to recent visitors array (maintain up to 15 recent)
      recentVisitors.push({
        timestamp: timeLocal,
        host,
        host_label: TARGET_DOMAINS[host],
        ip: clientIp || 'Unknown',
        os: osCategory,
        browser: browserName,
        device: deviceType,
        city,
        country
      });

      if (recentVisitors.length > 50) {
        recentVisitors.shift(); // Keep buffer manageable while streaming
      }
    }

    // Set unique counts
    summary.unique_devices = uniqueDevicesGlobal.size;
    Object.keys(domainUniqueDevices).forEach(dom => {
      summary.domains[dom].unique = domainUniqueDevices[dom].size;
    });

    const top_endpoints = Array.from(endpointMap.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    const top_ips = Array.from(ipMap.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 10);

    const hourly_distribution = Array.from(hourlyMap.entries())
      .map(([hour, hits]) => ({ hour, hits }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Recent 15 visitors (reverse for most recent first)
    const recent_visitors = recentVisitors.slice(-15).reverse();
    const locations = Array.from(locationMap.values());

    return {
      summary,
      status_codes,
      top_endpoints,
      top_ips,
      browsers,
      hourly_distribution,
      os_stats,
      locations,
      recent_visitors
    };
  } catch (err) {
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
      error: `Error parsing log file: ${err.message}`
    };
  }
}

module.exports = {
  parseTrafficAnalytics,
  normalizeOS,
  extractValidIP
};
