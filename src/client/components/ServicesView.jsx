import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export function ServicesView({ servicesData, onRefresh }) {
  const services = servicesData?.services || [];
  const pm2Users = servicesData?.pm2Fleet?.users || [];

  const [selectedUnit, setSelectedUnit] = useState(null); // string (e.g., 'nginx')
  const [logLines, setLogLines] = useState('100');
  const [unitLogs, setUnitLogs] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  // PM2 Log Viewer state
  const [selectedPm2App, setSelectedPm2App] = useState(null); // { user, app }
  const [pm2Logs, setPm2Logs] = useState('');
  const [isLoadingPm2Logs, setIsLoadingPm2Logs] = useState(false);

  // Select first service by default
  useEffect(() => {
    if (!selectedUnit && services.length > 0) {
      setSelectedUnit(services[0].name);
    }
  }, [services, selectedUnit]);

  // Fetch unit logs when selected or line count changes
  useEffect(() => {
    if (!selectedUnit) return;
    fetchUnitLogs();
  }, [selectedUnit, logLines]);

  const fetchUnitLogs = async () => {
    if (!selectedUnit) return;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(
        `/api/v2/services/logs?unit=${encodeURIComponent(selectedUnit)}&lines=${logLines}`
      );
      if (res.ok) {
        const data = await res.json();
        setUnitLogs(data.output || 'No journal logs found for this unit.');
      } else {
        setUnitLogs(`Failed to fetch journal logs (HTTP ${res.status})`);
      }
    } catch (err) {
      setUnitLogs(`Error loading logs: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Fetch PM2 Logs
  const fetchPm2Logs = async (user, appName) => {
    setSelectedPm2App({ user, app: appName });
    setIsLoadingPm2Logs(true);
    try {
      const res = await fetch(
        `/api/v2/pm2/logs?user=${encodeURIComponent(user)}&app=${encodeURIComponent(appName)}&lines=100`
      );
      if (res.ok) {
        const data = await res.json();
        setPm2Logs(data.output || data.logs || data.error || 'No PM2 log lines returned.');
      } else {
        setPm2Logs(`Failed to fetch PM2 logs (HTTP ${res.status})`);
      }
    } catch (err) {
      setPm2Logs(`Error loading PM2 logs: ${err.message}`);
    } finally {
      setIsLoadingPm2Logs(false);
    }
  };

  const handleCopyLogs = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const filteredLogLines = (unitLogs || '')
    .split('\n')
    .filter((line) => !logFilter || line.toLowerCase().includes(logFilter.toLowerCase()));

  // Count total PM2 processes
  let totalPm2Processes = 0;
  pm2Users.forEach(u => {
    totalPm2Processes += (u.processes || []).length;
  });

  return (
    <div className="space-y-6">
      {/* ─── Top Telemetry Summary Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 space-y-1 font-mono">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>SYSTEMD UNITS</span>
              <Badge variant="ok">PID 1</Badge>
            </div>
            <div className="text-2xl font-bold text-emerald-400">
              {servicesData?.activeCount || 0} <span className="text-xs text-neutral-500 font-normal">of {services.length} active</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1 font-mono">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>PM2 APPS DETECTED</span>
              <Badge variant={totalPm2Processes > 0 ? 'ok' : 'neutral'}>
                {totalPm2Processes > 0 ? 'ACTIVE' : 'NONE'}
              </Badge>
            </div>
            <div className="text-2xl font-bold text-white">
              {totalPm2Processes} <span className="text-xs text-neutral-500 font-normal">processes</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1 font-mono">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>SERVICES MEMORY</span>
              <Badge variant="blue">RSS</Badge>
            </div>
            <div className="text-2xl font-bold text-white">
              {servicesData?.formattedTotalMemory || '0 B'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── PM2 Fleet Section (If PM2 apps exist on host) ─── */}
      {pm2Users.length > 0 && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>PM2 Fleet Auto-Discovered ({totalPm2Processes})</CardTitle>
              <Badge variant="ok">NODE DAEMONS</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#1f1f1f]">
              {pm2Users.map((userGroup) => (
                <div key={userGroup.user} className="p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-neutral-400 font-bold uppercase">USER: {userGroup.user}</span>
                    <span className="text-neutral-500">{userGroup.processes?.length || 0} apps</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-[#222222] text-neutral-500 text-[11px]">
                          <th className="pb-2">APP</th>
                          <th className="pb-2">STATUS</th>
                          <th className="pb-2">PID</th>
                          <th className="pb-2">CPU</th>
                          <th className="pb-2">MEM</th>
                          <th className="pb-2">RESTARTS</th>
                          <th className="pb-2">UPTIME</th>
                          <th className="pb-2 text-right">ACTION</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#141414]">
                        {(userGroup.processes || []).map((app) => (
                          <tr key={app.name || app.pm_id} className="hover:bg-[#0d0d0d]">
                            <td className="py-2.5 font-medium text-white">{app.name}</td>
                            <td className="py-2.5">
                              <Badge variant={app.status === 'online' ? 'ok' : 'err'} className="text-[9px]">
                                {(app.status || 'UNKNOWN').toUpperCase()}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-neutral-400">{app.pid || '--'}</td>
                            <td className="py-2.5 text-neutral-300">{app.cpu || 0}%</td>
                            <td className="py-2.5 text-neutral-300">{app.memoryFormatted || app.memory || '--'}</td>
                            <td className="py-2.5 text-neutral-400">{app.restart_time || 0}</td>
                            <td className="py-2.5 text-neutral-400">{app.uptimeText || app.uptime || '--'}</td>
                            <td className="py-2.5 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-[10px] px-2 font-mono"
                                onClick={() => fetchPm2Logs(userGroup.user, app.name)}
                              >
                                LOGS
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* PM2 Modal / Inline Log Box */}
            {selectedPm2App && (
              <div className="border-t border-[#1f1f1f] bg-[#020202] p-4 font-mono text-[11px]">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#141414]">
                  <span className="text-emerald-400 font-bold">
                    PM2 LOGS: {selectedPm2App.user} / {selectedPm2App.app}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleCopyLogs(pm2Logs)} className="h-6 text-[10px]">
                      COPY
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedPm2App(null)} className="h-6 text-[10px]">
                      CLOSE
                    </Button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto text-neutral-300 whitespace-pre-wrap select-text">
                  {isLoadingPm2Logs ? 'Tailing PM2 application logs...' : pm2Logs}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Main Grid: Services Fleet & Live Journal Terminal ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-260px)]">
        {/* Left Column: Services Fleet List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Systemd Services ({services.length})</CardTitle>
              <Button variant="secondary" size="sm" onClick={onRefresh} className="font-mono text-[11px]">
                REFRESH
              </Button>
            </CardHeader>
            <div className="divide-y divide-[#141414] max-h-[540px] overflow-y-auto font-mono text-xs flex-1">
              {services.length === 0 ? (
                <div className="p-4 text-center text-neutral-500 font-sans">
                  No systemd services detected or configured.
                </div>
              ) : (
                services.map((s) => {
                  const isSelected = selectedUnit === s.name;
                  return (
                    <button
                      key={s.name}
                      onClick={() => setSelectedUnit(s.name)}
                      className={`w-full flex items-center justify-between p-3.5 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#171717] border-l-2 border-white font-medium'
                          : 'hover:bg-[#0d0d0d]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-white truncate">{s.unit}</div>
                        <div className="text-[10px] text-neutral-500 truncate">
                          PID: {s.pid || '--'} | SUBSTATE: {s.subState} | USER: {s.user}
                        </div>
                      </div>
                      <div className="text-right space-y-1 shrink-0">
                        <Badge variant={s.active ? 'ok' : s.activeState === 'failed' ? 'err' : 'neutral'} className="text-[9px]">
                          {(s.activeState || 'UNKNOWN').toUpperCase()}
                        </Badge>
                        <div className="text-[10px] text-neutral-400">
                          {s.formattedMemory || '--'}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Live Journal Logs (7 cols) */}
        <div className="lg:col-span-7">
          <Card className="h-full flex flex-col min-h-[540px]">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle>
                  JOURNAL: {selectedUnit ? `${selectedUnit}.service` : 'SELECT UNIT'}
                </CardTitle>
                <Badge variant="neutral" className="text-[9px]">
                  JOURNALCTL
                </Badge>
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
                <Button variant="secondary" size="sm" onClick={() => handleCopyLogs(unitLogs)} className="font-mono text-[11px] h-7">
                  {copySuccess ? 'COPIED' : 'COPY'}
                </Button>
                <Button variant="outline" size="sm" onClick={fetchUnitLogs} disabled={isLoadingLogs} className="font-mono text-[11px] h-7">
                  {isLoadingLogs ? '...' : 'TAIL'}
                </Button>
              </div>
            </CardHeader>
            <div className="flex-1 bg-[#020202] p-4 font-mono text-[11px] leading-relaxed text-neutral-300 overflow-y-auto max-h-[calc(100vh-320px)] select-text">
              {isLoadingLogs ? (
                <div className="text-neutral-500 font-sans">Fetching journalctl log tail...</div>
              ) : filteredLogLines.length === 0 ? (
                <div className="text-neutral-600 font-sans">No matching journalctl entries found.</div>
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
    </div>
  );
}
