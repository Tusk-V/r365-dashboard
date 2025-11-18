import { useState, useEffect } from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw } from 'lucide-react';

// Google Sheets API Configuration
const API_KEY = 'AIzaSyAbUI3oP_0ofBG9tiAudYLUjZ4MSSaFNDA';
const SPREADSHEET_ID = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';
const SHEET_NAME = 'Sheet1';

export default function Home() {
  const [locations, setLocations] = useState([]);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [filters, setFilters] = useState({
    locations: [],
    actVsOptVariance: 'all',
    salesVariance: 'all'
  });
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reportDate, setReportDate] = useState('Loading...');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDataFromGoogleSheets();
    const interval = setInterval(loadDataFromGoogleSheets, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    applyFilters();
  }, [locations, filters]);

  const loadDataFromGoogleSheets = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const range = `${SHEET_NAME}!A2:K`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to load data from Google Sheets');
      }
      
      const data = await response.json();
      
      if (!data.values || data.values.length === 0) {
        throw new Error('No data found in spreadsheet');
      }
      
      const parsedData = parseSheetData(data.values);
      
      if (parsedData.length > 0) {
        setLocations(parsedData);
        if (parsedData[0].reportDate) {
          setReportDate(parsedData[0].reportDate);
        }
        setLastUpdated(new Date());
      } else {
        setError('No valid data found in Google Sheet');
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const parseSheetData = (rows) => {
    const parsedData = [];
    
    for (const row of rows) {
      if (row.length >= 11 && row[0]) {
        parsedData.push({
          location: row[0],
          actualSales: parseFloat(row[1]) || 0,
          forecastSales: parseFloat(row[2]) || 0,
          salesVariance: parseFloat(row[3]) || 0,
          priorYearSales: parseFloat(row[4]) || 0,
          laborPercent: parseFloat(row[5]) * 100 || 0,
          optimalLaborHours: parseFloat(row[6]) || 0,
          actualLaborHours: parseFloat(row[7]) || 0,
          schVsForLaborVar: parseFloat(row[9]) || 0,
          reportDate: row[10] || ''
        });
      }
    }
    
    return parsedData;
  };

  const applyFilters = () => {
    let filtered = locations.map(loc => {
      const productivity = loc.actualSales / loc.actualLaborHours;
      const laborCostPerHour = (loc.actualSales * (loc.laborPercent / 100)) / loc.actualLaborHours;
      const laborCost = loc.actualSales * (loc.laborPercent / 100);
      const pyVariancePercent = ((loc.actualSales - loc.priorYearSales) / loc.priorYearSales) * 100;
      const actVsOptHours = loc.actualLaborHours - loc.optimalLaborHours;

      return {
        ...loc,
        productivity,
        laborCostPerHour,
        laborCost,
        pyVariancePercent,
        actVsOptHours
      };
    });

    if (filters.locations.length > 0) {
      filtered = filtered.filter(loc => filters.locations.includes(loc.location));
    }

    if (filters.actVsOptVariance === 'positive') {
      filtered = filtered.filter(loc => loc.actVsOptHours > 0);
    } else if (filters.actVsOptVariance === 'negative') {
      filtered = filtered.filter(loc => loc.actVsOptHours <= 0);
    }

    if (filters.salesVariance === 'positive') {
      filtered = filtered.filter(loc => loc.salesVariance > 0);
    } else if (filters.salesVariance === 'negative') {
      filtered = filtered.filter(loc => loc.salesVariance < 0);
    }

    setFilteredLocations(filtered);
  };

  const handleLocationToggle = (location) => {
    setFilters(prev => {
      const newLocations = prev.locations.includes(location)
        ? prev.locations.filter(l => l !== location)
        : [...prev.locations, location];
      return { ...prev, locations: newLocations };
    });
  };

  const calculateTotals = () => {
    if (filteredLocations.length === 0) return {
      totalActualSales: 0,
      totalForecastSales: 0,
      totalPYSales: 0,
      avgLaborPercent: 0,
      totalActualHours: 0,
      totalOptimalHours: 0,
      avgProductivity: 0,
      totalSchVsForHours: 0,
      avgLaborCostPerHour: 0
    };

    return {
      totalActualSales: filteredLocations.reduce((sum, loc) => sum + loc.actualSales, 0),
      totalForecastSales: filteredLocations.reduce((sum, loc) => sum + loc.forecastSales, 0),
      totalPYSales: filteredLocations.reduce((sum, loc) => sum + loc.priorYearSales, 0),
      avgLaborPercent: filteredLocations.reduce((sum, loc) => sum + loc.laborPercent, 0) / filteredLocations.length,
      totalActualHours: filteredLocations.reduce((sum, loc) => sum + loc.actualLaborHours, 0),
      totalOptimalHours: filteredLocations.reduce((sum, loc) => sum + loc.optimalLaborHours, 0),
      avgProductivity: filteredLocations.reduce((sum, loc) => sum + loc.productivity, 0) / filteredLocations.length,
      totalSchVsForHours: filteredLocations.reduce((sum, loc) => sum + loc.schVsForLaborVar, 0),
      avgLaborCostPerHour: filteredLocations.reduce((sum, loc) => sum + loc.laborCostPerHour, 0) / filteredLocations.length
    };
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="bg-slate-800 border-b border-blue-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img 
                src="https://i.imgur.com/kkJMVz0.png" 
                alt="Andy's Frozen Custard" 
                className="h-12 w-auto object-contain"
                onError={(e) => {e.target.style.display='none'}}
              />
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">Weekly Sales and Labor</h1>
                <p className="text-slate-400 text-xs mt-1">
                  Week Ending: {reportDate}
                  {lastUpdated && (
                    <span className="ml-2">
                      • Updated: {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={loadDataFromGoogleSheets}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg cursor-pointer transition-colors"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              <span className="text-xs font-medium">
                {isLoading ? 'Refreshing...' : 'Refresh Data'}
              </span>
            </button>
          </div>
          {error && (
            <div className="mt-2 px-3 py-2 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
              Error: {error}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 py-4">
        {isLoading && locations.length === 0 ? (
          <div className="text-center py-12">
            <RefreshCw size={48} className="mx-auto text-blue-400 animate-spin mb-4" />
            <p className="text-slate-400">Loading data from Google Sheets...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <DollarSign className="text-green-400" size={16} />
                  <p className="text-slate-400 text-xs font-medium">Actual Sales</p>
                </div>
                <p className="text-lg font-bold text-white">
                  ${totals.totalActualSales.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Target className="text-blue-400" size={16} />
                  <p className="text-slate-400 text-xs font-medium">Forecast</p>
                </div>
                <p className="text-lg font-bold text-white">
                  ${totals.totalForecastSales.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <TrendingUp className="text-purple-400" size={16} />
                  <p className="text-slate-400 text-xs font-medium">Prior Year</p>
                </div>
                <p className="text-lg font-bold text-white">
                  ${totals.totalPYSales.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Users className="text-orange-400" size={16} />
                  <p className="text-slate-400 text-xs font-medium">Labor %</p>
                </div>
                <p className="text-lg font-bold text-white">
                  {totals.avgLaborPercent.toFixed(1)}%
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Clock className="text-yellow-400" size={16} />
                  <p className="text-slate-400 text-xs font-medium">Act vs Opt</p>
                </div>
                <p className="text-lg font-bold text-white">
                  {(totals.totalActualHours - totals.totalOptimalHours) > 0 ? '+' : ''}
                  {(totals.totalActualHours - totals.totalOptimalHours).toFixed(1)} hrs
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Activity className="text-cyan-400" size={16} />
                  <p className="text-slate-400 text-xs font-medium">Productivity</p>
                </div>
                <p className="text-lg font-bold text-white">
                  ${totals.avgProductivity.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-4 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <Filter size={16} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-white">Filters</h3>
              </div>
              
              <div className="flex gap-3 items-end">
                <div className="relative flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Locations ({filters.locations.length > 0 ? filters.locations.length : 'All'})
                  </label>
                  <button
                    onClick={() => setIsLocationDropdownOpen(!isLocationDropdownOpen)}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-600 flex justify-between items-center"
                  >
                    <span>{filters.locations.length === 0 ? 'All Locations' : `${filters.locations.length} selected`}</span>
                    <span className="text-slate-400">▼</span>
                  </button>
                  {isLocationDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-slate-700 border border-slate-600 rounded shadow-lg max-h-64 overflow-y-auto">
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
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
              {filteredLocations.map((loc, idx) => (
                <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-base font-bold text-white">{loc.location}</h3>
                    {loc.laborPercent > 35 && (
                      <AlertTriangle className="text-orange-400 flex-shrink-0" size={16} />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-900 rounded-lg p-2">
                      <p className="text-slate-400 text-xs font-semibold mb-2">SALES</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Actual</span>
                          <span className="text-white font-bold text-xs">${loc.actualSales.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Forecast</span>
                          <span className={`font-semibold text-xs ${loc.salesVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {loc.salesVariance >= 0 ? '+' : ''}${loc.salesVariance.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Prior Year</span>
                          <span className={`font-semibold text-xs ${loc.pyVariancePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {loc.pyVariancePercent >= 0 ? '+' : ''}{loc.pyVariancePercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded-lg p-2">
                      <p className="text-slate-400 text-xs font-semibold mb-2">LABOR</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Labor %</span>
                          <span className={`font-bold text-xs ${loc.laborPercent > 35 ? 'text-orange-400' : 'text-green-400'}`}>
                            {loc.laborPercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Cost/Hr</span>
                          <span className="text-white font-semibold text-xs">${loc.laborCostPerHour.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Prod</span>
                          <span className="text-green-400 font-bold text-xs">${loc.productivity.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded-lg p-2">
                      <p className="text-slate-400 text-xs font-semibold mb-2">HOURS</p>
                      <div className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Act/Opt</span>
                          <span className={`font-semibold text-xs ${loc.actVsOptHours > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {loc.actVsOptHours > 0 ? '+' : ''}{loc.actVsOptHours.toFixed(1)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Sch/For</span>
                          <span className={`font-semibold text-xs ${loc.schVsForLaborVar > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                            {loc.schVsForLaborVar > 0 ? '+' : ''}{loc.schVsForLaborVar.toFixed(2)}
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
      </div>
    </div>
  );
}
