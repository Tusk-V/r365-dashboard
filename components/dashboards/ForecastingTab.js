import React from 'react';
import { ChevronDown, RefreshCw, TrendingUp } from 'lucide-react';
import { getMarket } from '../../lib/markets';
import { getWeekMonday, getWeatherEmoji, computeForecastForLocation } from '../../lib/forecast';

export default function ForecastingTab({
  forecastData,
  dailyFlashData,
  modelForecastData,
  forecastLoading,
  forecastWeekOffset,
  setForecastWeekOffset,
  forecastMarketFilter,
  setForecastMarketFilter,
  forecastAccuracyExpanded,
  setForecastAccuracyExpanded,
  modelCoefficients,
  isAdmin,
  dashboardAccess,
}) {
  return (
    <>
      {/* Filters Bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />Sales Forecasting
            </h2>
            <p className="text-xs text-slate-400">Three-way comparison: Model vs R365 vs Actual</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-slate-700 rounded-lg overflow-hidden">
            {[{ val: -1, label: 'Last Week' }, { val: 0, label: 'This Week' }, { val: 1, label: 'Next Week' }].map(w => (
              <button key={w.val} onClick={() => setForecastWeekOffset(w.val)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${forecastWeekOffset === w.val ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-600'}`}>
                {w.label}
              </button>
            ))}
          </div>
          <select value={forecastMarketFilter} onChange={(e) => setForecastMarketFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-700 border border-slate-600 rounded-lg text-white">
            <option value="all">All Markets</option>
            <option value="Tulsa">Tulsa</option><option value="Oklahoma City">Oklahoma City</option>
            <option value="Dallas">Dallas</option><option value="Orlando">Orlando</option>
          </select>
        </div>
        <div className="text-xs text-slate-500 mt-1.5">
          {(() => { const mon = getWeekMonday(forecastWeekOffset); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
            const label = forecastWeekOffset === -1 ? 'Last Week' : forecastWeekOffset === 0 ? 'This Week' : 'Next Week';
            return `${label}: Mon ${mon.getMonth()+1}/${mon.getDate()} - Sun ${sun.getMonth()+1}/${sun.getDate()}`; })()}
        </div>
      </div>

      {/* Rolling Accuracy Tracker */}
      {!forecastLoading && forecastData.length > 0 && (() => {
        const allLocs = [...new Set(forecastData.map(d => d.location))].sort();
        const filteredLocs = forecastMarketFilter === 'all' ? allLocs : allLocs.filter(l => getMarket(l) === forecastMarketFilter);
        const accessLocs = isAdmin ? filteredLocs : dashboardAccess?.type === 'specific' ? filteredLocs.filter(l => dashboardAccess.locations?.includes(l)) : dashboardAccess?.type === 'all' ? filteredLocs : [];

        const locAccuracy = accessLocs.map(loc => {
          const weekResults = [];
          for (let w = -1; w >= -4; w--) {
            const days = computeForecastForLocation({ forecastData, dailyFlashData, modelForecastData }, loc, w);
            const withBoth = days.filter(d => d.forecast > 0 && d.actual !== null && d.actual > 0);
            if (withBoth.length === 0) continue;
            const totalF = withBoth.reduce((s, d) => s + d.forecast, 0);
            const totalA = withBoth.reduce((s, d) => s + d.actual, 0);
            const acc = totalA > 0 ? (1 - Math.abs(totalF - totalA) / totalA) * 100 : 0;
            // R365 accuracy for same period
            const r365WithBoth = withBoth.filter(d => d.r365Forecast !== null && d.r365Forecast > 0);
            const r365TotalF = r365WithBoth.reduce((s, d) => s + d.r365Forecast, 0);
            const r365TotalA = r365WithBoth.reduce((s, d) => s + d.actual, 0);
            const r365Acc = r365TotalA > 0 && r365TotalF > 0 ? (1 - Math.abs(r365TotalF - r365TotalA) / r365TotalA) * 100 : null;
            const mon = getWeekMonday(w);
            weekResults.push({ week: w, accuracy: Math.round(acc * 10) / 10, r365Accuracy: r365Acc !== null ? Math.round(r365Acc * 10) / 10 : null, forecast: totalF, actual: totalA, label: `${mon.getMonth()+1}/${mon.getDate()}` });
          }
          if (weekResults.length === 0) return null;
          const avgAccuracy = weekResults.reduce((s, w) => s + w.accuracy, 0) / weekResults.length;
          const r365Weeks = weekResults.filter(w => w.r365Accuracy !== null);
          const avgR365 = r365Weeks.length > 0 ? r365Weeks.reduce((s, w) => s + w.r365Accuracy, 0) / r365Weeks.length : null;
          let trend = 'flat';
          if (weekResults.length >= 3) {
            const recent = weekResults.slice(0, Math.ceil(weekResults.length / 2));
            const older = weekResults.slice(Math.ceil(weekResults.length / 2));
            const recentAvg = recent.reduce((s, w) => s + w.accuracy, 0) / recent.length;
            const olderAvg = older.reduce((s, w) => s + w.accuracy, 0) / older.length;
            if (recentAvg - olderAvg > 2) trend = 'improving';
            else if (olderAvg - recentAvg > 2) trend = 'declining';
          }
          return { location: loc, weeks: weekResults, avgAccuracy: Math.round(avgAccuracy * 10) / 10, avgR365: avgR365 !== null ? Math.round(avgR365 * 10) / 10 : null, trend };
        }).filter(Boolean);

        if (locAccuracy.length === 0) return null;
        const overallAvg = locAccuracy.reduce((s, l) => s + l.avgAccuracy, 0) / locAccuracy.length;
        const r365Locs = locAccuracy.filter(l => l.avgR365 !== null);
        const overallR365 = r365Locs.length > 0 ? r365Locs.reduce((s, l) => s + l.avgR365, 0) / r365Locs.length : null;

        return (
          <div className="bg-slate-800 border border-slate-700 rounded-lg mb-3 overflow-hidden shadow-lg">
            <div className="px-4 py-2.5 border-b border-slate-700 flex items-center justify-between cursor-pointer select-none" onClick={() => setForecastAccuracyExpanded(!forecastAccuracyExpanded)}>
              <div className="flex items-center gap-2">
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${forecastAccuracyExpanded ? '' : '-rotate-90'}`} />
                <div>
                  <div className="text-sm font-semibold text-white">Forecast Accuracy -- Rolling 4 Weeks</div>
                  <div className="text-xs text-slate-400">Model vs R365 accuracy comparison{modelCoefficients?.version ? ` · Coefficients v${modelCoefficients.version}` : ''}{modelCoefficients?.last_tuned ? ` (tuned ${modelCoefficients.last_tuned})` : ''}</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className={`text-xl font-bold ${overallAvg >= 95 ? 'text-green-400' : overallAvg >= 90 ? 'text-yellow-400' : 'text-orange-400'}`}>{overallAvg.toFixed(1)}%</span>
                  <div className="text-[10px] text-slate-500">Model Avg</div>
                </div>
                {overallR365 !== null && (
                  <div className="text-right">
                    <span className={`text-xl font-bold ${overallR365 >= 95 ? 'text-green-400' : overallR365 >= 90 ? 'text-yellow-400' : 'text-orange-400'}`}>{overallR365.toFixed(1)}%</span>
                    <div className="text-[10px] text-slate-500">R365 Avg</div>
                  </div>
                )}
              </div>
            </div>
            {forecastAccuracyExpanded && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs" style={{ fontSize: '0.78rem' }}>
                <thead>
                  <tr className="text-slate-400 uppercase" style={{ fontSize: '0.68rem' }}>
                    <th className="text-left pl-3 py-1.5 font-semibold">Location</th>
                    {locAccuracy[0]?.weeks.map((w, i) => (
                      <th key={i} className="text-right px-2 py-1.5 font-semibold" colSpan={2}>Wk {w.label}</th>
                    ))}
                    <th className="text-right px-2 py-1.5 font-semibold" colSpan={2}>Avg</th>
                    <th className="text-right pr-3 py-1.5 font-semibold">Trend</th>
                  </tr>
                  <tr className="text-slate-500" style={{ fontSize: '0.6rem' }}>
                    <th></th>
                    {locAccuracy[0]?.weeks.map((w, i) => (
                      <React.Fragment key={i}><th className="text-right px-1 pb-1">Model</th><th className="text-right px-1 pb-1">R365</th></React.Fragment>
                    ))}
                    <th className="text-right px-1 pb-1">Model</th><th className="text-right px-1 pb-1">R365</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {locAccuracy.sort((a, b) => b.avgAccuracy - a.avgAccuracy).map(loc => (
                    <tr key={loc.location} className="border-b border-slate-700/40">
                      <td className="text-left pl-3 py-1.5 font-medium text-slate-200">{loc.location}</td>
                      {loc.weeks.map((w, i) => (
                        <React.Fragment key={i}>
                          <td className={`text-right px-1 py-1.5 font-semibold ${w.accuracy >= 96 ? 'text-green-400' : w.accuracy >= 92 ? 'text-yellow-400' : w.accuracy >= 85 ? 'text-orange-400' : 'text-red-400'}`}>{w.accuracy}%</td>
                          <td className={`text-right px-1 py-1.5 ${w.r365Accuracy !== null ? (w.r365Accuracy >= 96 ? 'text-green-400' : w.r365Accuracy >= 92 ? 'text-yellow-400' : w.r365Accuracy >= 85 ? 'text-orange-400' : 'text-red-400') : 'text-slate-600'}`}>{w.r365Accuracy !== null ? `${w.r365Accuracy}%` : '--'}</td>
                        </React.Fragment>
                      ))}
                      <td className={`text-right px-1 py-1.5 font-bold ${loc.avgAccuracy >= 95 ? 'text-green-400' : loc.avgAccuracy >= 90 ? 'text-yellow-400' : 'text-orange-400'}`}>{loc.avgAccuracy}%</td>
                      <td className={`text-right px-1 py-1.5 font-bold ${loc.avgR365 !== null ? (loc.avgR365 >= 95 ? 'text-green-400' : loc.avgR365 >= 90 ? 'text-yellow-400' : 'text-orange-400') : 'text-slate-600'}`}>{loc.avgR365 !== null ? `${loc.avgR365}%` : '--'}</td>
                      <td className="text-right pr-3 py-1.5">
                        {loc.trend === 'improving' ? <span className="text-green-400">↑</span> : loc.trend === 'declining' ? <span className="text-red-400">↓</span> : <span className="text-slate-500">&rarr;</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>
        );
      })()}

      {forecastLoading && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <RefreshCw className="w-6 h-6 text-blue-400 animate-spin mx-auto mb-2" />
          <p className="text-slate-400 text-sm">Loading forecast data...</p>
        </div>
      )}

      {/* Location Cards */}
      {!forecastLoading && forecastData.length > 0 && (() => {
        const allLocs = [...new Set(forecastData.map(d => d.location))].sort();
        const filteredLocs = forecastMarketFilter === 'all' ? allLocs : allLocs.filter(l => getMarket(l) === forecastMarketFilter);
        const accessLocs = isAdmin ? filteredLocs : dashboardAccess?.type === 'specific' ? filteredLocs.filter(l => dashboardAccess.locations?.includes(l)) : dashboardAccess?.type === 'all' ? filteredLocs : [];
        if (accessLocs.length === 0) return <div className="text-center text-slate-400 py-8 text-sm">No locations available</div>;

        return accessLocs.map(loc => {
          const days = computeForecastForLocation({ forecastData, dailyFlashData, modelForecastData }, loc, forecastWeekOffset);
          if (days.length === 0) return null;
          const totalForecast = days.reduce((s, d) => s + d.forecast, 0);
          const totalR365 = days.filter(d => d.r365Forecast !== null).reduce((s, d) => s + d.r365Forecast, 0);
          const totalActual = days.filter(d => d.actual !== null).reduce((s, d) => s + d.actual, 0);
          // Apples-to-apples: only sum model/R365 forecast over days that have actuals
          const daysWithActual = days.filter(d => d.actual !== null);
          const totalForecastForActual = daysWithActual.reduce((s, d) => s + d.forecast, 0);
          const totalR365ForActual = daysWithActual.filter(d => d.r365Forecast !== null).reduce((s, d) => s + d.r365Forecast, 0);
          const totalAvg = days.reduce((s, d) => s + d.weightedAvg, 0);
          const totalPW = days.filter(d => d.pwSales !== null).reduce((s, d) => s + d.pwSales, 0);
          const totalPY = days.filter(d => d.pySales !== null).reduce((s, d) => s + d.pySales, 0);

          return (
            <div key={loc} className="bg-slate-800 border border-slate-700 rounded-lg mb-3 shadow-lg">
              <div className="px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                <span className="font-bold text-sm text-white">{loc}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300">{getMarket(loc)}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs whitespace-nowrap" style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr className="text-slate-400 uppercase" style={{ fontSize: '0.68rem' }}>
                      <th className="text-left pl-3 py-1.5 font-semibold">Day</th>
                      <th className="text-right px-1.5 py-1.5 font-semibold">Model Fcst</th>
                      <th className="text-right px-1.5 py-1.5 font-semibold">R365 Fcst</th>
                      {forecastWeekOffset <= 0 && <th className="text-right px-1.5 py-1.5 font-semibold">Actual / Var</th>}
                      <th className="text-right px-1.5 py-1.5 font-semibold">Weather</th>
                      <th className="text-right px-1.5 py-1.5 font-semibold">vs Prior Wk</th>
                      <th className="text-right px-1.5 py-1.5 font-semibold">4-Wk Avg</th>
                      <th className="text-right pl-1.5 pr-1 py-1.5 font-semibold border-l border-slate-600">PW Sales</th>
                      <th className="text-right px-1 py-1.5 font-semibold">PW Wthr</th>
                      <th className="text-right pl-1.5 pr-1 py-1.5 font-semibold border-l border-slate-600">PY Sales</th>
                      <th className="text-right px-1 pr-1.5 py-1.5 font-semibold border-r border-slate-600">PY Wthr</th>
                    </tr>
                  </thead>
                  <tbody>
                    {days.map((day, idx) => (
                      <tr key={idx} className={`border-b border-slate-700/40 ${day.isToday ? 'bg-blue-900/10' : ''}`}>
                        <td className="text-left pl-3 py-1.5">
                          <span className="font-medium text-slate-200">{day.dayLabel}</span>
                          {day.holiday && <span className="ml-1.5 text-[9px] font-semibold bg-purple-600 text-white px-1.5 py-px rounded align-middle">{day.holiday}</span>}
                        </td>
                        <td className="text-right px-1.5 py-1.5">
                          <div className="relative inline-block group cursor-default">
                            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle ${day.confidence === 'high' ? 'bg-green-400' : day.confidence === 'med' ? 'bg-yellow-400' : 'bg-orange-400'}`} />
                            <span className="font-bold text-white">${day.forecast.toLocaleString()}</span>
                            <div className="hidden group-hover:block absolute bottom-full right-0 mb-1.5 bg-slate-900 border border-slate-600 rounded-md p-2 min-w-[180px] z-50 shadow-xl whitespace-normal">
                              <div className="flex justify-between text-[10px] py-px"><span className="text-slate-400">Method</span><span className="text-slate-300 font-semibold">{day.forecastMethod === 'pw' ? 'Prior Week' : day.forecastMethod === 'blend' ? 'PW+Avg Blend' : '4-Wk Avg'}</span></div>
                              {day.modelForecast !== null && <div className="flex justify-between text-[10px] py-px"><span className="text-slate-400">Source</span><span className="text-emerald-400 font-semibold">Stored Prediction</span></div>}
                              {day.modelCoeffVer && <div className="flex justify-between text-[10px] py-px"><span className="text-slate-400">Coeff v{day.modelCoeffVer}</span><span className="text-slate-500">{day.modelGenAt || ''}</span></div>}
                              {day.pwOutlier && <div className="text-[9px] text-amber-400 py-px">⚠ PW was &gt;30% off avg -- blended 60/40</div>}
                              <div className="flex justify-between text-[10px] py-px"><span className="text-slate-400">Weather Adj</span><span className={`font-semibold ${day.weatherAdj > 0 ? 'text-orange-400' : day.weatherAdj < 0 ? 'text-blue-400' : 'text-slate-300'}`}>{day.weatherAdj > 0 ? '+' : ''}{day.weatherAdj}%</span></div>
                            </div>
                          </div>
                        </td>
                        <td className="text-right px-1.5 py-1.5">
                          {day.r365Forecast !== null ? (
                            <span className="font-semibold text-cyan-300">${day.r365Forecast.toLocaleString()}</span>
                          ) : <span className="text-slate-600">--</span>}
                        </td>
                        {forecastWeekOffset <= 0 && (
                          <td className="text-right px-1.5 py-1.5">
                            {day.actual !== null ? (
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-white">${day.actual.toLocaleString()}</span>
                                <div className="flex gap-1.5">
                                  {day.forecast > 0 && (
                                    <span className={`text-[10px] font-semibold ${day.actual >= day.forecast ? 'text-green-400' : 'text-red-400'}`}>
                                      M:{day.actual >= day.forecast ? '+' : ''}{Math.round(((day.actual - day.forecast) / day.forecast) * 100)}%
                                    </span>
                                  )}
                                  {day.r365Forecast !== null && day.r365Forecast > 0 && (
                                    <span className={`text-[10px] font-semibold ${day.actual >= day.r365Forecast ? 'text-green-400' : 'text-red-400'}`}>
                                      R:{day.actual >= day.r365Forecast ? '+' : ''}{Math.round(((day.actual - day.r365Forecast) / day.r365Forecast) * 100)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : <span className="text-slate-600">--</span>}
                          </td>
                        )}
                        <td className="text-right px-1.5 py-1.5">
                          <div className="flex items-center justify-end gap-1">
                            <span>{getWeatherEmoji(day.conditions)}</span>
                            <span className="font-semibold text-white">{day.highTemp !== null ? `${Math.round(day.highTemp)} degrees ` : '--'}</span>
                          </div>
                        </td>
                        <td className="text-right px-1.5 py-1.5">
                          {day.tempDelta !== null ? (
                            <span className={`font-semibold ${day.tempCompare === 'warmer' ? 'text-orange-400' : day.tempCompare === 'cooler' ? 'text-sky-400' : 'text-slate-400'}`}>
                              {day.tempCompare === 'warmer' ? `${Math.abs(Math.round(day.tempDelta))} degrees  warmer` : day.tempCompare === 'cooler' ? `${Math.abs(Math.round(day.tempDelta))} degrees  cooler` : 'Similar'}
                            </span>
                          ) : <span className="text-slate-500">--</span>}
                          {day.conditionChange && <div className="text-purple-400 font-medium" style={{ fontSize: '0.62rem' }}>{day.conditionChange}</div>}
                        </td>
                        <td className="text-right px-1.5 py-1.5 font-semibold text-white">${day.weightedAvg.toLocaleString()}</td>
                        <td className="text-right pl-1.5 pr-1 py-1.5 text-slate-400 border-l border-slate-600">{day.pwSales !== null ? `$${day.pwSales.toLocaleString()}` : <span className="text-slate-600">--</span>}</td>
                        <td className="text-right px-1 py-1.5">
                          {day.pwTemp !== null ? (
                            <div className="flex items-center justify-end gap-px">
                              <span style={{ fontSize: '0.78rem' }}>{getWeatherEmoji(day.pwConditions)}</span>
                              <span className="text-slate-500 font-medium">{Math.round(day.pwTemp)} degrees </span>
                            </div>
                          ) : <span className="text-slate-600">--</span>}
                        </td>
                        <td className="text-right pl-1.5 pr-1 py-1.5 text-slate-400 border-l border-slate-600">{day.pySales !== null ? `$${day.pySales.toLocaleString()}` : <span className="text-slate-600">--</span>}</td>
                        <td className="text-right px-1 pr-1.5 py-1.5 border-r border-slate-600">
                          {day.pyWeather ? (
                            <div className="flex items-center justify-end gap-px">
                              <span style={{ fontSize: '0.78rem' }}>{getWeatherEmoji(day.pyConditions)}</span>
                              <span className="text-slate-500 font-medium">{day.pyWeather ? `${Math.round(day.pyWeather)} degrees ` : ''}</span>
                            </div>
                          ) : <span className="text-slate-600">--</span>}
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="bg-slate-900/50">
                      <td className="text-left pl-3 py-2 font-bold text-slate-300 border-t border-slate-600">Total</td>
                      <td className="text-right px-1.5 py-2 font-bold text-white border-t border-slate-600">${totalForecast.toLocaleString()}</td>
                      <td className="text-right px-1.5 py-2 font-bold text-cyan-300 border-t border-slate-600">{totalR365 > 0 ? `$${totalR365.toLocaleString()}` : ''}</td>
                      {forecastWeekOffset <= 0 && (
                        <td className="text-right px-1.5 py-2 font-bold border-t border-slate-600">
                          {totalActual > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-white">${totalActual.toLocaleString()}</span>
                              <div className="flex gap-1.5">
                                {totalForecastForActual > 0 && <span className={`text-[10px] font-semibold ${totalActual >= totalForecastForActual ? 'text-green-400' : 'text-red-400'}`}>M:{totalActual >= totalForecastForActual ? '+' : ''}{Math.round(((totalActual - totalForecastForActual) / totalForecastForActual) * 100)}%</span>}
                                {totalR365ForActual > 0 && <span className={`text-[10px] font-semibold ${totalActual >= totalR365ForActual ? 'text-green-400' : 'text-red-400'}`}>R:{totalActual >= totalR365ForActual ? '+' : ''}{Math.round(((totalActual - totalR365ForActual) / totalR365ForActual) * 100)}%</span>}
                              </div>
                            </div>
                          ) : ''}
                        </td>
                      )}
                      <td className="border-t border-slate-600" />
                      <td className="border-t border-slate-600" />
                      <td className="text-right px-1.5 py-2 font-bold text-white border-t border-slate-600">${totalAvg.toLocaleString()}</td>
                      <td className="text-right pl-1.5 pr-1 py-2 text-slate-400 font-bold border-t border-slate-600 border-l border-slate-600">{totalPW > 0 ? `$${totalPW.toLocaleString()}` : ''}</td>
                      <td className="border-t border-slate-600" />
                      <td className="text-right pl-1.5 pr-1 py-2 text-slate-400 font-bold border-t border-slate-600 border-l border-slate-600">{totalPY > 0 ? `$${totalPY.toLocaleString()}` : ''}</td>
                      <td className="border-t border-slate-600 border-r border-slate-600" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        });
      })()}

      {!forecastLoading && forecastData.length === 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <TrendingUp className="w-8 h-8 text-slate-600 mx-auto mb-2" />
          <p className="text-slate-400 text-sm">No forecast data available</p>
          <p className="text-slate-500 text-xs mt-1">Make sure the Forecast Data sheet has been populated</p>
        </div>
      )}
    </>
  );
}
