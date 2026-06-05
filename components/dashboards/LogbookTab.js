import { BookOpen, ChevronDown, Filter } from 'lucide-react';
import { extractDriveTime, extractMood, generateSummary } from '../../lib/logbookHelpers';

export default function LogbookTab({
  logbookEntries,
  filteredLogbook,
  logbookLoading,
  logbookError,
  logbookFilters,
  setLogbookFilters,
  isLogbookFiltersOpen,
  setIsLogbookFiltersOpen,
  expandedLogbookIds,
  toggleLogbookExpanded,
  getLogbookDateRange,
}) {
  return (
    <>
      {/* Header */}
      <div className="surface rounded-2xl p-3 mb-3 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-400" />
              Logbook Entries
            </h2>
            {getLogbookDateRange() && (
              <p className="text-sm text-slate-400">Showing data for: {getLogbookDateRange()}</p>
            )}
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-blue-400">{filteredLogbook.length}</span>
            <p className="text-xs text-slate-400">Entries</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="surface rounded-2xl p-3 mb-3 shadow-card">
        <button
          onClick={() => setIsLogbookFiltersOpen(!isLogbookFiltersOpen)}
          className="flex items-center gap-2 w-full"
        >
          <Filter className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Filters</h3>
          <span className="text-slate-400 text-sm ml-auto">{isLogbookFiltersOpen ? '▼' : '▶'}</span>
        </button>
        {isLogbookFiltersOpen && (
          <div className="flex flex-col md:flex-row gap-2 mt-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
              <select
                value={logbookFilters.location}
                onChange={(e) => setLogbookFilters({...logbookFilters, location: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-800/80 hairline rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Locations</option>
                {[...new Set(logbookEntries.map(e => e.location))].sort().map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
              <select
                value={logbookFilters.market}
                onChange={(e) => setLogbookFilters({...logbookFilters, market: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-800/80 hairline rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Markets</option>
                <option value="Tulsa">Tulsa</option>
                <option value="Oklahoma City">Oklahoma City</option>
                <option value="Dallas">Dallas</option>
                <option value="Orlando">Orlando</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {logbookError && (
        <div className="bg-rose-950/50 ring-1 ring-rose-500/30 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {logbookError}
        </div>
      )}

      {logbookLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400"><div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-andy-red animate-spin" /><span className="text-sm">Loading logbook entries...</span></div>
        </div>
      ) : filteredLogbook.length === 0 ? (
        <div className="surface rounded-2xl p-8 text-center">
          <BookOpen className="mx-auto mb-3 text-slate-500" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No Logbook Entries</h3>
          <p className="text-slate-400">No entries found for the selected filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            const groupedLogbook = filteredLogbook.reduce((acc, entry) => {
              const date = entry.reportDate;
              if (!acc[date]) acc[date] = [];
              acc[date].push(entry);
              return acc;
            }, {});
            const sortedDates = Object.keys(groupedLogbook).sort((a, b) => new Date(b) - new Date(a));

            return sortedDates.map(date => {
              const entries = groupedLogbook[date];
              const formattedDate = new Date(date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'numeric',
                day: 'numeric',
                year: 'numeric'
              });

              return (
                <div key={date} className="surface rounded-2xl shadow-card overflow-hidden">
                  <div className="bg-white/5 p-3 border-b border-white/10">
                    <h3 className="text-lg font-bold text-white">{formattedDate}</h3>
                    <p className="text-xs text-slate-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
                  </div>

                  <div className="divide-y divide-white/10">
                    {entries.map((entry) => {
                      const isExpanded = expandedLogbookIds.has(entry.id);
                      const summary = entry.summary || generateSummary(entry.comment);
                      const driveTime = extractDriveTime(entry.comment) || extractDriveTime(summary);
                      const mood = extractMood(entry.comment) || extractMood(summary);

                      return (
                        <div
                          key={entry.id}
                          className="p-3 cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() => toggleLogbookExpanded(entry.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h4 className="text-sm md:text-base font-bold text-white">{entry.location}</h4>
                                {driveTime && (
                                  <span className="bg-slate-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                                    Drive Time {driveTime}
                                  </span>
                                )}

                              </div>

                              {!isExpanded && (
                                <p className="text-xs text-slate-400"><span className="text-slate-500 font-medium">Summary:</span> {summary}</p>
                              )}

                              {isExpanded && (
                                <div className="mt-3 bg-slate-900 rounded-lg p-3">
                                  <pre className="text-xs md:text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                                    {entry.comment}
                                  </pre>
                                </div>
                              )}
                            </div>
                            <button className="p-1 text-slate-400 hover:text-white transition-colors flex-shrink-0">
                              <ChevronDown
                                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}


    </>
  );
}
