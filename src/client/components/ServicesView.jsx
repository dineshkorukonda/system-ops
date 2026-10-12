import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export function ServicesView({ servicesData, onRefresh }) {
  const services = servicesData?.services || [];

  const [selectedUnit, setSelectedUnit] = useState(null); // string (e.g., 'nginx')
  const [logLines, setLogLines] = useState('100');
  const [unitLogs, setUnitLogs] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const logController = useRef(null);

  // Count failed units
  const failedUnits = services.filter(
    (s) => s.activeState === 'failed' || s.subState === 'failed'
  );


  // Fetch unit logs when selected or line count changes
  useEffect(() => {
    if (!selectedUnit) return;
    fetchUnitLogs();
    return () => logController.current?.abort();
  }, [selectedUnit, logLines]);

  const fetchUnitLogs = async () => {
    if (!selectedUnit) return;
    logController.current?.abort();
    const controller = new AbortController(); logController.current = controller;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(
        `/api/v2/services/logs?unit=${encodeURIComponent(selectedUnit)}&lines=${logLines}`, { signal: controller.signal }
      );
      if (res.ok) {
        const data = await res.json();
        if (!controller.signal.aborted) setUnitLogs(data.output || data.error || 'No journal logs found for this unit.');
      } else {
        setUnitLogs(`Failed to fetch journal logs (HTTP ${res.status})`);
      }
    } catch (err) {
      if (err.name !== 'AbortError') setUnitLogs(`Error loading logs: ${err.message}`);
    } finally {
      if (logController.current === controller) setIsLoadingLogs(false);
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

  return (
    <div className="space-y-6">
      {/* ─── Top Telemetry Summary Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
              <span>SYSTEMD UNITS</span>
              <Badge variant="ok">PID 1</Badge>
            </div>
            <div className="text-2xl font-bold text-[var(--success)]">
              {servicesData?.activeCount || 0}{' '}
              <span className="text-xs text-[var(--text-muted)] font-normal">
                of {services.length} active
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
              <span>UNIT HEALTH</span>
              <Badge variant={failedUnits.length > 0 ? 'err' : 'ok'}>
                {failedUnits.length > 0 ? `${failedUnits.length} FAILED` : 'HEALTHY'}
              </Badge>
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {failedUnits.length === 0 ? '0' : failedUnits.length}{' '}
              <span className="text-xs text-[var(--text-muted)] font-normal">
                {failedUnits.length === 0 ? 'all units active' : 'units degraded'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-1">
            <div className="flex justify-between items-center text-xs text-[var(--text-secondary)]">
              <span>SERVICES MEMORY</span>
              <Badge variant="blue">RSS</Badge>
            </div>
            <div className="text-2xl font-bold text-[var(--text-primary)]">
              {servicesData?.formattedTotalMemory || '0 B'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Main Grid: Services Fleet & Live Journal Terminal ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-260px)]">
        {/* Left Column: Services Fleet List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Systemd Services ({services.length})</CardTitle>
              <Button
                variant="secondary"
                size="sm"
                onClick={onRefresh}
                className="font-mono text-xs"
              >
                REFRESH
              </Button>
            </CardHeader>
            <div className="divide-y divide-[var(--border-color)] max-h-[560px] overflow-y-auto font-mono text-xs flex-1">
              {services.length === 0 ? (
                <div className="p-4 text-center text-[var(--text-muted)] font-sans">
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
                          ? 'bg-[var(--surface-raised)] border-l-2 border-white font-medium'
                          : 'hover:bg-[var(--card-bg)]'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-[var(--text-primary)] truncate">{s.unit}</div>
                        <div className="text-[10px] text-[var(--text-muted)] truncate">
                          PID: {s.pid || '--'} | SUBSTATE: {s.subState} | USER: {s.user}
                        </div>
                      </div>
                      <div className="text-right space-y-1 shrink-0">
                        <Badge
                          variant={
                            s.active
                              ? 'ok'
                              : s.activeState === 'failed'
                              ? 'err'
                              : 'neutral'
                          }
                          className="text-[9px]"
                        >
                          {(s.activeState || 'UNKNOWN').toUpperCase()}
                        </Badge>
                        <div className="text-[10px] text-[var(--text-secondary)]">
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
          <Card className="h-full flex flex-col min-h-[560px]">
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopyLogs(unitLogs)}
                  className="font-mono text-xs h-7"
                >
                  {copySuccess ? 'COPIED' : 'COPY'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchUnitLogs}
                  disabled={isLoadingLogs}
                  className="font-mono text-xs h-7"
                >
                  {isLoadingLogs ? '...' : 'TAIL'}
                </Button>
              </div>
            </CardHeader>
            <div className="flex-1 bg-[var(--bg-main)] p-4 font-mono text-xs leading-relaxed text-[var(--text-secondary)] overflow-y-auto max-h-[calc(100vh-320px)] select-text">
              {isLoadingLogs ? (
                <div className="text-[var(--text-muted)] font-sans">Fetching journalctl log tail...</div>
              ) : filteredLogLines.length === 0 ? (
                <div className="text-[var(--text-muted)] font-sans">No matching journalctl entries found.</div>
              ) : (
                filteredLogLines.map((line, idx) => {
                  const isErr = /error|fail|exception|fatal|panic/i.test(line);
                  const isWarn = /warn|alert/i.test(line);
                  return (
                    <div
                      key={idx}
                      className={`py-0.5 whitespace-pre-wrap break-all ${
                        isErr
                          ? 'text-[var(--error)] font-semibold'
                          : isWarn
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--text-secondary)]'
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
