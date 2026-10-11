const { stateStore } = require('./stateStore');

/**
 * CollectorManager owns the scheduled execution of all background telemetry collectors.
 *
 * Guarantees:
 * 1. Non-overlapping executions per collector (skip if already running).
 * 2. Independent, configurable intervals.
 * 3. Isolated error handling (a failing collector never crashes the app).
 * 4. Cache-first API serving (HTTP requests read cache, zero direct exec on dashboard load).
 * 5. Manual rescan triggering for discovery.
 */
class CollectorManager {
  constructor(store = stateStore) {
    this.store = store;
    this.collectors = new Map();
    this.timers = new Map();
    this.isRunning = false;
  }

  /**
   * Register a collector.
   * @param {Object} options
   * @param {string} options.name - Unique collector identifier
   * @param {Function} options.collect - Async function returning state data
   * @param {number} options.intervalMs - Periodic interval in ms
   * @param {string} options.stateKey - Key in StateStore to populate
   * @param {boolean} [options.enabled=true] - Whether to start automatically
   * @param {boolean} [options.critical=false] - Critical collector for backpressure
   * @param {number} [options.staleAfterMs] - Override automatic freshness limit
   * @param {Function} [options.transform] - Optional transform for state
   */
  register({
    name,
    collect,
    intervalMs,
    stateKey,
    enabled = true,
    critical = false,
    staleAfterMs = null,
    transform = null
  }) {
    if (typeof collect !== 'function') {
      throw new Error(`Collector [${name}] must provide a collect function`);
    }

    const interval = Math.max(1000, intervalMs || 5000);
    this.collectors.set(name, {
      name,
      collect,
      intervalMs: interval,
      staleAfterMs: Number.isFinite(staleAfterMs) && staleAfterMs > 0 ? staleAfterMs : null,
      stateKey: stateKey || name,
      enabled,
      critical,
      transform,
      running: false,
      consecutiveErrors: 0,
      totalRuns: 0,
      skippedRuns: 0
    });
  }

  /**
   * Run a single cycle of a collector safely with overlap guard and duration measurement.
   */
  async runCollector(name, isManual = false) {
    const col = this.collectors.get(name);
    if (!col) {
      throw new Error(`Collector [${name}] not found`);
    }
    if (!col.enabled) return { skipped: true, reason: 'Disabled' };

    if (col.running) {
      col.skippedRuns++;
      const stats = this.store.get('metadata.collectorStats.' + col.stateKey);
      if (stats) stats.skipped = col.skippedRuns;
      return { skipped: true, reason: 'Already running' };
    }

    col.running = true;
    const startTime = Date.now();

    try {
      const data = await col.collect();
      const durationMs = Date.now() - startTime;
      const finalData = col.transform ? col.transform(data) : data;

      // Some adapters report failure in their payload rather than throwing.
      // Such a result must never advance lastSuccess or replace a good snapshot.
      const unsupported = finalData?.unsupported === true;
      const unavailable = finalData?.available === false;
      if (finalData == null || unsupported || unavailable || finalData.error ||
          finalData.ok === false || finalData.success === false) {
        const failure = new Error(finalData?.error || finalData?.reason || 'Collector returned no usable data');
        failure.collectionStatus = unsupported ? 'unsupported' : unavailable ? 'unavailable' : 'error';
        if (this.store.get(col.stateKey) == null && finalData != null) failure.initialData = finalData;
        throw failure;
      }

      col.consecutiveErrors = 0;
      col.totalRuns++;

      this.store.set(col.stateKey, finalData, {
        durationMs,
        status: 'healthy',
        source: finalData.source || `collector:${name}`,
      });

      return { success: true, durationMs, data: finalData };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      col.consecutiveErrors++;
      col.totalRuns++;

      const isUnavailable = (err.message && (
        err.message.includes('not found') ||
        err.message.includes('unavailable') ||
        err.message.includes('ECONNREFUSED')
      ));

      this.store.set(col.stateKey, this.store.get(col.stateKey) ?? err.initialData ?? null, {
        durationMs,
        error: err.message,
        status: err.collectionStatus || (isUnavailable ? 'unavailable' : 'error')
      });

      if (process.env.SYSTEM_OPS_LOG_LEVEL === 'debug' || col.consecutiveErrors <= 3) {
        console.warn(`[Collector:${name}] Collection failed (${durationMs}ms):`, err.message);
      }

      return { success: false, durationMs, error: err.message };
    } finally {
      col.running = false;
    }
  }

  /** Collection readiness; this does not assert that monitored services are up. */
  getCollectorHealth(name, now = Date.now()) {
    const col = this.collectors.get(name);
    if (!col) return null;
    const stats = this.store.get(`metadata.collectorStats.${col.stateKey}`);
    const successAt = stats?.lastSuccess ? Date.parse(stats.lastSuccess) : NaN;
    const ageMs = Number.isFinite(successAt) ? Math.max(0, now - successAt) : null;
    const staleAfterMs = col.staleAfterMs ?? Math.max(15000, col.intervalMs * 3);
    const fresh = col.enabled && ageMs !== null && ageMs <= staleAfterMs && stats?.status === 'healthy';
    let status;
    if (!col.enabled) status = 'disabled';
    else if (stats?.status && stats.status !== 'healthy') status = stats.status;
    else if (ageMs === null) status = col.running ? 'collecting' : 'initializing';
    else status = fresh ? 'healthy' : 'stale';

    return {
      name, stateKey: col.stateKey, enabled: col.enabled, critical: col.critical,
      status, fresh, collecting: col.running,
      source: stats?.source || `collector:${name}`,
      lastSuccess: stats?.lastSuccess || null,
      lastAttempt: stats?.lastUpdated || null,
      lastError: stats?.lastError || null,
      ageMs, staleAfterMs,
    };
  }

  getHealth(now = Date.now()) {
    const collectors = Object.fromEntries([...this.collectors.keys()].map(name => [name, this.getCollectorHealth(name, now)]));
    const critical = Object.values(collectors).filter(col => col.enabled && col.critical);
    return {
      ok: critical.length > 0 && critical.every(col => col.fresh),
      timestamp: new Date(now).toISOString(),
      collectors,
    };
  }

  /**
   * Start periodic collection for all enabled collectors.
   */
  async startAll() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run initial cycle for all collectors sequentially / in parallel
    const initialPromises = [];
    for (const [name, col] of this.collectors.entries()) {
      if (col.enabled) {
        initialPromises.push(
          this.runCollector(name).catch(e => {
            console.error(`[CollectorManager] Initial run error for ${name}:`, e.message);
          })
        );
      }
    }

    // Await initial collection before starting intervals
    await Promise.allSettled(initialPromises);

    // Schedule intervals
    for (const [name, col] of this.collectors.entries()) {
      if (col.enabled) {
        const timer = setInterval(() => {
          this.runCollector(name);
        }, col.intervalMs);

        // Allow Node process to exit gracefully if only collectors are active
        if (timer.unref) timer.unref();

        this.timers.set(name, timer);
      }
    }
  }

  /**
   * Stop all periodic timers.
   */
  stopAll() {
    for (const [name, timer] of this.timers.entries()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.isRunning = false;
  }

  setEnabled(name, enabled) {
    const col = this.collectors.get(name);
    if (!col || col.enabled === enabled) return;
    col.enabled = enabled;
    clearInterval(this.timers.get(name));
    this.timers.delete(name);
    if (enabled && this.isRunning) {
      this.runCollector(name);
      const timer = setInterval(() => this.runCollector(name), col.intervalMs);
      timer.unref?.();
      this.timers.set(name, timer);
    }
  }

  /**
   * Manually trigger an immediate rescan of one or all collectors.
   */
  async rescan(name = null) {
    if (name) {
      return await this.runCollector(name, true);
    }

    const results = {};
    for (const collectorName of this.collectors.keys()) {
      results[collectorName] = await this.runCollector(collectorName, true);
    }
    return results;
  }

  /**
   * Update collector interval dynamically.
   */
  setInterval(name, intervalMs) {
    const col = this.collectors.get(name);
    if (!col) return;
    col.intervalMs = Math.max(1000, intervalMs);

    if (this.timers.has(name)) {
      clearInterval(this.timers.get(name));
      const timer = setInterval(() => {
        this.runCollector(name);
      }, col.intervalMs);
      if (timer.unref) timer.unref();
      this.timers.set(name, timer);
    }
  }
}

const collectorManager = new CollectorManager(stateStore);

module.exports = {
  CollectorManager,
  collectorManager
};
