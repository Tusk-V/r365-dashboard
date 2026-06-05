import { Filter } from 'lucide-react';
import { sortByMarket } from '../../lib/markets';

export default function DailySalesTab({
  dailyFlashData,
  filteredDailyFlash,
  dailyFlashLoading,
  dailyFlashError,
  dailyFlashFilters,
  setDailyFlashFilters,
  isDailyFlashFiltersOpen,
  setIsDailyFlashFiltersOpen,
  isDailyFlashLocationDropdownOpen,
  setIsDailyFlashLocationDropdownOpen,
  handleDailyFlashLocationToggle,
  filterPrior7Days,
}) {
  return (
    <>
      <div className="surface rounded-lg p-3 mb-3 shadow-lg">
        <button
          onClick={() => setIsDailyFlashFiltersOpen(!isDailyFlashFiltersOpen)}
          className="flex items-center gap-2 w-full"
        >
          <Filter className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Filters</h3>
          <span className="text-slate-400 text-sm ml-auto">{isDailyFlashFiltersOpen ? '▼' : '▶'}</span>
        </button>
        {isDailyFlashFiltersOpen && (
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1 relative">
              <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDailyFlashLocationDropdownOpen(!isDailyFlashLocationDropdownOpen);
                }}
                className="w-full px-2 py-1.5 text-sm bg-slate-800/80 hairline rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
              >
                <span>{dailyFlashFilters.locations.length === 0 ? 'All Locations' : `${dailyFlashFilters.locations.length} selected`}</span>
                <span className="text-slate-400">▼</span>
              </button>
              {isDailyFlashLocationDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-slate-800/80 hairline rounded shadow-lg max-h-60 overflow-y-auto">
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600 border-b border-slate-600">
                    <input
                      type="checkbox"
                      checked={dailyFlashFilters.locations.length === 0}
                      onChange={() => setDailyFlashFilters({...dailyFlashFilters, locations: []})}
                      className="rounded"
                    />
                    <span className="text-white text-xs font-semibold">All Locations</span>
                  </label>
                  {sortByMarket(Object.keys(dailyFlashData)).map(location => (
                    <label key={location} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600">
                      <input
                        type="checkbox"
                        checked={dailyFlashFilters.locations.includes(location)}
                        onChange={() => handleDailyFlashLocationToggle(location)}
                        className="rounded"
                      />
                      <span className="text-white text-xs">{location}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
              <select
                value={dailyFlashFilters.market}
                onChange={(e) => setDailyFlashFilters({...dailyFlashFilters, market: e.target.value})}
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

      {dailyFlashError && (
        <div className="bg-rose-950/50 ring-1 ring-rose-500/30 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {dailyFlashError}
        </div>
      )}

      {dailyFlashLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400"><div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-andy-red animate-spin" /><span className="text-sm">Loading daily sales data...</span></div>
        </div>
      ) : Object.keys(dailyFlashData).length === 0 ? (
        <div className="surface rounded-lg p-8 text-center">
          <p className="text-slate-400">No daily sales data available</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:gap-3">
          {filteredDailyFlash.map((location) => {
            const locationData = filterPrior7Days(dailyFlashData[location]);
            if (locationData.length === 0) return null;
            return (
              <div key={location} className="surface rounded-2xl p-2 md:p-3 shadow-card">
                <div className="mb-2 md:mb-3">
                  <h3 className="text-sm md:text-base font-bold text-white">{location}</h3>
                </div>

                <div className="surface-2 rounded-xl overflow-x-auto">
                  {/* Desktop Table */}
                  <table className="hidden md:table w-full text-sm tnum">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="text-left p-2 text-slate-400 font-semibold">Date</th>
                        <th className="text-right p-2 text-slate-400 font-semibold">Sales</th>
                        <th className="text-right p-2 text-slate-400 font-semibold">PY Sales</th>
                        <th className="text-right p-2 text-slate-400 font-semibold">PY Var</th>
                        <th className="text-right p-2 text-slate-400 font-semibold">Fcst Var</th>
                        <th className="text-right p-2 text-slate-400 font-semibold">Guests</th>
                        <th className="text-right p-2 text-slate-400 font-semibold">PY Guests</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locationData.map((day, idx) => {
                        const pyVarPercent = day.paySales > 0 ? (((day.sales - day.paySales) / day.paySales) * 100) : 0;
                        return (
                          <tr key={idx} className="border-t border-white/5 odd:bg-white/[0.02] hover:bg-white/[0.05] transition-colors">
                            <td className="p-2 text-slate-300">{day.date}</td>
                            <td className="text-right p-2 text-white font-semibold">${day.sales.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                            <td className="text-right p-2 text-slate-300">${day.paySales.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</td>
                            <td className={`text-right p-2 font-semibold ${pyVarPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pyVarPercent >= 0 ? '+' : ''}{pyVarPercent.toFixed(1)}%
                            </td>
                            <td className={`text-right p-2 font-semibold ${day.forecastVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {day.forecastVariance >= 0 ? '+' : '-'}${Math.abs(day.forecastVariance).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                            </td>
                            <td className="text-right p-2 text-white">{day.guestCount.toLocaleString('en-US')}</td>
                            <td className="text-right p-2 text-slate-300">{day.payGuestCount.toLocaleString('en-US')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Mobile Ultra-Compact - All on one line per day */}
                  <div className="md:hidden">
                    {/* Mobile Headers */}
                    <div className="border-b border-white/5 p-2 text-xs flex items-center bg-slate-800 sticky top-0">
                      <div className="text-slate-400 font-semibold w-9">Day</div>
                      <div className="text-slate-400 font-semibold text-right flex-1">Sales</div>
                      <div className="text-slate-400 font-semibold text-right flex-1">PY</div>
                      <div className="text-slate-400 font-semibold text-right w-12">PY%</div>
                      <div className="text-slate-400 font-semibold text-right w-14">Fcst</div>
                      <div className="text-slate-400 font-semibold text-right w-10">Gst</div>
                      <div className="text-slate-400 font-semibold text-right w-10">PY</div>
                    </div>

                    {/* Data rows */}
                    {locationData.map((day, idx) => {
                      const pyVarPercent = day.paySales > 0 ? (((day.sales - day.paySales) / day.paySales) * 100) : 0;

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

                      return (
                        <div key={idx} className="border-b border-white/5 last:border-b-0 p-2 text-xs flex items-center">
                          {/* Day */}
                          <div className="text-slate-300 font-semibold w-9">{dayOfWeek}</div>

                          {/* Sales */}
                          <div className="text-white font-semibold text-right flex-1">${day.sales.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>

                          {/* PY Sales */}
                          <div className="text-slate-400 text-right flex-1">${day.paySales.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>

                          {/* PY Var % */}
                          <div className={`font-semibold text-right w-12 ${pyVarPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pyVarPercent >= 0 ? '+' : ''}{pyVarPercent.toFixed(0)}%
                          </div>

                          {/* Forecast Var */}
                          <div className={`font-semibold text-right w-14 ${day.forecastVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {day.forecastVariance >= 0 ? '+' : '-'}{Math.abs(Math.round(day.forecastVariance))}
                          </div>

                          {/* Guests */}
                          <div className="text-white text-right w-10">{day.guestCount}</div>

                          {/* PY Guests */}
                          <div className="text-slate-400 text-right w-10">{day.payGuestCount}</div>
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
