import React, { useState, useEffect, useCallback } from 'react';
import { Terminal, Shield, RefreshCw, Sparkles, ExternalLink, HelpCircle } from 'lucide-react';
import { StatusResponse, LogEntry } from './types';
import { MetricsBar } from './components/MetricsBar';
import { ScraperControlPanel } from './components/ScraperControlPanel';
import { TerminalViewer } from './components/TerminalViewer';
import { ResultsTable } from './components/ResultsTable';

export default function App() {
  const [statusData, setStatusData] = useState<StatusResponse | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'output' | 'suspicious'>('output');
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [tableCount, setTableCount] = useState<number>(0);
  const [isTableLoading, setIsTableLoading] = useState<boolean>(false);
  const [sseConnected, setSseConnected] = useState<boolean>(false);

  // Fetch status snapshot
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data: StatusResponse = await res.json();
        setStatusData(data);
      }
    } catch {
      // Backend polling fallback
    }
  }, []);

  // Fetch table data for active tab
  const fetchPreview = useCallback(async () => {
    setIsTableLoading(true);
    try {
      const res = await fetch(`/api/preview/${activeTab}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setTableRows(data.rows || []);
          setTableCount(data.totalCount || 0);
        } else {
          setTableRows([]);
          setTableCount(0);
        }
      }
    } catch {
      // Ignore preview errors
    } finally {
      setIsTableLoading(false);
    }
  }, [activeTab]);

  // Connect to SSE for real-time live terminal streaming & progress sync
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource('/api/events');

      eventSource.onopen = () => {
        setSseConnected(true);
      };

      eventSource.addEventListener('init', (e: MessageEvent) => {
        try {
          const initData = JSON.parse(e.data);
          setStatusData(prev => prev ? { ...prev, ...initData } : null);
        } catch {}
      });

      eventSource.addEventListener('status', (e: MessageEvent) => {
        try {
          const s = JSON.parse(e.data);
          setStatusData(prev => prev ? { ...prev, status: s.status, isRunning: s.status === 'running' } : null);
          fetchPreview();
        } catch {}
      });

      eventSource.addEventListener('progress', (e: MessageEvent) => {
        try {
          const prog = JSON.parse(e.data);
          setStatusData(prev => prev ? { ...prev, progress: prog } : null);
        } catch {}
      });

      eventSource.addEventListener('log', (e: MessageEvent) => {
        try {
          const logItem: LogEntry = JSON.parse(e.data);
          setLogs(prev => [...prev.slice(-350), logItem]);
        } catch {}
      });

      eventSource.addEventListener('clear_logs', () => {
        setLogs([]);
      });

      eventSource.onerror = () => {
        setSseConnected(false);
        eventSource?.close();
        setTimeout(connect, 4000);
      };
    };

    connect();
    fetchStatus();
    fetchPreview();

    const interval = setInterval(() => {
      fetchStatus();
      fetchPreview();
    }, 5000);

    return () => {
      clearInterval(interval);
      eventSource?.close();
    };
  }, [fetchStatus, fetchPreview]);

  // Handle Starting the Scraper
  const handleStart = async (clearCache = false) => {
    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptName: 'email-scraper.js',
          clearCache,
          resume: !clearCache
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to start script');
      } else {
        fetchStatus();
      }
    } catch (err: any) {
      alert(`Start failed: ${err.message}`);
    }
  };

  // Handle Stopping the Scraper
  const handleStop = async () => {
    try {
      const res = await fetch('/api/stop', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to stop process');
      } else {
        fetchStatus();
      }
    } catch (err: any) {
      alert(`Stop request failed: ${err.message}`);
    }
  };

  // Upload CSV
  const handleUploadCsv = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Upload error');
    }
    fetchStatus();
  };

  // Direct URLs
  const handleDirectUrls = async (urls: string[]) => {
    const res = await fetch('/api/input-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to write input URLs');
    }
    fetchStatus();
  };

  // Single Quick Crawl
  const handleQuickScrape = async (url: string) => {
    const res = await fetch('/api/quick-scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Scrape failed');
    }
    fetchPreview();
    fetchStatus();
  };

  // Clear logs
  const handleClearLogs = async () => {
    setLogs([]);
    await fetch('/api/clear-logs', { method: 'POST' }).catch(() => {});
  };

  // Self-Test run
  const handleSelfTest = async () => {
    try {
      const res = await fetch('/api/selftest', { method: 'POST' });
      const data = await res.json();
      alert(`Self-test ${data.success ? 'PASSED (Exit 0)' : 'FAILED'}! See terminal output for logs.`);
    } catch (err: any) {
      alert(`Self-test request failed: ${err.message}`);
    }
  };

  // File download helper
  const handleDownload = (type: 'output' | 'suspicious') => {
    window.location.href = `/api/download/${type}`;
  };

  const isRunning = statusData?.isRunning || statusData?.status === 'running';

  const defaultProgress = {
    stage: 'Idle',
    processed: 0,
    total: 0,
    percent: 0,
    found: 0,
    notFound: 0,
    suspicious: 0,
    errors: 0,
    eta: '--',
    currentItem: '',
    startedAt: null,
    endedAt: null,
    isResumed: false
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-neutral-200 font-sans antialiased selection:bg-emerald-500 selection:text-black">
      {/* Top Main Navigation Bar */}
      <header className="border-b border-[#1f1f1f] bg-[#0d0d0d]/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]"></div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base font-semibold text-white tracking-tight">
                  Huzaifa Cyber Proxy • Automated Lead Scraper
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#171717] text-neutral-400 border border-[#262626]">
                  v2.4
                </span>
              </div>
              <p className="text-[11px] text-neutral-500 font-mono">
                Full-Stack React Dashboard • Express Orchestrator • Stealth Puppeteer & Cheerio Engine
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {/* SSE Indicator */}
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded bg-[#141414] border border-[#222]">
              <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
              <span className="text-[11px] font-mono text-neutral-400">
                {sseConnected ? 'SSE Live' : 'Connecting...'}
              </span>
            </div>

            {/* Run Self-test */}
            <button
              onClick={handleSelfTest}
              className="flex items-center space-x-1.5 px-3 py-1 bg-[#181818] hover:bg-[#222] border border-[#333] text-neutral-300 hover:text-white rounded-lg transition cursor-pointer font-mono"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Unit Test</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Metric Cards Top Row */}
        <MetricsBar
          progress={statusData?.progress || defaultProgress}
          isRunning={!!isRunning}
          status={statusData?.status || 'idle'}
        />

        {/* Middle Two-Column Grid: Controls on Left, Live Terminal on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column (5 cols) */}
          <div className="lg:col-span-5">
            <ScraperControlPanel
              statusData={statusData}
              isRunning={!!isRunning}
              onStart={handleStart}
              onStop={handleStop}
              onUploadCsv={handleUploadCsv}
              onDirectUrls={handleDirectUrls}
              onQuickScrape={handleQuickScrape}
              onResetCheckpoint={() => handleStart(true)}
            />
          </div>

          {/* Terminal Logs Column (7 cols) */}
          <div className="lg:col-span-7">
            <TerminalViewer
              logs={logs}
              onClear={handleClearLogs}
              isRunning={!!isRunning}
            />
          </div>
        </div>

        {/* Bottom Section: Scraped Results Table with Search & Filters */}
        <ResultsTable
          activeTab={activeTab}
          onTabChange={setActiveTab}
          rows={tableRows}
          totalCount={tableCount}
          onRefresh={fetchPreview}
          onDownload={handleDownload}
          isLoading={isTableLoading}
        />
      </main>
    </div>
  );
}
