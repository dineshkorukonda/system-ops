const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

// Liveness can precede the first cached system sample. Keep the deployment
// gate strict, but allow the scheduled collector time to finish.
async function waitForSystemSnapshot(request, headers, { timeoutMs = 45000, pollMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastState = 'not requested';
  while (Date.now() < deadline) {
    let response;
    try {
      response = await request('/api/v2/system/snapshot', {
        headers, signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))),
      });
    } catch {
      lastState = 'connection unavailable';
    }
    if (response) {
      assert.ok([200, 503].includes(response.status), `Protected system snapshot returned HTTP ${response.status}`);
      const data = await response.json();
      if (response.status === 200) {
        assert.ok(data.memory && data.uptime, 'System snapshot structure missing');
        assert.equal(data.collection?.status, 'healthy', 'System snapshot collection is not healthy');
        assert.ok(data.collection.lastSuccess && data.collection.source, 'System collection provenance missing');
        return data;
      }
      lastState = `HTTP 503 (${data.collection?.status || 'not ready'})`;
    }
    await delay(Math.max(0, Math.min(pollMs, deadline - Date.now())));
  }
  throw new Error(`System snapshot did not become healthy within ${timeoutMs}ms; last state: ${lastState}`);
}

module.exports = { waitForSystemSnapshot };
