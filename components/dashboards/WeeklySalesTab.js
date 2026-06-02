import { AlertTriangle, Clock, DollarSign, Filter, Target, TrendingUp, Users } from 'lucide-react';

export default function WeeklySalesTab({
  availableWeeks,
  selectedWeek,
  setSelectedWeek,
  isWeekDropdownOpen,
  setIsWeekDropdownOpen,
  error,
  isLoading,
  totals,
  isFiltersOpen,
  setIsFiltersOpen,
  filters,
  setFilters,
  isLocationDropdownOpen,
  setIsLocationDropdownOpen,
  locations,
  handleLocationToggle,
  filteredLocations,
  getAutoClockoutData,
  getAutoClockoutExtraHours,
  getCallOffEmployees,
  setClockoutModalData,
  setShowClockoutModal,
  setCallOffModalData,
  setShowCallOffModal,
}) {
  return (
    <>
      {/* Control bar: week selector + filters share one row */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 mb-3 md:mb-4 shadow-lg">
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            className="flex items-center gap-2"
          >
            <Filter size={14} className="text-slate-400" />
            <h3 className="text-xs md:text-sm font-semibold text-white">Filters</h3>
            <span className="text-slate-400 text-sm">{isFiltersOpen ? '▼' : '▶'}</span>
          </button>

          {availableWeeks.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-sm font-medium text-slate-400">Select Week:</label>
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsWeekDropdownOpen(!isWeekDropdownOpen);
                  }}
                  className="px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600 flex items-center gap-2"
                >
                  <span>{selectedWeek === 'current' ? 'Current Week' : `Week ending ${selectedWeek}`}</span>
                  <span className="text-slate-400">▼</span>
                </button>
                {isWeekDropdownOpen && (
                  <div
                    className="absolute z-10 mt-1 bg-slate-700 border border-slate-600 rounded shadow-lg min-w-[200px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setSelectedWeek('current');
                        setIsWeekDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600"
                    >
                      Current Week
                    </button>
                    {availableWeeks.map(week => (
                      <button
                        key={week}
                        onClick={() => {
                          setSelectedWeek(week);
                          setIsWeekDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-600"
                      >
                        Week ending {week}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {isFiltersOpen && (
          <div className="flex flex-col md:flex-row gap-2 md:gap-3 items-stretch md:items-end mt-2 md:mt-3">
            <div className="relative flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Locations ({filters.locations.length > 0 ? filters.locations.length : 'All'})
              </label>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLocationDropdownOpen(!isLocationDropdownOpen);
                }}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-600 flex justify-between items-center"
              >
                <span>{filters.locations.length === 0 ? 'All Locations' : `${filters.locations.length} selected`}</span>
                <span className="text-slate-400">▼</span>
              </button>
              {isLocationDropdownOpen && (
                <div
                  className="absolute z-10 w-full mt-1 bg-slate-700 border border-slate-600 rounded shadow-lg max-h-64 overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600">
                    <input
                      type="checkbox"
                      checked={filters.locations.length === 0}
                      onChange={() => {
                        setFilters({...filters, locations: []});
                      }}
                      className="rounded"
                    />
                    <span className="text-white text-xs">All Locations</span>
                  </label>
                  {locations.map(loc => (
                    <label key={loc.location} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600">
                      <input
                        type="checkbox"
                        checked={filters.locations.includes(loc.location)}
                        onChange={() => handleLocationToggle(loc.location)}
                        className="rounded"
                      />
                      <span className="text-white text-xs">{loc.location}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
              <select
                value={filters.market}
                onChange={(e) => setFilters({...filters, market: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Markets</option>
                <option value="Tulsa">Tulsa</option>
                <option value="Oklahoma City">Oklahoma City</option>
                <option value="Dallas">Dallas</option>
                <option value="Orlando">Orlando</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Act vs Opt Hours</label>
              <select
                value={filters.actVsOptVariance}
                onChange={(e) => setFilters({...filters, actVsOptVariance: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Variances</option>
                <option value="positive">Over Optimal</option>
                <option value="negative">Under Optimal</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-400 mb-1">Sales Variance</label>
              <select
                value={filters.salesVariance}
                onChange={(e) => setFilters({...filters, salesVariance: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Variances</option>
                <option value="positive">Above Forecast</option>
                <option value="negative">Below Forecast</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {error}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="text-white text-lg">Loading data...</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-3 md:mb-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                <DollarSign className="text-green-400" size={14} />
                <p className="text-slate-400 text-xs font-medium">Actual Sales</p>
              </div>
              <p className="text-sm md:text-lg font-bold text-white">${totals.totalSales.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                <Target className="text-blue-400" size={14} />
                <p className="text-slate-400 text-xs font-medium">Forecast</p>
              </div>
              <p className="text-sm md:text-lg font-bold text-white">${totals.totalForecast.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                <AlertTriangle className={totals.flaggedCount > 0 ? 'text-red-400' : 'text-green-400'} size={14} />
                <p className="text-slate-400 text-xs font-medium">Fcst ↓ Sched ↑</p>
              </div>
              <p className={`text-sm md:text-lg font-bold ${totals.flaggedCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{totals.flaggedCount}</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                <TrendingUp className="text-cyan-400" size={14} />
                <p className="text-slate-400 text-xs font-medium">Comp PY Var</p>
              </div>
              <p className={`text-sm md:text-lg font-bold ${totals.comparablePyVariancePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totals.comparablePyVariancePercent >= 0 ? '+' : ''}{totals.comparablePyVariancePercent.toFixed(1)}%
              </p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                <Users className="text-orange-400" size={14} />
                <p className="text-slate-400 text-xs font-medium">Labor %</p>
              </div>
              <p className="text-sm md:text-lg font-bold text-white">{totals.avgLaborPercent.toFixed(1)}%</p>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
              <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                <Clock className="text-red-400" size={14} />
                <p className="text-slate-400 text-xs font-medium">Actual vs Scheduled</p>
              </div>
              <p className={`text-sm md:text-lg font-bold ${totals.totalActVsSch > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {totals.totalActVsSch > 0 ? '+' : ''}{totals.totalActVsSch.toFixed(1)} hrs
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
            {filteredLocations.map((loc, idx) => (
              <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                <div className="flex items-start justify-between mb-2 md:mb-3">
                  <h3 className="text-sm md:text-base font-bold text-white">{loc.location}</h3>
                  <div className="flex gap-1">
                    {(() => {
                      const clockoutData = getAutoClockoutData(loc.location);
                      const extraHrs = getAutoClockoutExtraHours(loc.location);
                      if (clockoutData.length > 0) {
                        return (
                          <button
                            onClick={() => {
                              setClockoutModalData({ location: loc.location, data: clockoutData });
                              setShowClockoutModal(true);
                            }}
                            className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 cursor-pointer hover:bg-red-700 transition-colors"
                          >
                            AC ({clockoutData.length}){extraHrs && ` ${extraHrs}h`}
                          </button>
                        );
                      }
                      return null;
                    })()}
                    {(() => {
                      const callOffEmployees = getCallOffEmployees(loc.location);
                      if (callOffEmployees.length > 0) {
                        return (
                          <button
                            onClick={() => {
                              setCallOffModalData({ location: loc.location, employees: callOffEmployees });
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
                </div>

                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                    <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">SALES</p>
                    <div className="space-y-0.5 md:space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Actual</span>
                        <span className="text-white font-bold text-xs">${loc.actualSales.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Forecast</span>
                        <span className={`font-semibold text-xs ${loc.salesVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {loc.salesVariance >= 0 ? '+' : '-'}${Math.abs(loc.salesVariance).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Prior Yr</span>
                        <span className={`font-semibold text-xs ${loc.pyVariancePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {loc.pyVariancePercent >= 0 ? '+' : ''}{loc.pyVariancePercent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                    <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">LABOR</p>
                    <div className="space-y-0.5 md:space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Labor %</span>
                        <span className="font-bold text-xs text-white">
                          {loc.laborPercent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Opt %</span>
                        <span className="text-white font-semibold text-xs">{loc.optimalLaborPercent.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Variance</span>
                        <span className={`font-bold text-xs ${loc.laborVariance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {loc.laborVariance > 0 ? '+' : ''}{loc.laborVariance.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                    <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">HOURS</p>
                    <div className="space-y-0.5 md:space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Sch/For</span>
                        <span className={`font-semibold text-xs ${loc.schVsForLaborVar > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                          {loc.schVsForLaborVar > 0 ? '+' : ''}{loc.schVsForLaborVar.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Act/Sch</span>
                        <span className={`font-semibold text-xs ${loc.actVsSchHours > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {loc.actVsSchHours > 0 ? '+' : ''}{loc.actVsSchHours.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Act/Opt</span>
                        <span className={`font-semibold text-xs ${loc.actVsOptHours > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {loc.actVsOptHours > 0 ? '+' : ''}{loc.actVsOptHours.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
