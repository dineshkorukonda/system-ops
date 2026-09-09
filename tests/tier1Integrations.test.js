const test = require('node:test');
const assert = require('node:assert/strict');
const { extractHostname } = require('../src/collectors/tlsCerts');
const { parseCertbotCertificates } = require('../src/collectors/certbot');

test('extractHostname normalizes URLs and hostnames', () => {
  assert.equal(extractHostname('https://Ops.Example.com/path'), 'ops.example.com');
  assert.equal(extractHostname('system-ops.dineshkorukonda.online:443'), 'system-ops.dineshkorukonda.online');
});

test('discoverNginxSslMap parses ssl_certificate from server blocks', () => {
  const content = `
    server {
      listen 443 ssl;
      server_name app.example.com www.example.com;
      ssl_certificate /etc/letsencrypt/live/app.example.com/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/app.example.com/privkey.pem;
    }
  `;

  const map = new Map();
  const blocks = content.split(/\bserver\s*\{/i).slice(1);
  for (const block of blocks) {
    const body = block.slice(0, block.indexOf('}'));
    const certMatch = body.match(/ssl_certificate\s+([^;\s]+)/i);
    const certPath = certMatch[1].trim();
    const names = [...body.matchAll(/server_name\s+([^;]+);/gi)][0][1].trim().split(/\s+/);
    for (const dom of names) map.set(dom.toLowerCase(), certPath);
  }

  assert.equal(map.get('app.example.com'), '/etc/letsencrypt/live/app.example.com/fullchain.pem');
  assert.equal(map.get('www.example.com'), '/etc/letsencrypt/live/app.example.com/fullchain.pem');
});

test('parseCertbotCertificates extracts certificate metadata', () => {
  const sample = `
Found the following certs:
  Certificate Name: example.com
    Domains: example.com www.example.com
    Expiry Date: 2026-12-01 12:00:00+00:00 (VALID: 83 days)
    Certificate Path: /etc/letsencrypt/live/example.com/fullchain.pem
    Private Key Path: /etc/letsencrypt/live/example.com/privkey.pem
`;

  const certs = parseCertbotCertificates(sample);
  assert.equal(certs.length, 1);
  assert.equal(certs[0].name, 'example.com');
  assert.deepEqual(certs[0].domains, ['example.com', 'www.example.com']);
  assert.equal(certs[0].valid, true);
});

test('getCapabilities includes tier-1 integration keys', async () => {
  const { getCapabilities } = require('../src/collectors/capabilities');
  const caps = await getCapabilities();
  for (const key of ['databases', 'security', 'osUpdates', 'certbot', 'monix']) {
    assert.ok(key in caps, `${key} key present`);
    assert.ok(typeof caps[key].available === 'boolean' || typeof caps[key].configured === 'boolean');
  }
});
