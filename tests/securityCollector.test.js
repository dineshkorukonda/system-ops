const test = require('node:test');
const assert = require('node:assert');
const { parseUfwOutput, parseUfwRuleLine } = require('../src/collectors/security');

test('parseUfwRuleLine extracts port, label, and action', () => {
  const rule = parseUfwRuleLine('443/tcp                     ALLOW IN    Anywhere                   # HTTPS');
  assert.strictEqual(rule.port, '443/tcp');
  assert.strictEqual(rule.label, 'HTTPS');
  assert.strictEqual(rule.allowed, true);
});

test('parseUfwRuleLine handles IPv6 and OpenSSH rule formats', () => {
  const v6 = parseUfwRuleLine('9090/tcp (v6)                ALLOW IN    Anywhere (v6)              # VersionGate API/setup');
  assert.strictEqual(v6.allowed, true);
  assert.ok(v6.label.includes('VersionGate'));
  assert.strictEqual(v6.ipv6, true);

  const ssh = parseUfwRuleLine('22/tcp (OpenSSH)             ALLOW IN    Anywhere');
  assert.strictEqual(ssh.label, 'OpenSSH');
  assert.strictEqual(ssh.port, '22/tcp (OpenSSH)');
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
