/**
 * Bounded Ring Buffer / History Store
 * Prevents memory leaks by maintaining a fixed maximum size.
 */
class BoundedHistory {
  constructor(maxSize = 300) {
    this.maxSize = Math.max(1, maxSize);
    this.buffer = [];
  }

  push(item) {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push(item);
  }

  getAll() {
    return [...this.buffer];
  }

  clear() {
    this.buffer = [];
  }

  get length() {
    return this.buffer.length;
  }
}

/**
 * Central State Store for System-Ops
 * Holds cached snapshots and metadata for each collector.
 */
class StateStore {
  constructor() {
    this.state = {
      system: null,
      processes: null,
      pm2: null,
      services: null,
      backups: null,
      traffic: null,
      ollama: {
        status: null,
        models: null
      },
      metadata: {
        startTime: Date.now(),
        collectorStats: {}
      }
    };

    // Bounded history for telemetry charts (max 300 data points = 15-25 min at 3-5s intervals)
    this.history = {
      cpu: new BoundedHistory(300),
      ram: new BoundedHistory(300),
      swap: new BoundedHistory(300)
    };
  }

  set(key, data, meta = {}) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let obj = this.state;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]]) obj[parts[i]] = {};
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = data;
    } else {
      this.state[key] = data;
    }

    if (!this.state.metadata.collectorStats[key]) {
      this.state.metadata.collectorStats[key] = {
        executions: 0,
        failures: 0,
        skipped: 0,
        lastDurationMs: 0,
        lastSuccess: null,
        lastError: null,
        status: 'initializing'
      };
    }

    const stat = this.state.metadata.collectorStats[key];
    stat.lastUpdated = new Date().toISOString();
    if (meta.durationMs !== undefined) stat.lastDurationMs = meta.durationMs;
    if (meta.status) stat.status = meta.status;
    if (meta.error) {
      stat.lastError = meta.error;
      stat.failures++;
    } else {
      stat.lastSuccess = new Date().toISOString();
      stat.executions++;
    }
  }

  get(key) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let obj = this.state;
      for (const part of parts) {
        if (obj == null) return null;
        obj = obj[part];
      }
      return obj;
    }
    return this.state[key];
  }

  getSnapshot() {
    return this.state;
  }

  getDiagnostics() {
    const mem = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      systemOpsMemory: {
        rssBytes: mem.rss,
        rssFormatted: (mem.rss / 1024 / 1024).toFixed(2) + ' MB',
        heapUsedBytes: mem.heapUsed,
        heapUsedFormatted: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotalBytes: mem.heapTotal,
        heapTotalFormatted: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        externalBytes: mem.external,
        externalFormatted: (mem.external / 1024 / 1024).toFixed(2) + ' MB'
      },
      collectorStats: this.state.metadata.collectorStats,
      historyLengths: {
        cpu: this.history.cpu.length,
        ram: this.history.ram.length,
        swap: this.history.swap.length
      }
    };
  }
}

const stateStore = new StateStore();

module.exports = {
  StateStore,
  BoundedHistory,
  stateStore
};
