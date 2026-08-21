document.addEventListener('DOMContentLoaded', () => {
  // ────────────────────────────────────────────────────────
  // STATE
  // ────────────────────────────────────────────────────────
  let autoRefreshTimer = null;
  let rawLogContent = '';
  let rawBackupLogContent = '';
  let activeTab = 'tab-ollama';
  let activePm2User = null;
  let activePm2App = null;

  // ────────────────────────────────────────────────────────
  // ELEMENT REFS — Header
  // ────────────────────────────────────────────────────────
  const globalStateTag   = document.getElementById('globalStateTag');
  const lastUpdatedVal   = document.getElementById('lastUpdatedVal');
  const refreshSelect    = document.getElementById('refreshSelect');
  const refreshBtn       = document.getElementById('refreshBtn');
  const logoutBtn        = document.getElementById('logoutBtn');
  const themeToggleBtn   = document.getElementById('themeToggleBtn');
  const navTabs          = document.querySelectorAll('.nav-tab');

  // ────────────────────────────────────────────────────────
  // ELEMENT REFS — Tab 1: Ollama
  // ────────────────────────────────────────────────────────
  const serviceStateTag    = document.getElementById('serviceStateTag');
  const subStateVal        = document.getElementById('subStateVal');
  const pidVal             = document.getElementById('pidVal');
  const userVal            = document.getElementById('userVal');
  const listenTag          = document.getElementById('listenTag');
  const apiHealthTag       = document.getElementById('apiHealthTag');
  const apiLatencyVal      = document.getElementById('apiLatencyVal');
  const hostVal            = document.getElementById('hostVal');
  const ramVal             = document.getElementById('ramVal');
  const swapVal            = document.getElementById('swapVal');
  const chatModelSelect    = document.getElementById('chatModelSelect');
  const chatPromptInput    = document.getElementById('chatPromptInput');
  const runChatTestBtn     = document.getElementById('runChatTestBtn');
  const chatResultBox      = document.getElementById('chatResultBox');
  const chatResultTag      = document.getElementById('chatResultTag');
  const chatLatencyVal     = document.getElementById('chatLatencyVal');
  const chatResponseContent = document.getElementById('chatResponseContent');
  const modelsTableBody    = document.getElementById('modelsTableBody');
  const logTerminal        = document.getElementById('logTerminal');
  const logLinesSelect     = document.getElementById('logLinesSelect');
  const logFilterInput     = document.getElementById('logFilterInput');
  const autoScrollCheck    = document.getElementById('autoScrollCheck');
  const copyLogsBtn        = document.getElementById('copyLogsBtn');

  // ────────────────────────────────────────────────────────
  // ELEMENT REFS — Tab 2: PM2
  // ────────────────────────────────────────────────────────
  const pm2SummaryContainer  = document.getElementById('pm2SummaryContainer');
  const pm2RefreshBtn        = document.getElementById('pm2RefreshBtn');
  const pm2LastUpdated       = document.getElementById('pm2LastUpdated');
  const pm2ProcessCount      = document.getElementById('pm2ProcessCount');
  const pm2UserTablesContainer = document.getElementById('pm2UserTablesContainer');
  const pm2TableView         = document.getElementById('pm2TableView');
  const pm2LogView           = document.getElementById('pm2LogView');
  const pm2LogAppTitle       = document.getElementById('pm2LogAppTitle');
  const pm2LogUserTag        = document.getElementById('pm2LogUserTag');
  const pm2LogLinesSelect    = document.getElementById('pm2LogLinesSelect');
  const pm2LogFetchBtn       = document.getElementById('pm2LogFetchBtn');
  const pm2LogBackBtn        = document.getElementById('pm2LogBackBtn');
  const pm2LogTerminal       = document.getElementById('pm2LogTerminal');

  // ────────────────────────────────────────────────────────
  // ELEMENT REFS — Tab 3: System
  // ────────────────────────────────────────────────────────
  const sysUptimeVal         = document.getElementById('sysUptimeVal');
  const sysCpusVal           = document.getElementById('sysCpusVal');
  const sysLoad1m            = document.getElementById('sysLoad1m');
  const sysLoad5m            = document.getElementById('sysLoad5m');
  const sysLoad15m           = document.getElementById('sysLoad15m');
  const sysRamText           = document.getElementById('sysRamText');
  const sysRamBar            = document.getElementById('sysRamBar');
  const sysSwapText          = document.getElementById('sysSwapText');
  const sysSwapBar           = document.getElementById('sysSwapBar');
  const sysServicesTableBody = document.getElementById('sysServicesTableBody');
  const sysDiskContainer     = document.getElementById('sysDiskContainer');
  const sysPortsTableBody    = document.getElementById('sysPortsTableBody');
  const sysTlsTableBody      = document.getElementById('sysTlsTableBody');

  // ────────────────────────────────────────────────────────
  // ELEMENT REFS — Tab 4: Backups
  // ────────────────────────────────────────────────────────
  const backupSourceSelect  = document.getElementById('backupSourceSelect');
  const backupLinesSelect   = document.getElementById('backupLinesSelect');
  const backupFetchBtn      = document.getElementById('backupFetchBtn');
  const backupBadgeTag      = document.getElementById('backupBadgeTag');
  const backupStatusMsg     = document.getElementById('backupStatusMsg');
  const backupTargetVal     = document.getElementById('backupTargetVal');
  const backupFilterInput   = document.getElementById('backupFilterInput');
  const backupCopyBtn       = document.getElementById('backupCopyBtn');
  const backupLogTerminal   = document.getElementById('backupLogTerminal');
  const backupLogsBody      = document.getElementById('backupLogsBody');
  const backupReverseCheck  = document.getElementById('backupReverseCheck');
  const backupFilesContainer  = document.getElementById('backupFilesContainer');
  const backupFilesRefreshBtn = document.getElementById('backupFilesRefreshBtn');

  // ════════════════════════════════════════════════════════
  // THEME TOGGLE
  // ════════════════════════════════════════════════════════
  function applyTheme(light) {
    // Apply on <body> — more reliable than <html> for CSS var overrides
    if (light) {
      document.body.setAttribute('data-theme', 'light');
      document.documentElement.setAttribute('data-theme', 'light');
      themeToggleBtn.textContent = '○';
      themeToggleBtn.title = 'Switch to dark mode';
    } else {
      document.body.removeAttribute('data-theme');
      document.documentElement.removeAttribute('data-theme');
      themeToggleBtn.textContent = '◐';
      themeToggleBtn.title = 'Switch to light mode';
    }
    localStorage.setItem('theme', light ? 'light' : 'dark');
  }

  // Restore saved theme on load
  applyTheme(localStorage.getItem('theme') === 'light');

  themeToggleBtn.addEventListener('click', () => {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    applyTheme(!isLight);
  });

  // ════════════════════════════════════════════════════════
  // LOGOUT
  // ════════════════════════════════════════════════════════
  logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
    window.location.href = '/login.html';
  });

  // ════════════════════════════════════════════════════════
  // TAB NAVIGATION
  // ════════════════════════════════════════════════════════
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.getAttribute('data-tab');
      document.getElementById(activeTab).classList.add('active');
      refreshActiveTabData();
    });
  });

  function refreshActiveTabData() {
    if (activeTab === 'tab-ollama')  { fetchStatus(); fetchLogs(); fetchModels(); }
    else if (activeTab === 'tab-pm2')     { fetchPm2Snapshot(); }
    else if (activeTab === 'tab-system')  { fetchSystemSnapshot(); }
    else if (activeTab === 'tab-backups') {
      fetchBackupFiles();
      // Re-fetch sources if dropdown never populated (e.g. initial load failed)
      if (!backupSourceSelect.value || backupSourceSelect.querySelector('option[value=""]')) {
        fetchLogSourcesList();
      } else {
        fetchBackupLogTail();
      }
    }
    else if (activeTab === 'tab-traffic') { fetchTrafficAnalytics(); }
  }

  // ════════════════════════════════════════════════════════
  // TAB 1: OLLAMA
  // ════════════════════════════════════════════════════════
  async function fetchStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      renderStatus(data);
    } catch (err) {
      globalStateTag.className = 'status-tag err';
      globalStateTag.textContent = '[ ERR ]';
    }
  }

  function renderStatus(data) {
    lastUpdatedVal.textContent = new Date(data.timestamp || Date.now()).toLocaleTimeString();
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
    listenTag.className = listener.listening ? 'status-tag ok' : 'status-tag err';
    listenTag.textContent = listener.listening ? '[BOUND]' : '[UNBOUND]';

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
      globalStateTag.className = 'status-tag warn';
      globalStateTag.textContent = '[ WARN ]';
    }

    if (data.hostMetrics) {
      hostVal.textContent = data.hostMetrics.hostname || 'ubuntu-vps';
      const ram  = data.hostMetrics.memory;
      const swap = data.hostMetrics.swap;
      if (ram)  ramVal.textContent  = `${ram.formattedUsed} / ${ram.formattedTotal} (${ram.usagePercent}%)`;
      if (swap) swapVal.textContent = `${swap.formattedUsed} / ${swap.formattedTotal} (${swap.usagePercent}%)`;
    }
  }

  async function fetchLogs() {
    try {
      const res = await fetch(`/api/logs?lines=${logLinesSelect.value}`);
      if (res.ok) {
        const data = await res.json();
        rawLogContent = data.logs || '';
        renderLogs();
      }
    } catch (err) {}
  }

  function renderLogs() {
    if (!rawLogContent) { logTerminal.textContent = 'No logs available.'; return; }
    const filter = logFilterInput.value.toLowerCase().trim();
    let lines = rawLogContent.split('\n');
    if (filter) lines = lines.filter(l => l.toLowerCase().includes(filter));

    const formatted = lines.map(line => {
      let esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      esc = esc.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)/, '<span class="log-ts">$1</span>');
      if (/error|failed|panic/i.test(esc)) esc = `<span class="log-err">${esc}</span>`;
      return esc;
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
      opt.value = 'llama3.2:3b'; opt.textContent = 'llama3.2:3b';
      chatModelSelect.appendChild(opt);
      modelsTableBody.innerHTML = `<tr><td colspan="3" class="text-dim">No models found.</td></tr>`;
      return;
    }
    modelsTableBody.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name; opt.textContent = m.name;
      chatModelSelect.appendChild(opt);

      const tr = document.createElement('tr');
      const sizeMb = m.size ? (m.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : 'N/A';
      const modDate = m.modified_at ? new Date(m.modified_at).toLocaleDateString() : 'N/A';
      tr.innerHTML = `<td><code>${m.name}</code></td><td>${sizeMb}</td><td class="text-dim">${modDate}</td>`;
      modelsTableBody.appendChild(tr);
    });
  }

  runChatTestBtn.addEventListener('click', async () => {
    const model  = chatModelSelect.value;
    const prompt = chatPromptInput.value.trim() || 'OK';
    runChatTestBtn.disabled = true;
    runChatTestBtn.textContent = 'Testing...';
    chatResultBox.classList.add('hidden');
    try {
      const res  = await fetch('/api/test-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt }) });
      const data = await res.json();
      chatResultBox.classList.remove('hidden');
      chatLatencyVal.textContent = `${data.latencyMs || 0} ms`;
      if (data.success) {
        chatResultTag.className = 'status-tag ok';
        chatResultTag.textContent = '[PASS]';
        chatResponseContent.textContent = data.response || '(Empty response)';
      } else {
        chatResultTag.className = 'status-tag err';
        chatResultTag.textContent = '[FAIL]';
        chatResponseContent.textContent = data.error || 'Chat test failed';
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

  logLinesSelect.addEventListener('change', fetchLogs);
  logFilterInput.addEventListener('input', renderLogs);

  // ════════════════════════════════════════════════════════
  // TAB 2: PM2
  // ════════════════════════════════════════════════════════
  pm2RefreshBtn.addEventListener('click', fetchPm2Snapshot);

  async function fetchPm2Snapshot() {
    pm2SummaryContainer.innerHTML = `<div class="text-dim" style="font-size:12px;">Fetching...</div>`;
    pm2UserTablesContainer.innerHTML = `<div style="padding:1rem;" class="text-dim">Loading PM2 snapshot...</div>`;
    try {
      const res = await fetch('/api/v2/pm2/snapshot');
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) {
        pm2UserTablesContainer.innerHTML = `<div style="padding:1rem;" class="text-red">Failed to fetch PM2 snapshot (HTTP ${res.status})</div>`;
        return;
      }
      const data = await res.json();
      renderPm2Snapshot(data);
    } catch (err) {
      pm2UserTablesContainer.innerHTML = `<div style="padding:1rem;" class="text-red">Error: ${err.message}</div>`;
    }
  }

  function renderPm2Snapshot(data) {
    const users = data.users || [];
    const ts = new Date(data.timestamp || Date.now()).toLocaleTimeString();
    pm2LastUpdated.textContent = ts;
    lastUpdatedVal.textContent = ts;

    if (users.length === 0) {
      pm2SummaryContainer.innerHTML = `<div class="text-dim" style="font-size:12px;">No PM2 users configured.</div>`;
      pm2UserTablesContainer.innerHTML = `<div style="padding:1rem;" class="text-dim">No PM2 users configured in PM2_USERS environment variable.</div>`;
      return;
    }

    // ── Left Col: Per-user summary cards
    pm2SummaryContainer.innerHTML = '';
    let totalProcesses = 0;

    users.forEach(u => {
      const online  = (u.processes || []).filter(p => p.status === 'online').length;
      const stopped = (u.processes || []).filter(p => p.status === 'stopped').length;
      const errored = (u.processes || []).filter(p => p.status !== 'online' && p.status !== 'stopped').length;
      const total   = (u.processes || []).length;
      totalProcesses += total;

      const totalMem = (u.processes || []).reduce((s, p) => s + (p.memoryBytes || 0), 0);
      const memStr = formatBytesClient(totalMem);

      const card = document.createElement('div');
      card.className = 'pm2-summary-card';

      let statusBadge = '';
      if (u.error) {
        statusBadge = `<span class="status-tag warn">[WARN]</span>`;
      } else if (errored > 0) {
        statusBadge = `<span class="status-tag err">[${errored} ERR]</span>`;
      } else if (total === 0) {
        statusBadge = `<span class="status-tag warn">[NONE]</span>`;
      } else {
        statusBadge = `<span class="status-tag ok">[${online}/${total} UP]</span>`;
      }

      card.innerHTML = `
        <div class="card-user">
          <span>${u.user}</span>
          ${statusBadge}
        </div>
        ${u.error
          ? `<div style="font-size:11px;color:var(--yellow);font-family:var(--font-mono);">${u.error}</div>`
          : `<div class="card-stats">
               <span><span class="text-green">${online}</span> online</span>
               <span>${stopped} stopped</span>
               <span>${memStr} mem</span>
             </div>`
        }
        ${u.pm2Path ? `<div class="card-path">${u.pm2Path}</div>` : ''}
      `;
      pm2SummaryContainer.appendChild(card);
    });

    pm2ProcessCount.textContent = `${totalProcesses} process${totalProcesses !== 1 ? 'es' : ''}`;

    // ── Right Col: Process table
    pm2UserTablesContainer.innerHTML = '';

    users.forEach(u => {
      // User section header
      const userHeader = document.createElement('div');
      userHeader.className = 'pm2-user-header';
      userHeader.innerHTML = `
        <span>User: <strong>${u.user}</strong></span>
        ${u.pm2Path ? `<span class="pm2-path-dim">${u.pm2Path}</span>` : ''}
      `;
      pm2UserTablesContainer.appendChild(userHeader);

      if (u.error) {
        const errRow = document.createElement('div');
        errRow.className = 'pm2-user-error';
        errRow.textContent = `⚠  ${u.error}`;
        pm2UserTablesContainer.appendChild(errRow);
        return;
      }

      if (!u.processes || u.processes.length === 0) {
        const emptyRow = document.createElement('div');
        emptyRow.className = 'pm2-user-error';
        emptyRow.style.color = 'var(--text-dim)';
        emptyRow.textContent = `No active PM2 processes for user '${u.user}'.`;
        pm2UserTablesContainer.appendChild(emptyRow);
        return;
      }

      // Render a modern card for each process
      u.processes.forEach(p => {
        const sc = p.status === 'online' ? 'ok' : (p.status === 'stopped' ? 'warn' : 'err');
        const card = document.createElement('div');
        card.className = 'v2-card pm2-process-card';
        card.style.marginBottom = '1rem';
        
        card.innerHTML = `
          <div class="v2-card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:1rem;">
              <div class="v2-card-title">${p.name}</div>
              <span class="status-tag ${sc}">[${p.status.toUpperCase()}]</span>
            </div>
            <div style="font-size:12px; color:var(--text-dim); display:flex; gap:1rem;">
              <span><strong>PID:</strong> ${p.pid || '--'}</span>
              <span><strong>UPTIME:</strong> ${p.uptime}</span>
              <span><strong>RESTARTS:</strong> ${p.restarts}</span>
            </div>
          </div>
          <div class="v2-card-body p-0" style="background:var(--bg-lighter);">
            <div style="display:flex; border-bottom:1px solid var(--border); font-size:12px;">
              <div style="flex:1; padding:0.5rem 1rem; border-right:1px solid var(--border);"><strong>CPU:</strong> ${p.cpu}</div>
              <div style="flex:1; padding:0.5rem 1rem;"><strong>MEM:</strong> ${p.formattedMemory}</div>
            </div>
            <div class="pm2-inline-logs-wrap" style="position:relative; background:#0f1115; border-bottom-left-radius:6px; border-bottom-right-radius:6px; padding:0.5rem;">
              <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase; margin-bottom:0.25rem; font-family:var(--font-mono);">Live Logs (Last 50 lines)</div>
              <pre id="pm2-log-${u.user}-${p.name}" style="margin:0; font-family:var(--font-mono); font-size:11px; color:var(--text-main); max-height:200px; overflow-y:auto; white-space:pre-wrap;">Loading logs...</pre>
            </div>
          </div>
        `;
        pm2UserTablesContainer.appendChild(card);

        // Fetch logs automatically
        fetch(`/api/v2/pm2/logs?user=${u.user}&app=${p.name}&lines=50`)
          .then(r => r.json())
          .then(data => {
            const pre = document.getElementById(`pm2-log-${u.user}-${p.name}`);
            if(pre) {
              pre.textContent = data.error ? `Error: ${data.error}` : (data.output || 'No logs available.');
              pre.scrollTop = pre.scrollHeight;
            }
          })
          .catch(err => {
            const pre = document.getElementById(`pm2-log-${u.user}-${p.name}`);
            if(pre) pre.textContent = `Failed to fetch logs: ${err.message}`;
          });
      });
    });
  }

  // ════════════════════════════════════════════════════════
  // TAB 3: SYSTEM HEALTH
  // ════════════════════════════════════════════════════════
  async function fetchSystemSnapshot() {
    try {
      const res = await fetch('/api/v2/system/snapshot');
      if (res.ok) renderSystemSnapshot(await res.json());
    } catch (err) {}
  }

  function renderSystemSnapshot(data) {
    lastUpdatedVal.textContent = new Date(data.timestamp || Date.now()).toLocaleTimeString();

    const upt = data.uptime || {};
    sysUptimeVal.textContent = upt.uptimeText || '--';
    sysCpusVal.textContent   = upt.cpus || '--';
    sysLoad1m.textContent    = upt.load1m || '--';
    sysLoad5m.textContent    = upt.load5m || '--';
    sysLoad15m.textContent   = upt.load15m || '--';

    const mem = data.memory || {};
    sysRamText.textContent = `${mem.formattedUsed || '--'} / ${mem.formattedTotal || '--'} (${mem.usagePercent || 0}%)`;
    sysRamBar.style.width = `${mem.usagePercent || 0}%`;
    sysRamBar.className = `progress-bar ${mem.usagePercent > 85 ? 'err' : mem.usagePercent > 65 ? 'warn' : 'green'}`;

    const swap = data.swap || {};
    sysSwapText.textContent = `${swap.formattedUsed || '0 B'} / ${swap.formattedTotal || '0 B'} (${swap.usagePercent || 0}%)`;
    sysSwapBar.style.width = `${swap.usagePercent || 0}%`;

    const services = data.services || [];
    sysServicesTableBody.innerHTML = services.length === 0
      ? `<tr><td colspan="4" class="text-dim" style="padding-left:1rem;">No services checked.</td></tr>`
      : services.map(s => `
          <tr>
            <td style="padding-left:1rem;"><code>${s.fullUnit}</code></td>
            <td><span class="status-tag ${s.isActive ? 'ok' : 'err'}">[${(s.activeState || 'UNKNOWN').toUpperCase()}]</span></td>
            <td>${s.formattedMemory}</td>
            <td style="padding-right:1rem;"><code>${s.pid || '--'}</code></td>
          </tr>`).join('');

    const disk = data.disk || [];
    sysDiskContainer.innerHTML = disk.length === 0
      ? `<div class="text-dim">No disk mounts configured.</div>`
      : disk.map(d => `
          <div style="margin-bottom:0.75rem;">
            <div class="progress-label">
              <span><strong>${d.path}</strong> ${d.mountPoint ? '(' + d.mountPoint + ')' : ''}</span>
              <span>${d.formattedUsed || 'N/A'} / ${d.formattedTotal || 'N/A'} (${d.percent}%)</span>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar ${d.percent > 85 ? 'err' : d.percent > 70 ? 'warn' : 'green'}" style="width:${d.percent}%"></div>
            </div>
          </div>`).join('');

    sysPortsTableBody.innerHTML = (data.ports || []).map(p => `
      <tr>
        <td style="padding-left:1rem;">${p.name}</td>
        <td><code>${p.host}:${p.port}</code></td>
        <td style="padding-right:1rem;"><span class="status-tag ${p.listening ? 'ok' : 'err'}">[${p.listening ? 'BOUND' : 'NOT BOUND'}]</span></td>
      </tr>`).join('');

    sysTlsTableBody.innerHTML = (data.tls || []).map(t => `
      <tr>
        <td style="padding-left:1rem;"><code>${t.target}</code></td>
        <td>${t.formattedValidTo || 'N/A'}</td>
        <td style="padding-right:1rem;"><span class="status-tag ${t.valid ? 'ok' : 'err'}">[${t.statusText}]</span></td>
      </tr>`).join('');
  }

  // ════════════════════════════════════════════════════════
  // TAB 4: BACKUPS
  // ════════════════════════════════════════════════════════
  async function fetchLogSourcesList() {
    try {
      const res = await fetch('/api/v2/logs/sources');
      if (!res.ok) {
        backupSourceSelect.innerHTML = `<option value="">Error loading sources (HTTP ${res.status})</option>`;
        return;
      }
      const data = await res.json();
      const sources = data.sources || [];
      if (sources.length === 0) {
        backupSourceSelect.innerHTML = `<option value="">No log sources configured</option>`;
        return;
      }
      renderLogSourcesSelect(sources);
    } catch (err) {
      backupSourceSelect.innerHTML = `<option value="">Error: ${err.message}</option>`;
    }
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
    fetchBackupLogTail();
  }

  backupFetchBtn.addEventListener('click', fetchBackupLogTail);
  backupSourceSelect.addEventListener('change', fetchBackupLogTail);
  backupReverseCheck.addEventListener('change', renderBackupLog);

  async function fetchBackupLogTail() {
    const id = backupSourceSelect.value;
    if (!id) return;
    const lines = backupLinesSelect.value || 200;
    backupLogTerminal.textContent = `Fetching log tail for '${id}' (${lines} lines)...`;

    try {
      const res = await fetch(`/api/v2/logs/tail?id=${id}&lines=${lines}`);
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) { backupLogTerminal.textContent = `Failed to fetch log tail (HTTP ${res.status})`; return; }
      const data = await res.json();
      rawBackupLogContent = data.output || '';
      renderBackupLogTail(data);
    } catch (err) {
      backupLogTerminal.textContent = `Error: ${err.message}`;
    }
  }

  function renderBackupLog() {
    if (!rawBackupLogContent) return;
    const filter = backupFilterInput.value.toLowerCase().trim();
    let lines = rawBackupLogContent.split('\n');
    if (filter) lines = lines.filter(l => l.toLowerCase().includes(filter));

    // Newest entries first: reverse the lines
    if (backupReverseCheck.checked) lines = lines.slice().reverse();

    // Colorize lines
    const formatted = lines.map(line => {
      let esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (/^=== Backup started/i.test(esc)) {
        esc = `<span class="log-ts">${esc}</span>`;
      } else if (/✓/.test(esc) || /Backup successful/i.test(esc)) {
        esc = `<span class="log-ok">${esc}</span>`;
      } else if (/✗/.test(esc) || /FAILED/i.test(esc) || /^rm: cannot remove/i.test(esc) || /^error/i.test(esc)) {
        esc = `<span class="log-err">${esc}</span>`;
      } else if (/WARN/i.test(esc)) {
        esc = `<span class="log-warn">${esc}</span>`;
      }
      return esc;
    }).join('\n');

    backupLogTerminal.innerHTML = formatted || '<span class="text-dim">No matching lines found.</span>';
    // Scroll to top since newest is first
    backupLogsBody.scrollTop = 0;
  }

  function renderBackupLogTail(data) {
    lastUpdatedVal.textContent = new Date().toLocaleTimeString();
    backupTargetVal.textContent = `${data.type || 'source'}: ${data.target || data.id}`;

    const st = data.backupStatus || {};
    backupBadgeTag.className   = `status-tag ${st.badgeClass || 'warn'}`;
    backupBadgeTag.textContent = `[${(st.status || 'UNKNOWN').toUpperCase()}]`;
    backupStatusMsg.textContent = st.message || 'Log analysis complete';

    renderBackupLog();
  }

  backupFilterInput.addEventListener('input', renderBackupLog);

  backupCopyBtn.addEventListener('click', () => {
    if (!rawBackupLogContent) return;
    navigator.clipboard.writeText(rawBackupLogContent);
    backupCopyBtn.textContent = 'Copied!';
    setTimeout(() => { backupCopyBtn.textContent = 'Copy'; }, 1500);
  });

  if (backupFilesRefreshBtn) {
    backupFilesRefreshBtn.addEventListener('click', fetchBackupFiles);
  }

  async function fetchBackupFiles() {
    if (!backupFilesContainer) return;
    backupFilesContainer.innerHTML = '<div class="text-dim" style="font-size: 12px; padding: 0.4rem;">Loading backup files...</div>';

    try {
      const res = await fetch('/api/v2/backups/files');
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      if (!res.ok) {
        backupFilesContainer.innerHTML = `<div class="text-dim" style="font-size: 12px; padding: 0.4rem; color: var(--red);">Error loading files (HTTP ${res.status})</div>`;
        return;
      }
      const data = await res.json();
      if (!data.success || !data.files || data.files.length === 0) {
        backupFilesContainer.innerHTML = `<div class="text-dim" style="font-size: 12px; padding: 0.4rem;">${data.error || 'No backup dump files found.'}</div>`;
        return;
      }
      renderBackupFilesList(data.files);
    } catch (err) {
      backupFilesContainer.innerHTML = `<div class="text-dim" style="font-size: 12px; padding: 0.4rem; color: var(--red);">Error: ${err.message}</div>`;
    }
  }

  function renderBackupFilesList(files) {
    backupFilesContainer.innerHTML = files.map(file => {
      const sizeStr = formatBytesClient(file.size);
      const d = new Date(file.mtime);
      const dateStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="backup-file-item">
          <div class="backup-file-info">
            <div class="backup-file-name" title="${file.name}">${file.name}</div>
            <div class="backup-file-meta">${sizeStr} • ${dateStr}</div>
          </div>
          <a href="/api/v2/backups/download/${encodeURIComponent(file.name)}" class="btn-download" download="${file.name}">
            ⬇ Download
          </a>
        </div>
      `;
    }).join('');
  }

  // ════════════════════════════════════════════════════════
  // TAB 5: TRAFFIC ANALYTICS
  // ════════════════════════════════════════════════════════
  let leafletMap = null;
  let mapMarkersLayer = null;

  async function fetchTrafficAnalytics() {
    try {
      const res = await fetch('/api/traffic-analytics');
      if (res.status === 401) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      renderTrafficAnalytics(data);
    } catch (err) {
      console.error('Failed to fetch traffic analytics:', err);
    }
  }

  function renderTrafficAnalytics(data) {
    if (!data) return;

    // 1. Metric Cards
    const summary = data.summary || {};
    const doms = summary.domains || {};

    const appData = doms['iskconcommunity.com'] || { hits: 0, unique: 0, mobile_hits: 0, web_hits: 0 };
    const devData = doms['dev.iskconcommunity.com'] || { hits: 0, unique: 0, mobile_hits: 0, web_hits: 0 };
    const msfData = doms['msf.iskconcommunity.com'] || { hits: 0, unique: 0, mobile_hits: 0, web_hits: 0 };

    const hitsAppEl = document.getElementById('trafficHitsApp');
    const usersAppEl = document.getElementById('trafficUsersApp');
    const mobileAppEl = document.getElementById('trafficMobileApp');
    const webAppEl = document.getElementById('trafficWebApp');

    const hitsDevEl = document.getElementById('trafficHitsDev');
    const usersDevEl = document.getElementById('trafficUsersDev');
    const mobileDevEl = document.getElementById('trafficMobileDev');
    const webDevEl = document.getElementById('trafficWebDev');

    const hitsMsfEl = document.getElementById('trafficHitsMsf');
    const usersMsfEl = document.getElementById('trafficUsersMsf');
    const mobileMsfEl = document.getElementById('trafficMobileMsf');
    const webMsfEl = document.getElementById('trafficWebMsf');

    const hitsTotalEl = document.getElementById('trafficHitsTotal');
    const usersTotalEl = document.getElementById('trafficUsersTotal');
    const mobileTotalEl = document.getElementById('trafficMobileTotal');
    const webTotalEl = document.getElementById('trafficWebTotal');

    if (hitsAppEl) hitsAppEl.textContent = appData.hits.toLocaleString();
    if (usersAppEl) usersAppEl.textContent = appData.unique.toLocaleString();
    if (mobileAppEl) mobileAppEl.textContent = (appData.mobile_hits || 0).toLocaleString();
    if (webAppEl) webAppEl.textContent = (appData.web_hits || 0).toLocaleString();

    if (hitsDevEl) hitsDevEl.textContent = devData.hits.toLocaleString();
    if (usersDevEl) usersDevEl.textContent = devData.unique.toLocaleString();
    if (mobileDevEl) mobileDevEl.textContent = (devData.mobile_hits || 0).toLocaleString();
    if (webDevEl) webDevEl.textContent = (devData.web_hits || 0).toLocaleString();

    if (hitsMsfEl) hitsMsfEl.textContent = msfData.hits.toLocaleString();
    if (usersMsfEl) usersMsfEl.textContent = msfData.unique.toLocaleString();
    if (mobileMsfEl) mobileMsfEl.textContent = (msfData.mobile_hits || 0).toLocaleString();
    if (webMsfEl) webMsfEl.textContent = (msfData.web_hits || 0).toLocaleString();

    if (hitsTotalEl) hitsTotalEl.textContent = (summary.total_hits || 0).toLocaleString();
    if (usersTotalEl) usersTotalEl.textContent = (summary.unique_devices || 0).toLocaleString();
    if (mobileTotalEl) mobileTotalEl.textContent = (summary.total_mobile_hits || 0).toLocaleString();
    if (webTotalEl) webTotalEl.textContent = (summary.total_web_hits || 0).toLocaleString();

    // 2. OS Breakdown
    const osStatsContainer = document.getElementById('osStatsContainer');
    const osStats = data.os_stats || {};
    const totalOsHits = Object.values(osStats).reduce((a, b) => a + b, 0) || 1;

    const osColors = {
      Android: '#10b981',
      iOS: '#0ea5e9',
      Windows: '#3b82f6',
      Mac: '#8b5cf6',
      Linux: '#f59e0b',
      Other: '#6b7280'
    };

    if (osStatsContainer) {
      osStatsContainer.innerHTML = Object.keys(osStats).map(os => {
        const count = osStats[os] || 0;
        const pct = ((count / totalOsHits) * 100).toFixed(1);
        const color = osColors[os] || '#6b7280';
        return `
          <div style="flex:1; min-width:110px; background:var(--panel-alt); border:1px solid var(--border); border-radius:var(--radius); padding:0.5rem 0.75rem; border-left:3px solid ${color};">
            <div style="font-size:11px; color:var(--text-dim); text-transform:uppercase; font-weight:600;">${os}</div>
            <div style="font-size:16px; font-weight:700; color:var(--text); margin-top:2px;">${count.toLocaleString()}</div>
            <div style="font-size:10px; color:var(--text-dim); margin-top:1px;">${pct}%</div>
          </div>
        `;
      }).join('');
    }

    // 3. Map rendering
    const locations = data.locations || [];
    const countTag = document.getElementById('mapDeviceCountTag');
    if (countTag) {
      countTag.textContent = `${locations.length} active location${locations.length === 1 ? '' : 's'}`;
    }

    initOrUpdateMap(locations);

    // 4. Recent Visitors Table
    const recentTableBody = document.getElementById('trafficRecentTableBody');
    const recent = data.recent_visitors || [];

    if (recentTableBody) {
      if (recent.length === 0) {
        recentTableBody.innerHTML = `<tr><td colspan="4" class="text-dim" style="padding:1rem; text-align:center;">No recent traffic recorded</td></tr>`;
      } else {
        const hostBadges = {
          'iskconcommunity.com': '<span class="status-tag ok" style="font-size:10px;">APP</span>',
          'dev.iskconcommunity.com': '<span class="status-tag warn" style="font-size:10px;">DEV</span>',
          'msf.iskconcommunity.com': '<span class="status-tag" style="font-size:10px; background:rgba(139,92,246,0.15); color:#a855f7; border-color:#8b5cf6;">MSF</span>'
        };

        recentTableBody.innerHTML = recent.map(v => {
          const timeStr = v.timestamp || '-';
          const badge = hostBadges[v.host] || `<span class="status-tag" style="font-size:10px;">${v.host}</span>`;
          const locStr = (v.city && v.city !== 'Unknown') ? `${v.city}, ${v.country}` : (v.country || 'Unknown');
          const osDeviceStr = `${v.os} (${v.device}) • ${v.browser}`;

          return `
            <tr style="border-bottom:1px solid var(--border-dim);">
              <td style="padding:6px 10px; font-family:var(--font-mono); font-size:11px; white-space:nowrap; color:var(--text-dim);">${timeStr}</td>
              <td style="padding:6px 10px; white-space:nowrap;">${badge}</td>
              <td style="padding:6px 10px; white-space:nowrap;">${locStr}</td>
              <td style="padding:6px 10px; color:var(--text-dim); font-size:11px;">${osDeviceStr}</td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  function initOrUpdateMap(locations) {
    const mapElement = document.getElementById('trafficMap');
    if (!mapElement || typeof L === 'undefined') return;

    if (!leafletMap) {
      leafletMap = L.map('trafficMap').setView([20.5937, 78.9629], 3);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(leafletMap);

      mapMarkersLayer = L.layerGroup().addTo(leafletMap);
    }

    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
    }, 100);

    mapMarkersLayer.clearLayers();

    const hostColors = {
      'iskconcommunity.com': '#10b981',
      'dev.iskconcommunity.com': '#0ea5e9',
      'msf.iskconcommunity.com': '#8b5cf6'
    };

    const bounds = [];

    locations.forEach(loc => {
      if (typeof loc.lat === 'number' && typeof loc.lon === 'number') {
        const color = hostColors[loc.host] || '#f59e0b';
        const marker = L.circleMarker([loc.lat, loc.lon], {
          radius: 7,
          fillColor: color,
          color: '#ffffff',
          weight: 1,
          opacity: 0.9,
          fillOpacity: 0.8
        });

        const popupContent = `
          <div style="font-family:sans-serif; font-size:12px; line-height:1.4; color:#111;">
            <strong style="font-size:13px; color:#000;">${loc.city}, ${loc.country}</strong><br/>
            <b>Domain:</b> ${loc.host_label || loc.host}<br/>
            <b>OS / Device:</b> ${loc.os} (${loc.device})<br/>
            <b>Browser:</b> ${loc.browser}<br/>
            <b>IP:</b> <code>${loc.ip || 'Unknown'}</code>
          </div>
        `;

        marker.bindPopup(popupContent);
        mapMarkersLayer.addLayer(marker);
        bounds.push([loc.lat, loc.lon]);
      }
    });

    if (bounds.length > 0 && leafletMap) {
      leafletMap.fitBounds(bounds, { maxZoom: 10, padding: [20, 20] });
    }
  }

  // ════════════════════════════════════════════════════════
  // AUTO-REFRESH & BOOTSTRAP
  // ════════════════════════════════════════════════════════
  refreshBtn.addEventListener('click', refreshActiveTabData);
  refreshSelect.addEventListener('change', setupAutoRefresh);

  function setupAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    const secs = parseInt(refreshSelect.value, 10);
    if (secs > 0) autoRefreshTimer = setInterval(refreshActiveTabData, secs * 1000);
  }

  // ════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════
  function formatBytesClient(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  // ════════════════════════════════════════════════════════
  // INITIAL LOAD
  // ════════════════════════════════════════════════════════
  fetchStatus();
  fetchLogs();
  fetchModels();
  fetchLogSourcesList();
  setupAutoRefresh();
});
