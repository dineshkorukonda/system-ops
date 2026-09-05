const test = require('node:test');
const assert = require('node:assert/strict');
const { getListeningPorts } = require('../src/collectors/system');

test('getListeningPorts does not include hardcoded Ollama or Dev API by default', async () => {
  const ports = await getListeningPorts();
  assert.ok(Array.isArray(ports));
  assert.ok(ports.length > 0);

  // System Ops self port must be present
  const selfPort = ports.find(p => p.name.includes('System Ops') || p.name.includes('Self'));
  assert.ok(selfPort, 'Self port should be in monitored ports');

  // Must not have hardcoded Ollama API when not configured
  const ollamaPort = ports.find(p => p.name === 'Ollama API');
  assert.equal(ollamaPort, undefined, 'Ollama API should not be hardcoded by default');

  // Must not have hardcoded Dev API
  const devPort = ports.find(p => p.name === 'Dev API');
  assert.equal(devPort, undefined, 'Dev API should not be hardcoded by default');
});
