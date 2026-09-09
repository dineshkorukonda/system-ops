import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';

export function AppShell({
  siteName,
  activePage,
  setActivePage,
  subPage,
  setSubPage,
  navItems,
  subNavItems,
  lastUpdated,
  isSyncing,
  onSync,
  refreshInterval,
  setRefreshInterval,
  theme,
  toggleTheme,
  onLogout,
  updateAvailable,
  onOpenSettings,
  children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  return (
    <div className="shell flex flex-col">
      <header className="shell-header">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 md:px-6">
          <button
            type="button"
            onClick={() => setActivePage('home')}
            className="flex items-center gap-2.5 shrink-0 text-left"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--bg-subtle)] text-sm font-semibold">
              {siteName.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:block font-semibold text-[var(--fg)] truncate max-w-[140px]">
              {siteName}
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActivePage(item.id);
                  if (item.defaultSub) setSubPage(item.defaultSub);
                }}
                className={cn('shell-nav-link', activePage === item.id && 'shell-nav-link-active')}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 ml-auto">
            <span className="hidden lg:inline text-xs text-[var(--fg-faint)] tabular-nums">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
            </span>
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="field text-xs hidden sm:inline-flex items-center"
            >
              {isSyncing ? 'Refreshing…' : 'Refresh'}
            </button>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="field text-xs hidden sm:block w-auto"
              aria-label="Auto refresh"
            >
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={0}>Off</option>
            </select>
            <button type="button" onClick={toggleTheme} className="field w-9 flex items-center justify-center" aria-label="Toggle theme">
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="field w-9 flex items-center justify-center relative"
                aria-label="Menu"
              >
                ⋯
                {updateAvailable && (
                  <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[var(--caution)]" />
                )}
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-48 panel py-1 shadow-lg z-50">
                  {[
                    { id: 'integrations', label: 'Integrations' },
                    { id: 'troubleshooting', label: 'Help' },
                    { id: 'settings', label: 'Settings' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActivePage(item.id);
                        setMenuOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--fg)]"
                    >
                      {item.label}
                      {item.id === 'settings' && updateAvailable && ' · update'}
                    </button>
                  ))}
                  <hr className="my-1 border-[var(--line)]" />
                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full px-4 py-2 text-left text-sm text-[var(--negative)] hover:bg-[var(--bg-subtle)]"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex gap-1 overflow-x-auto px-4 pb-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActivePage(item.id);
                if (item.defaultSub) setSubPage(item.defaultSub);
              }}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border',
                activePage === item.id
                  ? 'border-[var(--fg)] text-[var(--fg)] bg-[var(--bg-subtle)]'
                  : 'border-[var(--line)] text-[var(--fg-muted)]'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {subNavItems && subNavItems.length > 0 && (
        <div className="shell-subnav">
          <div className="mx-auto flex max-w-[1400px] gap-1 overflow-x-auto px-4 md:px-6">
            {subNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubPage(item.id)}
                className={cn('shell-subnav-link shrink-0', subPage === item.id && 'shell-subnav-link-active')}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6 md:py-8">
        {children}
      </main>
    </div>
  );
}
