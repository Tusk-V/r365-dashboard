import { Filter, Receipt } from 'lucide-react';

export default function PaidOutsTab({
  paidOuts,
  filteredPaidOuts,
  paidOutsLoading,
  paidOutsError,
  paidOutsFilters,
  setPaidOutsFilters,
  isPaidOutsFiltersOpen,
  setIsPaidOutsFiltersOpen,
  getPaidOutsDateRange,
  getPaidOutsTotals,
}) {
  return (
    <>
      {/* Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-amber-400" />
              Paid Outs
            </h2>
            {getPaidOutsDateRange() && (
              <p className="text-sm text-slate-400">Showing data for: {getPaidOutsDateRange()}</p>
            )}
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-amber-400">${getPaidOutsTotals().total.toFixed(2)}</span>
            <p className="text-xs text-slate-400">{filteredPaidOuts.length} entries</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
        <button
          onClick={() => setIsPaidOutsFiltersOpen(!isPaidOutsFiltersOpen)}
          className="flex items-center gap-2 w-full"
        >
          <Filter className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Filters</h3>
          <span className="text-slate-400 text-sm ml-auto">{isPaidOutsFiltersOpen ? '▼' : '▶'}</span>
        </button>
        {isPaidOutsFiltersOpen && (
          <div className="flex flex-col md:flex-row gap-2 mt-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
              <select
                value={paidOutsFilters.location}
                onChange={(e) => setPaidOutsFilters({...paidOutsFilters, location: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Locations</option>
                {[...new Set(paidOuts.map(e => e.location))].sort().map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
              <select
                value={paidOutsFilters.type}
                onChange={(e) => setPaidOutsFilters({...paidOutsFilters, type: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Types</option>
                {[...new Set(paidOuts.map(e => e.type))].sort().map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
              <select
                value={paidOutsFilters.market}
                onChange={(e) => setPaidOutsFilters({...paidOutsFilters, market: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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

      {paidOutsError && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {paidOutsError}
        </div>
      )}

      {paidOutsLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="text-white text-lg">Loading paid outs...</div>
        </div>
      ) : filteredPaidOuts.length === 0 ? (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <Receipt className="mx-auto mb-3 text-slate-500" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No Paid Outs</h3>
          <p className="text-slate-400">No paid outs found for the selected filters</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            const groupedPaidOuts = filteredPaidOuts.reduce((acc, entry) => {
              const date = entry.reportDate;
              if (!acc[date]) acc[date] = [];
              acc[date].push(entry);
              return acc;
            }, {});
            const sortedDates = Object.keys(groupedPaidOuts).sort((a, b) => new Date(b) - new Date(a));

            return sortedDates.map(date => {
              const entries = groupedPaidOuts[date];
              const dayTotal = entries.reduce((sum, e) => sum + (e.amount || 0), 0);

              return (
                <div key={date} className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
                  <div className="bg-slate-900 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
                    <span className="text-sm font-semibold text-white">{date}</span>
                    <span className="text-sm font-bold text-amber-400">${dayTotal.toFixed(2)}</span>
                  </div>
                  <div className="divide-y divide-slate-700">
                    {entries.map((entry, idx) => (
                      <div key={idx} className="p-3">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium text-sm">{entry.location}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                              entry.type === 'Paid out' ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'
                            }`}>
                              {entry.type}
                            </span>
                          </div>
                          <span className="text-amber-400 font-bold text-sm">${entry.amount.toFixed(2)}</span>
                        </div>
                        {entry.ticketNum && entry.ticketNum !== '-' && (
                          <p className="text-xs text-slate-500 mb-1">Ticket #{entry.ticketNum}</p>
                        )}
                        {entry.comment && (
                          <p className="text-xs text-slate-400">{entry.comment}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}

          {/* Summary by Type */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
            <h3 className="text-sm font-semibold text-white mb-2">Summary by Type</h3>
            <div className="space-y-1">
              {Object.entries(getPaidOutsTotals().byType).sort((a, b) => b[1] - a[1]).map(([type, total]) => (
                <div key={type} className="flex justify-between items-center">
                  <span className="text-slate-400 text-sm">{type}</span>
                  <span className="text-amber-400 font-medium text-sm">${total.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
