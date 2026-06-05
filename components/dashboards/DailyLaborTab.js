import { AlertCircle, ChevronDown, Filter } from 'lucide-react';
import { sortByMarket } from '../../lib/markets';
import { getDailyLaborGrade } from '../../lib/laborGrade';

export default function DailyLaborTab({
  dailyLaborData,
  dailyFlashData,
  filteredDailyLabor,
  dailyLaborLoading,
  dailyLaborError,
  dailyLaborFilters,
  setDailyLaborFilters,
  isDailyLaborFiltersOpen,
  setIsDailyLaborFiltersOpen,
  isDailyLaborLocationDropdownOpen,
  setIsDailyLaborLocationDropdownOpen,
  handleDailyLaborLocationToggle,
  clockouts,
  getCallOffEmployees,
  setCallOffModalData,
  setShowCallOffModal,
  setClockoutModalData,
  setShowClockoutModal,
  filterPrior7Days,
}) {
  return (
    <>
      <div className="surface rounded-lg p-3 mb-3 shadow-lg">
        <button
          onClick={() => setIsDailyLaborFiltersOpen(!isDailyLaborFiltersOpen)}
          className="flex items-center gap-2 w-full"
        >
          <Filter className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Filters</h3>
          <span className="text-slate-400 text-sm ml-auto">{isDailyLaborFiltersOpen ? '▼' : '▶'}</span>
        </button>
        {isDailyLaborFiltersOpen && (
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDailyLaborLocationDropdownOpen(!isDailyLaborLocationDropdownOpen);
                  }}
                  className="w-full px-2 py-1.5 text-sm bg-slate-800/80 hairline rounded text-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span>{dailyLaborFilters.locations.length === 0 ? 'All Locations' : `${dailyLaborFilters.locations.length} selected`}</span>
                  <ChevronDown size={14} />
                </button>
                {isDailyLaborLocationDropdownOpen && (
                  <div className="absolute z-10 mt-1 w-full bg-slate-800/80 hairline rounded shadow-lg max-h-60 overflow-y-auto">
                    <label className="flex items-center px-3 py-2 hover:bg-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dailyLaborFilters.locations.length === 0}
                        onChange={() => setDailyLaborFilters({...dailyLaborFilters, locations: []})}
                        className="mr-2"
                      />
                      <span className="text-sm text-white">All Locations</span>
                    </label>
                    {sortByMarket(Object.keys(dailyLaborData)).map((location) => (
                      <label key={location} className="flex items-center px-3 py-2 hover:bg-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dailyLaborFilters.locations.includes(location)}
                          onChange={() => handleDailyLaborLocationToggle(location)}
                          className="mr-2"
                        />
                        <span className="text-sm text-white">{location}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
              <select
                value={dailyLaborFilters.market}
                onChange={(e) => setDailyLaborFilters({...dailyLaborFilters, market: e.target.value})}
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

      {dailyLaborError && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {dailyLaborError}
        </div>
      )}

      {dailyLaborLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="text-white text-lg">Loading labor data...</div>
        </div>
      ) : filteredDailyLabor.length === 0 ? (
        <div className="surface rounded-lg p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-blue-400" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No Labor Data</h3>
          <p className="text-slate-400">Select locations to view labor metrics</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredDailyLabor.map((location) => {
            const locationData = filterPrior7Days(dailyLaborData[location]);
            if (locationData.length === 0) return null;
            return (
              <div key={location} className="surface rounded-lg p-2 md:p-3 shadow-lg">
                <div className="mb-2 md:mb-3 flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm md:text-base font-bold text-white">{location}</h3>
                  {(() => {
                    const callOffEmployees = getCallOffEmployees(location);
                    if (callOffEmployees.length > 0) {
                      return (
                        <button
                          onClick={() => {
                            setCallOffModalData({ location: location, employees: callOffEmployees });
                            setShowCallOffModal(true);
                          }}
                          className="bg-orange-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 cursor-pointer hover:bg-orange-700 transition-colors"
                        >
                          CO ({callOffEmployees.length})
                        </button>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="surface-2 rounded-xl overflow-x-auto">
                  {/* Desktop Table */}
                  <table className="hidden md:table w-full text-sm tnum table-fixed">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="text-center p-2 text-slate-400 font-semibold w-16">Grade</th>
                        <th className="text-left p-2 text-slate-400 font-semibold w-44">Date</th>
                        <th className="text-right p-2 text-slate-400 font-semibold w-24">Act Hrs</th>
                        <th className="text-right p-2 text-slate-400 font-semibold w-24">Sch Hrs</th>
                        <th className="text-right p-2 text-slate-400 font-semibold w-24">Opt Hrs</th>
                        <th className="text-right p-2 text-slate-400 font-semibold w-24">Act %</th>
                        <th className="text-right p-2 text-slate-400 font-semibold w-24">Opt %</th>
                        <th className="text-right p-2 text-slate-400 font-semibold w-24">% Var</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locationData.map((day, idx) => {
                        // Cross-reference forecast variance from Daily Sales data
                        const salesDayData = (dailyFlashData[location] || []).find(s => s.date === day.date);
                        const forecastVar = salesDayData ? salesDayData.forecastVariance : null;
                        const grade = getDailyLaborGrade(day, forecastVar);
                        // Cross-reference auto-clockouts for this location+date
                        const dayClockouts = clockouts.filter(c => c.location === location && c.reportDate === day.date);
                        const dayExtraHrs = dayClockouts.reduce((sum, c) => { const h = parseFloat(c.extraHours); return sum + (isNaN(h) ? 0 : h); }, 0);
                        return (
                          <tr key={idx} className="border-t border-white/5 odd:bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                            <td className="text-center p-2">
                              {grade ? (
                                <span className={`inline-block w-7 py-0.5 rounded text-xs font-bold border ${grade.bg} ${grade.color}`}>
                                  {grade.letter}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="p-2 text-slate-300">
                              <div className="flex items-center gap-1.5">
                                {day.date}
                                {dayClockouts.length > 0 && (
                                  <button
                                    onClick={() => {
                                      setClockoutModalData({ location: location, data: dayClockouts });
                                      setShowClockoutModal(true);
                                    }}
                                    className="bg-red-600 text-white text-[10px] px-1 py-0.5 rounded font-semibold cursor-pointer hover:bg-red-700 transition-colors"
                                  >
                                    AC{dayClockouts.length > 1 ? `×${dayClockouts.length}` : ''} {dayExtraHrs > 0 ? `${dayExtraHrs.toFixed(1)}h` : ''}
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="text-right p-2 text-white font-semibold">{day.actualHours.toFixed(1)}</td>
                            <td className="text-right p-2 text-slate-300">{day.scheduledHours.toFixed(1)}</td>
                            <td className="text-right p-2 text-slate-300">{day.optimalHours.toFixed(1)}</td>
                            <td className="text-right p-2 text-white font-semibold">{day.actualLaborPercent.toFixed(1)}%</td>
                            <td className="text-right p-2 text-slate-300">{day.optimalLaborPercent.toFixed(1)}%</td>
                            <td className={`text-right p-2 font-semibold ${day.laborPercentVariance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {day.laborPercentVariance >= 0 ? '+' : ''}{day.laborPercentVariance.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile Ultra-Compact - All on one line per day */}
                  <div className="md:hidden">
                    {/* Mobile Headers */}
                    <div className="border-b border-white/5 px-1.5 py-2 text-[11px] flex items-center bg-slate-800 sticky top-0">
                      <div className="text-slate-400 font-semibold w-5 text-center">G</div>
                      <div className="text-slate-400 font-semibold w-12">Day</div>
                      <div className="text-slate-400 font-semibold text-right flex-1">Act</div>
                      <div className="text-slate-400 font-semibold text-right flex-1">Sch</div>
                      <div className="text-slate-400 font-semibold text-right flex-1">Opt</div>
                      <div className="text-slate-400 font-semibold text-right flex-1">Act%</div>
                      <div className="text-slate-400 font-semibold text-right flex-1">Opt%</div>
                    </div>

                    {/* Data rows */}
                    {locationData.map((day, idx) => {
                      // Get day of week abbreviation
                      const dayOfWeek = (() => {
                        try {
                          const date = new Date(day.date);
                          const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                          return days[date.getDay()];
                        } catch {
                          return day.date.substring(0, 3);
                        }
                      })();
                      const grade = (() => {
                        const salesDayData = (dailyFlashData[location] || []).find(s => s.date === day.date);
                        const forecastVar = salesDayData ? salesDayData.forecastVariance : null;
                        return getDailyLaborGrade(day, forecastVar);
                      })();
                      // Cross-reference auto-clockouts for this location+date
                      const dayClockouts = clockouts.filter(c => c.location === location && c.reportDate === day.date);
                      const dayExtraHrs = dayClockouts.reduce((sum, c) => { const h = parseFloat(c.extraHours); return sum + (isNaN(h) ? 0 : h); }, 0);

                      return (
                        <div key={idx} className="border-b border-white/5 last:border-b-0">
                          <div className="px-1.5 py-1.5 text-[11px] flex items-center">
                          {/* Grade */}
                          <div className="w-5 text-center flex-shrink-0">
                            {grade ? (
                              <span className={`inline-block w-5 py-0.5 rounded text-[10px] font-bold border ${grade.bg} ${grade.color}`}>
                                {grade.letter}
                              </span>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </div>

                          {/* Day + AC badge */}
                          <div className="w-12 flex items-center gap-1 flex-shrink-0">
                            <span className="text-slate-300 font-semibold">{dayOfWeek}</span>
                            {dayClockouts.length > 0 && (
                              <button
                                onClick={() => {
                                  setClockoutModalData({ location: location, data: dayClockouts });
                                  setShowClockoutModal(true);
                                }}
                                className="bg-red-600 text-white text-[8px] leading-tight px-1 py-0.5 rounded font-bold cursor-pointer hover:bg-red-700 transition-colors flex-shrink-0"
                              >
                                AC
                              </button>
                            )}
                          </div>

                          {/* Act Hours */}
                          <div className="text-white font-semibold text-right flex-1">{day.actualHours.toFixed(1)}</div>

                          {/* Sch Hours */}
                          <div className="text-slate-400 text-right flex-1">{day.scheduledHours.toFixed(1)}</div>

                          {/* Opt Hours */}
                          <div className="text-slate-400 text-right flex-1">{day.optimalHours.toFixed(1)}</div>

                          {/* Act % */}
                          <div className="text-white text-right flex-1">{day.actualLaborPercent.toFixed(1)}%</div>

                          {/* Opt % */}
                          <div className="text-slate-400 text-right flex-1">{day.optimalLaborPercent.toFixed(1)}%</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
