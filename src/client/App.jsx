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
import { MonixView } from './components/MonixView';
import { LoginView } from './components/LoginView';

const MAX_HISTORY = 30;

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [activeTab, setActiveTab] = useState('system');
  const [theme, setTheme] = useState(() => localStorage.getItem('ops_theme') || 'dark');
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [lastUpdated, setLastUpdated] = useState(new Date());
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
  const [monixData, setMonixData] = useState(null);
  const [branding, setBranding] = useState(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const activeTabRef = useRef(activeTab);
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
      monix: 'Monix',
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
      if (res.ok) setProcesses((await res.json()).processes || []);
    } catch (e) {}
  };

  const fetchDockerData = async () => {
    try {
      const res = await fetch('/api/v2/docker/snapshot');
      if (res.ok) setDockerData(await res.json());
    } catch (e) {}
  };

  const fetchPm2Data = async () => {
    try {
      const res = await fetch('/api/v2/pm2/snapshot');
      if (res.ok) setPm2Data(await res.json());
    } catch (e) {}
  };

  const fetchServices = async () => {
    try {
      const res = await fetch('/api/v2/services/snapshot');
      if (res.ok) setServicesData(await res.json());
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
      if (modelsRes.ok) setOllamaModels((await modelsRes.json()).models || []);
      if (logsRes.ok) setOllamaLogs((await logsRes.json()).logs || '');
    } catch (e) {}
  };

  const fetchBackupData = async () => {
    try {
      const [sourcesRes, filesRes] = await Promise.all([
        fetch('/api/v2/logs/sources'),
        fetch('/api/v2/backups/files'),
      ]);
      if (sourcesRes.ok) setBackupSources((await sourcesRes.json()).sources || []);
      if (filesRes.ok) setBackupFiles((await filesRes.json()).files || []);
    } catch (e) {}
  };

  const fetchTrafficData = async () => {
    try {
      const res = await fetch('/api/v2/traffic/analytics');
      if (res.ok) setTrafficData(await res.json());
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

  const fetchMonixData = async () => {
    try {
      const res = await fetch('/api/v2/monix/snapshot');
      if (res.ok) setMonixData(await res.json());
    } catch (e) {}
  };

  const syncCurrentView = async () => {
    if (!isAuthenticated) return;
    setIsSyncing(true);
    const tab = activeTabRef.current;
    const promises = [fetchSystemSnapshot()];

    if (tab === 'system') promises.push(fetchProcesses(), fetchServices());
    else if (tab === 'processes') promises.push(fetchProcesses());
    else if (tab === 'docker') promises.push(fetchDockerData());
    else if (tab === 'pm2') promises.push(fetchPm2Data());
    else if (tab === 'services') promises.push(fetchServices());
    else if (tab === 'ollama') promises.push(fetchOllamaData());
    else if (tab === 'backups') promises.push(fetchBackupData());
    else if (tab === 'traffic') promises.push(fetchTrafficData());
    else if (tab === 'databases') promises.push(fetchDatabaseData());
    else if (tab === 'security') promises.push(fetchSecurityData());
    else if (tab === 'monix') promises.push(fetchMonixData());

    await Promise.allSettled(promises);
    setLastUpdated(new Date());
    setIsSyncing(false);
  };

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
        fetchMonixData(),
        fetchBranding(),
        fetchVersionCheck(),
      ]).then(() => setLastUpdated(new Date()));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated === true) syncCurrentView();
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || refreshInterval === 0) return;
    const timerId = setInterval(() => {
      if (!document.hidden) syncCurrentView();
    }, refreshInterval * 1000);
    const onVisible = () => { if (!document.hidden) syncCurrentView(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timerId);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
    monix: 'Monix',
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
        monixDown={monixData?.downCount}
        dbCount={databaseData?.count}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

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
          {activeTab === 'backups' && (
            <BackupsView sources={backupSources} files={backupFiles} onRefreshFiles={fetchBackupData} />
          )}
          {activeTab === 'traffic' && <TrafficAnalyticsView trafficData={trafficData} />}
          {activeTab === 'databases' && <DatabasesView databaseData={databaseData} />}
          {activeTab === 'security' && (
            <SecurityView securityData={securityData} certbotData={certbotData} />
          )}
          {activeTab === 'monix' && <MonixView monixData={monixData} />}
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
