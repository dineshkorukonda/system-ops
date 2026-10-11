const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SessionStore, isAuthenticated, handleLogin, handleLogout } = require('../src/middleware/auth');

test('sessions are unique, expire, revoke, and do not survive a new store', () => {
  let now = 0;
  const store = new SessionStore({ now: () => now, ttlMs: 100, maxSessions: 2 });
  const first = store.create('identity');
  const second = store.create('identity');
  assert.notEqual(first, second);
  assert.equal(store.valid(first, 'identity'), true);
  assert.equal(store.valid(first, 'different'), false);
  assert.equal(new SessionStore().valid(first, 'identity'), false);
  store.revoke(first);
  assert.equal(store.valid(first, 'identity'), false);
  now = 100;
  assert.equal(store.valid(second, 'identity'), false);
  store.create('identity'); store.create('identity'); store.create('identity');
  assert.equal(store.sessions.size, 2);
});

test('auth checks exact schemas and supports colon-containing Basic passwords', () => {
  process.env.APP_PASSWORD = 'test:password';
  const auth = authorization => isAuthenticated({ headers: { authorization } });
  assert.equal(auth('garbage test:password suffix'), false);
  assert.equal(auth('Bearer xtest:password'), false);
  assert.equal(auth('Bearer test:password extra'), false);
  assert.equal(auth('Bearer test:password'), true);
  assert.equal(auth('Basic ' + Buffer.from('ops:test:password').toString('base64')), true);
  assert.equal(auth('Basic ' + Buffer.from('ops:wrong').toString('base64')), false);
});

test('logout invalidates a copied cookie and TLS cookies have matching attributes', () => {
  process.env.APP_PASSWORD = 'fixture-password';
  let token, attributes, clearAttributes;
  const res = { setHeader() {}, json() {}, cookie(name, value, opts) { token = value; attributes = opts; },
    clearCookie(name, opts) { clearAttributes = opts; } };
  handleLogin({ body: { password: 'fixture-password' }, secure: true }, res);
  const request = { cookies: { system_ops_session: token }, headers: {}, secure: true };
  assert.equal(attributes.secure, true);
  assert.equal(attributes.httpOnly, true);
  assert.equal(attributes.sameSite, 'strict');
  assert.equal(isAuthenticated(request), true);
  handleLogout(request, res);
  assert.equal(isAuthenticated(request), false);
  assert.equal(clearAttributes.path, attributes.path);
  assert.equal(clearAttributes.secure, attributes.secure);
});
