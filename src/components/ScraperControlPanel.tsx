import React, { useState } from 'react';
import { Play, Square, RefreshCw, Upload, FileText, Globe, Check, AlertCircle } from 'lucide-react';
import { StatusResponse } from '../types';

interface ScraperControlPanelProps {
  statusData: StatusResponse | null;
  isRunning: boolean;
  onStart: (clearCache?: boolean) => void;
  onStop: () => void;
  onUploadCsv: (file: File) => Promise<void>;
  onDirectUrls: (urls: string[]) => Promise<void>;
  onQuickScrape: (url: string) => Promise<void>;
  onResetCheckpoint: () => void;
}

export const ScraperControlPanel: React.FC<ScraperControlPanelProps> = ({
  statusData,
  isRunning,
  onStart,
  onStop,
  onUploadCsv,
  onDirectUrls,
  onQuickScrape,
  onResetCheckpoint
}) => {
  const [activeInputMode, setActiveInputMode] = useState<'csv' | 'direct' | 'single'>('direct');
  const [urlListText, setUrlListText] = useState('https://example.com\nhttps://news.ycombinator.com');
  const [singleUrlText, setSingleUrlText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSubmitting(true);
    try {
      await onUploadCsv(file);
      setActionMessage(`Uploaded ${file.name} successfully!`);
    } catch (err: any) {
      setActionMessage(`Upload failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleDirectSubmit = async () => {
    const urls = urlListText.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      alert('Please enter at least one valid URL');
      return;
    }
    setIsSubmitting(true);
    try {
      await onDirectUrls(urls);
      setActionMessage(`Generated input.csv with ${urls.length} target URLs!`);
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const handleSingleScrape = async () => {
    if (!singleUrlText.trim()) {
      alert('Please provide a URL to crawl');
      return;
    }
    setIsSubmitting(true);
    try {
      await onQuickScrape(singleUrlText.trim());
      setActionMessage(`Crawling ${singleUrlText}... check results table.`);
    } catch (err: any) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const checkpoint = statusData?.checkpoint;
  const inputInfo = statusData?.files?.input;

  return (
    <div className="space-y-6">
      {/* Checkpoint / Crash-Resume Notification */}
      {checkpoint?.hasCheckpoint && (
        <div id="checkpoint-notification" className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <RefreshCw className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-amber-300">Resume Checkpoint Available: </span>
              <span className="text-amber-200/80">
                {checkpoint.cachedUrls} of {checkpoint.totalInputUrls} URLs previously completed in cache.json.
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onStart(false)}
              disabled={isRunning}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium transition cursor-pointer disabled:opacity-50"
            >
              Resume Session
            </button>
            <button
              onClick={onResetCheckpoint}
              disabled={isRunning}
              className="px-3 py-1 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] text-neutral-300 hover:text-white rounded transition cursor-pointer disabled:opacity-50"
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* Target URLs / Input Configuration Card */}
      <div id="input-card" className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-5 shadow-lg flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold font-mono">
                Scraper Input Configuration
              </h2>
            </div>
            <div className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#141414] text-neutral-400 border border-[#222]">
              {inputInfo?.exists ? `input.csv: ${inputInfo.rows} URLs` : 'No input.csv detected'}
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex rounded-lg bg-[#141414] p-1 border border-[#222] mb-4 text-xs font-mono">
            <button
              onClick={() => setActiveInputMode('direct')}
              className={`flex-1 py-1.5 rounded text-center transition cursor-pointer ${
                activeInputMode === 'direct' ? 'bg-emerald-600 text-white font-medium' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Batch URLs (Paste)
            </button>
            <button
              onClick={() => setActiveInputMode('csv')}
              className={`flex-1 py-1.5 rounded text-center transition cursor-pointer ${
                activeInputMode === 'csv' ? 'bg-emerald-600 text-white font-medium' : 'text-neutral-400 hover:text-white'
              }`}
            >
              CSV File Upload
            </button>
            <button
              onClick={() => setActiveInputMode('single')}
              className={`flex-1 py-1.5 rounded text-center transition cursor-pointer ${
                activeInputMode === 'single' ? 'bg-emerald-600 text-white font-medium' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Single URL Crawl
            </button>
          </div>

          {/* Tab 1: Direct Batch URLs */}
          {activeInputMode === 'direct' && (
            <div className="space-y-3">
              <label className="block text-xs text-neutral-400 font-mono">
                Enter websites to crawl (one URL per line):
              </label>
              <textarea
                value={urlListText}
                onChange={e => setUrlListText(e.target.value)}
                rows={4}
                placeholder="https://example.com&#10;https://targetcompany.com"
                className="w-full bg-[#050505] border border-[#262626] rounded-lg p-3 text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500/70"
              />
              <button
                onClick={handleDirectSubmit}
                disabled={isSubmitting || isRunning}
                className="w-full py-2 bg-[#171717] hover:bg-[#222] border border-[#2c2c2c] text-neutral-200 rounded-lg text-xs font-mono font-medium transition cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-400" />
                <span>Save URLs to input.csv</span>
              </button>
            </div>
          )}

          {/* Tab 2: CSV Upload */}
          {activeInputMode === 'csv' && (
            <div className="space-y-3">
              <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-[#262626] hover:border-emerald-500/50 rounded-lg cursor-pointer bg-[#050505] p-4 text-center transition">
                <Upload className="w-6 h-6 text-neutral-500 mb-2" />
                <span className="text-xs font-mono text-neutral-300">Click or drag input.csv here</span>
                <span className="text-[11px] text-neutral-500 mt-1">Must contain 'url' or 'website' column</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          )}

          {/* Tab 3: Single URL Crawl */}
          {activeInputMode === 'single' && (
            <div className="space-y-3">
              <label className="block text-xs text-neutral-400 font-mono">
                Instant Single Target Crawl:
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={singleUrlText}
                  onChange={e => setSingleUrlText(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 bg-[#050505] border border-[#262626] rounded-lg px-3 py-2 text-xs font-mono text-neutral-200 focus:outline-none focus:border-emerald-500/70"
                />
                <button
                  onClick={handleSingleScrape}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-mono font-medium transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  Crawl Now
                </button>
              </div>
              <p className="text-[11px] text-neutral-500 font-mono">
                Performs a direct live scrape of the website, checking Contact, About, and JSON-LD schema.
              </p>
            </div>
          )}

          {/* Action Message Banner */}
          {actionMessage && (
            <div className="mt-3 p-2.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs font-mono flex items-center space-x-2">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{actionMessage}</span>
            </div>
          )}
        </div>

        {/* Global Process Controls (Run / Abort) */}
        <div className="mt-6 pt-4 border-t border-[#1f1f1f] flex items-center space-x-3">
          {!isRunning ? (
            <button
              id="start-scraper-btn"
              onClick={() => onStart(false)}
              className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-emerald-950/30 flex items-center justify-center space-x-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Launch Automated Scraper</span>
            </button>
          ) : (
            <button
              id="stop-scraper-btn"
              onClick={onStop}
              className="flex-1 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white font-mono font-semibold rounded-xl transition cursor-pointer shadow-lg shadow-rose-950/30 flex items-center justify-center space-x-2 animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop / Abort Process</span>
            </button>
          )}

          <button
            onClick={() => onStart(true)}
            disabled={isRunning}
            title="Start from beginning, resetting any previous checkpoints"
            className="px-4 py-3 bg-[#171717] hover:bg-[#222] border border-[#2c2c2c] text-neutral-400 hover:text-white rounded-xl text-xs font-mono transition cursor-pointer disabled:opacity-40 shrink-0"
          >
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
};
