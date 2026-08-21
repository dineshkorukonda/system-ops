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
    unique_devices: 0,
    domains: {
      'iskconcommunity.com': { name: 'Mobile App', hits: 0, unique: 0 },
      'dev.iskconcommunity.com': { name: 'Web Dev', hits: 0, unique: 0 },
      'msf.iskconcommunity.com': { name: 'Web MSF', hits: 0, unique: 0 }
    }
  };

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
      const userAgent = match[9];

      // Check if domain is one of target domains
      if (!TARGET_DOMAINS[host]) continue;

      const clientIp = extractValidIP(cfIp, remoteUser);
      summary.total_hits += 1;
      summary.domains[host].hits += 1;

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
      const browser = uaResult.browser.name || 'Unknown';
      const deviceType = uaResult.device.type || (osCategory === 'Android' || osCategory === 'iOS' ? 'mobile' : 'desktop');

      os_stats[osCategory] = (os_stats[osCategory] || 0) + 1;

      // GeoIP Lookup
      let geoData = null;
      if (clientIp) {
        geoData = geoip.lookup(clientIp);
      }

      const lat = geoData && geoData.ll ? geoData.ll[0] : null;
      const lon = geoData && geoData.ll ? geoData.ll[1] : null;
      const city = geoData && geoData.city ? geoData.city : 'Unknown';
      const country = geoData && geoData.country ? geoData.country : 'Unknown';

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
          browser,
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
        browser,
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

    // Recent 15 visitors (reverse for most recent first)
    const recent_visitors = recentVisitors.slice(-15).reverse();
    const locations = Array.from(locationMap.values());

    return {
      summary,
      os_stats,
      locations,
      recent_visitors
    };
  } catch (err) {
    return {
      summary,
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
