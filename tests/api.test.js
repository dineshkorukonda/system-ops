const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { requireAuth, generateSessionToken } = require('../src/middleware/auth');
const { getBackupFilePath } = require('../src/collectors/backupFiles');
const { getLogSourceTail } = require('../src/collectors/logSources');

test('Auth Middleware - rejects unauthorized request when no session cookie or header provided', (t) => {
  let statusSet = 0;
  let jsonSent = null;

  const req = {
    cookies: {},
    headers: {},
    originalUrl: '/api/status',
    baseUrl: '/api',
    path: '/status'
  };

  const res = {
    status(code) {
      statusSet = code;
      return this;
    },
    json(data) {
      jsonSent = data;
      return this;
    }
  };

  let nextCalled = false;
  requireAuth(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, false);
  assert.strictEqual(statusSet, 401);
  assert.strictEqual(jsonSent.error, 'Unauthorized');
});

test('Auth Middleware - accepts valid session token cookie', (t) => {
  const appPassword = process.env.APP_PASSWORD || 'admin-password-change-me';
  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-session-key-12345';
  const token = generateSessionToken(appPassword, sessionSecret);

  const req = {
    cookies: { system_ops_session: token },
    headers: {},
    originalUrl: '/api/status'
  };

  const res = {};
  let nextCalled = false;

  requireAuth(req, res, () => { nextCalled = true; });

  assert.strictEqual(nextCalled, true);
});

test('Backup Files Collector - prevents directory traversal', (t) => {
  assert.throws(() => {
    getBackupFilePath('../../../etc/passwd');
  }, /Invalid filename format/);

  assert.throws(() => {
    getBackupFilePath('..\\..\\secret.txt');
  }, /Invalid filename format/);
});
