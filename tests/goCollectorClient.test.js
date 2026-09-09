const test = require('node:test');
const assert = require('node:assert/strict');

test('goCollectorClient - reports disabled status when ENABLE_GO_COLLECTOR=false', async () => {
  const previous = process.env.ENABLE_GO_COLLECTOR;
  process.env.ENABLE_GO_COLLECTOR = 'false';

  delete require.cache[require.resolve('../src/services/goCollectorClient')];
  const client = require('../src/services/goCollectorClient');

  const available = await client.checkHealth(true);
  const status = client.getStatus();

  assert.strictEqual(available, false);
  assert.strictEqual(status.enabled, false);
  assert.strictEqual(status.available, false);

  process.env.ENABLE_GO_COLLECTOR = previous;
  delete require.cache[require.resolve('../src/services/goCollectorClient')];
});

test('goCollectorClient - exposes configured collector URL', () => {
  const previousUrl = process.env.GO_COLLECTOR_URL;
  process.env.GO_COLLECTOR_URL = 'http://127.0.0.1:9099';

  delete require.cache[require.resolve('../src/services/goCollectorClient')];
  const client = require('../src/services/goCollectorClient');
  const status = client.getStatus();

  assert.strictEqual(status.url, 'http://127.0.0.1:9099');

  process.env.GO_COLLECTOR_URL = previousUrl;
  delete require.cache[require.resolve('../src/services/goCollectorClient')];
});
