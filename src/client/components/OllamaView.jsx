import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export function OllamaView({
  statusData,
  models = [],
  logs = '',
  logLines,
  setLogLines,
  onRefreshLogs,
}) {
  const sys = statusData?.systemd || {};
  const listener = statusData?.listener || {};
  const api = statusData?.ollamaApi || {};

  // Quick Chat Probe state
  const [selectedModel, setSelectedModel] = useState('llama3.2:3b');
  const [prompt, setPrompt] = useState('OK');
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const [logFilter, setLogFilter] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  const handleProbe = async () => {
    setIsProbing(true);
    setProbeResult(null);
    try {
      const res = await fetch('/api/test-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, prompt }),
      });
      const data = await res.json();
      setProbeResult(data);
    } catch (err) {
      setProbeResult({ ok: false, error: err.message, latencyMs: 0 });
    } finally {
      setIsProbing(false);
    }
  };

  const handleCopyLogs = () => {
    if (!logs) return;
    navigator.clipboard.writeText(logs);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const filteredLogs = (logs || '')
    .split('\n')
    .filter((line) => !logFilter || line.toLowerCase().includes(logFilter.toLowerCase()));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-140px)]">
      {/* Left Column: Status, Quick Probe, Models (5 cols) */}
      <div className="lg:col-span-5 space-y-4">
        {/* Service Status Card */}
        <Card>
          <CardHeader>
            <CardTitle>Ollama Service Status</CardTitle>
            <Badge variant={sys.isActive ? 'ok' : 'err'}>
              {(sys.activeState || 'OFFLINE').toUpperCase()}
            </Badge>
          </CardHeader>
          <CardContent className="p-4 space-y-2.5 font-mono text-xs">
            <div className="flex justify-between py-1 border-b border-[var(--border)]">
              <span className="text-[var(--text-muted)]">UNIT</span>
              <span>ollama.service</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--border)]">
              <span className="text-[var(--text-muted)]">SUBSTATE / PID</span>
              <span>{sys.subState || '--'} (PID: {sys.pid || '--'})</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--border)]">
              <span className="text-[var(--text-muted)]">PROCESS USER</span>
              <span>{sys.user || 'ollama'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--border)]">
              <span className="text-[var(--text-muted)]">SOCKET BINDING</span>
              <Badge variant={listener.listening ? 'ok' : 'err'} className="text-[9px]">
                {listener.listening ? '127.0.0.1:11434 BOUND' : 'UNBOUND'}
              </Badge>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--text-muted)]">API HEALTH &amp; LATENCY</span>
              <span className="flex items-center gap-1.5">
                <Badge variant={api.ok ? 'ok' : 'err'} className="text-[9px]">
                  {api.ok ? 'HTTP 200' : 'FAIL'}
                </Badge>
                <span className="text-[var(--text-secondary)]">({api.latencyMs || 0} ms)</span>
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Quick Chat Probe */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Inference Probe</CardTitle>
            <span className="font-mono text-[10px] text-[var(--text-muted)]">Token-Capped</span>
          </CardHeader>
          <CardContent className="p-4 space-y-3 font-mono text-xs">
            <div className="flex gap-2">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-8 flex-1 rounded ops-input border px-2 text-xs text-[var(--text-primary)] outline-none ops-input"
              >
                {models.length > 0 ? (
                  models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))
                ) : (
                  <option value="llama3.2:3b">llama3.2:3b</option>
                )}
              </select>
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Test prompt..."
                className="h-8 flex-1 rounded ops-input border px-3 text-xs text-[var(--text-primary)] placeholder-neutral-500 outline-none ops-input"
              />
              <Button size="sm" onClick={handleProbe} disabled={isProbing}>
                {isProbing ? 'TESTING...' : 'PROBE'}
              </Button>
            </div>

            {probeResult && (
              <div className="rounded border border-[var(--border)] bg-[var(--surface-muted)] p-3 space-y-2 text-xs ">
                <div className="flex justify-between items-center">
                  <Badge variant={probeResult.ok ? 'ok' : 'err'}>
                    {probeResult.ok ? 'PASS' : 'FAIL'}
                  </Badge>
                  <span className="text-[var(--text-secondary)]">LATENCY: {probeResult.latencyMs || 0} ms</span>
                </div>
                <div className="text-[var(--text-secondary)] text-[10px] uppercase">RESPONSE:</div>
                <pre className="text-[11px] text-neutral-200 bg-[var(--surface-raised)] p-2 rounded max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {probeResult.response || probeResult.error || '--'}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Installed Models Registry */}
        <Card>
          <CardHeader>
            <CardTitle>Installed Models ({models.length})</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto max-h-[220px] overflow-y-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--surface-raised)] text-[10px] uppercase text-[var(--text-muted)] ">
                <tr>
                  <th className="px-4 py-2">Model</th>
                  <th className="px-4 py-2">Size</th>
                  <th className="px-4 py-2">Modified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {models.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-center text-[var(--text-muted)] font-sans">
                      No models installed in Ollama.
                    </td>
                  </tr>
                ) : (
                  models.map((m, idx) => (
                    <tr key={idx} className="hover:bg-[var(--surface-raised)]">
                      <td className="px-4 py-2 font-semibold text-[var(--text-primary)]">{m.name}</td>
                      <td className="px-4 py-2 text-[var(--text-secondary)]">{m.size}</td>
                      <td className="px-4 py-2 text-[var(--text-muted)] text-[11px]">{m.modified}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Right Column: Systemd Journal Logs (7 cols) */}
      <div className="lg:col-span-7">
        <Card className="h-full flex flex-col min-h-[500px]">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CardTitle>journalctl -u ollama</CardTitle>
              <Badge variant="neutral" className="text-[9px]">SYSTEMD</Badge>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={logLines}
                onChange={(e) => setLogLines(e.target.value)}
                className="h-7 rounded ops-input border px-2 font-mono text-[11px] text-[var(--text-secondary)] outline-none hover:border-neutral-700 focus:border-neutral-400 ops-input"
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
                className="h-7 rounded ops-input border px-2 font-mono text-[11px] text-[var(--text-primary)] placeholder-neutral-500 outline-none w-32 ops-input"
              />
              <Button variant="secondary" size="sm" onClick={handleCopyLogs}>
                {copySuccess ? 'COPIED' : 'COPY'}
              </Button>
              <Button variant="outline" size="sm" onClick={onRefreshLogs}>
                TAIL
              </Button>
            </div>
          </CardHeader>
          <div className="flex-1 bg-[var(--surface-muted)] p-4 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)] overflow-y-auto max-h-[calc(100vh-230px)] select-text">
            {filteredLogs.length === 0 ? (
              <div className="text-neutral-600 font-sans">No matching journal log lines.</div>
            ) : (
              filteredLogs.map((line, idx) => {
                const isErr = /error|failed|fatal|panic/i.test(line);
                return (
                  <div
                    key={idx}
                    className={`py-0.5 whitespace-pre-wrap break-all ${
                      isErr ? 'text-rose-400 font-semibold' : 'text-[var(--text-secondary)]'
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
