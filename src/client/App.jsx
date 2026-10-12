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
import { DatabasesView } from './components/DatabasesView';
import { SecurityView } from './components/SecurityView';
import { LoginView } from './components/LoginView';
import { CollectionStatus } from './components/CollectionStatus';

const MAX_HISTORY = 30;

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [activeTab, setActiveTab] = useState(() => window.location.hash.startsWith('#pm2') ? 'pm2' : 'system');
  const [theme, setTheme] = useState(() => localStorage.getItem('ops_theme') || 'dark');
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [monitoringHealth, setMonitoringHealth] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [cpuHistory, setCpuHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  const [swapHistory, setSwapHistory] = useState([]);

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
  const [branding, setBranding] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [viewErrors, setViewErrors] = useState({});
  const [collections, setCollections] = useState({});
  const syncControllerRef = useRef(null);

  const activeTabRef = useRef(activeTab);
  const lastMetricSuccessRef = useRef(null);
  activeTabRef.current = activeTab;
  const processSortRef = useRef(processSort);
  processSortRef.current = processSort;
  const ollamaLogLinesRef = useRef(ollamaLogLines);
  ollamaLogLinesRef.current = ollamaLogLines;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('ops_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  const fetchBranding = async () => {
    try {
      const res = await fetch('/api/v2/settings/branding');
      if (res.ok) setBranding(await res.json());
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

  useEffect(() => {
    fetchBranding();
    checkAuth();
    const onHash = () => { if (window.location.hash.startsWith('#pm2')) setActiveTab('pm2'); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

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
      databases: 'Databases',
      security: 'Security',
      troubleshooting: 'Troubleshooting',
      settings: 'Settings',
      integrations: 'Integrations',
    };
    const siteName = branding?.siteName || 'system-ops';
    document.title = `${siteName} | ${tabTitles[activeTab] || 'Console'}`;
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

  const pushMetric = (setter, val) => {
    setter((prev) => {
      const next = [...prev, val];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
  };

  const api = async (route) => {
    const signal = syncControllerRef.current?.signal;
    const res = await fetch(route, { signal });
    if (res.status === 401) { setIsAuthenticated(false); throw new Error('Session expired. Please log in.'); }
    const data = await res.json();
    if (signal?.aborted) throw new DOMException('View changed', 'AbortError');
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const load = async (key, route, setter, transform = data => data) => {
    try {
      const data = await api(route);
      setter(transform(data));
      if (data.collection) {
        setCollections(previous => ({ ...previous, [key]: data.collection }));
        setLastUpdated(data.collection.lastSuccess ? new Date(data.collection.lastSuccess) : null);
      }
      setViewErrors(previous => ({ ...previous, [key]: null }));
      return data;
    } catch (error) {
      if (error.name === 'AbortError') return;
      setViewErrors(previous => ({ ...previous, [key]: error.message }));
      setCollections(previous => ({ ...previous, [key]: { ...previous[key], status: 'error', fresh: false, lastError: error.message } }));
    }
  };

  const fetchCapabilities = () => load('capabilities', '/api/v2/system/capabilities', setCapabilities);
  const fetchSystemSnapshot = async () => {
    const data = await load('system', '/api/v2/system/snapshot', setSystemData);
    if (!data) return;
    setMonitoringHealth(data.monitoringHealth);
    if (data.persistence?.available && data.history) {
      setCpuHistory(data.history.cpu.map(sample => sample.value));
      setRamHistory(data.history.ram.map(sample => sample.value));
      setSwapHistory(data.history.swap.map(sample => sample.value));
      return;
    }
    if (data.collection?.fresh && data.collection.lastSuccess !== lastMetricSuccessRef.current) {
      lastMetricSuccessRef.current = data.collection.lastSuccess;
      if (Number.isFinite(data.uptime?.cpuPercent)) pushMetric(setCpuHistory, data.uptime.cpuPercent);
      if (Number.isFinite(data.memory?.usagePercent)) pushMetric(setRamHistory, data.memory.usagePercent);
      if (Number.isFinite(data.swap?.usagePercent)) pushMetric(setSwapHistory, data.swap.usagePercent);
    }
  };
  const fetchProcesses = () => load('processes', `/api/v2/system/processes?sort=${processSortRef.current}&limit=50`, setProcesses, data => data.processes || []);
  const fetchDockerData = () => load('docker', '/api/v2/docker/snapshot', setDockerData);
  const fetchPm2Data = () => load('pm2', '/api/v2/pm2/snapshot', setPm2Data);
  const fetchServices = () => load('services', '/api/v2/services/snapshot', setServicesData);
  const fetchTrafficData = () => load('traffic', '/api/v2/traffic/analytics', setTrafficData);
  const fetchDatabaseData = () => load('databases', '/api/v2/databases/snapshot', setDatabaseData);
  const fetchOsUpdates = () => load('osUpdates', '/api/v2/system/updates', setOsUpdatesData);
  const fetchOllamaData = () => Promise.allSettled([
    load('ollama', '/api/status', setOllamaStatus),
    load('ollama', '/api/models', setOllamaModels, data => data.models || []),
  ]);
  const fetchOllamaLogs = async () => {
    if (syncControllerRef.current) return;
    const controller = new AbortController(); syncControllerRef.current = controller;
    try { await load('logs', `/api/logs?lines=${ollamaLogLinesRef.current}`, setOllamaLogs, data => data.logs || ''); }
    finally { if (syncControllerRef.current === controller) syncControllerRef.current = null; }
  };
  const fetchBackupData = () => Promise.allSettled([
    load('backups', '/api/v2/logs/sources', setBackupSources, data => data.sources || []),
    load('backups', '/api/v2/backups/files', setBackupFiles, data => data.files || []),
  ]);
  const fetchSecurityData = () => Promise.allSettled([
    load('security', '/api/v2/security/snapshot', setSecurityData),
    load('certbot', '/api/v2/certbot/snapshot', setCertbotData),
  ]);

  const syncCurrentView = async () => {
    if (!isAuthenticated || document.hidden || syncControllerRef.current) return;
    const controller = new AbortController();
    syncControllerRef.current = controller;
    setIsSyncing(true);
    const tab = activeTabRef.current;
    const fetchers = { system: fetchSystemSnapshot, processes: fetchProcesses, docker: fetchDockerData,
      pm2: fetchPm2Data, services: fetchServices, ollama: fetchOllamaData, backups: fetchBackupData,
      traffic: fetchTrafficData, databases: fetchDatabaseData, security: fetchSecurityData,
      integrations: fetchCapabilities };
    try {
      await Promise.allSettled([
        load('monitoring', '/api/v2/ops/health', setMonitoringHealth),
        fetchers[tab]?.(),
      ]);
    } finally {
      if (syncControllerRef.current === controller) { syncControllerRef.current = null; setIsSyncing(false); }
    }
  };

  useEffect(() => {
    if (isAuthenticated === true) { fetchCapabilities(); fetchBranding(); fetchVersionCheck(); }
  }, [isAuthenticated]);

  useEffect(() => {
    setLastUpdated(null);
    if (isAuthenticated === true) syncCurrentView();
    return () => { syncControllerRef.current?.abort(); syncControllerRef.current = null; };
  }, [activeTab, isAuthenticated, processSort]);

  useEffect(() => {
    if (!isAuthenticated || refreshInterval === 0) return;
    const timerId = setInterval(() => { if (!document.hidden) syncCurrentView(); }, refreshInterval * 1000);
    const onVisible = () => {
      if (document.hidden) { syncControllerRef.current?.abort(); syncControllerRef.current = null; setIsSyncing(false); }
      else syncCurrentView();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timerId); document.removeEventListener('visibilitychange', onVisible); };
  }, [isAuthenticated, refreshInterval]);
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black font-mono text-xs text-neutral-500 theme-bg">
        INITIALIZING SYSTEM-OPS...
      </div>
    );
  }

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
    databases: 'Databases',
    security: 'Security',
    troubleshooting: 'Troubleshooting & Diagnostics',
    settings: 'Settings',
    integrations: 'Integrations & Setup',
  };

  const pm2TotalCount = (pm2Data?.users || []).reduce(
    (acc, u) => acc + (u.processes || []).length,
    0
  );

  return (
    <div className="flex min-h-screen bg-[#000000] text-white theme-bg">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        siteName={branding?.siteName || 'system-ops'}
        updateAvailable={updateAvailable}
        hostData={{ uptime: systemData?.uptime, processCount: processes.length }}
        capabilities={capabilities}
        dockerData={dockerData}
        pm2Count={pm2TotalCount}
        servicesCount={servicesData?.activeCount}
        ollamaStatus={ollamaStatus?.systemd?.isActive ? 'ONLINE' : 'STOPPED'}
        backupStatus={
          backupFiles.length > 0 ? 'SUCCESS' : capabilities?.backups?.available ? 'IDLE' : undefined
        }
        trafficHits={trafficData?.summary?.total_hits || 0}
        securityBanned={securityData?.fail2ban?.totalBanned}
        dbCount={databaseData?.count}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex flex-1 flex-col md:pl-64 min-w-0">
        <TopBar
          activeTabTitle={tabTitles[activeTab] || 'Console'}
          siteSubtitle={branding?.siteSubtitle || 'Operations Console'}
          lastUpdated={lastUpdated}
          monitoringHealth={monitoringHealth}
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
          {viewErrors[activeTab] && <p role="alert" className="mb-4 text-sm text-amber-400">{viewErrors[activeTab]}</p>}
          {activeTab !== 'system' && collections[activeTab] && <div className="mb-4"><CollectionStatus collection={collections[activeTab]} /></div>}
          {activeTab === 'system' && (
            <SystemHealthView
              systemData={systemData ? { ...systemData, collection: collections.system || systemData.collection } : null}
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
              onRefresh={syncCurrentView}
            />
          )}
          {activeTab === 'docker' && <DockerView dockerData={dockerData} onRefresh={syncCurrentView} />}
          {activeTab === 'pm2' && <Pm2FleetView pm2Data={pm2Data} onRefresh={syncCurrentView} />}
          {activeTab === 'services' && <ServicesView servicesData={servicesData} onRefresh={syncCurrentView} />}
          {activeTab === 'ollama' && (
            <OllamaView
              statusData={ollamaStatus}
              models={ollamaModels}
              logs={ollamaLogs}
              logLines={ollamaLogLines}
              setLogLines={setOllamaLogLines}
              onRefreshLogs={fetchOllamaLogs}
            />
          )}
          {activeTab === 'backups' && (
            <BackupsView sources={backupSources} files={backupFiles} onRefreshFiles={syncCurrentView} />
          )}
          {activeTab === 'traffic' && <TrafficAnalyticsView trafficData={trafficData} />}
          {activeTab === 'databases' && <DatabasesView databaseData={databaseData} />}
          {activeTab === 'security' && (
            <SecurityView securityData={securityData} certbotData={certbotData} />
          )}
          {activeTab === 'troubleshooting' && <TroubleshootingView capabilities={capabilities} />}
          {activeTab === 'integrations' && (
            <IntegrationsView capabilities={capabilities} onNavigate={(tabId) => setActiveTab(tabId)} />
          )}
          {activeTab === 'settings' && <SettingsView onBrandingChange={handleBrandingChange} />}
        </main>
      </div>
    </div>
  );
}
