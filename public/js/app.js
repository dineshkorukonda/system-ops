document.addEventListener('DOMContentLoaded', () => {
  let autoRefreshTimer = null;
  let rawLogContent = '';

  // Elements
  const globalStateTag = document.getElementById('globalStateTag');
  const lastUpdatedVal = document.getElementById('lastUpdatedVal');
  const refreshSelect = document.getElementById('refreshSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');

  // Left Column Status Elements
  const serviceStateTag = document.getElementById('serviceStateTag');
  const subStateVal = document.getElementById('subStateVal');
  const pidVal = document.getElementById('pidVal');
  const userVal = document.getElementById('userVal');
  const listenTag = document.getElementById('listenTag');
  const apiHealthTag = document.getElementById('apiHealthTag');
  const apiLatencyVal = document.getElementById('apiLatencyVal');

  // Host Elements
  const hostVal = document.getElementById('hostVal');
  const ramVal = document.getElementById('ramVal');
  const swapVal = document.getElementById('swapVal');

  // Chat Probe Elements
  const chatModelSelect = document.getElementById('chatModelSelect');
  const chatPromptInput = document.getElementById('chatPromptInput');
  const runChatTestBtn = document.getElementById('runChatTestBtn');
  const chatResultBox = document.getElementById('chatResultBox');
  const chatResultTag = document.getElementById('chatResultTag');
  const chatLatencyVal = document.getElementById('chatLatencyVal');
  const chatResponseContent = document.getElementById('chatResponseContent');

  // Models Table
  const modelsTableBody = document.getElementById('modelsTableBody');

  // Logs Elements
  const logTerminal = document.getElementById('logTerminal');
  const logLinesSelect = document.getElementById('logLinesSelect');
  const logFilterInput = document.getElementById('logFilterInput');
  const autoScrollCheck = document.getElementById('autoScrollCheck');
  const copyLogsBtn = document.getElementById('copyLogsBtn');

  // Logout
  logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
    window.location.href = '/login.html';
  });

  // Fetch Consolidated Status
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.status === 401) {
        window.location.href = '/login.html';
        return;
      }
      const data = await res.json();
      renderStatus(data);
    } catch (err) {
      globalStateTag.className = 'status-tag err';
      globalStateTag.textContent = '[ERR]';
    }
  }

  function renderStatus(data) {
    const now = new Date(data.timestamp || Date.now());
    lastUpdatedVal.textContent = now.toLocaleTimeString();

    // systemd status
    const sys = data.systemd || {};
    subStateVal.textContent = sys.subState || 'unknown';
    pidVal.textContent = sys.pid || '0';
    userVal.textContent = sys.user || 'ollama';

    if (sys.isActive) {
      serviceStateTag.className = 'status-tag ok';
      serviceStateTag.textContent = '[ACTIVE]';
    } else {
      serviceStateTag.className = 'status-tag err';
      serviceStateTag.textContent = `[${(sys.activeState || 'FAILED').toUpperCase()}]`;
    }

    // Listener
    const listener = data.listener || {};
    if (listener.listening) {
      listenTag.className = 'status-tag ok';
      listenTag.textContent = '[BOUND]';
    } else {
      listenTag.className = 'status-tag err';
      listenTag.textContent = '[UNBOUND]';
    }

    // API Health
    const api = data.ollamaApi || {};
    if (api.ok) {
      apiHealthTag.className = 'status-tag ok';
      apiHealthTag.textContent = '[HTTP 200]';
      apiLatencyVal.textContent = `${api.latencyMs} ms`;
    } else {
      apiHealthTag.className = 'status-tag err';
      apiHealthTag.textContent = '[FAIL]';
      apiLatencyVal.textContent = `${api.latencyMs} ms`;
    }

    // Overall Tag
    if (sys.isActive && listener.listening && api.ok) {
      globalStateTag.className = 'status-tag ok';
      globalStateTag.textContent = '[ OK ]';
    } else {
      globalStateTag.className = 'status-tag err';
      globalStateTag.textContent = '[ WARN ]';
    }

    // Host Metrics
    if (data.hostMetrics) {
      hostVal.textContent = data.hostMetrics.hostname || 'ubuntu-24-vps';
      const ram = data.hostMetrics.memory;
      const swap = data.hostMetrics.swap;
      if (ram) ramVal.textContent = `${ram.formattedUsed} / ${ram.formattedTotal} (${ram.usagePercent}%)`;
      if (swap) swapVal.textContent = `${swap.formattedUsed} / ${swap.formattedTotal} (${swap.usagePercent}%)`;
    }
  }

  // Fetch Logs
  async function fetchLogs() {
    const lines = logLinesSelect.value;
    try {
      const res = await fetch(`/api/logs?lines=${lines}`);
      if (res.ok) {
        const data = await res.json();
        rawLogContent = data.logs || '';
        renderLogs();
      }
    } catch (err) {}
  }

  function renderLogs() {
    if (!rawLogContent) {
      logTerminal.textContent = 'No logs available.';
      return;
    }

    const filter = logFilterInput.value.toLowerCase().trim();
    let lines = rawLogContent.split('\n');

    if (filter) {
      lines = lines.filter(l => l.toLowerCase().includes(filter));
    }

    const formatted = lines.map(line => {
      let escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      escaped = escaped.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)/, '<span class="log-ts">$1</span>');
      if (/error|failed|panic/i.test(escaped)) {
        escaped = `<span class="log-err">${escaped}</span>`;
      }
      return escaped;
    }).join('\n');

    logTerminal.innerHTML = formatted || 'No matching log lines.';

    if (autoScrollCheck.checked) {
      const container = logTerminal.parentElement;
      container.scrollTop = container.scrollHeight;
    }
  }

  // Copy Logs
  copyLogsBtn.addEventListener('click', () => {
    if (!rawLogContent) return;
    navigator.clipboard.writeText(rawLogContent);
    copyLogsBtn.textContent = 'Copied!';
    setTimeout(() => { copyLogsBtn.textContent = 'Copy'; }, 1500);
  });

  // Fetch Models
  async function fetchModels() {
    try {
      const res = await fetch('/api/models');
      if (res.ok) {
        const data = await res.json();
        renderModels(data.models || []);
      }
    } catch (err) {}
  }

  function renderModels(models) {
    chatModelSelect.innerHTML = '';
    if (models.length === 0) {
      const opt = document.createElement('option');
      opt.value = 'llama3.2:3b';
      opt.textContent = 'llama3.2:3b';
      chatModelSelect.appendChild(opt);

      modelsTableBody.innerHTML = `<tr><td colspan="3" class="text-dim">No models found.</td></tr>`;
      return;
    }

    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      chatModelSelect.appendChild(opt);
    });

    modelsTableBody.innerHTML = models.map(m => `
      <tr>
        <td><code>${m.name}</code></td>
        <td>${m.formattedSize}</td>
        <td>${m.modifiedAt}</td>
      </tr>
    `).join('');
  }

  // Quick Chat Probe
  runChatTestBtn.addEventListener('click', async () => {
    const selectedModel = chatModelSelect.value;
    const promptText = chatPromptInput.value.trim() || 'OK';

    runChatTestBtn.disabled = true;
    runChatTestBtn.textContent = 'Testing...';
    chatResultBox.classList.add('hidden');

    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, prompt: promptText })
      });

      const data = await res.json();
      chatResultBox.classList.remove('hidden');

      if (res.ok && data.success) {
        chatResultTag.className = 'status-tag ok';
        chatResultTag.textContent = '[PASS]';
        chatLatencyVal.textContent = `${data.latencyMs} ms`;
        chatResponseContent.textContent = data.response || '(Empty response)';
      } else {
        chatResultTag.className = 'status-tag err';
        chatResultTag.textContent = '[FAIL]';
        chatLatencyVal.textContent = `${data.latencyMs || 0} ms`;
        chatResponseContent.textContent = data.error || 'Test failed';
      }
    } catch (err) {
      chatResultBox.classList.remove('hidden');
      chatResultTag.className = 'status-tag err';
      chatResultTag.textContent = '[ERR]';
      chatLatencyVal.textContent = '-- ms';
      chatResponseContent.textContent = 'Connection error';
    } finally {
      runChatTestBtn.disabled = false;
      runChatTestBtn.textContent = 'Test';
    }
  });

  // Setup Refresh
  refreshBtn.addEventListener('click', refreshAll);
  logLinesSelect.addEventListener('change', fetchLogs);
  logFilterInput.addEventListener('input', renderLogs);

  function refreshAll() {
    fetchStatus();
    fetchLogs();
    fetchModels();
  }

  function setupAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    const secs = parseInt(refreshSelect.value, 10);
    if (secs > 0) {
      autoRefreshTimer = setInterval(() => {
        fetchStatus();
        fetchLogs();
      }, secs * 1000);
    }
  }

  refreshSelect.addEventListener('change', setupAutoRefresh);

  // Initial
  refreshAll();
  setupAutoRefresh();
});
