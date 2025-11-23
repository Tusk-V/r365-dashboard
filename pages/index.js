import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Dashboard() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState('sales');
  const [salesData, setSalesData] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  const [flashData, setFlashData] = useState([]);
  const [scheduledData, setScheduledData] = useState([]);
  const [laborData, setLaborData] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('current');
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch data on component mount
  useEffect(() => {
    if (status === 'authenticated') {
      fetchAllData();
    }
  }, [status]);

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [salesRes, flashRes, scheduledRes, laborRes] = await Promise.all([
        fetch('/api/sheets?type=sales'),
        fetch('/api/sheets?type=flash'),
        fetch('/api/sheets?type=scheduled'),
        fetch('/api/sheets?type=labor')
      ]);

      if (!salesRes.ok || !flashRes.ok || !scheduledRes.ok || !laborRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const salesJson = await salesRes.json();
      const flashJson = await flashRes.json();
      const scheduledJson = await scheduledRes.json();
      const laborJson = await laborRes.json();

      setSalesData(parseSheetData(salesJson.data));
      setHistoricalData(parseHistoricalData(salesJson.data));
      setFlashData(parseFlashData(flashJson.data));
      setScheduledData(parseScheduledData(scheduledJson.data));
      setLaborData(parseLaborData(laborJson.data));
      
      // Set initial selected date to most recent
      if (flashJson.data && flashJson.data.length > 1) {
        const dates = flashJson.data.slice(1).map(row => row[11]).filter(Boolean);
        if (dates.length > 0) {
          setSelectedDate(dates[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const parseSheetData = (data) => {
    if (!data || data.length < 2) return [];
    
    // Skip header row
    const rows = data.slice(1);
    
    return rows.map(row => {
      const locationName = row[0] || '';
      const actualSales = parseFloat(row[1]) || 0;
      const forecastSales = parseFloat(row[2]) || 0;
      const salesVariance = parseFloat(row[3]) || 0;
      const lySales = parseFloat(row[4]) || 0;
      const laborPercent = parseFloat(row[5]) || 0;
      const optimalHours = parseFloat(row[6]) || 0;
      const actualHours = parseFloat(row[7]) || 0;
      const optVsActHours = parseFloat(row[8]) || 0;
      const schVsForLaborVar = parseFloat(row[9]) || 0;
      const scheduledHours = actualHours - parseFloat(row[10]) || 0;
      
      // Calculate additional metrics
      const salesChange = actualSales - lySales;
      const salesChangePercent = lySales > 0 ? (salesChange / lySales) * 100 : 0;
      const actVsOptHours = actualHours - optimalHours;
      const actVsSchHours = actualHours - scheduledHours;
      const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
      const productivity = actualHours > 0 ? actualSales / actualHours : 0;
      
      // Calculate Opt % and Variance
      const optLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour / actualSales) * 100 : 0;
      const laborVariance = laborPercent - optLaborPercent;

      return {
        location: locationName,
        actualSales,
        forecastSales,
        salesVariance,
        lySales,
        salesChange,
        salesChangePercent,
        laborPercent,
        optimalHours,
        actualHours,
        scheduledHours,
        actVsOptHours,
        actVsSchHours,
        schVsForLaborVar,
        laborCostPerHour,
        productivity,
        optLaborPercent,
        laborVariance
      };
    }).filter(loc => loc.location);
  };

  const parseHistoricalData = (data) => {
    if (!data || data.length < 2) return [];
    
    const rows = data.slice(1);
    const grouped = {};
    
    rows.forEach(row => {
      const location = row[0];
      const weekDate = row[11]; // Assuming date is in column 11
      
      if (!location || !weekDate) return;
      
      if (!grouped[location]) {
        grouped[location] = [];
      }
      
      const actualSales = parseFloat(row[1]) || 0;
      const forecastSales = parseFloat(row[2]) || 0;
      const salesVariance = parseFloat(row[3]) || 0;
      const lySales = parseFloat(row[4]) || 0;
      const laborPercent = parseFloat(row[5]) || 0;
      const optimalHours = parseFloat(row[6]) || 0;
      const actualHours = parseFloat(row[7]) || 0;
      const scheduledHours = actualHours - parseFloat(row[10]) || 0;
      
      const salesChange = actualSales - lySales;
      const salesChangePercent = lySales > 0 ? (salesChange / lySales) * 100 : 0;
      const actVsOptHours = actualHours - optimalHours;
      const actVsSchHours = actualHours - scheduledHours;
      const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
      const productivity = actualHours > 0 ? actualSales / actualHours : 0;
      
      // Calculate Opt % and Variance for historical data
      const optLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour / actualSales) * 100 : 0;
      const laborVariance = laborPercent - optLaborPercent;
      
      grouped[location].push({
        weekDate,
        actualSales,
        forecastSales,
        salesVariance,
        lySales,
        salesChange,
        salesChangePercent,
        laborPercent,
        optimalHours,
        actualHours,
        scheduledHours,
        actVsOptHours,
        actVsSchHours,
        laborCostPerHour,
        productivity,
        optLaborPercent,
        laborVariance
      });
    });
    
    // Sort each location's data by date (most recent first)
    Object.keys(grouped).forEach(location => {
      grouped[location].sort((a, b) => new Date(b.weekDate) - new Date(a.weekDate));
    });
    
    return grouped;
  };

  const parseFlashData = (data) => {
    if (!data || data.length < 2) return [];
    
    const rows = data.slice(1);
    const grouped = {};
    
    rows.forEach(row => {
      const location = row[0];
      const reportDate = row[11];
      
      if (!location || !reportDate) return;
      
      if (!grouped[location]) {
        grouped[location] = [];
      }
      
      grouped[location].push({
        date: reportDate,
        sales: parseFloat(row[1]) || 0,
        lySales: parseFloat(row[2]) || 0,
        salesChange: parseFloat(row[3]) || 0,
        salesChangePercent: parseFloat(row[4]) || 0,
        avgPerGuest: parseFloat(row[5]) || 0,
        guestCount: parseFloat(row[6]) || 0,
        lyGuestCount: parseFloat(row[7]) || 0
      });
    });
    
    // Sort each location's data by date (most recent first)
    Object.keys(grouped).forEach(location => {
      grouped[location].sort((a, b) => new Date(b.date) - new Date(a.date));
    });
    
    return grouped;
  };

  const parseScheduledData = (data) => {
    if (!data || data.length < 2) return [];
    
    const rows = data.slice(1);
    const grouped = {};
    
    rows.forEach(row => {
      const location = row[0];
      const reportDate = row[5];
      
      if (!location || !reportDate) return;
      
      if (!grouped[location]) {
        grouped[location] = [];
      }
      
      grouped[location].push({
        date: reportDate,
        employeeName: row[1] || '',
        jobTitle: row[2] || '',
        startTime: row[3] || '',
        endTime: row[4] || ''
      });
    });
    
    return grouped;
  };

  const parseLaborData = (data) => {
    if (!data || data.length < 2) return [];
    
    const rows = data.slice(1);
    const grouped = {};
    
    rows.forEach(row => {
      const location = row[0];
      const reportDate = row[6];
      
      if (!location || !reportDate) return;
      
      if (!grouped[location]) {
        grouped[location] = {
          autoClockouts: [],
          callOffs: []
        };
      }
      
      const type = row[5] || '';
      const entry = {
        date: reportDate,
        employeeName: row[1] || '',
        jobTitle: row[2] || '',
        shiftTime: row[3] || '',
        clockTime: row[4] || ''
      };
      
      if (type.toLowerCase().includes('auto')) {
        grouped[location].autoClockouts.push(entry);
      } else if (type.toLowerCase().includes('call')) {
        grouped[location].callOffs.push(entry);
      }
    });
    
    return grouped;
  };

  const getAvailableDates = () => {
    if (!flashData || Object.keys(flashData).length === 0) return [];
    
    const allDates = new Set();
    Object.values(flashData).forEach(locationData => {
      locationData.forEach(entry => {
        if (entry.date) allDates.add(entry.date);
      });
    });
    
    return Array.from(allDates).sort((a, b) => new Date(b) - new Date(a));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US').format(Math.round(value));
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-white text-3xl font-bold mb-6">R365 Dashboard</h1>
          <button
            onClick={() => signIn('google')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-red-500 text-2xl font-bold mb-4">Error Loading Data</h1>
          <p className="text-white mb-6">{error}</p>
          <button
            onClick={fetchAllData}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Head>
        <title>R365 Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-2 md:px-4 py-2 md:py-3">
          <div className="flex justify-between items-center">
            <h1 className="text-white text-lg md:text-2xl font-bold">Andy's Dashboard</h1>
            <button
              onClick={() => signOut()}
              className="bg-red-600 hover:bg-red-700 text-white text-xs md:text-sm font-bold py-1.5 md:py-2 px-3 md:px-4 rounded"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-[52px] md:top-[60px] z-40">
        <div className="max-w-7xl mx-auto px-2 md:px-4">
          <div className="flex overflow-x-auto scrollbar-hide gap-1 md:gap-2 py-2">
            {[
              { id: 'sales', label: 'Weekly Sales & Labor' },
              { id: 'flash', label: 'Sales/Guest Counts' },
              { id: 'scheduled', label: 'Scheduled Today' },
              { id: 'labor', label: 'Auto-Clockouts & Call-Offs' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 md:px-4 py-4 md:py-6">
        
        {/* Weekly Sales & Labor Tab */}
        {activeTab === 'sales' && (
          <div className="space-y-3 md:space-y-4">
            {/* Week Selector */}
            <div className="bg-slate-900 rounded-lg p-3 md:p-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <label className="text-slate-400 text-sm font-semibold">Select Week:</label>
                <select
                  value={selectedWeek}
                  onChange={(e) => setSelectedWeek(e.target.value)}
                  className="bg-slate-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="current">Current Week</option>
                  {Object.keys(historicalData).length > 0 && 
                    historicalData[Object.keys(historicalData)[0]]?.map((week, idx) => (
                      <option key={idx} value={week.weekDate}>
                        {week.weekDate}
                      </option>
                    ))
                  }
                </select>
              </div>
            </div>

            {/* Location Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {(selectedWeek === 'current' ? salesData : 
                Object.entries(historicalData).map(([location, weeks]) => {
                  const weekData = weeks.find(w => w.weekDate === selectedWeek);
                  return weekData ? { location, ...weekData } : null;
                }).filter(Boolean)
              ).map((loc, idx) => (
                <div key={idx} className="bg-slate-900 rounded-lg p-3 md:p-4 border border-slate-800">
                  {/* Location Name */}
                  <h2 className="text-white text-base md:text-lg font-bold mb-3 md:mb-4">{loc.location}</h2>
                  
                  {/* Sales Section */}
                  <div className="bg-slate-800 rounded-lg p-2 md:p-3 mb-3 md:mb-4">
                    <p className="text-slate-400 text-xs font-semibold mb-2 md:mb-3">SALES</p>
                    <div className="grid grid-cols-2 gap-2 md:gap-3">
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Actual</p>
                        <p className="text-white text-sm md:text-base font-bold">{formatCurrency(loc.actualSales)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Forecast</p>
                        <p className="text-white text-sm md:text-base font-bold">{formatCurrency(loc.forecastSales)}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">vs LY</p>
                        <p className={`text-sm md:text-base font-bold ${loc.salesChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(loc.salesChange)}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">% Change</p>
                        <p className={`text-sm md:text-base font-bold ${loc.salesChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(loc.salesChangePercent)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Labor Section */}
                  <div className="bg-slate-800 rounded-lg p-2 md:p-3 mb-3 md:mb-4">
                    <p className="text-slate-400 text-xs font-semibold mb-2 md:mb-3">LABOR</p>
                    <div className="grid grid-cols-3 gap-2 md:gap-3 mb-3">
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Labor %</p>
                        <p className={`text-sm md:text-base font-bold ${loc.laborPercent > loc.optLaborPercent ? 'text-red-400' : 'text-green-400'}`}>
                          {loc.laborPercent.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Opt %</p>
                        <p className="text-white text-sm md:text-base font-bold">{loc.optLaborPercent.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-xs mb-1">Variance</p>
                        <p className={`text-sm md:text-base font-bold ${loc.laborVariance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {loc.laborVariance >= 0 ? '+' : ''}{loc.laborVariance.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* Hours Comparison */}
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

                  {/* Hours Details */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-800 rounded p-1.5 md:p-2">
                      <p className="text-slate-500 text-xs mb-0.5">Optimal</p>
                      <p className="text-white text-xs md:text-sm font-bold">{loc.optimalHours.toFixed(1)}</p>
                    </div>
                    <div className="bg-slate-800 rounded p-1.5 md:p-2">
                      <p className="text-slate-500 text-xs mb-0.5">Scheduled</p>
                      <p className="text-white text-xs md:text-sm font-bold">{loc.scheduledHours.toFixed(1)}</p>
                    </div>
                    <div className="bg-slate-800 rounded p-1.5 md:p-2">
                      <p className="text-slate-500 text-xs mb-0.5">Actual</p>
                      <p className="text-white text-xs md:text-sm font-bold">{loc.actualHours.toFixed(1)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flash Tab - Sales & Guest Counts */}
        {activeTab === 'flash' && (
          <div className="space-y-3 md:space-y-4">
            {/* Date Selector */}
            <div className="bg-slate-900 rounded-lg p-3 md:p-4">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <label className="text-slate-400 text-sm font-semibold">Select Date:</label>
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-slate-800 text-white rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {getAvailableDates().map((date, idx) => (
                    <option key={idx} value={date}>{date}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Location Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
              {Object.entries(flashData).map(([location, entries]) => {
                const dayData = entries.find(e => e.date === selectedDate);
                if (!dayData) return null;

                return (
                  <div key={location} className="bg-slate-900 rounded-lg p-3 md:p-4 border border-slate-800">
                    <h2 className="text-white text-base md:text-lg font-bold mb-3 md:mb-4">{location}</h2>
                    
                    {/* Sales */}
                    <div className="bg-slate-800 rounded-lg p-2 md:p-3 mb-3">
                      <p className="text-slate-400 text-xs font-semibold mb-2">SALES</p>
                      <div className="grid grid-cols-2 gap-2 md:gap-3">
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Today</p>
                          <p className="text-white text-sm md:text-base font-bold">{formatCurrency(dayData.sales)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">LY</p>
                          <p className="text-white text-sm md:text-base font-bold">{formatCurrency(dayData.lySales)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">$ Change</p>
                          <p className={`text-sm md:text-base font-bold ${dayData.salesChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(dayData.salesChange)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">% Change</p>
                          <p className={`text-sm md:text-base font-bold ${dayData.salesChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPercent(dayData.salesChangePercent)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Guest Counts */}
                    <div className="bg-slate-800 rounded-lg p-2 md:p-3">
                      <p className="text-slate-400 text-xs font-semibold mb-2">GUEST COUNTS</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Today</p>
                          <p className="text-white text-sm md:text-base font-bold">{formatNumber(dayData.guestCount)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">LY</p>
                          <p className="text-white text-sm md:text-base font-bold">{formatNumber(dayData.lyGuestCount)}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 text-xs mb-1">Avg $/Guest</p>
                          <p className="text-white text-sm md:text-base font-bold">${dayData.avgPerGuest.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scheduled Today Tab */}
        {activeTab === 'scheduled' && (
          <div className="space-y-3 md:space-y-4">
            {Object.entries(scheduledData).map(([location, employees]) => {
              if (!employees || employees.length === 0) return null;
              
              // Get the most recent date
              const mostRecentDate = employees[0]?.date;
              const todayEmployees = employees.filter(e => e.date === mostRecentDate);
              
              return (
                <div key={location} className="bg-slate-900 rounded-lg p-3 md:p-4 border border-slate-800">
                  <h2 className="text-white text-base md:text-lg font-bold mb-3">{location}</h2>
                  <p className="text-slate-400 text-xs mb-3">{mostRecentDate}</p>
                  
                  <div className="space-y-2">
                    {todayEmployees.map((emp, idx) => (
                      <div key={idx} className="bg-slate-800 rounded-lg p-2 md:p-3">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-2">
                          <div className="flex-1">
                            <p className="text-white text-sm md:text-base font-semibold">{emp.employeeName}</p>
                            <p className="text-slate-400 text-xs">{emp.jobTitle}</p>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-white text-sm font-semibold">{emp.startTime} - {emp.endTime}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Auto-Clockouts & Call-Offs Tab */}
        {activeTab === 'labor' && (
          <div className="space-y-3 md:space-y-4">
            {Object.entries(laborData).map(([location, data]) => {
              const hasAutoClockouts = data.autoClockouts && data.autoClockouts.length > 0;
              const hasCallOffs = data.callOffs && data.callOffs.length > 0;
              
              if (!hasAutoClockouts && !hasCallOffs) return null;
              
              return (
                <div key={location} className="bg-slate-900 rounded-lg p-3 md:p-4 border border-slate-800">
                  <h2 className="text-white text-base md:text-lg font-bold mb-3 md:mb-4">{location}</h2>
                  
                  {/* Auto-Clockouts */}
                  {hasAutoClockouts && (
                    <div className="mb-4">
                      <h3 className="text-red-400 text-sm font-semibold mb-2">Auto-Clockouts</h3>
                      <div className="space-y-2">
                        {data.autoClockouts.map((entry, idx) => (
                          <div key={idx} className="bg-slate-800 rounded-lg p-2 md:p-3">
                            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                              <div className="flex-1">
                                <p className="text-white text-sm font-semibold">{entry.employeeName}</p>
                                <p className="text-slate-400 text-xs">{entry.jobTitle}</p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-slate-300 text-xs">{entry.date}</p>
                                <p className="text-slate-400 text-xs">Shift: {entry.shiftTime}</p>
                                <p className="text-red-400 text-xs">Clocked: {entry.clockTime}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Call-Offs */}
                  {hasCallOffs && (
                    <div>
                      <h3 className="text-orange-400 text-sm font-semibold mb-2">Call-Offs</h3>
                      <div className="space-y-2">
                        {data.callOffs.map((entry, idx) => (
                          <div key={idx} className="bg-slate-800 rounded-lg p-2 md:p-3">
                            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                              <div className="flex-1">
                                <p className="text-white text-sm font-semibold">{entry.employeeName}</p>
                                <p className="text-slate-400 text-xs">{entry.jobTitle}</p>
                              </div>
                              <div className="text-left sm:text-right">
                                <p className="text-slate-300 text-xs">{entry.date}</p>
                                <p className="text-orange-400 text-xs">Scheduled: {entry.shiftTime}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
