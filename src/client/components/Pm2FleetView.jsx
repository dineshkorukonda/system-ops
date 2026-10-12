import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { formatBytes } from '../lib/utils';
function selectedFromUrl() {
  const match = /^#pm2\/([a-zA-Z0-9_-]+)\/(\d+)$/.exec(window.location.hash);
  return match ? { user: match[1], app: match[2] } : null;
}

export function Pm2FleetView({ pm2Data, onRefresh }) {
  // Use `allUsers` so errored/pending users are visible (with error banners)
  // Fall back to `users` for backward compatibility with older server versions
  const users = pm2Data?.allUsers || pm2Data?.users || [];
  const [selectedApp, setSelectedApp] = useState(selectedFromUrl);
  const logController = useRef(null);
  const [logLines, setLogLines] = useState('100');
  const [appLogs, setAppLogs] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const selectedProcess = users.find(user => user.user === selectedApp?.user)?.processes?.find(proc => String(proc.pm_id) === selectedApp?.app);
  const openApp = (user, proc) => {
    const app = String(proc.pm_id);
    history.pushState(null, '', `#pm2/${user}/${app}`);
    setSelectedApp({ user, app });
  };
  useEffect(() => {
    const update = () => setSelectedApp(selectedFromUrl());
    window.addEventListener('popstate', update);
    return () => { window.removeEventListener('popstate', update); logController.current?.abort(); };
  }, []);

  // Fetch app logs when selected
  useEffect(() => {
    setAppLogs('');
    if (!selectedApp) return;
    fetchAppLogs();
    return () => logController.current?.abort();
  }, [selectedApp, logLines]);

  const fetchAppLogs = async () => {
    if (!selectedApp) return;
    logController.current?.abort();
    const controller = new AbortController(); logController.current = controller;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(
        `/api/v2/pm2/logs?user=${encodeURIComponent(selectedApp.user)}&app=${encodeURIComponent(selectedApp.app)}&lines=${logLines}`, { signal: controller.signal }
      );
      if (res.ok) {
        const data = await res.json();
        if (!controller.signal.aborted) setAppLogs(data.output || data.logs || data.error || 'No log lines found for this app.');
      } else {
        setAppLogs(`Failed to fetch PM2 logs (HTTP ${res.status})`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setAppLogs(`Error loading logs: ${err.message}`);
    } finally {
      if (logController.current === controller) setIsLoadingLogs(false);
    }
  };

  const handleCopyLogs = () => {
    if (!appLogs) return;
    navigator.clipboard.writeText(appLogs);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const filteredLogLines = (appLogs || '')
    .split('\n')
    .filter((line) => !logFilter || line.toLowerCase().includes(logFilter.toLowerCase()));

  let totalFleetCount = 0;
  users.forEach((u) => {
    totalFleetCount += (u.processes || []).length;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-140px)]">
      {/* Left Column: User Summary & Process List (5 cols) */}
      <div className="lg:col-span-5 space-y-4">
        {/* User Summary Cards */}
        <Card>
          <CardHeader>
            <CardTitle>PM2 Users &amp; Environments</CardTitle>
            <Button variant="secondary" size="sm" onClick={onRefresh} className="font-mono text-xs">
              REFRESH
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {users.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] font-mono">No PM2 users configured.</div>
            ) : (
              users.map((u, idx) => {
                const online = (u.processes || []).filter((p) => p.status === 'online').length;
                const total = (u.processes || []).length;
                const memSum = (u.processes || []).reduce((s, p) => s + (p.memory || 0), 0);

                return (
                  <div
                    key={idx}
                    className="rounded border border-[var(--border-color)] bg-[var(--card-bg)] p-3 space-y-2 font-mono text-xs theme-header"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--text-secondary)]">
                        USER: {u.user}
                      </span>
                      <Badge variant={u.error ? 'warn' : online === total && total > 0 ? 'ok' : 'err'}>
                        {u.error ? 'WARN' : `${online}/${total} UP`}
                      </Badge>
                    </div>
                    {u.error ? (
                      <div className="text-[var(--warning)] text-xs">{u.error}</div>
                    ) : (
                      <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>ONLINE: <strong className="text-[var(--success)]">{online}</strong></span>
                        <span>STOPPED: {total - online}</span>
                        <span>MEMORY: {formatBytes(memSum)}</span>
                      </div>
                    )}
                    {u.pm2Path && (
                      <div className="text-[10px] text-[var(--text-muted)] truncate pt-1 border-t border-[var(--border-color)]">
                        PATH: {u.pm2Path}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Process Selection List */}
        <Card>
          <CardHeader>
            <CardTitle>Process Fleet ({totalFleetCount})</CardTitle>
          </CardHeader>
          <div className="divide-y divide-[var(--border-color)] max-h-[380px] overflow-y-auto font-mono text-xs">
            {users.flatMap((u) =>
              (u.processes || []).map((p) => {
                const isSelected =
                  selectedApp?.user === u.user && selectedApp?.app === String(p.pm_id);
                return (
                  <button
                    key={`${u.user}-${p.pm_id}`}
                    onClick={() => openApp(u.user, p)}
                    className={`w-full flex items-center justify-between p-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--surface-raised)] border-l-2 border-white font-medium'
                        : 'hover:bg-[var(--card-bg)]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">{p.name}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        USER: {u.user} | ID: {p.pm_id} | PID: {p.pid || '--'} | RESTARTS: {p.restart_time ?? '—'}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant={p.status === 'online' ? 'ok' : 'err'} className="text-[9px]">
                        {(p.status || 'UNKNOWN').toUpperCase()}
                      </Badge>
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        {p.formattedMemory || '0 B'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Right Column: Live App Logs Terminal (7 cols) */}
      <div className="lg:col-span-7">
        {selectedApp && <Card className="mb-4"><CardHeader><CardTitle>{selectedProcess?.name || 'Selected app'} · {selectedApp.user}/{selectedApp.app}</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {selectedProcess ? <><p>Status: {selectedProcess.status} · PID: {selectedProcess.pid ?? '—'}</p>
              <p>CPU: {Number.isFinite(selectedProcess.cpu) ? `${selectedProcess.cpu}%` : '—'} · Memory: {selectedProcess.memoryFormatted}</p>
              <p>Restarts: {selectedProcess.restart_time} · Uptime: {selectedProcess.uptimeText}</p></>
              : <p>This app is absent from the latest inventory. Check user collection errors.</p>}
          </CardContent></Card>}
        <Card className="h-full flex flex-col min-h-[500px]">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>
                LOGS: {selectedApp ? `${selectedApp.user} / ${selectedProcess?.name || selectedApp.app}` : 'SELECT APP'}
              </CardTitle>
              {selectedApp && (
                <Badge variant="blue" className="text-[9px]">
                  PM2
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={logLines}
                onChange={(e) => setLogLines(e.target.value)}
                className="h-7 rounded border border-[var(--border-color)] bg-[var(--card-bg)] px-2 font-mono text-xs text-[var(--text-secondary)] outline-none hover:border-neutral-700 focus:border-neutral-400 theme-input"
              >
                <option value="50">50 lines</option>
                <option value="100">100 lines</option>
                <option value="200">200 lines</option>
                <option value="500">500 lines</option>
              </select>
              <input
                type="text"
                placeholder="Filter logs..."
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="h-7 rounded border border-[var(--border-color)] bg-[var(--card-bg)] px-2 font-mono text-xs text-[var(--text-primary)] placeholder-neutral-500 outline-none w-32 theme-input"
              />
              <Button variant="secondary" size="sm" onClick={handleCopyLogs} className="font-mono text-xs h-7">
                {copySuccess ? 'COPIED' : 'COPY'}
              </Button>
              <Button variant="outline" size="sm" onClick={fetchAppLogs} disabled={isLoadingLogs} className="font-mono text-xs h-7">
                {isLoadingLogs ? '...' : 'TAIL'}
              </Button>
            </div>
          </CardHeader>
          <div className="flex-1 bg-[var(--bg-main)] p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)] overflow-y-auto max-h-[calc(100vh-230px)] select-text">
            {isLoadingLogs ? (
              <div className="text-[var(--text-muted)]">Fetching live log tail...</div>
            ) : filteredLogLines.length === 0 ? (
              <div className="text-[var(--text-muted)]">No matching log entries found.</div>
            ) : (
              filteredLogLines.map((line, idx) => {
                const isErr = /error|fail|exception|fatal|panic/i.test(line);
                const isWarn = /warn|alert/i.test(line);
                return (
                  <div
                    key={idx}
                    className={`py-0.5 whitespace-pre-wrap break-all ${
                      isErr ? 'text-[var(--error)] font-semibold' : isWarn ? 'text-[var(--warning)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {line}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
