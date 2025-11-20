import { useState, useEffect } from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw, AlertCircle } from 'lucide-react';

// Google Sheets API Configuration
const API_KEY = 'AIzaSyAbUI3oP_0ofBG9tiAudYLUjZ4MSSaFNDA';
const SPREADSHEET_ID = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';
const SHEET_NAME = 'Sheet1';
const AUTO_CLOCKOUTS_SHEET = 'Auto-Clockouts';
const FLASH_DAY_SHEET = 'Flash - Day';
const FLASH_WTD_SHEET = 'Flash - WTD';

export default function Home() {
  const [activeTab, setActiveTab] = useState('sales'); // 'sales', 'clockouts', 'flash-sales', 'flash-discounts'
  const [flashView, setFlashView] = useState('day'); // 'day' or 'wtd'
  
  // Sales Dashboard State
  const [locations, setLocations] = useState([]);
  const [filteredLocations, setFilteredLocations] = useState([]);
  const [availableWeeks, setAvailableWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('current');
  const [filters, setFilters] = useState({
    locations: [],
    actVsOptVariance: 'all',
    salesVariance: 'all',
    market: 'all'
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

  // Flash Report State
  const [flashData, setFlashData] = useState([]);
  const [flashLoading, setFlashLoading] = useState(false);
  const [flashError, setFlashError] = useState(null);
  const [filteredFlashData, setFilteredFlashData] = useState([]);
  const [flashFilters, setFlashFilters] = useState({
    locations: [],
    market: 'all',
    salesVariance: 'all',
    guestCountVariance: 'all'
  });

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
    loadFlashData();
    const interval = setInterval(() => {
      if (selectedWeek === 'current') {
        loadDataFromGoogleSheets();
      }
      loadAutoClockouts();
      loadFlashData();
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
    applyFlashFilters();
  }, [flashData, flashFilters]);

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

  // Helper function to get market for a location
  const getMarket = (locationName) => {
    const tulsa = ['Bixby', 'Yale', 'Broken Arrow', 'Owasso'];
    const okc = ['Warr Acres', 'Penn', 'Edmond', 'Norman'];
    const dallas = ['Carrollton', 'Frisco #1', 'Frisco #2', 'Frisco #3', 'Lake Highlands', 'Hillcrest Village', 'The Colony', 'Prosper', 'Allen'];
    const orlando = ['Sanford', 'Lakeland'];
    
    if (tulsa.includes(locationName)) return 'Tulsa';
    if (okc.includes(locationName)) return 'Oklahoma City';
    if (dallas.includes(locationName)) return 'Dallas';
    if (orlando.includes(locationName)) return 'Orlando';
    return 'Other';
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

  // Flash Report Functions
  const loadFlashData = async () => {
    setFlashLoading(true);
    setFlashError(null);
    
    try {
      const sheetName = flashView === 'day' ? FLASH_DAY_SHEET : FLASH_WTD_SHEET;
      const range = `${sheetName}!A2:M`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to load flash data');
      }
      
      const data = await response.json();
      
      if (!data.values || data.values.length === 0) {
        setFlashData([]);
        return;
      }
      
      const parsedFlash = data.values.map(row => ({
        date: row[0] || '',
        location: row[1] || '',
        sales: parseFloat(row[2]) || 0,
        sameDayLY: parseFloat(row[3]) || 0,
        dollarChange: parseFloat(row[4]) || 0,
        percentChange: parseFloat(row[5]) || 0,
        avgSalesPerGuest: parseFloat(row[6]) || 0,
        totalCounts: parseFloat(row[7]) || 0,
        sameDayLYCounts: parseFloat(row[8]) || 0,
        comps: parseFloat(row[9]) || 0,
        discounts: parseFloat(row[10]) || 0,
        totalDiscounts: parseFloat(row[11]) || 0,
        discountPercent: parseFloat(row[12]) || 0
      }));
      
      setFlashData(parsedFlash);
    } catch (err) {
      console.error('Error loading flash data:', err);
      setFlashError(err.message);
    } finally {
      setFlashLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab.startsWith('flash-')) {
      loadFlashData();
    }
  }, [flashView]);

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

  const hasAutoClockout = (locationName) => {
    // Get the current week's date range (Monday-Sunday)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Calculate Monday of current week
    const monday = new Date(today);
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // If Sunday, go back 6 days, else go to Monday
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    
    // Calculate Sunday of current week
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    // Check if this location has any auto-clockouts in the current week
    return clockouts.some(c => {
      if (c.location !== locationName) return false;
      
      // Parse the report date
      const reportDate = new Date(c.reportDate);
      
      // Check if it falls within current week
      return reportDate >= monday && reportDate <= sunday;
    });
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
    
    if (filters.market !== 'all') {
      filtered = filtered.filter(loc => getMarket(loc.location) === filters.market);
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

  const applyFlashFilters = () => {
    let filtered = [...flashData];
    
    if (flashFilters.locations.length > 0) {
      filtered = filtered.filter(loc => flashFilters.locations.includes(loc.location));
    }
    
    if (flashFilters.market !== 'all') {
      filtered = filtered.filter(loc => getMarket(loc.location) === flashFilters.market);
    }
    
    if (flashFilters.salesVariance === 'positive') {
      filtered = filtered.filter(loc => loc.percentChange > 0);
    } else if (flashFilters.salesVariance === 'negative') {
      filtered = filtered.filter(loc => loc.percentChange < 0);
    }
    
    if (flashFilters.guestCountVariance === 'positive') {
      filtered = filtered.filter(loc => ((loc.totalCounts - loc.sameDayLYCounts) / loc.sameDayLYCounts) > 0);
    } else if (flashFilters.guestCountVariance === 'negative') {
      filtered = filtered.filter(loc => ((loc.totalCounts - loc.sameDayLYCounts) / loc.sameDayLYCounts) < 0);
    }
    
    setFilteredFlashData(filtered);
  };

  const handleLocationToggle = (location) => {
    const newLocations = filters.locations.includes(location)
      ? filters.locations.filter(l => l !== location)
      : [...filters.locations, location];
    setFilters({...filters, locations: newLocations});
  };

  const handleFlashLocationToggle = (location) => {
    const newLocations = flashFilters.locations.includes(location)
      ? flashFilters.locations.filter(l => l !== location)
      : [...flashFilters.locations, location];
    setFlashFilters({...flashFilters, locations: newLocations});
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
            <div className="flex items-center gap-3 flex-1">
              <img 
                src="https://i.imgur.com/kkJMVz0.png" 
                alt="Andy's Frozen Custard" 
                className="h-12 md:h-16"
              />
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white mb-1">R365 Dashboards</h1>
                {activeTab === 'sales' && reportDate && reportDate !== 'Loading...' && !reportDate.includes('.') && (
                  <p className="text-xs md:text-sm text-slate-400">Week Ending: {reportDate}</p>
                )}
              </div>
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
                  <option value="flash-sales">Sales/Guest Counts</option>
                  <option value="flash-discounts">Comps/Discounts</option>
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
                      <TrendingUp className="text-purple-400" size={14} />
                      <p className="text-slate-400 text-xs font-medium">Prior Year</p>
                    </div>
                    <p className="text-sm md:text-lg font-bold text-white">${totals.totalPriorYear.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</p>
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
                </div>

                {/* Location Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                  {filteredLocations.map((loc, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                      <div className="flex items-start justify-between mb-2 md:mb-3">
                        <h3 className="text-sm md:text-base font-bold text-white">{loc.location}</h3>
                        {hasAutoClockout(loc.location) && (
                          <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold whitespace-nowrap flex-shrink-0">
                            AUTO-CLOCKOUT
                          </span>
                        )}
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
                                {loc.salesVariance >= 0 ? '+' : ''}${Math.abs(loc.salesVariance).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
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
                              <span className="text-white font-bold text-xs">${loc.productivity.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
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
              <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
                {/* Header */}
                <div className="grid grid-cols-3 gap-4 p-4 border-b border-slate-700 bg-slate-900">
                  <div className="text-slate-400 text-sm font-semibold">Date</div>
                  <div className="text-slate-400 text-sm font-semibold">Name</div>
                  <div className="text-slate-400 text-sm font-semibold">Location</div>
                </div>
                
                {/* List */}
                <div className="divide-y divide-slate-700">
                  {filteredClockouts.map((clockout, idx) => (
                    <div key={idx} className="grid grid-cols-3 gap-4 p-4 hover:bg-slate-750 transition-colors">
                      <div className="text-slate-300">{clockout.reportDate}</div>
                      <div className="text-white font-medium">{clockout.employee}</div>
                      <div className="text-slate-300">{clockout.location}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Flash Report - Sales Dashboard */}
        {activeTab === 'flash-sales' && (
          <>
            {/* Day/WTD Toggle */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-400">View:</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFlashView('day')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      flashView === 'day'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Yesterday
                  </button>
                  <button
                    onClick={() => setFlashView('wtd')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      flashView === 'wtd'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Week To Date
                  </button>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Filters</h3>
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <div className="flex-1 relative">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLocationDropdownOpen(!isLocationDropdownOpen);
                    }}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-600 flex items-center justify-between"
                  >
                    <span>{flashFilters.locations.length === 0 ? 'All Locations' : `${flashFilters.locations.length} selected`}</span>
                    <span className="text-slate-400">▼</span>
                  </button>
                  {isLocationDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded shadow-lg max-h-60 overflow-y-auto">
                      <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600 border-b border-slate-600">
                        <input
                          type="checkbox"
                          checked={flashFilters.locations.length === 0}
                          onChange={() => setFlashFilters({...flashFilters, locations: []})}
                          className="rounded"
                        />
                        <span className="text-white text-xs font-semibold">All Locations</span>
                      </label>
                      {flashData.map(loc => (
                        <label key={loc.location} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600">
                          <input
                            type="checkbox"
                            checked={flashFilters.locations.includes(loc.location)}
                            onChange={() => handleFlashLocationToggle(loc.location)}
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
                    value={flashFilters.market}
                    onChange={(e) => setFlashFilters({...flashFilters, market: e.target.value})}
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
                  <label className="block text-xs font-medium text-slate-400 mb-1">Sales Variance</label>
                  <select
                    value={flashFilters.salesVariance}
                    onChange={(e) => setFlashFilters({...flashFilters, salesVariance: e.target.value})}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Variances</option>
                    <option value="positive">Above LY</option>
                    <option value="negative">Below LY</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Guest Count Variance</label>
                  <select
                    value={flashFilters.guestCountVariance}
                    onChange={(e) => setFlashFilters({...flashFilters, guestCountVariance: e.target.value})}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Variances</option>
                    <option value="positive">Above LY</option>
                    <option value="negative">Below LY</option>
                  </select>
                </div>
              </div>
            </div>

            {flashError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
                <strong>Error:</strong> {flashError}
              </div>
            )}

            {flashLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="text-white text-lg">Loading flash data...</div>
              </div>
            ) : flashData.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No flash data available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                {filteredFlashData.map((loc, idx) => (
                  <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                    <div className="flex items-start justify-between mb-2 md:mb-3">
                      <h3 className="text-sm md:text-base font-bold text-white">{loc.location}</h3>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                      <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                        <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">SALES</p>
                        <div className="space-y-0.5 md:space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">Sales</span>
                            <span className="text-white font-bold text-xs">${loc.sales.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">LY</span>
                            <span className="text-slate-300 text-xs">${loc.sameDayLY.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">Var</span>
                            <span className={`font-semibold text-xs ${loc.dollarChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {loc.dollarChange >= 0 ? '+' : ''}${Math.abs(loc.dollarChange).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">% Chg</span>
                            <span className={`font-semibold text-xs ${loc.percentChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {loc.percentChange >= 0 ? '+' : ''}{(loc.percentChange * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                        <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">GUESTS</p>
                        <div className="space-y-0.5 md:space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">Avg Ticket</span>
                            <span className="text-white font-bold text-xs">${loc.avgSalesPerGuest.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">Counts</span>
                            <span className="text-white font-semibold text-xs">{loc.totalCounts.toLocaleString('en-US')}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">LY</span>
                            <span className="text-slate-300 text-xs">{loc.sameDayLYCounts.toLocaleString('en-US')}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">% Chg</span>
                            <span className={`font-semibold text-xs ${((loc.totalCounts - loc.sameDayLYCounts) / loc.sameDayLYCounts) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {((loc.totalCounts - loc.sameDayLYCounts) / loc.sameDayLYCounts) >= 0 ? '+' : ''}{(((loc.totalCounts - loc.sameDayLYCounts) / loc.sameDayLYCounts) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Flash Report - Discounts Dashboard */}
        {activeTab === 'flash-discounts' && (
          <>
            {/* Day/WTD Toggle */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-slate-400">View:</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFlashView('day')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      flashView === 'day'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Yesterday
                  </button>
                  <button
                    onClick={() => setFlashView('wtd')}
                    className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                      flashView === 'wtd'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Week To Date
                  </button>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Filters</h3>
              </div>
              <div className="flex flex-col md:flex-row gap-2">
                <div className="flex-1 relative">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsLocationDropdownOpen(!isLocationDropdownOpen);
                    }}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-600 flex items-center justify-between"
                  >
                    <span>{flashFilters.locations.length === 0 ? 'All Locations' : `${flashFilters.locations.length} selected`}</span>
                    <span className="text-slate-400">▼</span>
                  </button>
                  {isLocationDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded shadow-lg max-h-60 overflow-y-auto">
                      <label className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600 border-b border-slate-600">
                        <input
                          type="checkbox"
                          checked={flashFilters.locations.length === 0}
                          onChange={() => setFlashFilters({...flashFilters, locations: []})}
                          className="rounded"
                        />
                        <span className="text-white text-xs font-semibold">All Locations</span>
                      </label>
                      {flashData.map(loc => (
                        <label key={loc.location} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-600">
                          <input
                            type="checkbox"
                            checked={flashFilters.locations.includes(loc.location)}
                            onChange={() => handleFlashLocationToggle(loc.location)}
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
                    value={flashFilters.market}
                    onChange={(e) => setFlashFilters({...flashFilters, market: e.target.value})}
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
                  <label className="block text-xs font-medium text-slate-400 mb-1">Sales Variance</label>
                  <select
                    value={flashFilters.salesVariance}
                    onChange={(e) => setFlashFilters({...flashFilters, salesVariance: e.target.value})}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Variances</option>
                    <option value="positive">Above LY</option>
                    <option value="negative">Below LY</option>
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Guest Count Variance</label>
                  <select
                    value={flashFilters.guestCountVariance}
                    onChange={(e) => setFlashFilters({...flashFilters, guestCountVariance: e.target.value})}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Variances</option>
                    <option value="positive">Above LY</option>
                    <option value="negative">Below LY</option>
                  </select>
                </div>
              </div>
            </div>

            {flashError && (
              <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
                <strong>Error:</strong> {flashError}
              </div>
            )}

            {flashLoading ? (
              <div className="flex justify-center items-center py-20">
                <div className="text-white text-lg">Loading flash data...</div>
              </div>
            ) : flashData.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                <p className="text-slate-400">No flash data available</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                {filteredFlashData.map((loc, idx) => {
                  return (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                      <div className="flex items-start justify-between mb-2 md:mb-3">
                        <h3 className="text-sm md:text-base font-bold text-white">{loc.location}</h3>
                      </div>

                      <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                        <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">DISCOUNTS</p>
                        <div className="space-y-0.5 md:space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">Comps</span>
                            <span className="text-white font-bold text-xs">${loc.comps.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">Discounts</span>
                            <span className="text-white font-semibold text-xs">${loc.discounts.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-700">
                            <span className="text-slate-500 text-xs">Total</span>
                            <span className="text-white font-bold text-xs">${loc.totalDiscounts.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500 text-xs">% of Sales</span>
                            <span className={`font-bold text-xs ${(loc.discountPercent * 100) > 3 ? 'text-orange-400' : 'text-white'}`}>
                              {(loc.discountPercent * 100).toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
