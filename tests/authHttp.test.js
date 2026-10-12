const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const cookieParser = require('cookie-parser');
const { handleLogin, handleLogout, isAuthenticated, requireAuth } = require('../src/middleware/auth');
const { loginLimiter } = require('../src/middleware/rateLimiter');

test('HTTP login, shared auth status, logout replay, proxy cookies and rate limiting', async () => {
  process.env.APP_PASSWORD = 'http-fixture-password';
  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(express.json(), cookieParser());
  app.post('/login', loginLimiter, handleLogin);
  app.post('/logout', handleLogout);
  app.get('/status', (req, res) => res.json({ authenticated: isAuthenticated(req) }));
  app.get('/api/private', requireAuth, (req, res) => res.json({ ok: true }));
  app.get('/metrics', requireAuth, (req, res) => res.type('text/plain').send('fixture_metric 1\n'));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const request = (route, opts = {}) => fetch(`http://127.0.0.1:${server.address().port}${route}`, opts);
  try {
    for (const route of ['/metrics', '/metrics?format=text']) {
      const denied = await request(route, { redirect: 'manual' });
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get('location'), null);
      assert.equal((await denied.json()).error, 'Unauthorized');
    }
    const scrape = await request('/metrics', { headers: { authorization: 'Bearer http-fixture-password' }, redirect: 'manual' });
    assert.equal(scrape.status, 200);
    assert.equal(await scrape.text(), 'fixture_metric 1\n');
    const login = await request('/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' }, body: JSON.stringify({ password: process.env.APP_PASSWORD }) });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get('set-cookie');
    assert.match(cookieHeader, /Secure/);
    assert.match(cookieHeader, /HttpOnly/);
    const cookie = cookieHeader.split(';')[0];
    assert.equal((await request('/api/private', { headers: { cookie } })).status, 200);
    assert.equal((await (await request('/status', { headers: { authorization: 'wrong http-fixture-password suffix' } })).json()).authenticated, false);
    await request('/logout', { method: 'POST', headers: { cookie } });
    assert.equal((await request('/api/private', { headers: { cookie } })).status, 401);
    assert.equal((await (await request('/status', { headers: { cookie } })).json()).authenticated, false);
    for (let i = 0; i < 14; i++) assert.equal((await request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"incorrect"}' })).status, 401);
    assert.equal((await request('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"password":"incorrect"}' })).status, 429);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
