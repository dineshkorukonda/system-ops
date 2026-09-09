import React from 'react';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { Separator } from '../components/ui/Separator';

const TITLES = {
  overview: 'Dashboard',
  system: 'System Health',
  processes: 'Processes',
  docker: 'Docker',
  pm2: 'PM2 Fleet',
  services: 'Services',
  ollama: 'Ollama',
  traffic: 'Traffic',
  backups: 'Backups',
  databases: 'Databases',
  security: 'Security',
  monix: 'Monix',
  integrations: 'Integrations',
  settings: 'Settings',
  troubleshooting: 'Help',
};

export function Header({
  activeTab,
  siteSubtitle,
  lastUpdated,
  isSyncing,
  onSync,
  refreshInterval,
  setRefreshInterval,
  theme,
  toggleTheme,
  onLogout,
  onOpenMobile,
}) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMobile} aria-label="Menu">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="text-sm font-semibold truncate">{TITLES[activeTab] || 'Console'}</h1>
        <p className="text-xs text-muted-foreground truncate hidden sm:block">{siteSubtitle}</p>
      </div>

      <span className="hidden lg:inline text-xs text-muted-foreground tabular-nums">
        {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
      </span>

      <Separator orientation="vertical" className="hidden sm:block h-6" />

      <Select
        value={refreshInterval}
        onChange={(e) => setRefreshInterval(Number(e.target.value))}
        className="hidden sm:block w-auto text-xs h-8"
      >
        <option value={10}>10s</option>
        <option value={30}>30s</option>
        <option value={60}>60s</option>
        <option value={0}>Off</option>
      </Select>

      <Button variant="default" size="sm" onClick={onSync} disabled={isSyncing}>
        {isSyncing ? '…' : 'Refresh'}
      </Button>

      <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Theme">
        {theme === 'dark' ? '☀' : '☾'}
      </Button>

      <Button variant="ghost" size="sm" onClick={onLogout} className="hidden sm:inline-flex">
        Sign out
      </Button>
    </header>
  );
}
