import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { MonitoringStatus } from './CollectionStatus';

export function TopBar({ activeTabTitle, siteName = 'system-ops', lastUpdated, monitoringHealth, isSyncing, onSync, refreshInterval, setRefreshInterval, theme, toggleTheme, onLogout, onOpenMobileMenu, onNavigate, availableTabs = {} }) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const matches = Object.entries(availableTabs).filter(([, title]) => title.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => {
    const dismiss = (e) => { if (!searchRef.current?.contains(e.target)) setSearchOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, []);
  const navigate = (id) => { onNavigate(id); setSearchOpen(false); setQuery(''); };
  return (
    <header className="app-topbar !block !p-0 sticky top-0 z-30 border-b border-[var(--border-color)] bg-[var(--bg-main)]">
      <div className="flex min-h-20 items-center justify-between gap-3 px-4 lg:px-7 py-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onOpenMobileMenu} aria-label="Open navigation" className="md:hidden p-2 rounded-lg border border-[var(--border-color)]"><Icon name="menu" /></button>
          <span className="h-3 w-3 shrink-0 bg-[var(--accent)]" />
          <h2 className="font-bold text-lg tracking-tight truncate max-w-48">{siteName}</h2>
          <MonitoringStatus health={monitoringHealth} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div ref={searchRef} className="relative hidden lg:block">
            <Icon name="search" className="absolute left-3 top-2.5 text-[var(--text-muted)]" />
            <input aria-label="Search modules" aria-controls={searchOpen ? "module-search-results" : undefined} placeholder="Search modules..." value={query} onFocus={() => setSearchOpen(true)} onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }} onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); if (e.key === 'Enter' && matches.length) { e.preventDefault(); navigate(matches[0][0]); } }} className="theme-input w-48 xl:w-60 border h-10 pl-10 pr-3 text-sm" />
            {searchOpen && <div id="module-search-results" className="ops-search-results" aria-label="Module search results">{matches.length ? matches.map(([id, title]) => <button key={id} onClick={() => navigate(id)}><Icon name={id} /><span>{title}</span></button>) : <p className="p-3 text-xs text-[var(--text-muted)]">No modules found.</p>}</div>}
          </div>
          <Button variant="secondary" onClick={() => navigate('discovery')} className="hidden sm:inline-flex h-10"><Icon name="integrations" className="text-[var(--accent)]" /><span className="hidden xl:inline">Module Library</span></Button>
          <select aria-label="Refresh interval" value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))} className="theme-input h-10 border px-2 text-xs"><option value="10">10s</option><option value="30">30s</option><option value="60">60s</option><option value="0">Off</option></select>
          <Button variant="secondary" onClick={onSync} disabled={isSyncing} className="h-10" aria-label="Refresh telemetry"><Icon name="refresh" className={isSyncing ? 'animate-spin' : ''} /><span className="hidden xl:inline">Refresh</span></Button>
          <Button variant="outline" onClick={toggleTheme} className="h-10" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? 'Light' : 'Dark'}</Button>
          <Button variant="ghost" onClick={onLogout} className="h-10" aria-label="Log out">Logout</Button>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 lg:px-7 py-2 text-[10px] font-mono border-t border-[var(--border-subtle)] text-[var(--text-muted)]"><span>COMMAND CENTER <span className="mx-2">/</span><span className="text-[var(--text-secondary)]">{activeTabTitle}</span></span><span className="hidden sm:inline">LAST SYNC {lastUpdated?.toLocaleTimeString() || '—'}</span></div>
    </header>
  );
}
