import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export function BackupsView({
  sources = [],
  files = [],
  onRefreshFiles,
}) {
  const [selectedSource, setSelectedSource] = useState('');
  const [linesCount, setLinesCount] = useState('200');
  const [logTailData, setLogTailData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [reverseOrder, setReverseOrder] = useState(true);
  const [logFilter, setLogFilter] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (sources.length > 0 && !selectedSource) {
      setSelectedSource(sources[0].id);
    }
  }, [sources, selectedSource]);

  useEffect(() => {
    if (selectedSource) {
      fetchLogTail();
    }
  }, [selectedSource, linesCount]);

  const fetchLogTail = async () => {
    if (!selectedSource) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/v2/logs/tail?id=${encodeURIComponent(selectedSource)}&lines=${linesCount}`
      );
      if (res.ok) {
        const data = await res.json();
        setLogTailData(data);
      }
    } catch (err) {
      setLogTailData({ output: `Error fetching log tail: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLogs = () => {
    if (!logTailData?.output) return;
    navigator.clipboard.writeText(logTailData.output);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  let rawLines = (logTailData?.output || '').split('\n');
  if (logFilter) {
    rawLines = rawLines.filter((l) => l.toLowerCase().includes(logFilter.toLowerCase()));
  }
  if (reverseOrder) {
    rawLines = rawLines.slice().reverse();
  }

  const backupStatus = logTailData?.backupStatus || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100vh-140px)]">
      {/* Left Column: Source Selection, Health Heuristics, Dump Downloads (5 cols) */}
      <div className="lg:col-span-5 space-y-4">
        {/* Source Selector Card */}
        <Card>
          <CardHeader>
            <CardTitle>Log Source Selector</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 font-mono text-xs">
            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="w-full h-8 rounded border border-[#262626] bg-[#0d0d0d] px-3 text-xs text-white outline-none theme-input"
            >
              {sources.length === 0 ? (
                <option value="">No log sources configured</option>
              ) : (
                sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type}: {s.target})
                  </option>
                ))
              )}
            </select>
            <div className="flex gap-2">
              <select
                value={linesCount}
                onChange={(e) => setLinesCount(e.target.value)}
                className="h-8 flex-1 rounded border border-[#262626] bg-[#0d0d0d] px-2 text-xs text-white outline-none theme-input"
              >
                <option value="50">50 lines</option>
                <option value="100">100 lines</option>
                <option value="200">200 lines</option>
                <option value="500">500 lines</option>
              </select>
              <Button size="sm" onClick={fetchLogTail} disabled={isLoading} className="font-mono text-[11px]">
                {isLoading ? 'FETCHING...' : 'FETCH TAIL'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Latest Heuristic Health Banner */}
        <Card>
          <CardHeader>
            <CardTitle>Backup Health Status</CardTitle>
            <Badge
              variant={
                backupStatus.status === 'success'
                  ? 'ok'
                  : backupStatus.status === 'failed'
                  ? 'err'
                  : 'warn'
              }
            >
              {(backupStatus.status || 'UNKNOWN').toUpperCase()}
            </Badge>
          </CardHeader>
          <CardContent className="p-4 space-y-2 font-mono text-xs">
            <div className="font-medium text-white">
              {backupStatus.message || 'Select a log source to inspect'}
            </div>
            <div className="text-[11px] text-neutral-500 pt-1 border-t border-[#141414]">
              TARGET: {logTailData?.target || selectedSource || '--'}
            </div>
          </CardContent>
        </Card>

        {/* PostgreSQL Dump Archives */}
        <Card>
          <CardHeader>
            <CardTitle>Backup Dump Files ({files.length})</CardTitle>
            <Button variant="secondary" size="sm" onClick={onRefreshFiles} className="font-mono text-[10px] h-6 px-2">
              REFRESH
            </Button>
          </CardHeader>
          <div className="divide-y divide-[#141414] max-h-[260px] overflow-y-auto font-mono text-xs">
            {files.length === 0 ? (
              <div className="p-4 text-center text-neutral-500 font-sans">
                No backup dump files found in storage directory.
              </div>
            ) : (
              files.map((f, idx) => (
                <div key={idx} className="flex items-center justify-between p-3">
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-neutral-200 truncate text-[11px]">
                      {f.name}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {f.formattedSize} | {f.formattedDate}
                    </div>
                  </div>
                  <a
                    href={`/api/v2/backups/download?filename=${encodeURIComponent(f.name)}`}
                    download
                    className="inline-flex items-center justify-center rounded border border-[#262626] bg-[#121212] px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-[#1f1f1f] transition-colors"
                  >
                    DOWNLOAD
                  </a>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Right Column: Log Terminal (7 cols) */}
      <div className="lg:col-span-7">
        <Card className="h-full flex flex-col min-h-[500px]">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Log Tail Terminal</CardTitle>
            <div className="flex items-center gap-2.5">
              <label className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reverseOrder}
                  onChange={(e) => setReverseOrder(e.target.checked)}
                  className="rounded border-[#262626] bg-[#0d0d0d] text-white"
                />
                <span>NEWEST FIRST</span>
              </label>
              <input
                type="text"
                placeholder="Search log..."
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="h-7 rounded border border-[#262626] bg-[#0d0d0d] px-2 font-mono text-[11px] text-white placeholder-neutral-500 outline-none w-32 theme-input"
              />
              <Button variant="secondary" size="sm" onClick={handleCopyLogs} className="font-mono text-[11px] h-7">
                {copySuccess ? 'COPIED' : 'COPY'}
              </Button>
            </div>
          </CardHeader>
          <div className="flex-1 bg-[#020202] p-4 font-mono text-[11px] leading-relaxed text-neutral-300 overflow-y-auto max-h-[calc(100vh-230px)] select-text">
            {isLoading ? (
              <div className="text-neutral-500 font-sans">Fetching log tail...</div>
            ) : rawLines.length === 0 ? (
              <div className="text-neutral-600 font-sans">No log entries found.</div>
            ) : (
              rawLines.map((line, idx) => {
                const isHeader = /^=== Backup started/i.test(line);
                const isSuccess = /✓|Backup successful|SUCCESS/i.test(line);
                const isFail = /✗|FAILED|error|exception/i.test(line);
                return (
                  <div
                    key={idx}
                    className={`py-0.5 whitespace-pre-wrap break-all ${
                      isHeader
                        ? 'text-neutral-500 font-semibold'
                        : isSuccess
                        ? 'text-emerald-400 font-semibold'
                        : isFail
                        ? 'text-rose-400 font-semibold'
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
  );
}
