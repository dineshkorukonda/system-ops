const fs = require('fs');
const readline = require('readline');
const path = require('path');
const UAParser = require('ua-parser-js');
const { discoverNginxDomains, discoverDockerDomains, discoverNginxLogFiles } = require('../utils/domainDiscovery');

let geoipModule = null;
function lookupGeo(ip) {
  if (!geoipModule) {
    try {
      geoipModule = require('geoip-lite');
    } catch (err) {
      console.warn('[traffic] geoip-lite unavailable:', err.message);
      geoipModule = { lookup: () => null };
    }
  }
  return geoipModule.lookup(ip);
}

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
      if (domain && !domain.includes('example.com') && !domain.includes('example.org') && !domain.includes('example.net')) {
        map[domain] = label;
      }
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
 * Stateful Incremental Traffic Engine
 * Remembers file inode + byte offset across collection ticks.
 * Never re-reads the entire file. Detects log rotation (inode change / size shrink).
 */
class IncrementalTrafficEngine {
  constructor() {
    this.fileStates = new Map(); // filepath -> { inode, offset, size }
    this.cachedResult = null;
    this.aggregatedState = this._createFreshState();
  }

  _createFreshState() {
    return {
      summary: {
        total_hits: 0,
        total_mobile_hits: 0,
        total_web_hits: 0,
        total_bytes: 0,
        unique_devices: 0,
        domains: {}
      },
      status_codes: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
      browsers: {},
      endpointMap: new Map(), // key -> { path, host, hits }
      ipMap: new Map(),       // ip -> { ip, hits, city, country }
      hourlyMap: new Map(),
      os_stats: { Android: 0, iOS: 0, Windows: 0, Mac: 0, Linux: 0, Other: 0 },
      uniqueDevicesGlobal: new Set(),
      domainUniqueDevices: {}, // dom -> Set
      locationMap: new Map(),
      recentVisitors: []
    };
  }

  reset() {
    this.fileStates.clear();
    this.aggregatedState = this._createFreshState();
    this.cachedResult = null;
  }

  /**
   * Run incremental parse across log files.
   * If customLogPath is supplied (e.g. in automated tests), parses from start of that file.
   */
  async processLogs(customLogPath = null) {
    const TARGET_DOMAINS = await getResolvedDomains();
    const logFiles = customLogPath ? [customLogPath] : discoverNginxLogFiles();
    const existingLogs = logFiles.filter(f => fs.existsSync(f));

    if (customLogPath && existingLogs.length === 0) {
      return {
        summary: {
          total_hits: 0,
          total_mobile_hits: 0,
          total_web_hits: 0,
          total_bytes: 0,
          unique_devices: 0,
          domains: {}
        },
        status_codes: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
        top_endpoints: [],
        top_ips: [],
        browsers: {},
        hourly_distribution: [],
        os_stats: { Android: 0, iOS: 0, Windows: 0, Mac: 0, Linux: 0, Other: 0 },
        locations: [],
        recent_visitors: [],
        error: `Log file '${customLogPath}' does not exist or cannot be read.`
      };
    }

    if (customLogPath) {
      // In custom test cases, run one-shot parse to maintain backward test compatibility
      return await this._parseFullLogs(existingLogs, TARGET_DOMAINS);
    }

    if (existingLogs.length === 0) {
      return {
        summary: {
          total_hits: 0,
          total_mobile_hits: 0,
          total_web_hits: 0,
          total_bytes: 0,
          unique_devices: 0,
          domains: {}
        },
        status_codes: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 },
        top_endpoints: [],
        top_ips: [],
        browsers: {},
        hourly_distribution: [],
        os_stats: { Android: 0, iOS: 0, Windows: 0, Mac: 0, Linux: 0, Other: 0 },
        locations: [],
        recent_visitors: [],
        error: 'No Nginx access logs found in /var/log/nginx/'
      };
    }

    // Initialize domain summary keys
    Object.entries(TARGET_DOMAINS).forEach(([dom, label]) => {
      if (!this.aggregatedState.summary.domains[dom]) {
        this.aggregatedState.summary.domains[dom] = {
          name: label,
          hits: 0,
          unique: 0,
          mobile_hits: 0,
          web_hits: 0,
          bytes: 0
        };
        this.aggregatedState.domainUniqueDevices[dom] = new Set();
      }
    });

    const hostLogRegex = /^(\S+)\s+(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;
    const standardLogRegex = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

    for (const logPath of existingLogs) {
      try {
        const stats = fs.statSync(logPath);
        const currentSize = stats.size;
        const currentInode = stats.ino || 0;

        let state = this.fileStates.get(logPath);
        let startOffset = 0;

        if (state) {
          if (state.inode !== currentInode || currentSize < state.offset) {
            // Log rotated or truncated: reset offset to 0
            startOffset = 0;
          } else if (currentSize === state.offset) {
            // No new data in this file
            continue;
          } else {
            // Read new delta from previous offset
            startOffset = state.offset;
          }
        } else {
          // First time reading this log: read up to the last 2MB to keep startup instant
          const INITIAL_MAX_BYTES = 2 * 1024 * 1024; // 2 MB initial tail
          startOffset = Math.max(0, currentSize - INITIAL_MAX_BYTES);
        }

        const readStream = fs.createReadStream(logPath, {
          start: startOffset,
          encoding: 'utf8'
        });

        const rl = readline.createInterface({
          input: readStream,
          crlfDelay: Infinity
        });

        const defaultHost = Object.keys(TARGET_DOMAINS).find(d => !d.includes('example.com')) ||
          Object.keys(TARGET_DOMAINS)[0] ||
          path.basename(logPath).replace(/\.access\.log|\.log/, '') ||
          'primary';

        let isFirstLineOfChunk = startOffset > 0;

        for await (const line of rl) {
          // If we jumped into the middle of a file, skip the partial first line
          if (isFirstLineOfChunk) {
            isFirstLineOfChunk = false;
            continue;
          }

          if (!line || !line.trim()) continue;

          this._parseLine(line, hostLogRegex, standardLogRegex, defaultHost, TARGET_DOMAINS);
        }

        // Record updated offset
        this.fileStates.set(logPath, {
          inode: currentInode,
          offset: currentSize,
          size: currentSize
        });
      } catch (err) {}
    }

    // Build finalized snapshot
    return this._formatResult();
  }

  _parseLine(line, hostLogRegex, standardLogRegex, defaultHost, TARGET_DOMAINS) {
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
        return;
      }
    }

    if (process.env.TRACKED_DOMAINS && !TARGET_DOMAINS[host]) return;

    const s = this.aggregatedState;

    if (!s.summary.domains[host]) {
      s.summary.domains[host] = {
        name: TARGET_DOMAINS[host] || formatDomainLabel(host),
        hits: 0,
        unique: 0,
        mobile_hits: 0,
        web_hits: 0,
        bytes: 0
      };
      s.domainUniqueDevices[host] = new Set();
    }

    s.summary.total_hits += 1;
    s.summary.domains[host].hits += 1;
    s.summary.total_bytes += bodyBytes;
    s.summary.domains[host].bytes += bodyBytes;

    // Status code grouping
    if (statusCode >= 200 && statusCode < 300) s.status_codes['2xx'] += 1;
    else if (statusCode >= 300 && statusCode < 400) s.status_codes['3xx'] += 1;
    else if (statusCode >= 400 && statusCode < 500) s.status_codes['4xx'] += 1;
    else if (statusCode >= 500) s.status_codes['5xx'] += 1;

    // Bounded device sets (cap at 100,000 to prevent runaway memory on huge multi-gig traffic)
    const deviceKey = `${clientIp || 'no-ip'}|${userAgent}|${host}`;
    const globalDeviceKey = `${clientIp || 'no-ip'}|${userAgent}`;

    if (s.domainUniqueDevices[host].size < 100000) {
      s.domainUniqueDevices[host].add(deviceKey);
    }
    if (s.uniqueDevicesGlobal.size < 100000) {
      s.uniqueDevicesGlobal.add(globalDeviceKey);
    }

    // Parse User-Agent
    const uaParser = new UAParser(userAgent);
    const uaResult = uaParser.getResult();
    const rawOs = uaResult.os.name || '';
    const osCategory = normalizeOS(rawOs);
    const browserName = uaResult.browser.name || 'Other';
    const deviceType = uaResult.device.type || (osCategory === 'Android' || osCategory === 'iOS' ? 'mobile' : 'desktop');

    s.browsers[browserName] = (s.browsers[browserName] || 0) + 1;

    const isMobileDevice = (deviceType === 'mobile' || deviceType === 'tablet' || osCategory === 'Android' || osCategory === 'iOS');
    if (isMobileDevice) {
      s.summary.domains[host].mobile_hits += 1;
      s.summary.total_mobile_hits += 1;
    } else {
      s.summary.domains[host].web_hits += 1;
      s.summary.total_web_hits += 1;
    }

    s.os_stats[osCategory] = (s.os_stats[osCategory] || 0) + 1;

    // Request path aggregation
    const reqParts = requestStr.split(/\s+/);
    const requestPath = reqParts.length >= 2 ? reqParts[1].split('?')[0] : '/';
    const epKey = `${host}|${requestPath}`;
    if (s.endpointMap.has(epKey)) {
      s.endpointMap.get(epKey).hits += 1;
    } else if (s.endpointMap.size < 500) {
      s.endpointMap.set(epKey, { path: requestPath, host, hits: 1 });
    }

    // GeoIP Lookup
    let geoData = null;
    if (clientIp && !clientIp.startsWith('127.') && !clientIp.startsWith('10.') && !clientIp.startsWith('192.168.')) {
      geoData = lookupGeo(clientIp);
    }

    const lat = geoData && geoData.ll ? geoData.ll[0] : null;
    const lon = geoData && geoData.ll ? geoData.ll[1] : null;
    const city = geoData && geoData.city ? geoData.city : 'Unknown';
    const country = geoData && geoData.country ? geoData.country : 'Unknown';

    if (clientIp) {
      if (s.ipMap.has(clientIp)) {
        s.ipMap.get(clientIp).hits += 1;
      } else if (s.ipMap.size < 500) {
        s.ipMap.set(clientIp, { ip: clientIp, hits: 1, city, country });
      }
    }

    // Hourly Distribution
    const timeMatch = timeLocal.match(/:(\d{2}):\d{2}:\d{2}/);
    if (timeMatch) {
      const hour = `${timeMatch[1]}:00`;
      s.hourlyMap.set(hour, (s.hourlyMap.get(hour) || 0) + 1);
    }

    // Geo marker
    if (lat !== null && lon !== null && lat !== 0 && lon !== 0 && s.locationMap.size < 200) {
      s.locationMap.set(deviceKey, {
        lat,
        lon,
        city,
        country,
        host,
        host_label: s.summary.domains[host]?.name || host,
        device: deviceType,
        os: osCategory,
        browser: browserName,
        ip: clientIp,
        last_seen: timeLocal
      });
    }

    // Recent visitors ring buffer (max 20)
    s.recentVisitors.push({
      timestamp: timeLocal,
      host,
      host_label: s.summary.domains[host]?.name || host,
      ip: clientIp || 'Unknown',
      city,
      country,
      os: osCategory,
      device: deviceType,
      browser: browserName
    });

    if (s.recentVisitors.length > 20) {
      s.recentVisitors.shift();
    }
  }

  _formatResult() {
    const s = this.aggregatedState;

    Object.keys(s.summary.domains).forEach(dom => {
      if (s.domainUniqueDevices[dom]) {
        s.summary.domains[dom].unique = s.domainUniqueDevices[dom].size;
      }
      if (dom.includes('example.com') || dom.includes('example.org')) {
        delete s.summary.domains[dom];
      }
    });
    s.summary.unique_devices = s.uniqueDevicesGlobal.size;

    const top_endpoints = Array.from(s.endpointMap.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 25);

    const top_ips = Array.from(s.ipMap.values())
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 25);

    const locations = Array.from(s.locationMap.values());

    return {
      summary: s.summary,
      status_codes: s.status_codes,
      top_endpoints,
      top_ips,
      browsers: s.browsers,
      hourly_distribution: Array.from(s.hourlyMap.entries()).map(([hour, hits]) => ({ hour, hits })),
      os_stats: s.os_stats,
      locations,
      recent_visitors: [...s.recentVisitors].reverse()
    };
  }

  /**
   * One-shot parse helper for tests & custom log paths
   */
  async _parseFullLogs(existingLogs, TARGET_DOMAINS) {
    const freshEngine = new IncrementalTrafficEngine();
    freshEngine.aggregatedState = freshEngine._createFreshState();

    Object.entries(TARGET_DOMAINS).forEach(([dom, label]) => {
      freshEngine.aggregatedState.summary.domains[dom] = {
        name: label,
        hits: 0,
        unique: 0,
        mobile_hits: 0,
        web_hits: 0,
        bytes: 0
      };
      freshEngine.aggregatedState.domainUniqueDevices[dom] = new Set();
    });

    const hostLogRegex = /^(\S+)\s+(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;
    const standardLogRegex = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"/;

    for (const logPath of existingLogs) {
      try {
        const fileStream = fs.createReadStream(logPath, { encoding: 'utf8' });
        const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
        const defaultHost = Object.keys(TARGET_DOMAINS).find(d => !d.includes('example.com')) ||
          Object.keys(TARGET_DOMAINS)[0] ||
          path.basename(logPath).replace(/\.access\.log|\.log/, '') ||
          'primary';

        for await (const line of rl) {
          if (!line || !line.trim()) continue;
          freshEngine._parseLine(line, hostLogRegex, standardLogRegex, defaultHost, TARGET_DOMAINS);
        }
      } catch (e) {}
    }

    return freshEngine._formatResult();
  }
}

const trafficEngine = new IncrementalTrafficEngine();

async function parseTrafficAnalytics(customLogPath = null) {
  return await trafficEngine.processLogs(customLogPath);
}

module.exports = {
  parseTrafficAnalytics,
  IncrementalTrafficEngine,
  trafficEngine,
  normalizeOS,
  extractValidIP,
  formatDomainLabel,
  getResolvedDomains
};
