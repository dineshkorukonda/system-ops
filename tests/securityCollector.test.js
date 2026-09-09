const test = require('node:test');
const assert = require('node:assert');
const { parseUfwOutput, parseUfwRuleLine } = require('../src/collectors/security');

test('parseUfwRuleLine extracts port, label, and action', () => {
  const rule = parseUfwRuleLine('443/tcp                     ALLOW IN    Anywhere                   # HTTPS');
  assert.strictEqual(rule.port, '443/tcp');
  assert.strictEqual(rule.label, 'HTTPS');
  assert.strictEqual(rule.allowed, true);
});

test('parseUfwOutput builds human summary and parsed rules', () => {
  const sample = `
Status: active
Default: deny (incoming), allow (outgoing), disabled (routed)
443/tcp                     ALLOW IN    Anywhere                   # HTTPS
22/tcp (OpenSSH)            ALLOW IN    Anywhere
`;
  const out = parseUfwOutput(sample);
  assert.strictEqual(out.active, true);
  assert.strictEqual(out.incomingPolicy, 'block-by-default');
  assert.ok(out.summary.includes('Firewall is ON'));
  assert.ok(out.parsedRules.length >= 2);
});
