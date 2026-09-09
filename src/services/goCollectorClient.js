/**
 * Optional Go collector sidecar client.
 * Node uses this for Linux-native system/process sampling when available,
 * and transparently falls back to the built-in Node collectors.
 */

const GO_COLLECTOR_URL = (process.env.GO_COLLECTOR_URL || 'http://127.0.0.1:9081').replace(/\/$/, '');
const HEALTH_CACHE_MS = parseInt(process.env.GO_COLLECTOR_HEALTH_CACHE_MS, 10) || 30000;
const REQUEST_TIMEOUT_MS = parseInt(process.env.GO_COLLECTOR_TIMEOUT_MS, 10) || 2000;

let healthCache = {
  checkedAt: 0,
  available: false,
  lastError: null
};

function isExplicitlyDisabled() {
  return process.env.ENABLE_GO_COLLECTOR === 'false';
}

async function fetchJson(path, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${GO_COLLECTOR_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`Go collector ${path} returned ${res.status}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function checkHealth(force = false) {
  if (isExplicitlyDisabled()) {
    healthCache = { checkedAt: Date.now(), available: false, lastError: 'disabled' };
    return false;
  }

  const now = Date.now();
  if (!force && now - healthCache.checkedAt < HEALTH_CACHE_MS) {
    return healthCache.available;
  }

  try {
    const data = await fetchJson('/health', 1000);
    const available = data && data.ok === true;
    healthCache = { checkedAt: now, available, lastError: null };
    return available;
  } catch (err) {
    healthCache = {
      checkedAt: now,
      available: false,
      lastError: err.message || String(err)
    };
    return false;
  }
}

async function getSystemSnapshot() {
  if (!(await checkHealth())) {
    return null;
  }

  try {
    return await fetchJson('/v1/system/snapshot');
  } catch (err) {
    healthCache.available = false;
    healthCache.lastError = err.message || String(err);
    healthCache.checkedAt = Date.now();
    return null;
  }
}

async function getProcesses({ limit = 50, sortBy = 'cpu' } = {}) {
  if (!(await checkHealth())) {
    return null;
  }

  const sort = sortBy === 'mem' ? 'mem' : 'cpu';
  const query = new URLSearchParams({
    limit: String(limit),
    sort
  });

  try {
    return await fetchJson(`/v1/processes?${query.toString()}`);
  } catch (err) {
    healthCache.available = false;
    healthCache.lastError = err.message || String(err);
    healthCache.checkedAt = Date.now();
    return null;
  }
}

async function getDiagnostics() {
  if (!(await checkHealth())) {
    return null;
  }

  try {
    return await fetchJson('/v1/diagnostics', 1500);
  } catch (err) {
    return null;
  }
}

function getStatus() {
  return {
    enabled: !isExplicitlyDisabled(),
    url: GO_COLLECTOR_URL,
    available: healthCache.available,
    lastCheckedAt: healthCache.checkedAt || null,
    lastError: healthCache.lastError
  };
}

function buildMemoryBreakdown(nodeDiagnostics, goDiagnostics, goStatus) {
  const nodeMem = nodeDiagnostics?.systemOpsMemory || {};
  const goMem = goDiagnostics?.memory || {};

  const nodeRss = nodeMem.rssBytes || 0;
  const goRss = goMem.rssBytes || goMem.allocBytes || 0;
  const combinedRss = nodeRss + (goStatus?.available ? goRss : 0);

  let activeCollector = 'node';
  if (goStatus?.available) {
    activeCollector = 'hybrid';
  } else if (goStatus?.enabled === false) {
    activeCollector = 'node-only';
  }

  return {
    activeCollector,
    node: {
      runtime: 'node',
      uptimeSeconds: nodeDiagnostics?.uptimeSeconds || 0,
      rssBytes: nodeRss,
      rssFormatted: nodeMem.rssFormatted || '0 B',
      heapUsedBytes: nodeMem.heapUsedBytes || 0,
      heapUsedFormatted: nodeMem.heapUsedFormatted || '0 B',
      heapTotalBytes: nodeMem.heapTotalBytes || 0,
      heapTotalFormatted: nodeMem.heapTotalFormatted || '0 B',
      externalBytes: nodeMem.externalBytes || 0,
      externalFormatted: nodeMem.externalFormatted || '0 B'
    },
    goCollector: {
      runtime: 'go',
      available: goStatus?.available === true,
      url: goStatus?.url || null,
      lastError: goStatus?.lastError || null,
      uptimeSeconds: goDiagnostics?.uptimeSeconds || 0,
      rssBytes: goRss,
      rssFormatted: goMem.rssFormatted || goMem.allocFormatted || 'N/A',
      allocBytes: goMem.allocBytes || 0,
      allocFormatted: goMem.allocFormatted || 'N/A',
      sysBytes: goMem.sysBytes || 0,
      sysFormatted: goMem.sysFormatted || 'N/A',
      heapInuseBytes: goMem.heapInuseBytes || 0,
      heapInuseFormatted: goMem.heapInuseFormatted || 'N/A'
    },
    combinedRssBytes: combinedRss,
    combinedRssFormatted: formatMb(combinedRss)
  };
}

function formatMb(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

module.exports = {
  checkHealth,
  getSystemSnapshot,
  getProcesses,
  getDiagnostics,
  getStatus,
  buildMemoryBreakdown
};
