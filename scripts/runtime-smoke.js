// Exercise the built application over HTTP. With SMOKE_BASE_URL, test an
// existing container; otherwise start the production entrypoint on a free port.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { waitForSystemSnapshot } = require('./smoke-readiness');

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function smoke() {
  const external = process.env.SMOKE_BASE_URL;
  const password = external ? process.env.APP_PASSWORD : crypto.randomBytes(24).toString('hex');
  assert.ok(password, 'APP_PASSWORD is required when testing an existing server');
  const port = external ? null : await freePort();
  const base = external || `http://127.0.0.1:${port}`;
  const dataDir = external ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'system-ops-smoke-'));
  let child;
  let output = '';
  const request = (route, options = {}) => fetch(`${base}${route}`, {
    ...options, signal: options.signal || AbortSignal.timeout(15000),
  });
  try {
    if (!external) {
      child = spawn(process.execPath, ['src/start.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port),
          APP_PASSWORD: password, SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
          ENABLE_GO_COLLECTOR: 'false',
          SYSTEM_OPS_DATA_DIR: dataDir,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', chunk => { output = (output + chunk).slice(-16000); });
      child.stderr.on('data', chunk => { output = (output + chunk).slice(-16000); });
      // Attach immediately so an early spawn failure is handled.
      child.on('error', error => { output += error.message; });
    }

    let available = false;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (child?.exitCode != null) throw new Error('Production entrypoint exited before becoming available');
      try {
        const response = await request('/health');
        if (response.ok && (await response.json()).ok === true) { available = true; break; }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(available, 'Production HTTP liveness did not respond');

    const home = await request('/');
    assert.equal(home.status, 200);
    const html = await home.text();
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1]);
    assert.ok(assets.some(asset => asset.endsWith('.js')), 'Built React entrypoint missing');
    assert.ok(assets.some(asset => asset.endsWith('.css')), 'Built stylesheet missing');
    for (const asset of assets) {
      const response = await request(asset);
      assert.equal(response.status, 200, `Missing built asset: ${asset}`);
      assert.ok(!(response.headers.get('content-type') || '').includes('text/html'), `SPA fallback at ${asset}`);
    }

    const loginPage = await request('/login.html');
    assert.equal(loginPage.status, 200, 'Legacy login page missing');
    assert.match(await loginPage.text(), /\/assets\/.*\.js/);
    const branding = await request('/api/v2/settings/branding');
    assert.equal(branding.status, 200, 'Branding requires a writable data directory');
    const currentBranding = await branding.json();
    assert.ok(currentBranding.siteName);
    if (process.env.SMOKE_EXPECTED_SITE_NAME) {
      assert.equal(currentBranding.siteName, process.env.SMOKE_EXPECTED_SITE_NAME,
        'Settings did not survive container recreation');
    }

    assert.equal((await request('/api/v2/system/snapshot')).status, 401);
    const badLogin = await request('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: `${password}-incorrect` }),
    });
    assert.equal(badLogin.status, 401);
    const login = await request('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('system_ops_session='));
    const headers = { Cookie: cookie };
    const status = await request('/api/auth/status', { headers });
    assert.equal((await status.json()).authenticated, true);
    await waitForSystemSnapshot(request, headers);
    const healthResponse = await request('/api/v2/ops/health', { headers });
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.ok(health.collectors.system.lastSuccess);
    const readiness = await request('/ready');
    assert.ok([200, 503].includes(readiness.status));
    assert.deepEqual(await readiness.json(), { ok: readiness.status === 200 });
    const diagnostics = await request('/api/v2/ops/diagnostics', { headers });
    assert.equal(diagnostics.status, 200);
    assert.ok((await diagnostics.json()).systemOpsMemory.rssBytes > 0);
    const settings = await request('/api/v2/settings', {
      method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteName: 'system-ops-smoke' }),
    });
    assert.equal(settings.status, 200, 'Runtime user cannot persist settings');
    console.log('PASS: production startup, built assets, login, protected snapshot, diagnostics and settings');
  } catch (error) {
    // The smoke child gets random ephemeral credentials; redact them anyway.
    if (output) console.error(output.replaceAll(password, '[redacted]'));
    throw error;
  } finally {
    if (child && child.exitCode == null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await exited; } finally { clearTimeout(timer); }
    }
    if (dataDir && path.dirname(dataDir) === path.resolve(os.tmpdir()) &&
        path.basename(dataDir).startsWith('system-ops-smoke-')) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }
}

smoke().catch(error => { console.error(error.message); process.exitCode = 1; });
