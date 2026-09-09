import React, { useState, useEffect, useRef } from 'react';
import { AppShell } from './layout/AppShell';
import { HomeView } from './views/HomeView';
import { HostView } from './views/HostView';
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

  const [activePage, setActivePage] = useState('home');
  const [subPage, setSubPage] = useState('metrics');

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
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const subPageRef = useRef(subPage);
  subPageRef.current = subPage;

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
    const pageTitles = {
      home: 'Home',
      host: subPage === 'processes' ? 'Processes' : 'Host',
      workloads: 'Workloads',
      traffic: 'Traffic',
      data: 'Data',
      security: 'Security',
      monix: 'Monix',
      troubleshooting: 'Help',
      settings: 'Settings',
      integrations: 'Integrations',
    };
    const siteName = branding?.siteName || 'system-ops';
    document.title = `${siteName} | ${pageTitles[activePage] || 'Console'}`;
  }, [branding, activePage, subPage]);

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

        const page = activePageRef.current;
        const sub = subPageRef.current;
        const unavailable =
          (page === 'traffic' && !data.traffic?.available) ||
          (page === 'data' && !data.backups?.available && !data.databases?.available) ||
          (page === 'security' && !data.security?.available && !data.certbot?.available) ||
          (page === 'monix' && !data.monix?.configured) ||
          (page === 'workloads' && sub === 'docker' && !data.docker?.available) ||
          (page === 'workloads' && sub === 'pm2' && !data.pm2?.available) ||
          (page === 'workloads' && sub === 'ollama' && !data.ollama?.available);
        if (unavailable) {
          setActivePage('integrations');
        }
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
    const page = activePageRef.current;
    const sub = subPageRef.current;

    const promises = [fetchSystemSnapshot(), fetchOsUpdates()];

    if (page === 'home') {
      promises.push(fetchServices(), fetchDockerData(), fetchPm2Data(), fetchTrafficData(), fetchSecurityData(), fetchMonixData());
    } else if (page === 'host') {
      promises.push(fetchProcesses());
    } else if (page === 'workloads') {
      if (sub === 'docker') promises.push(fetchDockerData());
      else if (sub === 'pm2') promises.push(fetchPm2Data());
      else if (sub === 'ollama') promises.push(fetchOllamaData());
      else promises.push(fetchServices());
    } else if (page === 'traffic') {
      promises.push(fetchTrafficData());
    } else if (page === 'data') {
      if (sub === 'databases') promises.push(fetchDatabaseData());
      else promises.push(fetchBackupData());
    } else if (page === 'security') {
      promises.push(fetchSecurityData());
    } else if (page === 'monix') {
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
    if (!capabilities) return;
    if (activePage === 'workloads') {
      const valid = [
        capabilities.docker?.available && 'docker',
        capabilities.pm2?.available && 'pm2',
        capabilities.systemd?.available !== false && 'services',
        capabilities.ollama?.available && 'ollama',
      ].filter(Boolean);
      if (valid.length && !valid.includes(subPage)) setSubPage(valid[0]);
    }
    if (activePage === 'data') {
      const valid = [
        capabilities.backups?.available && 'backups',
        capabilities.databases?.available && 'databases',
      ].filter(Boolean);
      if (valid.length && !valid.includes(subPage)) setSubPage(valid[0]);
    }
    if (activePage === 'host' && subPage !== 'metrics' && subPage !== 'processes') {
      setSubPage('metrics');
    }
  }, [activePage, capabilities]);

  useEffect(() => {
    if (isAuthenticated === true) {
      syncCurrentView();
    }
  }, [activePage, subPage, isAuthenticated]);

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
      <div className="shell flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[var(--fg-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--fg)]" />
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

  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'host', label: 'Host', defaultSub: 'metrics' },
    ...(capabilities?.docker?.available || capabilities?.pm2?.available || capabilities?.systemd?.available !== false || capabilities?.ollama?.available
      ? [{ id: 'workloads', label: 'Workloads', defaultSub: capabilities?.docker?.available ? 'docker' : capabilities?.pm2?.available ? 'pm2' : 'services' }]
      : []),
    ...(capabilities?.traffic?.available ? [{ id: 'traffic', label: 'Traffic' }] : []),
    ...(capabilities?.backups?.available || capabilities?.databases?.available
      ? [{ id: 'data', label: 'Data', defaultSub: capabilities?.backups?.available ? 'backups' : 'databases' }]
      : []),
    ...(capabilities?.security?.available || capabilities?.certbot?.available ? [{ id: 'security', label: 'Security' }] : []),
    ...(capabilities?.monix?.configured ? [{ id: 'monix', label: 'Monix' }] : []),
  ];

  const subNavItems =
    activePage === 'host'
      ? [
          { id: 'metrics', label: 'Metrics' },
          { id: 'processes', label: 'Processes' },
        ]
      : activePage === 'workloads'
      ? [
          ...(capabilities?.docker?.available ? [{ id: 'docker', label: 'Docker' }] : []),
          ...(capabilities?.pm2?.available ? [{ id: 'pm2', label: 'PM2' }] : []),
          ...(capabilities?.systemd?.available !== false ? [{ id: 'services', label: 'Services' }] : []),
          ...(capabilities?.ollama?.available ? [{ id: 'ollama', label: 'Ollama' }] : []),
        ]
      : activePage === 'data'
      ? [
          ...(capabilities?.backups?.available ? [{ id: 'backups', label: 'Backups' }] : []),
          ...(capabilities?.databases?.available ? [{ id: 'databases', label: 'Databases' }] : []),
        ]
      : null;

  const handleNavigate = (page, sub) => {
    setActivePage(page);
    if (sub) setSubPage(sub);
  };

  return (
    <AppShell
      siteName={branding?.siteName || 'system-ops'}
      activePage={activePage}
      setActivePage={setActivePage}
      subPage={subPage}
      setSubPage={setSubPage}
      navItems={navItems}
      subNavItems={subNavItems}
      lastUpdated={lastUpdated}
      isSyncing={isSyncing}
      onSync={syncCurrentView}
      refreshInterval={refreshInterval}
      setRefreshInterval={setRefreshInterval}
      theme={theme}
      toggleTheme={toggleTheme}
      onLogout={handleLogout}
      updateAvailable={updateAvailable}
    >
      {activePage === 'home' && (
        <HomeView
          systemData={systemData}
          capabilities={capabilities}
          dockerData={dockerData}
          pm2Count={pm2TotalCount}
          servicesData={servicesData}
          trafficData={trafficData}
          securityData={securityData}
          monixData={monixData}
          osUpdatesData={osUpdatesData}
          cpuHistory={cpuHistory}
          ramHistory={ramHistory}
          onNavigate={handleNavigate}
        />
      )}

      {activePage === 'host' && (
        <HostView
          subPage={subPage}
          systemData={systemData}
          osUpdatesData={osUpdatesData}
          cpuHistory={cpuHistory}
          ramHistory={ramHistory}
          swapHistory={swapHistory}
          processes={processes}
          processSort={processSort}
          setProcessSort={setProcessSort}
          onRefreshProcesses={fetchProcesses}
        />
      )}

      {activePage === 'workloads' && subPage === 'docker' && (
        <DockerView dockerData={dockerData} onRefresh={fetchDockerData} />
      )}
      {activePage === 'workloads' && subPage === 'pm2' && (
        <Pm2FleetView pm2Data={pm2Data} onRefresh={fetchPm2Data} />
      )}
      {activePage === 'workloads' && subPage === 'services' && (
        <ServicesView servicesData={servicesData} onRefresh={fetchServices} />
      )}
      {activePage === 'workloads' && subPage === 'ollama' && (
        <OllamaView
          statusData={ollamaStatus}
          models={ollamaModels}
          logs={ollamaLogs}
          logLines={ollamaLogLines}
          setLogLines={setOllamaLogLines}
          onRefreshLogs={fetchOllamaData}
        />
      )}

      {activePage === 'traffic' && <TrafficAnalyticsView trafficData={trafficData} />}

      {activePage === 'data' && subPage === 'backups' && (
        <BackupsView sources={backupSources} files={backupFiles} onRefreshFiles={fetchBackupData} />
      )}
      {activePage === 'data' && subPage === 'databases' && (
        <DatabasesView databaseData={databaseData} />
      )}

      {activePage === 'security' && (
        <SecurityView securityData={securityData} certbotData={certbotData} />
      )}

      {activePage === 'monix' && <MonixView monixData={monixData} />}

      {activePage === 'troubleshooting' && <TroubleshootingView capabilities={capabilities} />}

      {activePage === 'integrations' && (
        <IntegrationsView capabilities={capabilities} onNavigate={(tabId) => {
          const map = {
            docker: ['workloads', 'docker'],
            pm2: ['workloads', 'pm2'],
            services: ['workloads', 'services'],
            ollama: ['workloads', 'ollama'],
            backups: ['data', 'backups'],
            traffic: ['traffic'],
            databases: ['data', 'databases'],
          };
          const target = map[tabId];
          if (target) handleNavigate(target[0], target[1]);
          else handleNavigate(tabId);
        }} />
      )}

      {activePage === 'settings' && <SettingsView onBrandingChange={handleBrandingChange} />}
    </AppShell>
  );
}
