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

function getStatus() {
  return {
    enabled: !isExplicitlyDisabled(),
    url: GO_COLLECTOR_URL,
    available: healthCache.available,
    lastCheckedAt: healthCache.checkedAt || null,
    lastError: healthCache.lastError
  };
}

module.exports = {
  checkHealth,
  getSystemSnapshot,
  getProcesses,
  getStatus
};
