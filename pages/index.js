import { useState, useEffect } from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw } from 'lucide-react';

// Google Sheets API Configuration
const API_KEY = 'AIzaSyAbUI3oP_0ofBG9tiAudYLUjZ4MSSaFNDA';
const SPREADSHEET_ID = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';
const SHEET_NAME = 'Sheet1';

export default function Home() {
  const [locations, setLocations] = useState([]);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('current');
  const [filters, setFilters] = useState({
    locations: [],
    actVsOptVariance: 'all',
    salesVariance: 'all'
  });
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
  const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reportDate, setReportDate] = useState('Loading...');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (isLocationDropdownOpen) {
        setIsLocationDropdownOpen(false);
      }
      if (isWeekDropdownOpen) {
        setIsWeekDropdownOpen(false);
      }
    };
    
    if (isLocationDropdownOpen || isWeekDropdownOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isLocationDropdownOpen, isWeekDropdownOpen]);

  useEffect(() => {
    loadDataFromGoogleSheets();
    loadAvailableWeeks();
    const interval = setInterval(() => {
      if (selectedWeek === 'current') {
        loadDataFromGoogleSheets();
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedWeek === 'current') {
      loadDataFromGoogleSheets();
    } else {
      loadHistoricalWeek(selectedWeek);
    }
  }, [selectedWeek]);

  useEffect(() => {
    applyFilters();
  }, [locations, filters]);

  const loadDataFromGoogleSheets = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const range = `${SHEET_NAME}!A2:Z`; // Get all columns now
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

  const loadAvailableWeeks = async () => {
    try {
      const range = `Historical Data!A2:A`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) return;
      
      const data = await response.json();
      if (!data.values || data.values.length === 0) return;
      
      // Get unique week dates
      const uniqueWeeks = [...new Set(data.values.flat())].sort((a, b) => new Date(b) - new Date(a));
      setAvailableWeeks(uniqueWeeks);
    } catch (err) {
      console.error('Error loading available weeks:', err);
    }
  };

  const loadHistoricalWeek = async (weekDate) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const range = `Historical Data!A2:K`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to load historical data');
      }
      
      const data = await response.json();
      
      if (!data.values || data.values.length === 0) {
        throw new Error('No historical data found');
      }
      
      // Filter for selected week
      const weekData = data.values.filter(row => row[0] === weekDate);
      
      if (weekData.length === 0) {
        throw new Error('No data for selected week');
      }
      
      const parsedData = parseHistoricalData(weekData);
      setLocations(parsedData);
      setReportDate(weekDate);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading historical week:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const parseSheetData = (rows) => {
    const parsedData = [];
    
    // Helper function to clean and parse numbers
    const parseNumber = (value) => {
      if (!value) return 0;
      // Remove commas, dollar signs, and spaces
      const cleaned = value.toString().replace(/[$,\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    // Helper function to parse percentages
    const parsePercentage = (value) => {
      if (!value) return 0;
      // Remove % sign and commas, keep as percentage (already multiplied by 100)
      const cleaned = value.toString().replace(/[%,\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    // Column mapping based on Excel structure:
    // A: Location Name
    // H: Total Act Net Sales
    // G: For Net Sales
    // I: For v Act Sales Var
    // J: PYSales
    // K: Labor Percent
    // M: Opt Labor Hrs
    // N: Act Labor Hrs
    // P: Sch Labor Hrs
    // S: Sch v For Labor Var
    // (Assuming row has date somewhere - need to find)
    
    for (const row of rows) {
      if (row.length >= 16 && row[0]) { // Row 0 is Location
        parsedData.push({
          location: row[0],                    // A: Location Name
          actualSales: parseNumber(row[7]),    // H: Total Act Net Sales
          forecastSales: parseNumber(row[6]),  // G: For Net Sales
          salesVariance: parseNumber(row[8]),  // I: For v Act Sales Var
          priorYearSales: parseNumber(row[9]), // J: PYSales
          laborPercent: parsePercentage(row[10]), // K: Labor Percent
          optimalLaborHours: parseNumber(row[12]), // M: Opt Labor Hrs
          actualLaborHours: parseNumber(row[13]),  // N: Act Labor Hrs
          scheduledLaborHours: parseNumber(row[15]), // P: Sch Labor Hrs
          schVsForLaborVar: parseNumber(row[18]),    // S: Sch v For Labor Var
          reportDate: row[row.length - 1] || '' // Last column might be date
        });
      }
    }
    
    return parsedData;
  };

  const parseHistoricalData = (rows) => {
    const parsedData = [];
    
    const parseNumber = (value) => {
      if (!value) return 0;
      const cleaned = value.toString().replace(/[$,\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    const parsePercentage = (value) => {
      if (!value) return 0;
      const cleaned = value.toString().replace(/[%,\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    for (const row of rows) {
      if (row.length >= 11 && row[1]) { // row[1] is location (row[0] is week date)
        parsedData.push({
          location: row[1],
          actualSales: parseNumber(row[2]),
          forecastSales: parseNumber(row[3]),
          salesVariance: parseNumber(row[4]),
          priorYearSales: parseNumber(row[5]),
          laborPercent: parsePercentage(row[6]),
          optimalLaborHours: parseNumber(row[7]),
          actualLaborHours: parseNumber(row[8]),
          scheduledLaborHours: parseNumber(row[9]),
          schVsForLaborVar: parseNumber(row[10]),
          reportDate: row[0] || ''
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
      const actVsSchHours = loc.actualLaborHours - loc.scheduledLaborHours;

      return {
        ...loc,
        productivity,
        laborCostPerHour,
        laborCost,
        pyVariancePercent,
        actVsOptHours,
        actVsSchHours
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

  const getWeekLabel = (weekDate) => {
    const index = availableWeeks.indexOf(weekDate);
    if (index === 0) return 'Last Week';
    return `${index + 1} Weeks Ago`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="bg-slate-800 border-b border-blue-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <img 
                src="https://i.imgur.com/kkJMVz0.png" 
                alt="Andy's Frozen Custard" 
                className="h-8 md:h-12 w-auto object-contain"
                onError={(e) => {e.target.style.display='none'}}
              />
              <div>
                <h1 className="text-base md:text-xl lg:text-2xl font-bold text-white">Weekly Sales and Labor</h1>
                <p className="text-slate-400 text-xs mt-0.5 md:mt-1">
                  Week Ending: {reportDate}
                  {lastUpdated && (
                    <span className="ml-2 hidden sm:inline">
                      • Updated: {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Week Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsWeekDropdownOpen(!isWeekDropdownOpen);
                  }}
                  className="inline-flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg cursor-pointer transition-colors text-xs md:text-sm"
                >
                  <span>{selectedWeek === 'current' ? 'Current Week' : getWeekLabel(selectedWeek)}</span>
                  <span className="text-slate-400">▼</span>
                </button>
                {isWeekDropdownOpen && (
                  <div 
                    className="absolute right-0 z-20 mt-1 bg-slate-700 border border-slate-600 rounded shadow-lg max-h-64 overflow-y-auto min-w-[180px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setSelectedWeek('current');
                        setIsWeekDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-600 ${selectedWeek === 'current' ? 'bg-slate-600 text-white font-semibold' : 'text-slate-300'}`}
                    >
                      Current Week
                    </button>
                    {availableWeeks.map((week, index) => (
                      <button
                        key={week}
                        onClick={() => {
                          setSelectedWeek(week);
                          setIsWeekDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-600 ${selectedWeek === week ? 'bg-slate-600 text-white font-semibold' : 'text-slate-300'}`}
                      >
                        {index === 0 ? 'Last Week' : `${index + 1} Weeks Ago`} - {week}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Refresh Button */}
              <button
                onClick={selectedWeek === 'current' ? loadDataFromGoogleSheets : () => loadHistoricalWeek(selectedWeek)}
                disabled={isLoading}
                className="inline-flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg cursor-pointer transition-colors text-xs md:text-sm"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                <span className="hidden md:inline font-medium">
                  {isLoading ? 'Refreshing...' : 'Refresh Data'}
                </span>
              </button>
            </div>
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3 mb-3">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                  <DollarSign className="text-green-400" size={14} />
                  <p className="text-slate-400 text-xs font-medium">Actual Sales</p>
                </div>
                <p className="text-sm md:text-lg font-bold text-white">
                  ${totals.totalActualSales.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                  <Target className="text-blue-400" size={14} />
                  <p className="text-slate-400 text-xs font-medium">Forecast</p>
                </div>
                <p className="text-sm md:text-lg font-bold text-white">
                  ${totals.totalForecastSales.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                  <TrendingUp className="text-purple-400" size={14} />
                  <p className="text-slate-400 text-xs font-medium">Prior Year</p>
                </div>
                <p className="text-sm md:text-lg font-bold text-white">
                  ${totals.totalPYSales.toLocaleString(undefined, {maximumFractionDigits: 0})}
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                  <Users className="text-orange-400" size={14} />
                  <p className="text-slate-400 text-xs font-medium">Labor %</p>
                </div>
                <p className="text-sm md:text-lg font-bold text-white">
                  {totals.avgLaborPercent.toFixed(1)}%
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                  <Clock className="text-yellow-400" size={14} />
                  <p className="text-slate-400 text-xs font-medium">Act vs Opt</p>
                </div>
                <p className="text-sm md:text-lg font-bold text-white">
                  {(totals.totalActualHours - totals.totalOptimalHours) > 0 ? '+' : ''}
                  {(totals.totalActualHours - totals.totalOptimalHours).toFixed(1)} hrs
                </p>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                  <Activity className="text-cyan-400" size={14} />
                  <p className="text-slate-400 text-xs font-medium">Productivity</p>
                </div>
                <p className="text-sm md:text-lg font-bold text-white">
                  ${totals.avgProductivity.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 mb-3 md:mb-4 shadow-lg">
              <div className="flex items-center gap-2 mb-2 md:mb-3">
                <Filter size={14} className="text-slate-400" />
                <h3 className="text-xs md:text-sm font-semibold text-white">Filters</h3>
              </div>
              
              <div className="flex flex-col md:flex-row gap-2 md:gap-3 items-stretch md:items-end">
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

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
              {filteredLocations.map((loc, idx) => (
                <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                  <div className="flex items-start justify-between mb-2 md:mb-3">
                    <h3 className="text-sm md:text-base font-bold text-white">{loc.location}</h3>
                    {loc.laborPercent > 35 && (
                      <AlertTriangle className="text-orange-400 flex-shrink-0" size={14} />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                    <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                      <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">SALES</p>
                      <div className="space-y-0.5 md:space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Actual</span>
                          <span className="text-white font-bold text-xs">${loc.actualSales.toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Forecast</span>
                          <span className={`font-semibold text-xs ${loc.salesVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {loc.salesVariance >= 0 ? '+' : ''}${loc.salesVariance.toFixed(0)}
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
                          <span className={`font-bold text-xs ${loc.laborPercent > 35 ? 'text-orange-400' : 'text-green-400'}`}>
                            {loc.laborPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Cost/Hr</span>
                          <span className="text-white font-semibold text-xs">${loc.laborCostPerHour.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-slate-500 text-xs">Prod</span>
                          <span className="text-green-400 font-bold text-xs">${loc.productivity.toFixed(0)}</span>
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
      </div>
    </div>
  );
}

