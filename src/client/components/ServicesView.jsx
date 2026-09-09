import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';

export function ServicesView({ servicesData, onRefresh }) {
  const services = servicesData?.services || [];
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [logLines, setLogLines] = useState('100');
  const [unitLogs, setUnitLogs] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilter, setLogFilter] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const failedUnits = services.filter((s) => s.activeState === 'failed' || s.subState === 'failed');

  useEffect(() => {
    if (!selectedUnit && services.length > 0) setSelectedUnit(services[0].name);
  }, [services, selectedUnit]);

  useEffect(() => {
    if (!selectedUnit) return;
    fetchUnitLogs();
  }, [selectedUnit, logLines]);

  const fetchUnitLogs = async () => {
    if (!selectedUnit) return;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/v2/services/logs?unit=${encodeURIComponent(selectedUnit)}&lines=${logLines}`);
      if (res.ok) {
        const data = await res.json();
        setUnitLogs(data.output || 'No journal logs found.');
      } else {
        setUnitLogs(`Failed to fetch logs (HTTP ${res.status})`);
      }
    } catch (err) {
      setUnitLogs(`Error loading logs: ${err.message}`);
    } finally {
      setIsLoadingLogs(false);
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 space-y-1">
            <span className="ops-label">Active units</span>
            <div className="ops-metric text-[var(--success)]">
              {servicesData?.activeCount || 0}
              <span className="text-sm font-normal text-[var(--text-muted)] ml-2">of {services.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <span className="ops-label">Health</span>
            <div className="flex items-center gap-2">
              <div className="ops-metric">{failedUnits.length}</div>
              <Badge variant={failedUnits.length > 0 ? 'err' : 'ok'}>
                {failedUnits.length > 0 ? 'Issues detected' : 'All healthy'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-1">
            <span className="ops-label">Total memory</span>
            <div className="ops-metric">{servicesData?.formattedTotalMemory || '0 B'}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-260px)]">
        <div className="lg:col-span-5">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Services ({services.length})</CardTitle>
              <Button variant="secondary" size="sm" onClick={onRefresh}>Refresh</Button>
            </CardHeader>
            <div className="flex-1 max-h-[560px] overflow-y-auto">
              {services.length === 0 ? (
                <div className="ops-empty">No systemd services configured.</div>
              ) : (
                services.map((s) => {
                  const isSelected = selectedUnit === s.name;
                  return (
                    <button
                      key={s.name}
                      onClick={() => setSelectedUnit(s.name)}
                      className={cn(
                        'w-full flex items-center justify-between p-4 text-left border-b border-[var(--border)] transition-colors',
                        isSelected ? 'bg-[var(--accent-muted)] border-l-2 border-l-[var(--accent)]' : 'hover:bg-[var(--surface-raised)]'
                      )}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-medium text-[var(--text-primary)] truncate">{s.unit}</div>
                        <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                          PID {s.pid || '—'} · {s.subState} · {s.user}
                        </div>
                      </div>
                      <div className="text-right space-y-1 shrink-0">
                        <Badge variant={s.active ? 'ok' : s.activeState === 'failed' ? 'err' : 'neutral'}>
                          {s.activeState || 'unknown'}
                        </Badge>
                        <div className="text-xs text-[var(--text-muted)]">{s.formattedMemory || '—'}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-7">
          <Card className="h-full flex flex-col min-h-[560px]">
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{selectedUnit ? `${selectedUnit}.service` : 'Select a service'}</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={logLines} onChange={(e) => setLogLines(e.target.value)} className="ops-input h-8 px-2 text-xs">
                  <option value="50">50 lines</option>
                  <option value="100">100 lines</option>
                  <option value="200">200 lines</option>
                  <option value="500">500 lines</option>
                </select>
                <input type="text" placeholder="Filter logs…" value={logFilter} onChange={(e) => setLogFilter(e.target.value)} className="ops-input h-8 px-2 text-xs w-32" />
                <Button variant="secondary" size="sm" onClick={() => handleCopyLogs(unitLogs)}>{copySuccess ? 'Copied' : 'Copy'}</Button>
                <Button variant="outline" size="sm" onClick={fetchUnitLogs} disabled={isLoadingLogs}>{isLoadingLogs ? 'Loading…' : 'Reload'}</Button>
              </div>
            </CardHeader>
            <div className="flex-1 bg-[var(--surface-muted)] p-4 ops-log text-[var(--text-secondary)] overflow-y-auto max-h-[calc(100vh-320px)] rounded-b-[0.75rem]">
              {isLoadingLogs ? (
                <div className="text-[var(--text-muted)]">Loading logs…</div>
              ) : filteredLogLines.length === 0 ? (
                <div className="text-[var(--text-muted)]">No matching log entries.</div>
              ) : (
                filteredLogLines.map((line, idx) => {
                  const isErr = /error|fail|exception|fatal|panic/i.test(line);
                  const isWarn = /warn|alert/i.test(line);
                  return (
                    <div key={idx} className={cn('py-0.5 whitespace-pre-wrap break-all', isErr ? 'text-[var(--danger)]' : isWarn ? 'text-[var(--warning)]' : '')}>
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
