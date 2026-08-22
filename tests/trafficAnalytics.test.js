const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { parseTrafficAnalytics, normalizeOS, extractValidIP } = require('../src/collectors/trafficAnalytics');

test('normalizeOS should categorize OS strings correctly', () => {
  assert.strictEqual(normalizeOS('Android 13'), 'Android');
  assert.strictEqual(normalizeOS('iOS 16_5'), 'iOS');
  assert.strictEqual(normalizeOS('iPhone OS'), 'iOS');
  assert.strictEqual(normalizeOS('Windows 10'), 'Windows');
  assert.strictEqual(normalizeOS('Mac OS X'), 'Mac');
  assert.strictEqual(normalizeOS('Ubuntu Linux'), 'Linux');
  assert.strictEqual(normalizeOS('UnknownOS'), 'Other');
});

test('extractValidIP should return correct IP or fallback', () => {
  assert.strictEqual(extractValidIP('203.0.113.195', '-'), '203.0.113.195');
  assert.strictEqual(extractValidIP('203.0.113.195, 10.0.0.1', '-'), '203.0.113.195');
  assert.strictEqual(extractValidIP('-', '198.51.100.24'), '198.51.100.24');
  assert.strictEqual(extractValidIP('-', '-'), null);
});

test('parseTrafficAnalytics handles non-existent file gracefully', async () => {
  const result = await parseTrafficAnalytics('/non/existent/path/access.log');
  assert.strictEqual(result.summary.total_hits, 0);
  assert.strictEqual(result.summary.unique_devices, 0);
  assert.ok(result.error);
});

test('parseTrafficAnalytics correctly parses sample log lines', async () => {
  const tmpDir = os.tmpdir();
  const sampleLogPath = path.join(tmpDir, `test_access_${Date.now()}.log`);

  const sampleLogs = [
    'iskconcommunity.com 203.0.113.5 - - [21/Aug/2026:17:00:00 +0530] "GET /api/feed HTTP/1.1" 200 1234 "-" "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36"',
    'iskconcommunity.com 203.0.113.5 - - [21/Aug/2026:17:01:00 +0530] "GET /api/profile HTTP/1.1" 200 567 "-" "Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36"',
    'dev.iskconcommunity.com 198.51.100.10 - - [21/Aug/2026:17:02:00 +0530] "GET /dev HTTP/1.1" 200 890 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"',
    'msf.iskconcommunity.com 198.51.100.20 - - [21/Aug/2026:17:03:00 +0530] "GET /msf HTTP/1.1" 200 432 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)"',
    'otherdomain.com 1.2.3.4 - - [21/Aug/2026:17:04:00 +0530] "GET / HTTP/1.1" 200 100 "-" "Mozilla/5.0"'
  ].join('\n');

  fs.writeFileSync(sampleLogPath, sampleLogs, 'utf8');

  try {
    const result = await parseTrafficAnalytics(sampleLogPath);

    assert.strictEqual(result.summary.total_hits, 4); // ignores otherdomain.com
    assert.strictEqual(result.summary.total_mobile_hits, 3);
    assert.strictEqual(result.summary.total_web_hits, 1);
    assert.strictEqual(result.summary.unique_devices, 3);
    assert.strictEqual(result.summary.domains['iskconcommunity.com'].hits, 2);
    assert.strictEqual(result.summary.domains['iskconcommunity.com'].mobile_hits, 2);
    assert.strictEqual(result.summary.domains['iskconcommunity.com'].web_hits, 0);
    assert.strictEqual(result.summary.domains['iskconcommunity.com'].unique, 1);
    assert.strictEqual(result.summary.domains['dev.iskconcommunity.com'].hits, 1);
    assert.strictEqual(result.summary.domains['dev.iskconcommunity.com'].web_hits, 1);
    assert.strictEqual(result.summary.domains['msf.iskconcommunity.com'].hits, 1);
    assert.strictEqual(result.summary.domains['msf.iskconcommunity.com'].mobile_hits, 1);

    assert.strictEqual(result.os_stats.Android, 2);
    assert.strictEqual(result.os_stats.Windows, 1);
    assert.strictEqual(result.os_stats.iOS, 1);

    assert.strictEqual(result.summary.total_bytes, 3123); // 1234 + 567 + 890 + 432
    assert.strictEqual(result.status_codes['2xx'], 4);
    assert.ok(Array.isArray(result.top_endpoints));
    assert.strictEqual(result.top_endpoints[0].path, '/api/feed');
    assert.ok(Array.isArray(result.top_ips));
    assert.strictEqual(result.top_ips[0].ip, '203.0.113.5');
    assert.strictEqual(result.top_ips[0].hits, 2);
    assert.ok(result.browsers);
    assert.ok(Array.isArray(result.hourly_distribution));
  } finally {
    if (fs.existsSync(sampleLogPath)) {
      fs.unlinkSync(sampleLogPath);
    }
  }
});
