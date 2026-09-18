import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { formatBytes } from '../lib/utils';

export function Pm2FleetView({ pm2Data, onRefresh }) {
  const users = pm2Data?.users || [];
  const [selectedApp, setSelectedApp] = useState(null); // { user: string, app: string }
  const [logLines, setLogLines] = useState('100');
  const [appLogs, setAppLogs] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // Auto select first app if available
  useEffect(() => {
    if (!selectedApp && users.length > 0) {
      for (const u of users) {
        if (u.processes && u.processes.length > 0) {
          setSelectedApp({ user: u.user, app: u.processes[0].name });
          break;
        }
      }
    }
  }, [users, selectedApp]);

  // Fetch app logs when selected
  useEffect(() => {
    if (!selectedApp) return;
    fetchAppLogs();
  }, [selectedApp, logLines]);

  const fetchAppLogs = async () => {
    if (!selectedApp) return;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(
        `/api/v2/pm2/logs?user=${encodeURIComponent(selectedApp.user)}&app=${encodeURIComponent(selectedApp.app)}&lines=${logLines}`
      );
      if (res.ok) {
        const data = await res.json();
        setAppLogs(data.output || data.logs || data.error || 'No log lines found for this app.');
      } else {
        setAppLogs(`Failed to fetch PM2 logs (HTTP ${res.status})`);
      }
    } catch (err) {
      setAppLogs(`Error loading logs: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
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
            <Button variant="secondary" size="sm" onClick={onRefresh} className="font-mono text-[11px]">
              REFRESH
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {users.length === 0 ? (
              <div className="text-xs text-neutral-500 font-mono">No PM2 users configured.</div>
            ) : (
              users.map((u, idx) => {
                const online = (u.processes || []).filter((p) => p.status === 'online').length;
                const total = (u.processes || []).length;
                const memSum = (u.processes || []).reduce(
                  (s, p) => s + (p.memoryBytes ?? p.memory ?? 0),
                  0
                );

                return (
                  <div
                    key={idx}
                    className="rounded border border-[#1a1a1a] bg-[#0c0c0c] p-3 space-y-2 font-mono text-xs theme-header"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-neutral-200">
                        USER: {u.user}
                      </span>
                      <Badge variant={u.error ? 'warn' : online === total && total > 0 ? 'ok' : 'err'}>
                        {u.error ? 'WARN' : `${online}/${total} UP`}
                      </Badge>
                    </div>
                    {u.error ? (
                      <div className="text-amber-400 text-[11px]">{u.error}</div>
                    ) : (
                      <div className="flex justify-between text-[11px] text-neutral-400">
                        <span>ONLINE: <strong className="text-emerald-400">{online}</strong></span>
                        <span>STOPPED: {total - online}</span>
                        <span>MEMORY: {formatBytes(memSum)}</span>
                      </div>
                    )}
                    {u.pm2Path && (
                      <div className="text-[10px] text-neutral-500 truncate pt-1 border-t border-[#141414]">
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
          <div className="divide-y divide-[#141414] max-h-[380px] overflow-y-auto font-mono text-xs">
            {users.flatMap((u) =>
              (u.processes || []).map((p) => {
                const isSelected =
                  selectedApp?.user === u.user && selectedApp?.app === p.name;
                return (
                  <button
                    key={`${u.user}-${p.name}`}
                    onClick={() => setSelectedApp({ user: u.user, app: p.name })}
                    className={`w-full flex items-center justify-between p-3 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#171717] border-l-2 border-white font-medium'
                        : 'hover:bg-[#0d0d0d]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-white">{p.name}</div>
                      <div className="text-[10px] text-neutral-500">
                        USER: {u.user} | PID: {p.pid || '--'} | RESTARTS: {p.restartCount ?? p.restart_time ?? 0}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant={p.status === 'online' ? 'ok' : 'err'} className="text-[9px]">
                        {(p.status || 'UNKNOWN').toUpperCase()}
                      </Badge>
                      <div className="text-[10px] text-neutral-400">
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
        <Card className="h-full flex flex-col min-h-[500px]">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle>
                LOGS: {selectedApp ? `${selectedApp.user} / ${selectedApp.app}` : 'SELECT APP'}
              </CardTitle>
              {selectedApp && (
                <Badge variant="blue" className="text-[9px]">
                  PM2
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={logLines}
                onChange={(e) => setLogLines(e.target.value)}
                className="h-7 rounded border border-[#262626] bg-[#0d0d0d] px-2 font-mono text-[11px] text-neutral-300 outline-none hover:border-neutral-700 focus:border-neutral-400 theme-input"
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
                className="h-7 rounded border border-[#262626] bg-[#0d0d0d] px-2 font-mono text-[11px] text-white placeholder-neutral-500 outline-none w-32 theme-input"
              />
              <Button variant="secondary" size="sm" onClick={handleCopyLogs} className="font-mono text-[11px] h-7">
                {copySuccess ? 'COPIED' : 'COPY'}
              </Button>
              <Button variant="outline" size="sm" onClick={fetchAppLogs} disabled={isLoadingLogs} className="font-mono text-[11px] h-7">
                {isLoadingLogs ? '...' : 'TAIL'}
              </Button>
            </div>
          </CardHeader>
          <div className="flex-1 bg-[#020202] p-4 font-mono text-[11px] leading-relaxed text-neutral-300 overflow-y-auto max-h-[calc(100vh-230px)] select-text">
            {isLoadingLogs ? (
              <div className="text-neutral-500">Fetching live log tail...</div>
            ) : filteredLogLines.length === 0 ? (
              <div className="text-neutral-600">No matching log entries found.</div>
            ) : (
              filteredLogLines.map((line, idx) => {
                const isErr = /error|fail|exception|fatal|panic/i.test(line);
                const isWarn = /warn|alert/i.test(line);
                return (
                  <div
                    key={idx}
                    className={`py-0.5 whitespace-pre-wrap break-all ${
                      isErr ? 'text-rose-400 font-semibold' : isWarn ? 'text-amber-400' : 'text-neutral-300'
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
