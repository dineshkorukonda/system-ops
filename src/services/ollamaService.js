const { performance } = require('perf_hooks');
const { execFile } = require('child_process');
const { formatBytes } = require('./systemService');

/**
 * Checks Ollama HTTP API health via GET /api/tags
 */
async function checkApiHealth(ollamaUrl = 'http://127.0.0.1:11434', timeoutMs = 5000) {
  const startTime = performance.now();
  const endpoint = `${ollamaUrl.replace(/\/$/, '')}/api/tags`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        statusText: response.statusText,
        latencyMs: latencyMs,
        models: [],
        error: `Ollama API returned HTTP status ${response.status}`
      };
    }

    const data = await response.json();
    const rawModels = Array.isArray(data.models) ? data.models : [];

    const models = rawModels.map(m => {
      const sizeBytes = m.size || 0;
      return {
        name: m.name || m.model || 'unknown',
        model: m.model || m.name,
        sizeBytes: sizeBytes,
        formattedSize: formatBytes(sizeBytes),
        modifiedAt: m.modified_at ? new Date(m.modified_at).toLocaleString() : 'N/A',
        rawModified: m.modified_at || '',
        digest: m.digest ? m.digest.substring(0, 12) : '',
        details: m.details || {}
      };
    });

    return {
      ok: true,
      statusCode: 200,
      latencyMs: latencyMs,
      modelsCount: models.length,
      models: models
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ok: false,
      statusCode: 0,
      latencyMs: latencyMs,
      models: [],
      error: err.name === 'AbortError' ? `Connection timeout (${timeoutMs}ms)` : (err.message || 'Failed to connect to Ollama API')
    };
  }
}

/**
 * Executes a minimal chat probe to Ollama HTTP API POST /api/chat
 */
async function runQuickChatTest(ollamaUrl = 'http://127.0.0.1:11434', modelName = null, prompt = 'OK', timeoutMs = 15000) {
  const startTime = performance.now();
  const endpoint = `${ollamaUrl.replace(/\/$/, '')}/api/chat`;

  // First pick target model if not provided
  let targetModel = modelName;
  if (!targetModel) {
    const health = await checkApiHealth(ollamaUrl, 3000);
    if (health.ok && health.models.length > 0) {
      targetModel = health.models[0].name;
    } else {
      targetModel = 'llama3.2:3b'; // Fallback default per server context
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const payload = {
      model: targetModel,
      messages: [
        { role: 'user', content: prompt }
      ],
      stream: false,
      options: {
        num_predict: 20 // Keep token generation tiny for fast probe
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const latencyMs = Math.round(performance.now() - startTime);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        success: false,
        latencyMs: latencyMs,
        modelUsed: targetModel,
        prompt: prompt,
        response: null,
        error: `HTTP ${response.status}: ${errText.substring(0, 150) || response.statusText}`
      };
    }

    const data = await response.json();
    const outputMessage = data.message?.content || '';

    return {
      success: true,
      latencyMs: latencyMs,
      modelUsed: targetModel,
      prompt: prompt,
      response: outputMessage.trim(),
      totalDurationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : latencyMs
    };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      success: false,
      latencyMs: latencyMs,
      modelUsed: targetModel || 'unknown',
      prompt: prompt,
      response: null,
      error: err.name === 'AbortError' ? `Chat probe timeout (${timeoutMs}ms)` : (err.message || 'Chat test failed')
    };
  }
}

/**
 * Fetches CLI model list output via 'sudo -u ollama -H ollama list' or 'ollama list'
 */
function getCliModelList() {
  return new Promise((resolve) => {
    // Try sudo -n -u ollama -H ollama list
    execFile('sudo', ['-n', '-u', 'ollama', '-H', 'ollama', 'list'], { timeout: 4000 }, (err1, stdout1) => {
      if (!err1 && stdout1) {
        return resolve({ success: true, command: 'sudo -n -u ollama -H ollama list', output: stdout1.trim() });
      }

      // Try plain ollama list
      execFile('ollama', ['list'], { timeout: 4000 }, (err2, stdout2) => {
        if (!err2 && stdout2) {
          return resolve({ success: true, command: 'ollama list', output: stdout2.trim() });
        }

        resolve({
          success: false,
          command: 'sudo -n -u ollama -H ollama list',
          output: 'CLI command returned no output or requires sudoers rule.'
        });
      });
    });
  });
}

module.exports = {
  checkApiHealth,
  runQuickChatTest,
  getCliModelList
};
