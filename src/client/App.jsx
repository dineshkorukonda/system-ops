import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
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
import { LoginView } from './components/LoginView';

const MAX_HISTORY = 30;

export function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  // Active view — SYSTEM HEALTH is MAIN / DEFAULT
  const [activeTab, setActiveTab] = useState('system');

  // Monochrome Theme: 'dark' (pure #000000) or 'light' (pure #ffffff)
  const [theme, setTheme] = useState(() => localStorage.getItem('ops_theme') || 'dark');

  // Controls & auto-refresh
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    const tabTitles = {
      system: 'System Health',
      processes: 'Process Monitor',
      docker: 'Docker Containers',
      pm2: 'PM2 Fleet',
      services: 'Systemd Services',
      ollama: 'Ollama AI',
      backups: 'Backups & Recovery',
      traffic: 'Traffic Analytics',
      troubleshooting: 'Troubleshooting',
      settings: 'Settings',
      integrations: 'Integrations',
    };
    const siteName = branding?.siteName || 'system-ops';
    const tabTitle = tabTitles[activeTab] || 'Console';
    document.title = `${siteName} | ${tabTitle}`;
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

        const currentTab = activeTabRef.current;
        const tabCapabilityMap = {
          docker: data.docker?.available,
          pm2: data.pm2?.available,
          ollama: data.ollama?.available,
          backups: data.backups?.available,
          traffic: data.traffic?.available,
        };
        if (tabCapabilityMap[currentTab] === false) {
          setActiveTab('integrations');
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

  // Fetch only what is needed for the current active tab + system overview
  const syncCurrentView = async () => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    const tab = activeTabRef.current;

    const promises = [fetchSystemSnapshot()];

    if (tab === 'system') {
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
        fetchBranding(),
        fetchVersionCheck(),
      ]).then(() => setLastUpdated(new Date()));
    }
  }, [isAuthenticated]);

  // Fetch immediately when user switches tab
  useEffect(() => {
    if (isAuthenticated === true) {
      syncCurrentView();
    }
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
      <div className="flex min-h-screen items-center justify-center ops-app">
        <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
          Loading…
        </div>
      </div>
    );
  }

  // Render Login View if unauthenticated
  if (!isAuthenticated) {
    return <LoginView branding={branding} onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const tabTitles = {
    system: 'System Health',
    processes: 'Process Monitor',
    docker: 'Docker Containers',
    pm2: 'PM2 Fleet',
    services: 'Systemd Services',
    ollama: 'Ollama AI',
    backups: 'Backups & Recovery',
    traffic: 'Traffic Analytics',
    troubleshooting: 'Troubleshooting & Diagnostics',
    settings: 'Settings',
    integrations: 'Integrations & Setup',
  };

  const pm2TotalCount = (pm2Data?.users || []).reduce(
    (acc, u) => acc + (u.processes || []).length,
    0
  );

  return (
    <div className="flex min-h-screen ops-app">
      {/* Persistent Sectionized Dynamic Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        siteName={branding?.siteName || 'system-ops'}
        updateAvailable={updateAvailable}
        hostData={{
          uptime: systemData?.uptime,
          processCount: processes.length,
        }}
        capabilities={capabilities}
        dockerData={dockerData}
        pm2Count={pm2TotalCount}
        servicesCount={servicesData?.activeCount}
        ollamaStatus={ollamaStatus?.systemd?.isActive ? 'ONLINE' : 'STOPPED'}
        backupStatus={
          backupFiles.length > 0
            ? 'SUCCESS'
            : capabilities?.backups?.available
            ? 'IDLE'
            : undefined
        }
        trafficHits={trafficData?.summary?.total_hits || 0}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex flex-1 flex-col md:pl-64 min-w-0">
        <TopBar
          activeTabTitle={tabTitles[activeTab] || 'Console'}
          siteSubtitle={branding?.siteSubtitle || 'Operations Console'}
          lastUpdated={lastUpdated}
          isSyncing={isSyncing}
          onSync={syncCurrentView}
          refreshInterval={refreshInterval}
          setRefreshInterval={setRefreshInterval}
          theme={theme}
          toggleTheme={toggleTheme}
          onLogout={handleLogout}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        />

        <main className="flex-1 p-4 md:p-6 max-w-[1600px] w-full mx-auto">
          {activeTab === 'system' && (
            <SystemHealthView
              systemData={systemData}
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

          {activeTab === 'docker' && (
            <DockerView dockerData={dockerData} onRefresh={fetchDockerData} />
          )}

          {activeTab === 'pm2' && (
            <Pm2FleetView pm2Data={pm2Data} onRefresh={fetchPm2Data} />
          )}

          {activeTab === 'services' && (
            <ServicesView servicesData={servicesData} onRefresh={fetchServices} />
          )}

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

          {activeTab === 'backups' && (
            <BackupsView
              sources={backupSources}
              files={backupFiles}
              onRefreshFiles={fetchBackupData}
            />
          )}

          {activeTab === 'traffic' && (
            <TrafficAnalyticsView trafficData={trafficData} />
          )}

          {activeTab === 'troubleshooting' && (
            <TroubleshootingView capabilities={capabilities} />
          )}

          {activeTab === 'integrations' && (
            <IntegrationsView
              capabilities={capabilities}
              onNavigate={(tabId) => setActiveTab(tabId)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView onBrandingChange={handleBrandingChange} />
          )}
        </main>
      </div>
    </div>
  );
}
