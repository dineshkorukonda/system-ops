import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SystemHealthView } from './components/SystemHealthView';
import { ProcessMonitorView } from './components/ProcessMonitorView';
import { ServicesView } from './components/ServicesView';
import { OllamaView } from './components/OllamaView';
import { BackupsView } from './components/BackupsView';
import { TrafficAnalyticsView } from './components/TrafficAnalyticsView';
import { LoginView } from './components/LoginView';

const MAX_HISTORY = 20;

export function App() {
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  // Active view — SYSTEM HEALTH is MAIN / DEFAULT
  const [activeTab, setActiveTab] = useState('system');

  // Monochrome Theme: 'dark' (pure #000000) or 'light' (pure #ffffff)
  const [theme, setTheme] = useState(() => localStorage.getItem('ops_theme') || 'dark');

  // Controls & auto-refresh
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Telemetry rolling buffers
  const [cpuHistory, setCpuHistory] = useState([]);
  const [ramHistory, setRamHistory] = useState([]);
  const [swapHistory, setSwapHistory] = useState([]);

  // Telemetry snapshots
  const [systemData, setSystemData] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [processSort, setProcessSort] = useState('cpu');
  const [servicesData, setServicesData] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState(null);
  const [ollamaModels, setOllamaModels] = useState([]);
  const [ollamaLogs, setOllamaLogs] = useState('');
  const [ollamaLogLines, setOllamaLogLines] = useState('100');
  const [backupSources, setBackupSources] = useState([]);
  const [backupFiles, setBackupFiles] = useState([]);
  const [trafficData, setTrafficData] = useState(null);

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

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, []);

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

  // ── Individual Data Fetchers ──
  const fetchSystemSnapshot = async () => {
    try {
      const res = await fetch('/api/v2/system/snapshot');
      if (res.status === 401) { setIsAuthenticated(false); return; }
      if (res.ok) {
        const data = await res.json();
        setSystemData(data);
        if (data.uptime?.load1m) pushMetric(setCpuHistory, parseFloat(data.uptime.load1m) || 0);
        if (data.memory?.usagePercent) pushMetric(setRamHistory, data.memory.usagePercent);
        if (data.swap?.usagePercent) pushMetric(setSwapHistory, data.swap.usagePercent);
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
        fetchSystemSnapshot(),
        fetchProcesses(),
        fetchServices(),
        fetchOllamaData(),
        fetchBackupData(),
        fetchTrafficData(),
      ]).then(() => setLastUpdated(new Date()));
    }
  }, [isAuthenticated]);

  // Fetch immediately when user switches tab
  useEffect(() => {
    if (isAuthenticated === true) {
      syncCurrentView();
    }
  }, [activeTab, isAuthenticated]);

  // Polling timer
  useEffect(() => {
    if (!isAuthenticated || refreshInterval === 0) return;
    const timer = setInterval(() => {
      syncCurrentView();
    }, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [isAuthenticated, refreshInterval]);

  // Loading state during auth check
  if (isAuthenticated === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black font-mono text-xs text-neutral-500 theme-bg">
        INITIALIZING SYSTEM-OPS...
      </div>
    );
  }

  // Render Login View if unauthenticated
  if (!isAuthenticated) {
    return <LoginView onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  const tabTitles = {
    system: 'System Health',
    processes: 'Process Monitor',
    services: 'Systemd Services',
    ollama: 'Ollama AI',
    backups: 'Backups & Recovery',
    traffic: 'Traffic Analytics',
  };

  return (
    <div className="flex min-h-screen bg-[#000000] text-white theme-bg">
      {/* Persistent Sectionized Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hostData={{
          uptime: systemData?.uptime,
          processCount: processes.length,
        }}
        servicesCount={servicesData?.activeCount}
        ollamaStatus={ollamaStatus?.systemd?.isActive ? 'ONLINE' : 'STOPPED'}
        backupStatus={backupSources.length > 0 ? 'SUCCESS' : 'IDLE'}
        trafficHits={trafficData?.summary?.total_hits || 0}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Content Viewport */}
      <div className="flex flex-1 flex-col md:pl-64 min-w-0">
        <TopBar
          activeTabTitle={tabTitles[activeTab] || 'Console'}
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
        </main>
      </div>
    </div>
  );
}
