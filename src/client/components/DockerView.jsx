import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export function DockerView({ dockerData, onRefresh }) {
  const containers = dockerData?.containers || [];
  const networks = dockerData?.networks || [];
  const total = dockerData?.total || 0;
  const running = dockerData?.running || 0;
  const exited = dockerData?.exited || 0;
  const paused = dockerData?.paused || 0;
  const networkCount = dockerData?.networkCount ?? networks.length;
  const hasError = dockerData?.error && !dockerData?.daemonReachable;
  const permissionIssue = dockerData?.permissionIssue;

  const [selectedContainer, setSelectedContainer] = useState(null);
  const [logLines, setLogLines] = useState('100');
  const [logs, setLogs] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [containerSearch, setContainerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [copySuccess, setCopySuccess] = useState(false);

  // Auto-select first running container on mount
  useEffect(() => {
    if (!selectedContainer && containers.length > 0) {
      const firstRunning = containers.find((c) => c.state === 'running') || containers[0];
      setSelectedContainer(firstRunning);
    }
  }, [containers, selectedContainer]);

  // Fetch logs when container or lines change
  useEffect(() => {
    if (!selectedContainer) return;
    fetchLogs(selectedContainer.id);
  }, [selectedContainer, logLines]);

  const fetchLogs = async (containerId) => {
    if (!containerId) return;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(
        `/api/v2/docker/logs?id=${encodeURIComponent(containerId)}&lines=${logLines}`
      );
      if (res.ok) {
        const data = await res.json();
        setLogs(data.output || 'No logs recorded for this container.');
      } else {
        setLogs(`Failed to fetch logs (HTTP ${res.status})`);
      }
    } catch (err) {
      setLogs(`Error fetching logs: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleCopyLogs = () => {
    if (!logs) return;
    navigator.clipboard.writeText(logs);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const filteredContainers = containers.filter((c) => {
    const matchesSearch =
      !containerSearch ||
      c.name.toLowerCase().includes(containerSearch.toLowerCase()) ||
      c.image.toLowerCase().includes(containerSearch.toLowerCase()) ||
      c.id.toLowerCase().includes(containerSearch.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'running' && c.state === 'running') ||
      (statusFilter === 'exited' && c.state !== 'running');

    return matchesSearch && matchesStatus;
  });

  const filteredLogLines = (logs || '')
    .split('\n')
    .filter((line) => !logFilter || line.toLowerCase().includes(logFilter.toLowerCase()));

  return (
    <div className="space-y-6">
      {hasError && (
        <Card className="border-rose-900/50 bg-rose-950/20">
          <CardContent className="p-4 font-mono text-xs space-y-2">
            <div className="text-rose-400 font-semibold">
              {permissionIssue ? 'DOCKER PERMISSION DENIED' : 'DOCKER UNAVAILABLE'}
            </div>
            <div className="text-neutral-300">{dockerData.error}</div>
            {dockerData.hint && (
              <div className="text-neutral-400 text-[11px] leading-relaxed">
                Fix: {dockerData.hint}
              </div>
            )}
            <div className="text-neutral-500 text-[10px]">
              Run diagnostics: <code className="text-neutral-300">sudo bash /opt/system-ops/scripts/debug-docker.sh</code>
            </div>
          </CardContent>
        </Card>
      )}

      {dockerData?.usedSudo && dockerData?.daemonReachable && (
        <div className="font-mono text-[10px] text-amber-400/90 px-1">
          Docker commands running via sudo fallback. Add ops to docker group for direct access.
        </div>
      )}

      {/* ─── Top Telemetry Summary Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 font-mono">
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>TOTAL CONTAINERS</span>
              <Badge variant="neutral">DOCKER</Badge>
            </div>
            <div className="text-2xl font-bold text-white">{total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>RUNNING</span>
              <Badge variant="ok">ONLINE</Badge>
            </div>
            <div className="text-2xl font-bold text-emerald-400">{running}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>STOPPED / EXITED</span>
              <Badge variant={exited > 0 ? 'warn' : 'neutral'}>
                {exited > 0 ? `${exited} DOWN` : 'CLEAN'}
              </Badge>
            </div>
            <div className="text-2xl font-bold text-neutral-300">{exited}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>NETWORKS</span>
              <Badge variant="blue">NET</Badge>
            </div>
            <div className="text-2xl font-bold text-white">{networkCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-neutral-400">
              <span>ACTIVE FOOTPRINT</span>
              <Badge variant="blue">STATS</Badge>
            </div>
            <div className="text-2xl font-bold text-white truncate">
              {dockerData?.memoryFormatted || `${running} active`}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main Section: Containers Table + Live Log Terminal ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-260px)]">
        {/* Left Column: Container Fleet (6 cols) */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle>Containers ({filteredContainers.length})</CardTitle>
                <Badge variant={running > 0 ? 'ok' : 'neutral'} className="text-[9px]">
                  DAEMON
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter containers..."
                  value={containerSearch}
                  onChange={(e) => setContainerSearch(e.target.value)}
                  className="h-7 rounded border border-[#262626] bg-[#0d0d0d] px-2 font-mono text-[11px] text-white placeholder-neutral-500 outline-none w-32 md:w-40 theme-input"
                />
                <Button variant="secondary" size="sm" onClick={onRefresh} className="font-mono text-[11px] h-7">
                  REFRESH
                </Button>
              </div>
            </CardHeader>

            {/* Filter Tabs */}
            <div className="px-4 py-2 border-b border-[#141414] flex gap-2 font-mono text-[11px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-[#1f1f1f] text-white font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                All ({total})
              </button>
              <button
                onClick={() => setStatusFilter('running')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  statusFilter === 'running'
                    ? 'bg-[#1f1f1f] text-emerald-400 font-semibold'
                    : 'text-neutral-400 hover:text-emerald-400'
                }`}
              >
                Running ({running})
              </button>
              <button
                onClick={() => setStatusFilter('exited')}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  statusFilter === 'exited'
                    ? 'bg-[#1f1f1f] text-neutral-300 font-semibold'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                Exited ({exited})
              </button>
            </div>

            <div className="divide-y divide-[#141414] max-h-[560px] overflow-y-auto font-mono text-xs flex-1">
              {filteredContainers.length === 0 ? (
                <div className="p-6 text-center text-neutral-500 font-sans">
                  {containers.length === 0
                    ? 'No Docker containers found on this host.'
                    : 'No containers match your search filter.'}
                </div>
              ) : (
                filteredContainers.map((c) => {
                  const isSelected = selectedContainer?.id === c.id;
                  const isRunning = c.state === 'running';

                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedContainer(c)}
                      className={`w-full flex items-center justify-between p-3.5 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#171717] border-l-2 border-emerald-400 font-medium'
                          : 'hover:bg-[#0d0d0d]'
                      }`}
                    >
                      <div className="min-w-0 pr-3 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white truncate text-[13px]">{c.name}</span>
                          <span className="text-[10px] text-neutral-500">({c.id})</span>
                        </div>
                        <div className="text-[11px] text-neutral-400 truncate">{c.image}</div>
                        {c.ports && c.ports !== '--' && (
                          <div className="text-[10px] text-neutral-500 truncate">
                            PORTS: {c.ports}
                          </div>
                        )}
                        {c.networks && (
                          <div className="text-[10px] text-neutral-500 truncate">
                            NET: {c.networks}
                          </div>
                        )}
                      </div>

                      <div className="text-right space-y-1 shrink-0">
                        <Badge variant={isRunning ? 'ok' : 'neutral'} className="text-[9px]">
                          {c.state.toUpperCase()}
                        </Badge>
                        <div className="text-[10px] text-neutral-400">{c.status}</div>
                        {isRunning && (
                          <div className="text-[10px] text-emerald-400/90 font-mono">
                            CPU: {c.cpu} | MEM: {c.memory}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Live Container Terminal Logs (6 cols) */}
        <div className="lg:col-span-6">
          <Card className="h-full flex flex-col min-h-[560px]">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CardTitle>
                  LOGS: {selectedContainer ? selectedContainer.name : 'SELECT CONTAINER'}
                </CardTitle>
                <Badge variant="neutral" className="text-[9px]">
                  STDOUT/STDERR
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
                  <option value="250">250 lines</option>
                  <option value="500">500 lines</option>
                </select>
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="h-7 rounded border border-[#262626] bg-[#0d0d0d] px-2 font-mono text-[11px] text-white placeholder-neutral-500 outline-none w-28 md:w-36 theme-input"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyLogs}
                  className="font-mono text-[11px] h-7"
                >
                  {copySuccess ? 'COPIED' : 'COPY'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedContainer && fetchLogs(selectedContainer.id)}
                  disabled={isLoadingLogs}
                  className="font-mono text-[11px] h-7"
                >
                  {isLoadingLogs ? '...' : 'TAIL'}
                </Button>
              </div>
            </CardHeader>

            <div className="flex-1 bg-[#020202] p-4 font-mono text-[11px] leading-relaxed text-neutral-300 overflow-y-auto max-h-[calc(100vh-320px)] select-text">
              {isLoadingLogs ? (
                <div className="text-neutral-500 font-sans">Tailing container logs...</div>
              ) : filteredLogLines.length === 0 ? (
                <div className="text-neutral-600 font-sans">No matching container log entries found.</div>
              ) : (
                filteredLogLines.map((line, idx) => {
                  const isErr = /error|fail|exception|fatal|panic/i.test(line);
                  const isWarn = /warn|alert/i.test(line);
                  return (
                    <div
                      key={idx}
                      className={`py-0.5 whitespace-pre-wrap break-all ${
                        isErr
                          ? 'text-rose-400 font-semibold'
                          : isWarn
                          ? 'text-amber-400'
                          : 'text-neutral-300'
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

      {/* ─── Docker Networks Table ─── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle>Networks ({networks.length})</CardTitle>
            <Badge variant="neutral" className="text-[9px]">BRIDGE / OVERLAY</Badge>
          </div>
          <Button variant="secondary" size="sm" onClick={onRefresh} className="font-mono text-[11px] h-7">
            REFRESH
          </Button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-[#141414] text-neutral-500 text-[10px] uppercase">
                <th className="px-4 py-2.5 text-left">Name</th>
                <th className="px-4 py-2.5 text-left">ID</th>
                <th className="px-4 py-2.5 text-left">Driver</th>
                <th className="px-4 py-2.5 text-left">Scope</th>
                <th className="px-4 py-2.5 text-left">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141414]">
              {networks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500 font-sans">
                    {hasError ? 'Cannot list networks — see error above.' : 'No Docker networks found.'}
                  </td>
                </tr>
              ) : (
                networks.map((n) => (
                  <tr key={n.id || n.name} className="hover:bg-[#0d0d0d]">
                    <td className="px-4 py-2.5 text-white font-semibold">{n.name}</td>
                    <td className="px-4 py-2.5 text-neutral-400">{n.id}</td>
                    <td className="px-4 py-2.5 text-neutral-300">{n.driver}</td>
                    <td className="px-4 py-2.5 text-neutral-400">{n.scope}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {n.internal && <Badge variant="neutral" className="text-[9px]">INTERNAL</Badge>}
                        {n.ipv6 && <Badge variant="blue" className="text-[9px]">IPV6</Badge>}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
