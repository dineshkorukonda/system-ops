import React from 'react';
import { Button } from './ui/Button';

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
    <header className="ops-header sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b px-4 md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] md:hidden"
          aria-label="Open menu"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-[var(--text-primary)] truncate">{activeTabTitle}</h1>
          <p className="text-xs text-[var(--text-muted)] truncate hidden sm:block">{siteSubtitle}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--text-muted)] bg-[var(--surface-raised)] px-2.5 py-1.5 rounded-lg border border-[var(--border)]">
          <span className={`h-1.5 w-1.5 rounded-full ${isSyncing ? 'bg-[var(--warning)] animate-pulse' : 'bg-[var(--success)]'}`} />
          <span>{lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}</span>
        </div>

        <select
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          className="ops-input h-9 px-2 text-xs hidden sm:block"
          title="Auto refresh interval"
        >
          <option value="10">10s</option>
          <option value="30">30s</option>
          <option value="60">60s</option>
          <option value="0">Off</option>
        </select>

        <Button variant="secondary" size="sm" onClick={onSync} disabled={isSyncing}>
          {isSyncing ? 'Refreshing…' : 'Refresh'}
        </Button>

        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </Button>

        <Button variant="ghost" size="sm" onClick={onLogout} className="hidden sm:inline-flex">
          Sign out
        </Button>
      </div>
    </header>
  );
}
