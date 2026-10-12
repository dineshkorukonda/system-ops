const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const METRICS = ['cpu', 'ram', 'swap'];

class DurableStore {
  constructor(filename, { historyLimit = 10080, observationLimit = 10080, now = Date.now } = {}) {
    this.filename = filename; this.now = now;
    this.historyLimit = Math.min(10080, Math.max(1, historyLimit));
    this.observationLimit = Math.min(10080, Math.max(1, observationLimit));
    this.error = null; this.db = null;
    try {
      if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
      this.db = new DatabaseSync(filename, { timeout: 100 });
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA max_page_count=16384; PRAGMA journal_size_limit=1048576; PRAGMA wal_autocheckpoint=128;');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > 1) throw new Error('Database schema is newer than this application; refusing downgrade');
      if (version === 0) this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE metrics (metric TEXT NOT NULL CHECK(metric IN ('cpu','ram','swap')), bucket INTEGER NOT NULL, total REAL NOT NULL, n INTEGER NOT NULL, PRIMARY KEY(metric,bucket));
        CREATE TABLE checks (id TEXT PRIMARY KEY, config TEXT NOT NULL);
        CREATE TABLE observations (check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE, time INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('up','down','unknown')), latency REAL, error TEXT, PRIMARY KEY(check_id,time));
        CREATE TABLE incidents (id INTEGER PRIMARY KEY, check_id TEXT NOT NULL REFERENCES checks(id) ON DELETE CASCADE, opened INTEGER NOT NULL, closed INTEGER, acknowledged INTEGER, reason TEXT);
        CREATE TABLE deliveries (incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, kind TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL, delivered INTEGER, error TEXT, PRIMARY KEY(incident_id,kind));
        PRAGMA user_version=1; COMMIT;`);
      if (filename !== ':memory:') fs.chmodSync(filename, 0o600);
    } catch (error) { this.fail(error); try { this.db?.close(); } catch {} this.db = null; }
  }
  fail(error) { this.error = error.message; }
  read(operation, fallback) { try { if (!this.db) throw new Error(this.error || 'Persistence unavailable'); return operation(this.db); } catch (error) { this.fail(error); return fallback; } }
  write(operation) {
    if (!this.db) return false;
    try { this.db.exec('BEGIN IMMEDIATE'); operation(this.db); this.db.exec('COMMIT'); this.error = null; return true; }
    catch (error) { try { this.db.exec('ROLLBACK'); } catch {} this.fail(error); return false; }
  }
  status() { return { available: !!this.db && !this.error, error: this.error, schemaVersion: 1, historyResolutionMs: 60000, maxHistoryRowsPerMetric: this.historyLimit, maxObservationsPerCheck: this.observationLimit, maxDatabaseBytes: 64 * 1024 * 1024 }; }
  setting(key) { return this.read(db => { const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; }, null); }
  saveSetting(key, value) {
    if (!['settings', 'notifications'].includes(key)) throw new Error('Unknown settings key');
    const json = JSON.stringify(value); if (Buffer.byteLength(json) > 65536) throw new Error('Settings exceed storage limit');
    return this.write(db => db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, json));
  }
  metrics(values, time = this.now()) {
    return this.write(db => {
      const insert = db.prepare('INSERT INTO metrics VALUES (?,?,?,1) ON CONFLICT(metric,bucket) DO UPDATE SET total=total+excluded.total,n=n+1');
      const prune = db.prepare('DELETE FROM metrics WHERE metric=? AND bucket NOT IN (SELECT bucket FROM metrics WHERE metric=? ORDER BY bucket DESC LIMIT ?)');
      for (const metric of METRICS) if (Number.isFinite(values[metric])) { insert.run(metric, Math.floor(time / 60000) * 60000, values[metric]); prune.run(metric, metric, this.historyLimit); }
    });
  }
  history(limit = 300) {
    return this.read(db => Object.fromEntries(METRICS.map(metric => [metric, db.prepare('SELECT bucket AS time,total/n AS value,n AS samples FROM metrics WHERE metric=? ORDER BY bucket DESC LIMIT ?').all(metric, Math.min(300, Math.max(1, limit))).reverse()])), { cpu: [], ram: [], swap: [] });
  }
  checks() { return this.read(db => db.prepare('SELECT config FROM checks ORDER BY id').all().map(row => JSON.parse(row.config)), []); }
  saveCheck(config) {
    const json = JSON.stringify(config);
    if (Buffer.byteLength(json) > 4096) throw new Error('Check configuration exceeds storage limit');
    const existing = this.checks();
    if (existing.length >= 50 && !existing.some(check => check.id === config.id)) throw new Error('At most 50 checks are supported');
    return this.write(db => {
      if (db.prepare('SELECT count(*) AS n FROM checks').get().n >= 50 && !db.prepare('SELECT id FROM checks WHERE id=?').get(config.id)) throw new Error('At most 50 checks are supported');
      db.prepare('INSERT INTO checks VALUES (?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config').run(config.id, json);
    });
  }
  removeCheck(id) { return this.write(db => db.prepare('DELETE FROM checks WHERE id=?').run(id)); }
  observation(id, result, time = this.now()) {
    return this.write(db => {
      db.prepare('INSERT INTO observations VALUES (?,?,?,?,?) ON CONFLICT(check_id,time) DO UPDATE SET status=excluded.status,latency=excluded.latency,error=excluded.error').run(id, time, result.status, result.latencyMs ?? null, result.error?.slice(0, 1000) || null);
      db.prepare('DELETE FROM observations WHERE check_id=? AND time NOT IN (SELECT time FROM observations WHERE check_id=? ORDER BY time DESC LIMIT ?)').run(id, id, this.observationLimit);
      const open = db.prepare('SELECT id FROM incidents WHERE check_id=? AND closed IS NULL').get(id);
      if (result.status === 'down' && !open) {
        const inserted = db.prepare('INSERT INTO incidents(check_id,opened,reason) VALUES (?,?,?)').run(id, time, result.error?.slice(0, 1000) || 'Check failed');
        db.prepare("INSERT INTO deliveries(incident_id,kind,next_attempt) VALUES (?,'outage',?)").run(inserted.lastInsertRowid, time);
      } else if (result.status === 'up' && open) {
        db.prepare('UPDATE incidents SET closed=? WHERE id=?').run(time, open.id);
        db.prepare("INSERT INTO deliveries(incident_id,kind,next_attempt) VALUES (?,'recovery',?)").run(open.id, time);
      }
      db.exec('DELETE FROM incidents WHERE closed IS NOT NULL AND id NOT IN (SELECT id FROM incidents ORDER BY id DESC LIMIT 2000)');
    });
  }
  observations(id, since = 0) { return this.read(db => db.prepare('SELECT time,status,latency AS latencyMs,error FROM observations WHERE check_id=? AND time>=? ORDER BY time').all(id, since), []); }
  incidents() { return this.read(db => db.prepare('SELECT * FROM incidents ORDER BY opened DESC LIMIT 2000').all(), []); }
  acknowledge(id) { return this.write(db => db.prepare('UPDATE incidents SET acknowledged=? WHERE id=?').run(this.now(), id)); }
  pendingDeliveries(time = this.now()) {
    return this.read(db => db.prepare(`SELECT deliveries.*, incidents.check_id, incidents.opened, incidents.closed, incidents.acknowledged, incidents.reason
      FROM deliveries JOIN incidents ON incidents.id=deliveries.incident_id WHERE delivered IS NULL AND attempts<10 AND next_attempt<=? ORDER BY next_attempt LIMIT 2`).all(time), []);
  }
  deliveryAttempt(event, { delivered = null, error = null, nextAttempt, increment = true }) {
    return this.write(db => db.prepare('UPDATE deliveries SET delivered=?,error=?,next_attempt=?,attempts=attempts+? WHERE incident_id=? AND kind=?')
      .run(delivered, error?.slice(0,1000) || null, nextAttempt || this.now(), increment ? 1 : 0, event.incident_id, event.kind));
  }
  deliveryStatus() { return this.read(db => db.prepare('SELECT * FROM deliveries ORDER BY incident_id DESC LIMIT 100').all(), []); }
  close() { try { this.db?.exec('PRAGMA wal_checkpoint(TRUNCATE)'); this.db?.close(); this.db = null; } catch (error) { this.fail(error); } }
}
let singleton;
function getDurableStore() {
  if (!singleton) {
    const dir = process.env.SYSTEM_OPS_DATA_DIR || path.join(__dirname, '../../data');
    singleton = new DurableStore(process.env.NODE_ENV === 'test' && !process.env.SYSTEM_OPS_DATA_DIR ? ':memory:' : path.join(dir, 'monitoring.sqlite'));
  }
  return singleton;
}
module.exports = { DurableStore, getDurableStore };
