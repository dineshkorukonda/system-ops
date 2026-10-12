import React, { useState } from 'react';
import { Card, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';

export function ProcessMonitorView({
  processes = [],
  sort = 'cpu',
  setSort,
  onRefresh,
}) {
  const [search, setSearch] = useState('');

  const filtered = processes.filter((p) => {
    const s = search.toLowerCase().trim();
    if (!s) return true;
    return (
      String(p.pid).includes(s) ||
      p.user.toLowerCase().includes(s) ||
      p.command.toLowerCase().includes(s) ||
      (p.args && p.args.toLowerCase().includes(s))
    );
  });

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CardTitle>System Process Monitor</CardTitle>
          <Badge variant="ok">{filtered.length} PROCESSES</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search by PID, user, command..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 rounded border border-[var(--border-color)] bg-[var(--card-bg)] px-3 font-mono text-xs text-[var(--text-primary)] placeholder-neutral-500 outline-none hover:border-neutral-700 focus:border-neutral-400 w-48 sm:w-64 theme-input"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-8 rounded border border-[var(--border-color)] bg-[var(--card-bg)] px-2 font-mono text-xs text-[var(--text-secondary)] outline-none hover:border-neutral-700 focus:border-neutral-400 theme-input"
          >
            <option value="cpu">Sort by % CPU</option>
            <option value="mem">Sort by % RAM</option>
          </select>
          <Button variant="secondary" size="sm" onClick={onRefresh} className="font-mono text-xs">
            REFRESH
          </Button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto max-h-[calc(100vh-220px)] overflow-y-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 z-10 border-b border-[var(--border-color)] bg-[var(--card-bg)] text-[10px] uppercase text-[var(--text-muted)] theme-header">
            <tr>
              <th className="px-4 py-2.5 w-20">PID</th>
              <th className="px-4 py-2.5 w-28">User</th>
              <th className="px-4 py-2.5 w-20">% CPU</th>
              <th className="px-4 py-2.5 w-20">% RAM</th>
              <th className="px-4 py-2.5 w-24">RSS</th>
              <th className="px-4 py-2.5 w-20">State</th>
              <th className="px-4 py-2.5">Command</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)] font-sans">
                  No matching active processes found.
                </td>
              </tr>
            ) : (
              filtered.map((p, idx) => (
                <tr key={idx} className="hover:bg-[var(--card-bg)]">
                  <td className="px-4 py-2 font-semibold text-[var(--text-secondary)]">
                    {p.pid}
                  </td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{p.user}</td>
                  <td className="px-4 py-2 font-bold">
                    <span
                      className={
                        p.cpuPercent > 50
                          ? 'text-[var(--error)]'
                          : p.cpuPercent > 10
                          ? 'text-[var(--warning)]'
                          : 'text-[var(--text-secondary)]'
                      }
                    >
                      {Number.isFinite(p.cpuPercent) ? `${p.cpuPercent}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{p.memPercent ? `${p.memPercent}%` : '--'}</td>
                  <td className="px-4 py-2 text-[var(--text-secondary)]">{p.formattedRss || '0 B'}</td>
                  <td className="px-4 py-2">
                    <Badge variant={p.state === 'R' ? 'ok' : 'neutral'} className="text-[9px] px-1.5 py-0">
                      {p.state || 'S'}
                    </Badge>
                  </td>
                  <td
                    className="px-4 py-2 text-[var(--text-secondary)] max-w-xs truncate text-xs"
                    title={p.args || p.command}
                  >
                    {p.args || p.command}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
