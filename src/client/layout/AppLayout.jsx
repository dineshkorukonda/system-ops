import React from 'react';
import { AppSidebar } from './AppSidebar';
import { Header } from './Header';

export function AppLayout({
  siteName,
  siteSubtitle,
  activeTab,
  setActiveTab,
  capabilities,
  sidebarMeta,
  updateAvailable,
  lastUpdated,
  isSyncing,
  onSync,
  refreshInterval,
  setRefreshInterval,
  theme,
  toggleTheme,
  onLogout,
  isMobileOpen,
  setMobileOpen,
  children,
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar
        siteName={siteName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        capabilities={capabilities}
        sidebarMeta={sidebarMeta}
        updateAvailable={updateAvailable}
        isOpen={isMobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-1 flex-col md:pl-[var(--sidebar-width)] min-w-0">
        <Header
          activeTab={activeTab}
          siteSubtitle={siteSubtitle}
          lastUpdated={lastUpdated}
          isSyncing={isSyncing}
          onSync={onSync}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          theme={theme}
          toggleTheme={toggleTheme}
          onLogout={onLogout}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
