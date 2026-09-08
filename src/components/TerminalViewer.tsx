import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2, Copy, Check, ShieldCheck } from 'lucide-react';
import { LogEntry } from '../types';
import { ansiToHtml } from '../lib/formatters';

interface TerminalViewerProps {
  logs: LogEntry[];
  onClear: () => void;
  isRunning: boolean;
}

export const TerminalViewer: React.FC<TerminalViewerProps> = ({ logs, onClear, isRunning }) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleCopy = () => {
    const rawText = logs.map(l => l.text).join('\n');
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="terminal-card" className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl flex flex-col h-[480px] overflow-hidden shadow-2xl">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0a0a0a] border-b border-[#1f1f1f]">
        <div className="flex items-center space-x-2.5">
          <div className="flex space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <div className="h-4 w-[1px] bg-[#262626] mx-1"></div>
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-mono font-medium text-neutral-300">Live Runner Terminal</span>
            {isRunning && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 rounded animate-pulse">
                STREAMING
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono text-neutral-500">Lines: {logs.length}</span>
          <button
            id="copy-logs-btn"
            onClick={handleCopy}
            title="Copy logs"
            className="flex items-center space-x-1 text-xs px-2.5 py-1 rounded bg-[#171717] hover:bg-[#262626] text-neutral-300 transition-colors cursor-pointer border border-[#2a2a2a]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            id="clear-logs-btn"
            onClick={onClear}
            title="Clear logs"
            className="flex items-center space-x-1 text-xs px-2.5 py-1 rounded bg-[#171717] hover:bg-[#262626] text-neutral-400 hover:text-neutral-200 transition-colors cursor-pointer border border-[#2a2a2a]"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-[11px]">Clear</span>
          </button>
        </div>
      </div>

      {/* Terminal View Content */}
      <div id="terminal-logs" className="flex-1 p-4 bg-[#050505] font-mono text-xs overflow-y-auto space-y-1 select-text">
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600 space-y-2">
            <Terminal className="w-8 h-8 opacity-40" />
            <p className="text-xs">No active terminal output. Run a scrape task or self-test to view live logs.</p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className={`leading-relaxed break-all flex items-start space-x-2 ${
                log.stream === 'stderr' ? 'text-rose-400/90' : 'text-neutral-300'
              }`}
            >
              <span className="text-[10px] text-neutral-600 select-none shrink-0 font-mono">
                {new Date(log.time).toLocaleTimeString([], { hour12: false })}
              </span>
              <span
                className="flex-1 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: ansiToHtml(log.text) }}
              />
            </div>
          ))
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Terminal Footer Bar */}
      <div className="px-4 py-2 bg-[#0a0a0a] border-t border-[#1f1f1f] flex items-center justify-between text-[11px] font-mono text-neutral-500">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>Full ANSI TrueColor Rendered • Server-Sent Events (SSE)</span>
        </div>
        <div>UTF-8</div>
      </div>
    </div>
  );
};
