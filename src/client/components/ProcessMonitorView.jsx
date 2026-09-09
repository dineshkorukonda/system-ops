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
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search by PID, user, command..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 rounded border border-[#262626] bg-[#0d0d0d] px-3 font-mono text-xs text-white placeholder-neutral-500 outline-none hover:border-neutral-700 focus:border-neutral-400 w-48 sm:w-64 theme-input"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="h-8 rounded border border-[#262626] bg-[#0d0d0d] px-2 font-mono text-xs text-neutral-300 outline-none hover:border-neutral-700 focus:border-neutral-400 theme-input"
          >
            <option value="cpu">Sort by % CPU</option>
            <option value="mem">Sort by % RAM</option>
          </select>
          <Button variant="secondary" size="sm" onClick={onRefresh} className="font-mono text-[11px]">
            REFRESH
          </Button>
        </div>
      </CardHeader>
      <div className="overflow-x-auto max-h-[calc(100vh-220px)] overflow-y-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead className="sticky top-0 z-10 border-b border-[#1a1a1a] bg-[#0c0c0c] text-[10px] uppercase text-neutral-500 theme-header">
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
          <tbody className="divide-y divide-[#141414]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500 font-sans">
                  No matching active processes found.
                </td>
              </tr>
            ) : (
              filtered.map((p, idx) => (
                <tr key={idx} className="hover:bg-[#0d0d0d]">
                  <td className="px-4 py-2 font-semibold text-neutral-300">
                    {p.pid}
                  </td>
                  <td className="px-4 py-2 text-neutral-400">{p.user}</td>
                  <td className="px-4 py-2 font-bold">
                    <span
                      className={
                        p.cpuPercent > 50
                          ? 'text-rose-400'
                          : p.cpuPercent > 10
                          ? 'text-amber-400'
                          : 'text-neutral-300'
                      }
                    >
                      {p.cpuPercent}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-400">{p.memPercent ? `${p.memPercent}%` : '--'}</td>
                  <td className="px-4 py-2 text-neutral-400">{p.formattedRss || '0 B'}</td>
                  <td className="px-4 py-2">
                    <Badge variant={p.state === 'R' ? 'ok' : 'neutral'} className="text-[9px] px-1.5 py-0">
                      {p.state || 'S'}
                    </Badge>
                  </td>
                  <td
                    className="px-4 py-2 text-neutral-400 max-w-xs truncate text-[11px]"
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
