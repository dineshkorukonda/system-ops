const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
test('invalid sidecar schema triggers observable Node fallback instead of healthy bad data', async () => {
  const server = await new Promise(resolve => {
    const instance = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url === '/health' ? { ok: true } : { memory: 'invalid' }));
    }).listen(0, '127.0.0.1', () => resolve(instance));
  });
  process.env.ENABLE_GO_COLLECTOR = 'true';
  process.env.GO_COLLECTOR_URL = `http://127.0.0.1:${server.address().port}`;
  const client = require('../src/services/goCollectorClient');
  try {
    assert.equal(await client.getSystemSnapshot(), null);
    assert.equal(client.getStatus().selectedBackend, 'node');
    assert.equal(client.getStatus().fallbackActive, true);
    assert.match(client.getStatus().lastError, /schema/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
