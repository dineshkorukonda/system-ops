const DEFAULT_PASSWORDS = new Set([
  'admin-password-change-me',
  'change_me_in_production',
  'ChangeThisToYourSecurePassword123!',
]);
const DEFAULT_SECRETS = new Set([
  'dev-secret-session-key-12345',
  'super-secret-session-key-change-me',
  'random_secret_token_ops_2026',
]);

/** Fail before starting collectors or listening. Never include credential values. */
function validateProductionConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') return;

  const errors = [];
  if (!env.APP_PASSWORD?.trim() || DEFAULT_PASSWORDS.has(env.APP_PASSWORD.trim())) {
    errors.push('APP_PASSWORD must be set to a non-default password');
  }
  if (!env.SESSION_SECRET?.trim() || DEFAULT_SECRETS.has(env.SESSION_SECRET.trim()) ||
      Buffer.byteLength(env.SESSION_SECRET.trim(), 'utf8') < 32) {
    errors.push('SESSION_SECRET must be non-default and at least 32 bytes');
  }
  if (errors.length) {
    throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
  }
}

module.exports = { validateProductionConfig };
