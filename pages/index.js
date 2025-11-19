import { useState, useEffect } from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw, AlertCircle } from 'lucide-react';

// Google Sheets API Configuration
const API_KEY = 'AIzaSyAbUI3oP_0ofBG9tiAudYLUjZ4MSSaFNDA';
const SPREADSHEET_ID = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';
const SHEET_NAME = 'Sheet1';
const AUTO_CLOCKOUTS_SHEET = 'Auto-Clockouts';

export default function Home() {
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' or 'clockouts'
  
  // Sales Dashboard State
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

  // Auto-Clockouts State
  const [clockouts, setClockouts] = useState([]);
  const [filteredClockouts, setFilteredClockouts] = useState([]);
  const [clockoutsLoading, setClockoutsLoading] = useState(false);
  const [clockoutsError, setClockoutsError] = useState(null);
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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
    loadAutoClockouts();
    
    const interval = setInterval(() => {
      if (selectedWeek === 'current') {
        loadDataFromGoogleSheets();
      }
      loadAutoClockouts();
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

  useEffect(() => {
    applyClockoutFilters();
  }, [clockouts, locationFilter, statusFilter]);

  // Sales Dashboard Functions
  const loadDataFromGoogleSheets = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const range = `${SHEET_NAME}!A2:Z`;
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

  // Auto-Clockouts Functions
  const loadAutoClockouts = async () => {
    setClockoutsLoading(true);
    setClockoutsError(null);
    
    try {
      const range = `${AUTO_CLOCKOUTS_SHEET}!A2:F`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to load auto-clockouts');
      }
      
      const data = await response.json();
      
      if (!data.values || data.values.length === 0) {
        setClockouts([]);
        return;
      }
      
      const parsedClockouts = data.values.map(row => ({
        reportDate: row[0] || '',
        location: row[1] || '',
        employee: row[2] || '',
        clockIn: row[3] || '',
        clockOut: row[4] || '',
        status: row[5] || 'Needs Fix'
      }));
      
      setClockouts(parsedClockouts);
    } catch (err) {
      console.error('Error loading auto-clockouts:', err);
      setClockoutsError(err.message);
    } finally {
      setClockoutsLoading(false);
    }
  };

  const applyClockoutFilters = () => {
    let filtered = [...clockouts];
    
    if (locationFilter !== 'all') {
      filtered = filtered.filter(c => c.location === locationFilter);
    }
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    
    setFilteredClockouts(filtered);
  };

  const getUniqueLocations = () => {
    return [...new Set(clockouts.map(c => c.location))].sort();
  };

  const parseSheetData = (rows) => {
    const parsedData = [];
    
    const parseNumber = (value) => {
      if (!value) return 0;
      const cleaned = value.toString().replace(/[$,\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    const parsePercentage = (value) => {
      if (!value) return 0;
      const cleaned = value.toString().replace(/[%\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      if (!row[0] || row[0].toString().trim() === '') continue;
      
      const locationName = row[0].toString();
      
      if (locationName.includes('11/') || locationName.toLowerCase().includes('date')) {
        continue;
      }
      
      const actualSales = parseNumber(row[7]);
      const forecastSales = parseNumber(row[6]);
      const priorYearSales = parseNumber(row[9]);
      const laborPercent = parsePercentage(row[10]);
      const optimalHours = parseNumber(row[12]);
      const actualHours = parseNumber(row[13]);
      const scheduledHours = parseNumber(row[15]);
      const schVsForLaborVar = parseNumber(row[18]);
      
      const salesVariance = actualSales - forecastSales;
      const pyVariance = actualSales - priorYearSales;
      const pyVariancePercent = priorYearSales > 0 ? (pyVariance / priorYearSales) * 100 : 0;
      const actVsOptHours = actualHours - optimalHours;
      const actVsSchHours = actualHours - scheduledHours;
      const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
      const productivity = actualHours > 0 ? actualSales / actualHours : 0;
      
      let reportDate = 'Current Week';
      if (row.length > 19 && row[19]) {
        reportDate = row[19].toString();
      }
      
      parsedData.push({
        location: locationName,
        actualSales,
        forecastSales,
        salesVariance,
        priorYearSales,
        pyVariance,
        pyVariancePercent,
        laborPercent,
        optimalHours,
        actualHours,
        scheduledHours,
        actVsOptHours,
        actVsSchHours,
        schVsForLaborVar,
        laborCostPerHour,
        productivity,
        reportDate
      });
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
      const cleaned = value.toString().replace(/[%\s]/g, '');
      return parseFloat(cleaned) || 0;
    };
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      const weekEnding = row[0] || '';
      const locationName = row[1] || '';
      const actualSales = parseNumber(row[2]);
      const forecastSales = parseNumber(row[3]);
      const salesVariance = parseNumber(row[4]);
      const priorYearSales = parseNumber(row[5]);
      const laborPercent = parsePercentage(row[6]);
      const optimalHours = parseNumber(row[7]);
      const actualHours = parseNumber(row[8]);
      const scheduledHours = parseNumber(row[9]);
      const schVsForLaborVar = parseNumber(row[10]);
      
      const pyVariance = actualSales - priorYearSales;
      const pyVariancePercent = priorYearSales > 0 ? (pyVariance / priorYearSales) * 100 : 0;
      const actVsOptHours = actualHours - optimalHours;
      const actVsSchHours = actualHours - scheduledHours;
      const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
      const productivity = actualHours > 0 ? actualSales / actualHours : 0;
      
      parsedData.push({
        location: locationName,
        actualSales,
        forecastSales,
        salesVariance,
        priorYearSales,
        pyVariance,
        pyVariancePercent,
        laborPercent,
        optimalHours,
        actualHours,
        scheduledHours,
        actVsOptHours,
        actVsSchHours,
        schVsForLaborVar,
        laborCostPerHour,
        productivity,
        reportDate: weekEnding
      });
    }
    
    return parsedData;
  };

  const applyFilters = () => {
    let filtered = [...locations];
    
    if (filters.locations.length > 0) {
      filtered = filtered.filter(loc => filters.locations.includes(loc.location));
    }
    
    if (filters.actVsOptVariance === 'positive') {
      filtered = filtered.filter(loc => loc.actVsOptHours > 0);
    } else if (filters.actVsOptVariance === 'negative') {
      filtered = filtered.filter(loc => loc.actVsOptHours < 0);
    }
    
    if (filters.salesVariance === 'positive') {
      filtered = filtered.filter(loc => loc.salesVariance > 0);
    } else if (filters.salesVariance === 'negative') {
      filtered = filtered.filter(loc => loc.salesVariance < 0);
    }
    
    setFilteredLocations(filtered);
  };

  const handleLocationToggle = (location) => {
    const newLocations = filters.locations.includes(location)
      ? filters.locations.filter(l => l !== location)
      : [...filters.locations, location];
    setFilters({...filters, locations: newLocations});
  };

  const calculateTotals = () => {
    if (filteredLocations.length === 0) {
      return {
        totalSales: 0,
        totalForecast: 0,
        totalPriorYear: 0,
        avgLaborPercent: 0,
        totalActVsOpt: 0,
        avgProductivity: 0
      };
    }
    
    const totalSales = filteredLocations.reduce((sum, loc) => sum + loc.actualSales, 0);
    const totalForecast = filteredLocations.reduce((sum, loc) => sum + loc.forecastSales, 0);
    const totalPriorYear = filteredLocations.reduce((sum, loc) => sum + loc.priorYearSales, 0);
    const totalLaborCost = filteredLocations.reduce((sum, loc) => sum + (loc.actualSales * loc.laborPercent / 100), 0);
    const avgLaborPercent = totalSales > 0 ? (totalLaborCost / totalSales) * 100 : 0;
    const totalActVsOpt = filteredLocations.reduce((sum, loc) => sum + loc.actVsOptHours, 0);
    const totalHours = filteredLocations.reduce((sum, loc) => sum + loc.actualHours, 0);
    const avgProductivity = totalHours > 0 ? totalSales / totalHours : 0;
    
    return {
      totalSales,
      totalForecast,
      totalPriorYear,
      avgLaborPercent,
      totalActVsOpt,
      avgProductivity
    };
  };

  const totals = calculateTotals();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 mb-3 md:mb-4 shadow-2xl">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-bold text-white mb-1">R365 Dashboards</h1>
              <p className="text-xs md:text-sm text-slate-400">
                {activeTab === 'sales' ? `Week Ending: ${reportDate}` : 'Auto-Clockout Monitoring'}
              </p>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Dashboard Selector */}
              <div className="flex-1 md:flex-initial">
                <select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value)}
                  className="w-full md:w-auto px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="sales">Weekly Sales & Labor</option>
                  <option value="clockouts">Auto-Clockouts</option>
                </select>
              </div>

              {lastUpdated && (
                <div className="text-xs text-slate-400 hidden md:block">
                  Updated: {lastUpdated.toLocaleTimeString()}
                </div>
              )}
              
              <button
                onClick={() => {
                  if (activeTab === 'sales') {
                    if (selectedWeek === 'current') {
                      loadDataFromGoogleSheets();
                    } else {
                      loadHistoricalWeek(selectedWeek);
                    }
                  } else {
                    loadAutoClockouts();
                  }
                }}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                title="Refresh data"
              >
                <RefreshCw size={16} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Sales Dashboard */}
        {activeTab === 'sales' && (
          <>
            {/* Week Selector */}
            {availableWeeks.length > 0 && (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-400">Select Week:</label>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsWeekDropdownOpen(!isWeekDropdownOpen);
                      }}
                      className="px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600 flex items-center gap-2"
                    >
                      <span>{selectedWeek === 'current' ? 'Current Week' : selectedWeek}</span>
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
                            {week}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

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
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 mb-3 md:mb-4">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                    <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                      <DollarSign className="text-green-400" size={14} />
                      <p className="text-slate-400 text-xs font-medium">Actual Sales</p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-white">${totals.totalSales.toFixed(0)}</p>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                    <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                      <Target className="text-blue-400" size={14} />
                      <p className="text-slate-400 text-xs font-medium">Forecast</p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-white">${totals.totalForecast.toFixed(0)}</p>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                    <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                      <TrendingUp className="text-purple-400" size={14} />
                      <p className="text-slate-400 text-xs font-medium">Prior Year</p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-white">${totals.totalPriorYear.toFixed(0)}</p>
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
                      <p className="text-slate-400 text-xs font-medium">Act vs Opt</p>
                    </div>
                    <p className={`text-sm md:text-lg font-bold ${totals.totalActVsOpt > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      {totals.totalActVsOpt > 0 ? '+' : ''}{totals.totalActVsOpt.toFixed(1)} hrs
                    </p>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg text-center">
                    <div className="flex items-center justify-center gap-1 md:gap-2 mb-1">
                      <Activity className="text-cyan-400" size={14} />
                      <p className="text-slate-400 text-xs font-medium">Productivity</p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-white">${totals.avgProductivity.toFixed(2)}</p>
                  </div>
                </div>

                {/* Filters */}
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

                {/* Location Cards */}
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
                              <span className="font-bold text-xs text-white">
                                {loc.laborPercent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 text-xs">Cost/Hr</span>
                              <span className="text-white font-semibold text-xs">${loc.laborCostPerHour.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 text-xs">Prod</span>
                              <span className="text-white font-bold text-xs">${loc.productivity.toFixed(0)}</span>
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
        )}

        {/* Auto-Clockouts Dashboard */}
        {activeTab === 'clockouts' && (
          <>
            {clockoutsError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
                <strong>Error:</strong> {clockoutsError}
              </div>
            )}

            {/* Filters */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <Filter size={14} className="text-slate-400" />
                <h3 className="text-sm font-semibold text-white">Filters</h3>
              </div>
              
              <div className="flex flex-col md:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <select
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Locations</option>
                    {getUniqueLocations().map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Status</option>
                    <option value="Needs Fix">Needs Fix</option>
                    <option value="Fixed">Fixed</option>
                  </select>
                </div>
              </div>
            </div>

            {clockoutsLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="text-white text-lg">Loading auto-clockouts...</div>
              </div>
            ) : filteredClockouts.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <AlertCircle className="mx-auto mb-3 text-green-400" size={48} />
                <h3 className="text-xl font-bold text-white mb-2">No Auto-Clockouts Found</h3>
                <p className="text-slate-400">All employees clocked out properly!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-xs font-medium mb-1">Total Auto-Clockouts</p>
                        <p className="text-2xl font-bold text-white">{filteredClockouts.length}</p>
                      </div>
                      <AlertCircle className="text-red-400" size={32} />
                    </div>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-xs font-medium mb-1">Locations Affected</p>
                        <p className="text-2xl font-bold text-white">{getUniqueLocations().length}</p>
                      </div>
                      <Users className="text-orange-400" size={32} />
                    </div>
                  </div>

                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-xs font-medium mb-1">Needs Attention</p>
                        <p className="text-2xl font-bold text-white">
                          {filteredClockouts.filter(c => c.status === 'Needs Fix').length}
                        </p>
                      </div>
                      <AlertTriangle className="text-yellow-400" size={32} />
                    </div>
                  </div>
                </div>

                {/* Clockout Cards - Simplified */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredClockouts.map((clockout, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-lg hover:border-slate-600 transition-colors">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-white mb-1">{clockout.employee}</h3>
                          <p className="text-sm text-slate-400">{clockout.location}</p>
                        </div>
                        <AlertCircle className="text-red-400 flex-shrink-0 ml-2" size={20} />
                      </div>

                      <div className="pt-3 border-t border-slate-700">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                          clockout.status === 'Needs Fix' 
                            ? 'bg-red-900 text-red-200' 
                            : 'bg-green-900 text-green-200'
                        }`}>
                          {clockout.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
