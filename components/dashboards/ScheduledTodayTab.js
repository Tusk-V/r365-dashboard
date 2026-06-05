import { Filter } from 'lucide-react';
import TitleBadge from '../shared/TitleBadge';

export default function ScheduledTodayTab({
  scheduledToday,
  filteredScheduled,
  scheduledLoading,
  scheduledError,
  scheduledLocationFilter,
  setScheduledLocationFilter,
  scheduledMarketFilter,
  setScheduledMarketFilter,
  isScheduledFiltersOpen,
  setIsScheduledFiltersOpen,
  getEmployeeTitle,
}) {
  return (
    <>
      <div className="surface rounded-lg p-3 mb-3 shadow-lg">
        <button
          onClick={() => setIsScheduledFiltersOpen(!isScheduledFiltersOpen)}
          className="flex items-center gap-2 w-full"
        >
          <Filter className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Filters</h3>
          <span className="text-slate-400 text-sm ml-auto">{isScheduledFiltersOpen ? '▼' : '▶'}</span>
        </button>
        {isScheduledFiltersOpen && (
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
              <select
                value={scheduledLocationFilter}
                onChange={(e) => setScheduledLocationFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-slate-800/80 hairline rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Locations</option>
                {[...new Set(scheduledToday.map(emp => emp.location))].sort().map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
              <select
                value={scheduledMarketFilter}
                onChange={(e) => setScheduledMarketFilter(e.target.value)}
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

      {scheduledError && (
        <div className="bg-rose-950/50 ring-1 ring-rose-500/30 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {scheduledError}
        </div>
      )}

      {scheduledLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400"><div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-andy-red animate-spin" /><span className="text-sm">Loading scheduled employees...</span></div>
        </div>
      ) : filteredScheduled.length === 0 ? (
        <div className="surface rounded-lg p-8 text-center">
          <p className="text-slate-400">No scheduled employees found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
          {(() => {
            const groupedByLocation = filteredScheduled.reduce((acc, emp) => {
              if (!acc[emp.location]) {
                acc[emp.location] = [];
              }
              acc[emp.location].push(emp);
              return acc;
            }, {});

            const sortedLocations = Object.keys(groupedByLocation).sort();

            return sortedLocations.map((location, locIdx) => {
              const employees = groupedByLocation[location];

              return (
                <div key={locIdx} className="surface rounded-lg p-2 md:p-3 shadow-lg">
                  <div className="mb-2 md:mb-3">
                    <h3 className="text-sm md:text-base font-bold text-white">{location}</h3>
                    <p className="text-xs text-slate-400">{employees.length} employee{employees.length !== 1 ? 's' : ''} scheduled</p>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                    <div className="space-y-1">
                      {employees.map((emp, empIdx) => (
                        <div key={empIdx} className="flex justify-between items-center py-1 border-b border-white/5 last:border-b-0">
                          <span className="text-white text-xs md:text-sm font-medium flex items-center">
                            {emp.employee}
                            <TitleBadge title={getEmployeeTitle(emp.employee)} />
                          </span>
                          <span className="text-slate-300 text-xs md:text-sm whitespace-nowrap ml-2">{emp.schStart} - {emp.schEnd}</span>
                        </div>
                      ))}
                    </div>
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
