document.addEventListener('DOMContentLoaded', () => {
  let autoRefreshTimer = null;
  let rawLogContent = '';
  let activeTab = 'tab-ollama';
  let activePm2User = null;
  let activePm2App = null;
  let rawBackupLogContent = '';

  // Elements - Header & Global
  const globalStateTag = document.getElementById('globalStateTag');
  const lastUpdatedVal = document.getElementById('lastUpdatedVal');
  const refreshSelect = document.getElementById('refreshSelect');
  const refreshBtn = document.getElementById('refreshBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const navTabs = document.querySelectorAll('.nav-tab');

  // Elements - Tab 1 (Ollama v1)
  const serviceStateTag = document.getElementById('serviceStateTag');
  const subStateVal = document.getElementById('subStateVal');
  const pidVal = document.getElementById('pidVal');
  const userVal = document.getElementById('userVal');
  const listenTag = document.getElementById('listenTag');
  const apiHealthTag = document.getElementById('apiHealthTag');
  const apiLatencyVal = document.getElementById('apiLatencyVal');
  const hostVal = document.getElementById('hostVal');
  const ramVal = document.getElementById('ramVal');
  const swapVal = document.getElementById('swapVal');
  const chatModelSelect = document.getElementById('chatModelSelect');
  const chatPromptInput = document.getElementById('chatPromptInput');
  const runChatTestBtn = document.getElementById('runChatTestBtn');
  const chatResultBox = document.getElementById('chatResultBox');
  const chatResultTag = document.getElementById('chatResultTag');
  const chatLatencyVal = document.getElementById('chatLatencyVal');
  const chatResponseContent = document.getElementById('chatResponseContent');
  const modelsTableBody = document.getElementById('modelsTableBody');
  const logTerminal = document.getElementById('logTerminal');
  const logLinesSelect = document.getElementById('logLinesSelect');
  const logFilterInput = document.getElementById('logFilterInput');
  const autoScrollCheck = document.getElementById('autoScrollCheck');
  const copyLogsBtn = document.getElementById('copyLogsBtn');

  // Elements - Tab 2 (PM2)
  const pm2UserTablesContainer = document.getElementById('pm2UserTablesContainer');
  const pm2RefreshBtn = document.getElementById('pm2RefreshBtn');
  const pm2LogDrawer = document.getElementById('pm2LogDrawer');
  const pm2LogAppTitle = document.getElementById('pm2LogAppTitle');
  const pm2LogUserTag = document.getElementById('pm2LogUserTag');
  const pm2LogLinesSelect = document.getElementById('pm2LogLinesSelect');
  const pm2LogFetchBtn = document.getElementById('pm2LogFetchBtn');
  const pm2LogCloseBtn = document.getElementById('pm2LogCloseBtn');
  const pm2LogTerminal = document.getElementById('pm2LogTerminal');

  // Elements - Tab 3 (System)
  const sysUptimeVal = document.getElementById('sysUptimeVal');
  const sysCpusVal = document.getElementById('sysCpusVal');
  const sysLoad1m = document.getElementById('sysLoad1m');
  const sysLoad5m = document.getElementById('sysLoad5m');
  const sysLoad15m = document.getElementById('sysLoad15m');
  const sysRamText = document.getElementById('sysRamText');
  const sysRamBar = document.getElementById('sysRamBar');
  const sysSwapText = document.getElementById('sysSwapText');
  const sysSwapBar = document.getElementById('sysSwapBar');
  const sysServicesTableBody = document.getElementById('sysServicesTableBody');
  const sysDiskContainer = document.getElementById('sysDiskContainer');
  const sysPortsTableBody = document.getElementById('sysPortsTableBody');
  const sysTlsTableBody = document.getElementById('sysTlsTableBody');

  // Elements - Tab 4 (Backups)
  const backupSourceSelect = document.getElementById('backupSourceSelect');
  const backupLinesSelect = document.getElementById('backupLinesSelect');
  const backupFetchBtn = document.getElementById('backupFetchBtn');
  const backupBadgeTag = document.getElementById('backupBadgeTag');
  const backupStatusMsg = document.getElementById('backupStatusMsg');
  const backupTargetVal = document.getElementById('backupTargetVal');
  const backupFilterInput = document.getElementById('backupFilterInput');
  const backupCopyBtn = document.getElementById('backupCopyBtn');
  const backupLogTerminal = document.getElementById('backupLogTerminal');

  // Logout
  logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
    window.location.href = '/login.html';
  });

  // Tab Navigation Handling
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));

      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab');
      document.getElementById(activeTab).classList.add('active');

      // Refresh data for selected tab immediately
      refreshActiveTabData();
    });
  });

  function refreshActiveTabData() {
    if (activeTab === 'tab-ollama') {
      fetchStatus();
      fetchLogs();
      fetchModels();
    } else if (activeTab === 'tab-pm2') {
      fetchPm2Snapshot();
    } else if (activeTab === 'tab-system') {
      fetchSystemSnapshot();
    } else if (activeTab === 'tab-backups') {
      fetchBackupLogTail();
    }
  }

  // --- TAB 1: OLLAMA (v1) ---
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

    const listener = data.listener || {};
    if (listener.listening) {
      listenTag.className = 'status-tag ok';
      listenTag.textContent = '[BOUND]';
    } else {
      listenTag.className = 'status-tag err';
      listenTag.textContent = '[UNBOUND]';
    }

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

    if (sys.isActive && listener.listening && api.ok) {
      globalStateTag.className = 'status-tag ok';
      globalStateTag.textContent = '[ OK ]';
    } else {
      globalStateTag.className = 'status-tag err';
      globalStateTag.textContent = '[ WARN ]';
    }

    if (data.hostMetrics) {
      hostVal.textContent = data.hostMetrics.hostname || 'ubuntu-24-vps';
      const ram = data.hostMetrics.memory;
      const swap = data.hostMetrics.swap;
      if (ram) ramVal.textContent = `${ram.formattedUsed} / ${ram.formattedTotal} (${ram.usagePercent}%)`;
      if (swap) swapVal.textContent = `${swap.formattedUsed} / ${swap.formattedTotal} (${swap.usagePercent}%)`;
    }
  }

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

  copyLogsBtn.addEventListener('click', () => {
    if (!rawLogContent) return;
    navigator.clipboard.writeText(rawLogContent);
    copyLogsBtn.textContent = 'Copied!';
    setTimeout(() => { copyLogsBtn.textContent = 'Copy'; }, 1500);
  });

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

    modelsTableBody.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = m.name;
      chatModelSelect.appendChild(opt);

      const tr = document.createElement('tr');
      const sizeMb = m.size ? (m.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : 'N/A';
      const modDate = m.modified_at ? new Date(m.modified_at).toLocaleDateString() : 'N/A';

      tr.innerHTML = `
        <td><code>${m.name}</code></td>
        <td>${sizeMb}</td>
        <td><span class="text-dim">${modDate}</span></td>
      `;
      modelsTableBody.appendChild(tr);
    });
  }

  runChatTestBtn.addEventListener('click', async () => {
    const model = chatModelSelect.value;
    const prompt = chatPromptInput.value.trim() || 'OK';

    runChatTestBtn.disabled = true;
    runChatTestBtn.textContent = 'Testing...';
    chatResultBox.classList.add('hidden');

    const startTime = Date.now();

    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt })
      });

      const data = await res.json();
      const latency = Date.now() - startTime;

      chatResultBox.classList.remove('hidden');
      chatLatencyVal.textContent = `${data.latencyMs || latency} ms`;

      if (data.success) {
        chatResultTag.className = 'status-tag ok';
        chatResultTag.textContent = '[PASS]';
        chatResponseContent.textContent = data.response || '(Empty response)';
      } else {
        chatResultTag.className = 'status-tag err';
        chatResultTag.textContent = '[FAIL]';
        chatResponseContent.textContent = data.error || data.message || 'Chat test failed';
      }
    } catch (err) {
      chatResultBox.classList.remove('hidden');
      chatResultTag.className = 'status-tag err';
      chatResultTag.textContent = '[ERR]';
      chatResponseContent.textContent = err.message;
    } finally {
      runChatTestBtn.disabled = false;
      runChatTestBtn.textContent = 'Test';
    }
  });

  // --- TAB 2: PM2 PROCESSES (v2) ---
  pm2RefreshBtn.addEventListener('click', fetchPm2Snapshot);

  async function fetchPm2Snapshot() {
    pm2UserTablesContainer.innerHTML = `<div class="text-dim">Fetching PM2 process snapshot...</div>`;
    try {
      const res = await fetch('/api/v2/pm2/snapshot');
      if (res.ok) {
        const data = await res.json();
        renderPm2Snapshot(data);
      } else {
        pm2UserTablesContainer.innerHTML = `<div class="text-red">Failed to fetch PM2 snapshot (${res.status})</div>`;
      }
    } catch (err) {
      pm2UserTablesContainer.innerHTML = `<div class="text-red">Error: ${err.message}</div>`;
    }
  }

  function renderPm2Snapshot(data) {
    const users = data.users || [];
    if (users.length === 0) {
      pm2UserTablesContainer.innerHTML = `<div class="text-dim">No PM2 users configured in PM2_USERS environment variable.</div>`;
      return;
    }

    lastUpdatedVal.textContent = new Date(data.timestamp || Date.now()).toLocaleTimeString();
    pm2UserTablesContainer.innerHTML = '';

    users.forEach(u => {
      const section = document.createElement('div');
      section.style.marginBottom = '1.5rem';

      const header = document.createElement('div');
      header.className = 'section-title';
      header.style.display = 'flex';
      header.style.justifySpaceBetween = 'space-between';
      header.style.alignItems = 'center';
      header.innerHTML = `<span>User: <strong>${u.user}</strong></span>`;

      section.appendChild(header);

      if (u.error) {
        const errDiv = document.createElement('div');
        errDiv.className = 'text-dim';
        errDiv.style.color = 'var(--yellow)';
        errDiv.textContent = `Notice: ${u.error}`;
        section.appendChild(errDiv);
      } else if (!u.processes || u.processes.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-dim';
        emptyDiv.textContent = `No active PM2 processes found for user '${u.user}'.`;
        section.appendChild(emptyDiv);
      } else {
        const table = document.createElement('table');
        table.className = 'models-table';
        table.innerHTML = `
          <thead>
            <tr>
              <th>App Name</th>
              <th>Status</th>
              <th>PID</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Uptime</th>
              <th>Restarts</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${u.processes.map(p => {
              const statusClass = p.status === 'online' ? 'ok' : (p.status === 'stopped' ? 'warn' : 'err');
              return `
                <tr>
                  <td><code>${p.name}</code></td>
                  <td><span class="status-tag ${statusClass}">[${p.status.toUpperCase()}]</span></td>
                  <td><code>${p.pid}</code></td>
                  <td>${p.cpu}</td>
                  <td>${p.formattedMemory}</td>
                  <td>${p.uptime}</td>
                  <td>${p.restarts}</td>
                  <td>
                    <button class="btn-min pm2-log-btn" data-user="${u.user}" data-app="${p.name}">Logs</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        `;
        section.appendChild(table);
      }

      pm2UserTablesContainer.appendChild(section);
    });

    // Attach log button listeners
    document.querySelectorAll('.pm2-log-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const user = e.target.getAttribute('data-user');
        const app = e.target.getAttribute('data-app');
        openPm2Logs(user, app);
      });
    });
  }

  function openPm2Logs(user, app) {
    activePm2User = user;
    activePm2App = app;
    pm2LogAppTitle.textContent = app;
    pm2LogUserTag.textContent = `user: ${user}`;
    pm2LogDrawer.classList.remove('hidden');
    fetchPm2AppLogs();
  }

  pm2LogFetchBtn.addEventListener('click', fetchPm2AppLogs);
  pm2LogCloseBtn.addEventListener('click', () => {
    pm2LogDrawer.classList.add('hidden');
  });

  async function fetchPm2AppLogs() {
    if (!activePm2User || !activePm2App) return;
    const lines = pm2LogLinesSelect.value || 80;
    pm2LogTerminal.textContent = `Tailing logs for ${activePm2App} (${lines} lines)...`;

    try {
      const res = await fetch(`/api/v2/pm2/logs?user=${activePm2User}&app=${activePm2App}&lines=${lines}`);
      if (res.ok) {
        const data = await res.json();
        pm2LogTerminal.textContent = data.output || 'No logs output returned.';
      } else {
        pm2LogTerminal.textContent = `Error fetching PM2 logs (HTTP ${res.status})`;
      }
    } catch (err) {
      pm2LogTerminal.textContent = `Error: ${err.message}`;
    }
  }

  // --- TAB 3: SYSTEM HEALTH (v2) ---
  async function fetchSystemSnapshot() {
    try {
      const res = await fetch('/api/v2/system/snapshot');
      if (res.ok) {
        const data = await res.json();
        renderSystemSnapshot(data);
      }
    } catch (err) {}
  }

  function renderSystemSnapshot(data) {
    lastUpdatedVal.textContent = new Date(data.timestamp || Date.now()).toLocaleTimeString();

    // Uptime & Load
    const upt = data.uptime || {};
    sysUptimeVal.textContent = upt.uptimeText || '--';
    sysCpusVal.textContent = upt.cpus || '--';
    sysLoad1m.textContent = upt.load1m || '--';
    sysLoad5m.textContent = upt.load5m || '--';
    sysLoad15m.textContent = upt.load15m || '--';

    // RAM & Swap Progress Bars
    const mem = data.memory || {};
    sysRamText.textContent = `${mem.formattedUsed || '--'} / ${mem.formattedTotal || '--'} (${mem.usagePercent || 0}%)`;
    sysRamBar.style.width = `${mem.usagePercent || 0}%`;
    if (mem.usagePercent > 85) sysRamBar.className = 'progress-bar err';
    else if (mem.usagePercent > 65) sysRamBar.className = 'progress-bar warn';
    else sysRamBar.className = 'progress-bar green';

    const swap = data.swap || {};
    sysSwapText.textContent = `${swap.formattedUsed || '0 B'} / ${swap.formattedTotal || '0 B'} (${swap.usagePercent || 0}%)`;
    sysSwapBar.style.width = `${swap.usagePercent || 0}%`;

    // Systemd Services Table
    const services = data.services || [];
    if (services.length === 0) {
      sysServicesTableBody.innerHTML = `<tr><td colspan="4" class="text-dim" style="padding-left: 1rem;">No services checked.</td></tr>`;
    } else {
      sysServicesTableBody.innerHTML = services.map(s => {
        const statusClass = s.isActive ? 'ok' : 'err';
        return `
          <tr>
            <td style="padding-left: 1rem;"><code>${s.fullUnit}</code></td>
            <td><span class="status-tag ${statusClass}">[${(s.activeState || 'UNKNOWN').toUpperCase()}]</span></td>
            <td>${s.formattedMemory}</td>
            <td style="padding-right: 1rem;"><code>${s.pid || '--'}</code></td>
          </tr>
        `;
      }).join('');
    }

    // Disk Usage Cards
    const disk = data.disk || [];
    if (disk.length === 0) {
      sysDiskContainer.innerHTML = `<div class="text-dim">No disk mounts configured.</div>`;
    } else {
      sysDiskContainer.innerHTML = disk.map(d => {
        const barClass = d.percent > 85 ? 'err' : (d.percent > 70 ? 'warn' : 'green');
        return `
          <div style="margin-bottom: 0.75rem;">
            <div class="progress-label">
              <span><strong>${d.path}</strong> ${d.mountPoint ? '(' + d.mountPoint + ')' : ''}</span>
              <span>${d.formattedUsed || 'N/A'} / ${d.formattedTotal || 'N/A'} (${d.percent}%)</span>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar ${barClass}" style="width: ${d.percent}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Ports Sanity Check Table
    const ports = data.ports || [];
    sysPortsTableBody.innerHTML = ports.map(p => {
      const statusClass = p.listening ? 'ok' : 'err';
      return `
        <tr>
          <td style="padding-left: 1rem;">${p.name}</td>
          <td><code>${p.host}:${p.port}</code></td>
          <td style="padding-right: 1rem;"><span class="status-tag ${statusClass}">[${p.listening ? 'BOUND' : 'NOT BOUND'}]</span></td>
        </tr>
      `;
    }).join('');

    // TLS Certificate Expiry Table
    const tls = data.tls || [];
    sysTlsTableBody.innerHTML = tls.map(t => {
      const statusClass = t.valid ? 'ok' : 'err';
      return `
        <tr>
          <td style="padding-left: 1rem;"><code>${t.target}</code></td>
          <td>${t.formattedValidTo || 'N/A'}</td>
          <td style="padding-right: 1rem;"><span class="status-tag ${statusClass}">[${t.statusText}]</span></td>
        </tr>
      `;
    }).join('');
  }

  // --- TAB 4: POSTGRESQL & BACKUPS (v2) ---
  async function fetchLogSourcesList() {
    try {
      const res = await fetch('/api/v2/logs/sources');
      if (res.ok) {
        const data = await res.json();
        renderLogSourcesSelect(data.sources || []);
      }
    } catch (err) {}
  }

  function renderLogSourcesSelect(sources) {
    backupSourceSelect.innerHTML = '';
    if (sources.length === 0) {
      backupSourceSelect.innerHTML = `<option value="">No log sources configured</option>`;
      return;
    }

    sources.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.name} (${s.type}: ${s.target})`;
      backupSourceSelect.appendChild(opt);
    });

    // Auto fetch tail for first log source
    fetchBackupLogTail();
  }

  backupFetchBtn.addEventListener('click', fetchBackupLogTail);
  backupSourceSelect.addEventListener('change', fetchBackupLogTail);

  async function fetchBackupLogTail() {
    const id = backupSourceSelect.value;
    if (!id) return;

    const lines = backupLinesSelect.value || 200;
    backupLogTerminal.textContent = `Fetching log tail for '${id}' (${lines} lines)...`;

    try {
      const res = await fetch(`/api/v2/logs/tail?id=${id}&lines=${lines}`);
      if (res.ok) {
        const data = await res.json();
        rawBackupLogContent = data.output || '';
        renderBackupLogTail(data);
      } else {
        backupLogTerminal.textContent = `Failed to fetch log tail (HTTP ${res.status})`;
      }
    } catch (err) {
      backupLogTerminal.textContent = `Error: ${err.message}`;
    }
  }

  function renderBackupLogTail(data) {
    lastUpdatedVal.textContent = new Date().toLocaleTimeString();
    backupTargetVal.textContent = `${data.type || 'source'}: ${data.target || data.id}`;

    // Render Status Banner
    const st = data.backupStatus || {};
    backupBadgeTag.className = `status-tag ${st.badgeClass || 'warn'}`;
    backupBadgeTag.textContent = `[${(st.status || 'UNKNOWN').toUpperCase()}]`;
    backupStatusMsg.textContent = st.message || 'Log analysis complete';

    // Render Log Terminal Content
    if (!rawBackupLogContent) {
      backupLogTerminal.textContent = 'Log stream is empty.';
      return;
    }

    const filter = backupFilterInput.value.toLowerCase().trim();
    let lines = rawBackupLogContent.split('\n');

    if (filter) {
      lines = lines.filter(l => l.toLowerCase().includes(filter));
    }

    backupLogTerminal.textContent = lines.join('\n') || 'No matching lines found.';
  }

  backupFilterInput.addEventListener('input', () => {
    if (!rawBackupLogContent) return;
    const filter = backupFilterInput.value.toLowerCase().trim();
    let lines = rawBackupLogContent.split('\n');
    if (filter) {
      lines = lines.filter(l => l.toLowerCase().includes(filter));
    }
    backupLogTerminal.textContent = lines.join('\n') || 'No matching lines found.';
  });

  backupCopyBtn.addEventListener('click', () => {
    if (!rawBackupLogContent) return;
    navigator.clipboard.writeText(rawBackupLogContent);
    backupCopyBtn.textContent = 'Copied!';
    setTimeout(() => { backupCopyBtn.textContent = 'Copy'; }, 1500);
  });

  // --- AUTO REFRESH & EVENT LISTENERS ---
  refreshBtn.addEventListener('click', refreshActiveTabData);

  refreshSelect.addEventListener('change', setupAutoRefresh);
  logLinesSelect.addEventListener('change', fetchLogs);
  logFilterInput.addEventListener('input', renderLogs);

  function setupAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    const intervalSec = parseInt(refreshSelect.value, 10);
    if (intervalSec > 0) {
      autoRefreshTimer = setInterval(refreshActiveTabData, intervalSec * 1000);
    }
  }

  // Initial Load Sequence
  fetchStatus();
  fetchLogs();
  fetchModels();
  fetchLogSourcesList();
  setupAutoRefresh();
});
