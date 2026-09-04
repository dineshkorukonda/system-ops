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
   * @param {Function} [options.transform] - Optional transform for state
   */
  register({
    name,
    collect,
    intervalMs,
    stateKey,
    enabled = true,
    critical = false,
    transform = null
  }) {
    if (typeof collect !== 'function') {
      throw new Error(`Collector [${name}] must provide a collect function`);
    }

    this.collectors.set(name, {
      name,
      collect,
      intervalMs: Math.max(1000, intervalMs || 5000),
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

      col.consecutiveErrors = 0;
      col.totalRuns++;

      this.store.set(col.stateKey, finalData, {
        durationMs,
        status: 'healthy'
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

      this.store.set(col.stateKey, this.store.get(col.stateKey), {
        durationMs,
        error: err.message,
        status: isUnavailable ? 'unavailable' : 'error'
      });

      if (process.env.SYSTEM_OPS_LOG_LEVEL === 'debug' || col.consecutiveErrors <= 3) {
        console.warn(`[Collector:${name}] Collection failed (${durationMs}ms):`, err.message);
      }

      return { success: false, durationMs, error: err.message };
    } finally {
      col.running = false;
    }
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
