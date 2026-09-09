import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from './layout/AppLayout';
import { HomeView } from './views/HomeView';
import { SystemHealthView } from './components/SystemHealthView';
import { ProcessMonitorView } from './components/ProcessMonitorView';
import { DockerView } from './components/DockerView';
import { Pm2FleetView } from './components/Pm2FleetView';
import { ServicesView } from './components/ServicesView';
import { OllamaView } from './components/OllamaView';
import { BackupsView } from './components/BackupsView';
import { TrafficAnalyticsView } from './components/TrafficAnalyticsView';
import { TroubleshootingView } from './components/TroubleshootingView';
import { SettingsView } from './components/SettingsView';
import { IntegrationsView } from './components/IntegrationsView';
import { DatabasesView } from './components/DatabasesView';
import { SecurityView } from './components/SecurityView';
import { MonixView } from './components/MonixView';
import { LoginView } from './components/LoginView';

const MAX_HISTORY = 30;

export function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Monochrome Theme: 'dark' (pure #000000) or 'light' (pure #ffffff)
  const [theme, setTheme] = useState(() => localStorage.getItem('ops_theme') || 'dark');

  // Controls & auto-refresh
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);

  // Telemetry rolling buffers
  const [cpuHistory, setCpuHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  const [swapHistory, setSwapHistory] = useState([]);

  // Telemetry snapshots
  const [capabilities, setCapabilities] = useState(null);
  const [systemData, setSystemData] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [processSort, setProcessSort] = useState('cpu');
  const [dockerData, setDockerData] = useState(null);
  const [pm2Data, setPm2Data] = useState(null);
  const [servicesData, setServicesData] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaLogs, setOllamaLogs] = useState('');
  const [ollamaLogLines, setOllamaLogLines] = useState('100');
  const [backupSources, setBackupSources] = useState([]);
  const [backupFiles, setBackupFiles] = useState([]);
  const [trafficData, setTrafficData] = useState(null);
  const [databaseData, setDatabaseData] = useState(null);
  const [securityData, setSecurityData] = useState(null);
  const [certbotData, setCertbotData] = useState(null);
  const [osUpdatesData, setOsUpdatesData] = useState(null);
  const [monixData, setMonixData] = useState(null);
  const [branding, setBranding] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  // Refs to avoid infinite effect re-trigger loops
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const processSortRef = useRef(processSort);
  processSortRef.current = processSort;

  const ollamaLogLinesRef = useRef(ollamaLogLines);
  ollamaLogLinesRef.current = ollamaLogLines;

  // Theme synchronization with DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('ops_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const fetchBranding = async () => {
    try {
      const res = await fetch('/api/v2/settings/branding');
      if (res.ok) {
        const data = await res.json();
        setBranding(data);
      }
    } catch (e) {}
  };

  const fetchVersionCheck = async () => {
    try {
      const res = await fetch('/api/v2/system/version');
      if (res.ok) {
        const data = await res.json();
        setUpdateAvailable(data.updateAvailable === true);
      }
    } catch (e) {}
  };

  const handleBrandingChange = (settings) => {
    setBranding({
      siteName: settings.resolvedSiteName || settings.siteName,
      siteSubtitle: settings.siteSubtitle,
      pageTitle: settings.pageTitle,
      hostname: settings.hostname,
    });
  };

  // Check auth and load branding on mount
  useEffect(() => {
    fetchBranding();
    checkAuth();
  }, []);

  // Update document title when branding or active tab changes
  useEffect(() => {
    const titles = {
      overview: 'Dashboard', system: 'System Health', processes: 'Processes',
      docker: 'Docker', pm2: 'PM2', services: 'Services', ollama: 'Ollama',
      traffic: 'Traffic', backups: 'Backups', databases: 'Databases',
      security: 'Security', monix: 'Monix', troubleshooting: 'Help',
      settings: 'Settings', integrations: 'Integrations',
    };
    document.title = `${branding?.siteName || 'system-ops'} | ${titles[activeTab] || 'Console'}`;
  }, [branding, activeTab]);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/status');
      const data = await res.json();
      setIsAuthenticated(data.authenticated === true);
    } catch (e) {
      setIsAuthenticated(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {}
    setIsAuthenticated(false);
  };

  // Push rolling metrics
  const pushMetric = (setter, val) => {
    setter((prev) => {
      const next = [...prev, val];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  };

  // ── Individual Data Fetchers (Read Fast In-Memory State) ──
  const fetchCapabilities = async () => {
    try {
      const res = await fetch('/api/v2/system/capabilities');
      if (res.ok) {
        const data = await res.json();
        setCapabilities(data);

        const tab = activeTabRef.current;
        const capMap = {
          docker: data.docker?.available,
          pm2: data.pm2?.available,
          ollama: data.ollama?.available,
          backups: data.backups?.available,
          traffic: data.traffic?.available,
          databases: data.databases?.available,
          security: data.security?.available || data.certbot?.available,
          monix: data.monix?.configured,
        };
        if (capMap[tab] === false) setActiveTab('integrations');
      }
    } catch (e) {}
  };

  const fetchSystemSnapshot = async () => {
    try {
      const res = await fetch('/api/v2/system/snapshot');
      if (res.status === 401) { setIsAuthenticated(false); return; }
      if (res.ok) {
        const data = await res.json();
        setSystemData(data);
        if (data.uptime?.load1m) pushMetric(setCpuHistory, parseFloat(data.uptime.load1m) || 0);
        if (data.memory?.usagePercent !== undefined) pushMetric(setRamHistory, data.memory.usagePercent);
        if (data.swap?.usagePercent !== undefined) pushMetric(setSwapHistory, data.swap.usagePercent);
      }
    } catch (e) {}
  };

  const fetchProcesses = async () => {
    try {
      const res = await fetch(`/api/v2/system/processes?sort=${processSortRef.current}&limit=50`);
      if (res.ok) {
        const data = await res.json();
        setProcesses(data.processes || []);
      }
    } catch (e) {}
  };

  const fetchDockerData = async () => {
    try {
      const res = await fetch('/api/v2/docker/snapshot');
      if (res.ok) {
        const data = await res.json();
        setDockerData(data);
      }
    } catch (e) {}
  };

  const fetchPm2Data = async () => {
    try {
      const res = await fetch('/api/v2/pm2/snapshot');
      if (res.ok) {
        const data = await res.json();
        setPm2Data(data);
      }
    } catch (e) {}
  };

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/v2/services/snapshot');
      if (res.ok) {
        const data = await res.json();
        setServicesData(data);
      }
    } catch (e) {}
  };

  const fetchOllamaData = async () => {
    try {
      const [statusRes, modelsRes, logsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/models'),
        fetch(`/api/logs?lines=${ollamaLogLinesRef.current}`),
      ]);
      if (statusRes.ok) setOllamaStatus(await statusRes.json());
      if (modelsRes.ok) {
        const mData = await modelsRes.json();
        setOllamaModels(mData.models || []);
      }
      if (logsRes.ok) {
        const lData = await logsRes.json();
        setOllamaLogs(lData.logs || '');
      }
    } catch (e) {}
  };

  const fetchBackupData = async () => {
    try {
      const [sourcesRes, filesRes] = await Promise.all([
        fetch('/api/v2/logs/sources'),
        fetch('/api/v2/backups/files'),
      ]);
      if (sourcesRes.ok) {
        const sData = await sourcesRes.json();
        setBackupSources(sData.sources || []);
      }
      if (filesRes.ok) {
        const fData = await filesRes.json();
        setBackupFiles(fData.files || []);
      }
    } catch (e) {}
  };

  const fetchTrafficData = async () => {
    try {
      const res = await fetch('/api/v2/traffic/analytics');
      if (res.ok) {
        const data = await res.json();
        setTrafficData(data);
      }
    } catch (e) {}
  };

  const fetchDatabaseData = async () => {
    try {
      const res = await fetch('/api/v2/databases/snapshot');
      if (res.ok) setDatabaseData(await res.json());
    } catch (e) {}
  };

  const fetchSecurityData = async () => {
    try {
      const [secRes, certRes] = await Promise.all([
        fetch('/api/v2/security/snapshot'),
        fetch('/api/v2/certbot/snapshot'),
      ]);
      if (secRes.ok) setSecurityData(await secRes.json());
      if (certRes.ok) setCertbotData(await certRes.json());
    } catch (e) {}
  };

  const fetchOsUpdates = async () => {
    try {
      const res = await fetch('/api/v2/system/updates');
      if (res.ok) setOsUpdatesData(await res.json());
    } catch (e) {}
  };

  const fetchMonixData = async () => {
    try {
      const res = await fetch('/api/v2/monix/snapshot');
      if (res.ok) setMonixData(await res.json());
    } catch (e) {}
  };

  // Fetch only what is needed for the current active tab + system overview
  const syncCurrentView = async () => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    const tab = activeTabRef.current;
    const promises = [fetchSystemSnapshot(), fetchOsUpdates()];

    if (tab === 'overview') {
      promises.push(fetchServices(), fetchDockerData(), fetchPm2Data(), fetchTrafficData());
    } else if (tab === 'system') {
      promises.push(fetchProcesses(), fetchServices());
    } else if (tab === 'processes') {
      promises.push(fetchProcesses());
    } else if (tab === 'docker') {
      promises.push(fetchDockerData());
    } else if (tab === 'pm2') {
      promises.push(fetchPm2Data());
    } else if (tab === 'services') {
      promises.push(fetchServices());
    } else if (tab === 'ollama') {
      promises.push(fetchOllamaData());
    } else if (tab === 'backups') {
      promises.push(fetchBackupData());
    } else if (tab === 'traffic') {
      promises.push(fetchTrafficData());
    } else if (tab === 'databases') {
      promises.push(fetchDatabaseData());
    } else if (tab === 'security') {
      promises.push(fetchSecurityData());
    } else if (tab === 'monix') {
      promises.push(fetchMonixData());
    }

    await Promise.allSettled(promises);
    setLastUpdated(new Date());
    setIsSyncing(false);
  };

  // Full initial sync once after login
  useEffect(() => {
    if (isAuthenticated === true) {
      Promise.allSettled([
        fetchCapabilities(),
        fetchSystemSnapshot(),
        fetchProcesses(),
        fetchDockerData(),
        fetchPm2Data(),
        fetchServices(),
        fetchOllamaData(),
        fetchBackupData(),
        fetchTrafficData(),
        fetchDatabaseData(),
        fetchSecurityData(),
        fetchOsUpdates(),
        fetchMonixData(),
        fetchBranding(),
        fetchVersionCheck(),
      ]).then(() => setLastUpdated(new Date()));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated === true) syncCurrentView();
  }, [activeTab, isAuthenticated]);

  // Tab-Aware & Page-Visibility Adaptive Polling Timer
  useEffect(() => {
    if (!isAuthenticated || refreshInterval === 0) return;

    let timerId = null;

    const handleInterval = () => {
      // If browser tab is hidden in background, throttle polling
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      syncCurrentView();
    };

    timerId = setInterval(handleInterval, refreshInterval * 1000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncCurrentView();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timerId) clearInterval(timerId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, refreshInterval]);

  // Loading state during auth check
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
          Loading…
        </div>
      </div>
    );
  }

  // Render Login View if unauthenticated
  if (!isAuthenticated) {
    return <LoginView branding={branding} onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const pm2TotalCount = (pm2Data?.users || []).reduce(
    (acc, u) => acc + (u.processes || []).length,
    0
  );

  const sidebarMeta = {
    hostname: systemData?.uptime?.hostname,
    uptime: systemData?.uptime?.uptimeText,
    load: systemData?.uptime?.load1m,
    processCount: processes.length,
    dockerRunning: dockerData?.running,
    pm2Count: pm2TotalCount,
    servicesActive: servicesData?.activeCount,
    ollamaOnline: ollamaStatus?.systemd?.isActive,
    trafficHits: trafficData?.summary?.total_hits,
    securityBanned: securityData?.fail2ban?.totalBanned,
    monixDown: monixData?.downCount,
    dbCount: databaseData?.count,
  };

  return (
    <AppLayout
      siteName={branding?.siteName || 'system-ops'}
      siteSubtitle={branding?.siteSubtitle || 'Operations Console'}
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      capabilities={capabilities}
      sidebarMeta={sidebarMeta}
      updateAvailable={updateAvailable}
      lastUpdated={lastUpdated}
      isSyncing={isSyncing}
      onSync={syncCurrentView}
      refreshInterval={refreshInterval}
      setRefreshInterval={setRefreshInterval}
      theme={theme}
      toggleTheme={toggleTheme}
      onLogout={handleLogout}
      isMobileOpen={isMobileMenuOpen}
      setMobileOpen={setIsMobileMenuOpen}
    >
      {activeTab === 'overview' && (
        <HomeView
          systemData={systemData}
          capabilities={capabilities}
          dockerData={dockerData}
          pm2Count={pm2TotalCount}
          servicesData={servicesData}
          trafficData={trafficData}
          osUpdatesData={osUpdatesData}
          cpuHistory={cpuHistory}
          ramHistory={ramHistory}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'system' && (
        <SystemHealthView
          systemData={systemData}
          osUpdatesData={osUpdatesData}
          cpuHistory={cpuHistory}
          ramHistory={ramHistory}
          swapHistory={swapHistory}
        />
      )}

      {activeTab === 'processes' && (
        <ProcessMonitorView
          processes={processes}
          sort={processSort}
          setSort={setProcessSort}
          onRefresh={fetchProcesses}
        />
      )}

      {activeTab === 'docker' && <DockerView dockerData={dockerData} onRefresh={fetchDockerData} />}
      {activeTab === 'pm2' && <Pm2FleetView pm2Data={pm2Data} onRefresh={fetchPm2Data} />}
      {activeTab === 'services' && <ServicesView servicesData={servicesData} onRefresh={fetchServices} />}
      {activeTab === 'ollama' && (
        <OllamaView
          statusData={ollamaStatus}
          models={ollamaModels}
          logs={ollamaLogs}
          logLines={ollamaLogLines}
          setLogLines={setOllamaLogLines}
          onRefreshLogs={fetchOllamaData}
        />
      )}
      {activeTab === 'traffic' && <TrafficAnalyticsView trafficData={trafficData} />}
      {activeTab === 'backups' && (
        <BackupsView sources={backupSources} files={backupFiles} onRefreshFiles={fetchBackupData} />
      )}
      {activeTab === 'databases' && <DatabasesView databaseData={databaseData} />}
      {activeTab === 'security' && (
        <SecurityView securityData={securityData} certbotData={certbotData} />
      )}
      {activeTab === 'monix' && <MonixView monixData={monixData} />}
      {activeTab === 'troubleshooting' && <TroubleshootingView capabilities={capabilities} />}
      {activeTab === 'integrations' && (
        <IntegrationsView capabilities={capabilities} onNavigate={setActiveTab} />
      )}
      {activeTab === 'settings' && <SettingsView onBrandingChange={handleBrandingChange} />}
    </AppLayout>
  );
}
