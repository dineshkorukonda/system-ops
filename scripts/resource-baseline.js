// Linux-only, isolated production workload. Never attaches to a live deployment.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { once } = require('node:events');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const seconds = Number(process.env.BASELINE_SECONDS || 120);
const warmup = Number(process.env.BASELINE_WARMUP_SECONDS || 20);
const scenarios = (process.env.BASELINE_SCENARIOS || 'idle,viewers,traffic,rotation,failing-integrations').split(',');
const quantile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * q)] : null;

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
  const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
    APP_PASSWORD: password, SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
    SYSTEM_OPS_DATA_DIR: directory, ENABLE_GO_COLLECTOR: 'false',
    NGINX_LOG_PATH: log, TRACKED_DOMAINS: 'baseline.local',
    OLLAMA_URL: 'http://127.0.0.1:1', SYSTEM_OPS_TRAFFIC_INTERVAL: '1000', ENABLE_TRAFFIC: 'true',
    ENABLE_OLLAMA: scenario === 'failing-integrations' ? 'true' : 'false' };
  const child = spawn(process.execPath, ['src/start.js'], { cwd: path.join(__dirname, '..'), env,
    stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { output = (output + bytes).slice(-16000); });
  const base = `http://127.0.0.1:${port}`;
  const request = (route, opts = {}) => fetch(base + route, { ...opts, signal: AbortSignal.timeout(10000) });
  let traffic;
  let viewers;
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
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const latencies = [];
    let errors = 0;
    let requests = 0;
    let busy = false;
    async function view() {
      if (busy) return;
      busy = true;
      try { await Promise.all(Array.from({ length: 5 }, async () => {
        const start = performance.now();
        try { const res = await request('/api/v2/system/snapshot', { headers: { cookie } });
          await res.arrayBuffer(); requests++; if (!res.ok) errors++;
        } catch { errors++; }
        latencies.push(performance.now() - start);
      })); } finally { busy = false; }
    }
    if (scenario === 'viewers') viewers = setInterval(view, 5000);
    let lines = 0;
    let rotated = false;
    if (['traffic', 'rotation'].includes(scenario)) traffic = setInterval(() => {
      if (scenario === 'rotation' && !rotated && lines >= 5000) {
        fs.renameSync(log, log + '.1'); fs.writeFileSync(log, ''); rotated = true;
      }
      const batch = Array.from({ length: 1000 }, (_, i) => {
        const id = lines + i;
        return `10.${Math.floor(id / 65536) % 256}.${Math.floor(id / 256) % 256}.${id % 256} - - [10/Oct/2026:12:00:00 +0000] "GET /path/${id} HTTP/1.1" 200 128 "-" "baseline-agent/${id}" "baseline.local"\n`;
      }).join('');
      fs.appendFileSync(log, batch); lines += 1000;
    }, 1000);
    await sleep(warmup * 1000);
    const initial = await (await request('/api/v2/ops/diagnostics', { headers: { cookie } })).json();
    const samples = [];
    let previous = procSnapshot(child.pid);
    let previousTime = performance.now();
    const start = previousTime;
    while (performance.now() - start < seconds * 1000) {
      await sleep(1000);
      const now = performance.now();
      const current = procSnapshot(child.pid);
      const old = new Map(previous.map(proc => [proc.pid, proc]));
      const deltaTicks = current.reduce((sum, proc) => sum + Math.max(0, proc.ticks - (old.get(proc.pid)?.ticks ?? proc.ticks)), 0);
      samples.push({ time: new Date().toISOString(), rssBytes: current.reduce((sum, proc) => sum + proc.rssBytes, 0),
        cpuOneCorePercent: 100 * deltaTicks / ticksPerSecond / ((now - previousTime) / 1000), processes: current });
      previous = current; previousTime = now;
    }
    const final = await (await request('/api/v2/ops/diagnostics', { headers: { cookie } })).json();
    return { scenario, durationSeconds: (performance.now() - start) / 1000, generatedLogLines: lines, rotated,
      summary: { rssMedianBytes: quantile(samples.map(s => s.rssBytes), .5), rssPeakBytes: Math.max(...samples.map(s => s.rssBytes)),
        cpuAverageOneCorePercent: samples.reduce((sum, s) => sum + s.cpuOneCorePercent, 0) / samples.length,
        apiRequests: requests, apiErrors: errors, apiP95Ms: quantile(latencies, .95) },
      initialDiagnostics: initial, finalDiagnostics: final, samples,
      limitations: ['One-second process sampling misses short-lived children; command counts are instrumented separately.',
        'Fixtures exercise API viewers, not browser rendering. This is not an availability or SLO measurement.'] };
  } finally {
    clearInterval(traffic); clearInterval(viewers);
    if (child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 10000); await done; clearTimeout(timer); }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== 'linux') throw new Error('Run this benchmark on Linux; Windows results cannot stand in for Ubuntu.');
  if (!Number.isFinite(seconds) || seconds < 1 || !Number.isFinite(warmup) || warmup < 0) throw new Error('Invalid measurement duration');
  const allowed = new Set(['idle', 'viewers', 'traffic', 'rotation', 'failing-integrations']);
  if (scenarios.some(name => !allowed.has(name))) throw new Error('Unknown workload');
  const report = { schemaVersion: 1, startedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    machine: { platform: process.platform, release: os.release(), arch: os.arch(), cpus: os.cpus().map(cpu => cpu.model),
      totalMemoryBytes: os.totalmem(), node: process.version, osRelease: fs.readFileSync('/etc/os-release', 'utf8') },
    configuration: { collector: 'node-only', seconds, warmup, viewers: 5, trafficLinesPerSecond: 1000 }, results: [] };
  const ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
  for (const scenario of scenarios) { console.log('Measuring ' + scenario); report.results.push(await run(scenario, ticks)); }
  report.completedAt = new Date().toISOString();
  const destination = path.resolve(process.env.BASELINE_OUTPUT || 'artifacts/resource-baseline.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2));
  console.log('Report: ' + destination);
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { procSnapshot, quantile };
