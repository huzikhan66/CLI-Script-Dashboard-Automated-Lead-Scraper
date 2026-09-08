import React from 'react';
import { Activity, CheckCircle2, XCircle, AlertTriangle, Clock, Server } from 'lucide-react';
import { ProgressState } from '../types';

interface MetricsBarProps {
  progress: ProgressState;
  isRunning: boolean;
  status: string;
}

export const MetricsBar: React.FC<MetricsBarProps> = ({ progress, isRunning, status }) => {
  return (
    <div id="metrics-bar" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
      {/* Progress Metric */}
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-1">
          <span className="text-[11px] font-mono uppercase tracking-wider">Progress</span>
          <Activity className={`w-3.5 h-3.5 ${isRunning ? 'text-emerald-400 animate-pulse' : 'text-neutral-500'}`} />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-mono font-bold text-white">{progress.percent}%</span>
          <span className="text-[11px] font-mono text-neutral-500">
            ({progress.processed}/{progress.total || 0})
          </span>
        </div>
        <div className="w-full bg-[#1c1c1c] h-1.5 rounded-full mt-2.5 overflow-hidden">
          <div
            className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
          />
        </div>
      </div>

      {/* Found Emails */}
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-1">
          <span className="text-[11px] font-mono uppercase tracking-wider">Found Emails</span>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-mono font-bold text-emerald-400">{progress.found}</span>
          <span className="text-[11px] font-mono text-neutral-500">verified</span>
        </div>
        <span className="text-[10px] text-neutral-600 font-mono mt-2 truncate">
          Written to output.csv
        </span>
      </div>

      {/* Suspicious Leads */}
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-1">
          <span className="text-[11px] font-mono uppercase tracking-wider">Suspicious</span>
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-mono font-bold text-amber-400">{progress.suspicious}</span>
          <span className="text-[11px] font-mono text-neutral-500">flagged</span>
        </div>
        <span className="text-[10px] text-neutral-600 font-mono mt-2 truncate">
          Saved in suspicious.csv
        </span>
      </div>

      {/* Not Found */}
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-1">
          <span className="text-[11px] font-mono uppercase tracking-wider">Not Found</span>
          <XCircle className="w-3.5 h-3.5 text-neutral-500" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-mono font-bold text-neutral-300">{progress.notFound}</span>
          <span className="text-[11px] font-mono text-neutral-500">sites</span>
        </div>
        <span className="text-[10px] text-neutral-600 font-mono mt-2 truncate">
          No public email on site
        </span>
      </div>

      {/* Estimated Time (ETA) */}
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-1">
          <span className="text-[11px] font-mono uppercase tracking-wider">Est. Remaining</span>
          <Clock className="w-3.5 h-3.5 text-neutral-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-mono font-bold text-neutral-200">{progress.eta || '--'}</span>
        </div>
        <span className="text-[10px] text-neutral-600 font-mono mt-2 truncate">
          Dynamic ETA calculation
        </span>
      </div>

      {/* Current Stage */}
      <div className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between text-neutral-500 mb-1">
          <span className="text-[11px] font-mono uppercase tracking-wider">Active Stage</span>
          <Server className="w-3.5 h-3.5 text-neutral-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-sm font-mono font-bold text-emerald-400 truncate max-w-[140px]" title={progress.stage}>
            {progress.stage || (isRunning ? 'Processing' : 'Idle')}
          </span>
        </div>
        <span className="text-[10px] text-neutral-500 font-mono mt-2 truncate capitalize">
          Status: {status}
        </span>
      </div>
    </div>
  );
};
