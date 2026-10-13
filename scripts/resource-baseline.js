// Linux-only, isolated production workload. Never attaches to a live deployment.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { once } = require('node:events');
const http = require('node:http');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const seconds = Number(process.env.BASELINE_SECONDS || 120);
const warmup = Number(process.env.BASELINE_WARMUP_SECONDS || 20);
const scenarios = (process.env.BASELINE_SCENARIOS || 'idle,viewers,traffic,rotation,failing-integrations').split(',');
const logMaxBytes = Number(process.env.BASELINE_LOG_MAX_BYTES || 64 * 1024 * 1024);
const observerPort = process.env.BASELINE_OBSERVER_PORT ? Number(process.env.BASELINE_OBSERVER_PORT) : null;
const quantile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)] : null;

// Synthetic soak traffic must not fill the reference host's disk. Retain only
// the active log and one rotated file, and record every rotation in the report.
function appendBaselineLog(filename, batch, state, maxBytes, forceRotate = false) {
  const size = Buffer.byteLength(batch);
  if (!Number.isFinite(maxBytes) || maxBytes < 1 || size > maxBytes) throw new Error('Invalid baseline log byte limit');
  if (forceRotate || state.bytes + size > maxBytes) {
    const previous = filename + '.1';
    if (fs.existsSync(previous)) fs.unlinkSync(previous);
    fs.renameSync(filename, previous);
    fs.writeFileSync(filename, '');
    state.bytes = 0; state.rotations++;
  }
  fs.appendFileSync(filename, batch); state.bytes += size;
}

async function readinessGateway(target, port) {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' || req.url !== '/ready') {res.writeHead(404);res.end();return;}
    try {
      const response = await fetch(target + '/ready', {signal:AbortSignal.timeout(2000),redirect:'manual'});
      await response.body?.cancel();
      res.writeHead(response.ok ? 200 : 503, {'Content-Type':'application/json'});
      res.end(JSON.stringify({ok:response.ok}));
    } catch {res.writeHead(503,{'Content-Type':'application/json'});res.end('{"ok":false}');}
  });
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return server;
}

function procSnapshot(rootPid, extraPids = []) {
  const all = new Map();
  for (const entry of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const raw = fs.readFileSync(`/proc/${entry}/stat`, 'utf8');
      const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ');
      const status = fs.readFileSync(`/proc/${entry}/status`, 'utf8');
      all.set(Number(entry), { pid: Number(entry), parent: Number(fields[1]),
        ticks: Number(fields[11]) + Number(fields[12]),
        rssBytes: Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] || 0) * 1024 });
    } catch { /* Process exited during sampling. */ }
  }
  const selected = new Set([rootPid, ...extraPids]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const proc of all.values()) if (selected.has(proc.parent) && !selected.has(proc.pid)) {
      selected.add(proc.pid); changed = true;
    }
  }
  return [...selected].map(pid => all.get(pid)).filter(Boolean);
}

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function run(scenario, ticksPerSecond) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'system-ops-baseline-'));
  const log = path.join(directory, 'access.log');
  fs.writeFileSync(log, '');
  const port = await freePort();
  const password = crypto.randomBytes(24).toString('hex');
  const goMode = process.env.BASELINE_COLLECTOR === 'go';
  const goPort = goMode ? await freePort() : null;
  const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
    APP_PASSWORD: password, SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    SYSTEM_OPS_DATA_DIR: directory, ENABLE_GO_COLLECTOR: String(goMode),
    GO_COLLECTOR_URL: `http://127.0.0.1:${goPort || 9081}`,
    GO_COLLECTOR_HEALTH_CACHE_MS: '1000',
    NGINX_LOG_PATH: log, TRACKED_DOMAINS: 'baseline.local',
    OLLAMA_URL: 'http://127.0.0.1:1', SYSTEM_OPS_TRAFFIC_INTERVAL: '1000', ENABLE_TRAFFIC: 'true',
    ENABLE_OLLAMA: scenario === 'failing-integrations' ? 'true' : 'false' };
  const child = spawn(process.execPath, ['src/start.js'], { cwd: path.join(__dirname, '..'), env,
    stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const goChild = goMode ? spawn(path.resolve('go-collector/bin/system-ops-collector'), [], {
    env: { ...env, GO_COLLECTOR_HOST: '127.0.0.1', GO_COLLECTOR_PORT: String(goPort) }, stdio: 'ignore' }) : null;
  goChild?.on('error', error => { output += error.message; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-16000); });
  const base = `http://127.0.0.1:${port}`;
  const request = (route, opts = {}) => fetch(base + route, { ...opts, signal: AbortSignal.timeout(10000) });
  let traffic;
  let viewers;
  let gateway;
  try {
    let ready = false;
    for (let i = 0; i < 180; i++) {
      if (child.exitCode !== null) throw new Error('Server exited: ' + output);
      try { if ((await request('/health')).ok) { ready = true; break; } } catch {}
      await sleep(250);
    }
    if (!ready) throw new Error('Server did not start: ' + output);
    const login = await request('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    if (!login.ok) throw new Error('Fixture login failed');
    // The workload can exceed browser sessions' eight-hour lifetime. The
    // isolated API credential remains valid for the entire measurement.
    const headers = {Authorization:`Bearer ${password}`};
    if (observerPort) gateway = await readinessGateway(base, observerPort);
    const latencies = [];
    let errors = 0;
    let requests = 0;
    let busy = false;
    async function view() {
      if (busy) return;
      busy = true;
      try { await Promise.all(Array.from({ length: 5 }, async () => {
        const start = performance.now();
        try { const res = await request('/api/v2/system/snapshot', { headers });
          await res.arrayBuffer(); requests++; if (!res.ok) errors++;
        } catch { errors++; }
        latencies.push(performance.now() - start);
      })); } finally { busy = false; }
    }
    if (scenario === 'viewers') viewers = setInterval(view, 5000);
    let lines = 0;
    let rotated = false;
    const logState = { bytes: 0, rotations: 0 };
    if (['traffic', 'rotation'].includes(scenario)) traffic = setInterval(() => {
      const forceRotate = scenario === 'rotation' && !rotated && lines >= 5000;
      const batch = Array.from({ length: 1000 }, (_, i) => {
        const id = lines + i;
        return `10.${Math.floor(id / 65536) % 256}.${Math.floor(id / 256) % 256}.${id % 256} - - [10/Oct/2026:12:00:00 +0000] "GET /path/${id} HTTP/1.1" 200 128 "-" "baseline-agent/${id}" "baseline.local"\n`;
      }).join('');
      appendBaselineLog(log, batch, logState, logMaxBytes, forceRotate);
      rotated = logState.rotations > 0; lines += 1000;
    }, 1000);
    await sleep(warmup * 1000);
    const initial = await (await request('/api/v2/ops/diagnostics', { headers })).json();
    const samples = [];
    if (goMode) {
      const res = await request('/api/v2/ops/diagnostics', { headers });
      if (!(await res.json()).goCollector.available) throw new Error('Go comparison would silently measure fallback; sidecar must be available');
    }
    let previous = procSnapshot(child.pid, goChild ? [goChild.pid] : []);
    let previousTime = performance.now();
    const start = previousTime;
    while (performance.now() - start < seconds * 1000) {
      await sleep(1000);
      const now = performance.now();
      const current = procSnapshot(child.pid, goChild ? [goChild.pid] : []);
      const old = new Map(previous.map(proc => [proc.pid, proc]));
      const deltaTicks = current.reduce((sum, proc) => sum + Math.max(0, proc.ticks - (old.get(proc.pid)?.ticks ?? proc.ticks)), 0);
      samples.push({ time: new Date().toISOString(), rssBytes: current.reduce((sum, proc) => sum + proc.rssBytes, 0),
        cpuOneCorePercent: 100 * deltaTicks / ticksPerSecond / ((now - previousTime) / 1000), processes: current });
      if (process.env.BASELINE_PROGRESS_OUTPUT && samples.length % 60 === 0) {
        const progressFile = path.resolve(process.env.BASELINE_PROGRESS_OUTPUT);
        fs.mkdirSync(path.dirname(progressFile), {recursive:true});
        fs.writeFileSync(progressFile + '.tmp', JSON.stringify({scenario,time:new Date().toISOString(),measuredSeconds:(now-start)/1000,samples:samples.length,generatedLogLines:lines,logRotations:logState.rotations}), {mode:0o600});
        fs.renameSync(progressFile + '.tmp', progressFile);
      }
      previous = current; previousTime = now;
    }
    const final = await (await request('/api/v2/ops/diagnostics', { headers })).json();
    const finalTraffic = await (await request('/api/v2/traffic/analytics', { headers })).json();
    return { scenario, durationSeconds: (performance.now() - start) / 1000, generatedLogLines: lines, rotated, logRotations: logState.rotations,
      summary: { rssMedianBytes: quantile(samples.map(s => s.rssBytes), .5), rssPeakBytes: samples.reduce((peak,s) => Math.max(peak,s.rssBytes),0),
        cpuAverageOneCorePercent: samples.reduce((sum, s) => sum + s.cpuOneCorePercent, 0) / samples.length,
        apiRequests: requests, apiErrors: errors, apiP95Ms: quantile(latencies, .95) },
      initialDiagnostics: initial, finalDiagnostics: final, traffic: { summary: finalTraffic.summary,
        retention: finalTraffic.retention, processing: finalTraffic.processing }, samples,
      limitations: ['One-second process sampling misses short-lived children; command counts are instrumented separately.',
        'Fixtures exercise API viewers, not browser rendering. This is not an availability or SLO measurement.'] };
  } finally {
    clearInterval(traffic); clearInterval(viewers);
    if (gateway) {gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
    if (goChild && goChild.exitCode === null) { const done = once(goChild, 'exit'); goChild.kill('SIGKILL'); await done; }
    if (child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000); await done; clearTimeout(timer); }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'linux') throw new Error('Run this benchmark on Linux; Windows results cannot stand in for Ubuntu.');
  if (!Number.isFinite(seconds) || seconds < 1 || !Number.isFinite(warmup) || warmup < 0) throw new Error('Invalid measurement duration');
  if (!Number.isFinite(logMaxBytes) || logMaxBytes < 1024 * 1024) throw new Error('Baseline log limit must be at least 1 MiB');
  if (observerPort && (!Number.isInteger(observerPort) || observerPort < 1 || observerPort > 65535 || scenarios.length !== 1)) throw new Error('Observer gateway requires one scenario and a valid port');
  const allowed = new Set(['idle', 'viewers', 'traffic', 'rotation', 'failing-integrations']);
  if (scenarios.some(name => !allowed.has(name))) throw new Error('Unknown workload');
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    machine: { platform: process.platform, release: os.release(), arch: os.arch(), cpus: os.cpus().map(cpu => cpu.model),
      totalMemoryBytes: os.totalmem(), node: process.version, osRelease: fs.readFileSync('/etc/os-release', 'utf8') },
    configuration: { collector: process.env.BASELINE_COLLECTOR === 'go' ? 'node-and-go' : 'node-only', seconds, warmup, viewers: 5, trafficLinesPerSecond: 1000,
      geoip: process.env.TRAFFIC_GEOIP === 'true', userAgent: process.env.TRAFFIC_PARSE_USER_AGENT === 'true', logMaxBytes }, results: [] };
  const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
  for (const scenario of scenarios) { console.log('Measuring ' + scenario); report.results.push(await run(scenario, ticks)); }
  report.completedAt = new Date().toISOString();
  const destination = path.resolve(process.env.BASELINE_OUTPUT || 'artifacts/resource-baseline.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log('Report: ' + destination);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { procSnapshot, quantile, appendBaselineLog, readinessGateway };
