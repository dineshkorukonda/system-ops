import React from 'react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';

export function TopBar({
  activeTabTitle,
  siteSubtitle = 'Operations Console',
  lastUpdated,
  isSyncing,
  onSync,
  refreshInterval,
  setRefreshInterval,
  theme,
  toggleTheme,
  onLogout,
  onOpenMobileMenu,
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-[#1f1f1f] bg-[#000000] px-4 md:px-6 theme-header">
      {/* Left: Mobile Toggle & Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="flex h-8 w-8 items-center justify-center rounded border border-[#262626] text-xs font-mono md:hidden hover:bg-[#141414]"
        >
          MENU
        </button>
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-white tracking-tight">
            {activeTabTitle}
          </span>
          <span className="font-mono text-neutral-500 text-[11px] hidden sm:inline truncate max-w-[200px]">
            // {siteSubtitle.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Right: Controls & Actions */}
      <div className="flex items-center gap-2.5">
        {/* Sync status */}
        <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-neutral-400 bg-[#0d0d0d] px-2.5 py-1 rounded border border-[#1f1f1f] theme-header">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>{lastUpdated ? lastUpdated.toLocaleTimeString() : '--:--:--'}</span>
        </div>

        <Badge variant="ok" className="hidden lg:inline-flex">
          HEALTHY
        </Badge>

        {/* Auto-refresh interval */}
        <select
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          className="h-8 rounded border border-[#262626] bg-[#0d0d0d] px-2 font-mono text-xs text-neutral-300 outline-none hover:border-neutral-700 focus:border-neutral-400 theme-input"
          title="Auto Refresh Rate"
        >
          <option value="10">10s</option>
          <option value="30">30s</option>
          <option value="60">60s</option>
          <option value="0">Off</option>
        </select>

        {/* Manual Sync Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="font-mono text-[11px]"
        >
          {isSyncing ? 'SYNCING...' : 'SYNC'}
        </Button>

        {/* Pure Black / White Theme Toggle */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleTheme}
          className="font-mono text-[11px]"
          title="Toggle Monochrome Theme"
        >
          {theme === 'dark' ? 'LIGHT' : 'DARK'}
        </Button>

        {/* Logout Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onLogout}
          className="font-mono text-[11px] text-rose-400 hover:text-rose-300 border-rose-950/40 hover:bg-rose-950/20"
        >
          LOGOUT
        </Button>
      </div>
    </header>
  );
}
