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

test('goCollectorClient - buildMemoryBreakdown combines node and go RSS', () => {
  const client = require('../src/services/goCollectorClient');

  const breakdown = client.buildMemoryBreakdown(
    {
      uptimeSeconds: 120,
      systemOpsMemory: {
        rssBytes: 100 * 1024 * 1024,
        rssFormatted: '100.00 MB',
        heapUsedBytes: 20 * 1024 * 1024,
        heapUsedFormatted: '20.00 MB',
        heapTotalBytes: 30 * 1024 * 1024,
        heapTotalFormatted: '30.00 MB',
        externalBytes: 50 * 1024 * 1024,
        externalFormatted: '50.00 MB'
      }
    },
    {
      uptimeSeconds: 90,
      memory: {
        rssBytes: 12 * 1024 * 1024,
        rssFormatted: '12.00 MB',
        allocBytes: 8 * 1024 * 1024,
        allocFormatted: '8.00 MB',
        sysBytes: 15 * 1024 * 1024,
        sysFormatted: '15.00 MB'
      }
    },
    { available: true, url: 'http://127.0.0.1:9081', lastError: null }
  );

  assert.strictEqual(breakdown.activeCollector, 'hybrid');
  assert.strictEqual(breakdown.node.rssFormatted, '100.00 MB');
  assert.strictEqual(breakdown.goCollector.rssFormatted, '12.00 MB');
  assert.strictEqual(breakdown.combinedRssBytes, 112 * 1024 * 1024);
  assert.strictEqual(breakdown.combinedRssFormatted, '112.00 MB');
});

test('goCollectorClient - buildMemoryBreakdown falls back when go is offline', () => {
  const client = require('../src/services/goCollectorClient');

  const breakdown = client.buildMemoryBreakdown(
    {
      uptimeSeconds: 10,
      systemOpsMemory: { rssBytes: 50 * 1024 * 1024, rssFormatted: '50.00 MB' }
    },
    null,
    { available: false, enabled: true, lastError: 'connection refused' }
  );

  assert.strictEqual(breakdown.activeCollector, 'node');
  assert.strictEqual(breakdown.goCollector.available, false);
  assert.strictEqual(breakdown.combinedRssBytes, 50 * 1024 * 1024);
});
