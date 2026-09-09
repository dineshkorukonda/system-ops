import React, { useState } from 'react';
import { Card, CardHeader, CardTitle } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell, TableEmpty } from './ui/Table';

export function ProcessMonitorView({ processes = [], sort = 'cpu', setSort, onRefresh }) {
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
          <CardTitle>Processes</CardTitle>
          <Badge variant="ok">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search PID, user, command…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ops-input h-9 px-3 text-sm w-48 sm:w-64"
          />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="ops-input h-9 px-2 text-sm">
            <option value="cpu">Sort by CPU</option>
            <option value="mem">Sort by memory</option>
          </select>
          <Button variant="secondary" size="sm" onClick={onRefresh}>Refresh</Button>
        </div>
      </CardHeader>
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>PID</TableHeader>
              <TableHeader>User</TableHeader>
              <TableHeader>CPU</TableHeader>
              <TableHeader>RAM</TableHeader>
              <TableHeader>RSS</TableHeader>
              <TableHeader>State</TableHeader>
              <TableHeader>Command</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmpty colSpan={7}>No matching processes found.</TableEmpty>
            ) : (
              filtered.map((p, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-xs font-medium text-[var(--text-primary)]">{p.pid}</TableCell>
                  <TableCell>{p.user}</TableCell>
                  <TableCell>
                    <span className={p.cpuPercent > 50 ? 'text-[var(--danger)]' : p.cpuPercent > 10 ? 'text-[var(--warning)]' : ''}>
                      {p.cpuPercent}%
                    </span>
                  </TableCell>
                  <TableCell>{p.memPercent ? `${p.memPercent}%` : '—'}</TableCell>
                  <TableCell>{p.formattedRss || '0 B'}</TableCell>
                  <TableCell><Badge variant={p.state === 'R' ? 'ok' : 'neutral'}>{p.state || 'S'}</Badge></TableCell>
                  <TableCell className="max-w-xs truncate font-mono text-xs" title={p.args || p.command}>{p.args || p.command}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
