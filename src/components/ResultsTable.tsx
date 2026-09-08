import React, { useState } from 'react';
import { Download, Eye, ExternalLink, ShieldAlert, CheckCircle2, Search, Filter } from 'lucide-react';

interface ResultsTableProps {
  activeTab: 'output' | 'suspicious';
  onTabChange: (tab: 'output' | 'suspicious') => void;
  rows: any[];
  totalCount: number;
  onRefresh: () => void;
  onDownload: (type: 'output' | 'suspicious') => void;
  isLoading: boolean;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  activeTab,
  onTabChange,
  rows,
  totalCount,
  onRefresh,
  onDownload,
  isLoading
}) => {
  const [searchFilter, setSearchFilter] = useState('');

  const filteredRows = rows.filter(r => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const urlMatch = String(r.url || r.website || '').toLowerCase().includes(q);
    const emailMatch = String(r.email || r.emails || '').toLowerCase().includes(q);
    const phoneMatch = String(r.phone || r.phones || '').toLowerCase().includes(q);
    return urlMatch || emailMatch || phoneMatch;
  });

  return (
    <div id="results-card" className="bg-[#0f0f0f] border border-[#1f1f1f] rounded-xl overflow-hidden shadow-xl flex flex-col">
      {/* Header with Tabs and Actions */}
      <div className="px-6 py-4 border-b border-[#1f1f1f] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#0a0a0a]">
        <div className="flex items-center space-x-3">
          <div className="flex rounded-lg bg-[#141414] p-1 border border-[#222]">
            <button
              id="tab-output-btn"
              onClick={() => onTabChange('output')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                activeTab === 'output'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Verified Leads ({activeTab === 'output' ? totalCount : 'output.csv'})</span>
            </button>
            <button
              id="tab-suspicious-btn"
              onClick={() => onTabChange('suspicious')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                activeTab === 'suspicious'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Suspicious ({activeTab === 'suspicious' ? totalCount : 'suspicious.csv'})</span>
            </button>
          </div>
          {isLoading && (
            <span className="text-xs text-neutral-500 font-mono animate-pulse">Refreshing data...</span>
          )}
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Search bar inside table */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search leads, domains..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#141414] border border-[#262626] rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-emerald-500/70 font-mono"
            />
          </div>

          <button
            onClick={() => onDownload(activeTab)}
            className="flex items-center space-x-1.5 text-xs px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 text-white font-medium rounded-lg shadow transition cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
        {filteredRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-500 space-y-2">
            <Filter className="w-8 h-8 opacity-40" />
            <p className="text-xs font-mono">
              {rows.length === 0
                ? `No ${activeTab} records found yet. Start a scraping run or check after extraction completes.`
                : 'No rows match your filter criteria.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#121212] sticky top-0 border-b border-[#1f1f1f] text-neutral-400 uppercase font-mono text-[11px] tracking-wider z-10">
              <tr>
                <th className="py-2.5 px-4 font-semibold">#</th>
                <th className="py-2.5 px-4 font-semibold">Website / URL</th>
                <th className="py-2.5 px-4 font-semibold">Extracted Email(s)</th>
                <th className="py-2.5 px-4 font-semibold">Phone(s)</th>
                <th className="py-2.5 px-4 font-semibold">Source / Details</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#171717] font-mono">
              {filteredRows.map((row, idx) => {
                const url = row.url || row.website || row.domain || 'N/A';
                const email = row.email || row.emails || 'None found';
                const phone = row.phone || row.phones || 'None';
                const source = row.source || row.reason || (activeTab === 'suspicious' ? 'Flagged Pattern' : 'Website Crawler');

                return (
                  <tr key={idx} className="hover:bg-[#141414]/70 transition-colors">
                    <td className="py-2.5 px-4 text-neutral-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-medium text-neutral-200 max-w-[220px] truncate" title={url}>
                      <a
                        href={url.startsWith('http') ? url : `https://${url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-emerald-400 hover:underline flex items-center gap-1.5"
                      >
                        <span className="truncate">{url}</span>
                        <ExternalLink className="w-3 h-3 text-neutral-600 shrink-0" />
                      </a>
                    </td>
                    <td className="py-2.5 px-4 text-emerald-400/90 font-medium">
                      <span className="bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/50">
                        {email}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-neutral-400">
                      {phone !== 'None' ? (
                        <span className="bg-[#1a1a1a] px-2 py-0.5 rounded border border-[#2a2a2a] text-neutral-300">
                          {phone}
                        </span>
                      ) : (
                        <span className="text-neutral-600">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-neutral-400 text-[11px]">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        activeTab === 'suspicious' 
                          ? 'bg-amber-950/40 text-amber-300 border border-amber-800/40' 
                          : 'bg-[#181818] text-neutral-300 border border-[#262626]'
                      }`}>
                        {source}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {email !== 'None found' && (
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(email);
                            alert(`Copied email: ${email}`);
                          }}
                          title="Copy Email"
                          className="px-2 py-1 bg-[#1a1a1a] hover:bg-[#262626] border border-[#333] rounded text-[11px] text-neutral-300 hover:text-white transition cursor-pointer"
                        >
                          Copy
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-6 py-2.5 bg-[#0a0a0a] border-t border-[#1f1f1f] flex items-center justify-between text-xs text-neutral-500 font-mono">
        <span>Showing {filteredRows.length} of {totalCount} records (Live synchronized with server)</span>
        <button
          onClick={onRefresh}
          className="text-neutral-400 hover:text-emerald-400 underline cursor-pointer"
        >
          Force Reload Table
        </button>
      </div>
    </div>
  );
};
