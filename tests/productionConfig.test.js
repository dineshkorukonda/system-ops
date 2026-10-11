const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { validateProductionConfig } = require('../src/config/production');

const valid = {
  NODE_ENV: 'production',
  APP_PASSWORD: 'fixture-password-only',
  SESSION_SECRET: 'a'.repeat(64),
};

test('production requires explicit non-default credentials', () => {
  for (const password of ['', ' ', 'admin-password-change-me', 'change_me_in_production',
    'ChangeThisToYourSecurePassword123!']) {
    assert.throws(() => validateProductionConfig({ ...valid, APP_PASSWORD: password }), /APP_PASSWORD/);
  }
  for (const secret of ['', ' ', 'short-fixture-secret', 'dev-secret-session-key-12345',
    'super-secret-session-key-change-me', 'random_secret_token_ops_2026']) {
    assert.throws(() => validateProductionConfig({ ...valid, SESSION_SECRET: secret }), /SESSION_SECRET/);
  }
  assert.throws(() => validateProductionConfig({ NODE_ENV: 'production' }), /APP_PASSWORD.*SESSION_SECRET/);
  assert.doesNotThrow(() => validateProductionConfig(valid));
  assert.doesNotThrow(() => validateProductionConfig({ NODE_ENV: 'development' }));
  assert.doesNotThrow(() => validateProductionConfig({ NODE_ENV: 'test' }));
});

test('production startup exits before listening and does not print credential values', () => {
  const password = 'private-password-fixture';
  const secret = 'private-short-fixture';
  const result = spawnSync(process.execPath, ['src/start.js'], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'production', APP_PASSWORD: password, SESSION_SECRET: secret },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  const output = result.stdout + result.stderr;
  assert.match(output, /Invalid production configuration.*SESSION_SECRET/);
  assert.doesNotMatch(output, /Listening on/);
  assert.ok(!output.includes(password));
  assert.ok(!output.includes(secret));
});
