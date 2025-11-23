// pages/index.js - COMPLETE VERSION
// Includes: Weekly Sales & Labor, Daily Dashboard (7-day), Auto-Clockouts, Call-Offs, Scheduled Today, P&L Upload, P&L Access Management
// Removed: Comps/Discounts/Voids

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Head from 'next/head';

export default function Dashboard() {
  const { data: session, status } = useSession();
  
  // Dashboard Selection
  const [selectedDashboard, setSelectedDashboard] = useState('weekly-sales-labor');
  
  // Weekly Sales & Labor State
  const [salesData, setSalesData] = useState([]);
  const [historicalData, setHistoricalData] = useState([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState('current');
  const [salesFilters, setSalesFilters] = useState({
    location: '',
    salesVariance: 'all',
    laborVariance: 'all'
  });
  const [salesFiltersOpen, setSalesFiltersOpen] = useState(true);
  
  // Daily Dashboard (7-day history) State
  const [dailyData, setDailyData] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState(null);
  const [dailyFilters, setDailyFilters] = useState({
    location: ''
  });
  const [dailyFiltersOpen, setDailyFiltersOpen] = useState(true);
  
  // Scheduled Today State
  const [scheduledData, setScheduledData] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState(null);
  const [scheduledFilters, setScheduledFilters] = useState({
    location: ''
  });
  const [scheduledFiltersOpen, setScheduledFiltersOpen] = useState(true);
  
  // Auto-Clockouts State
  const [autoClockouts, setAutoClockouts] = useState([]);
  const [clockoutsLoading, setClockoutsLoading] = useState(false);
  const [clockoutsError, setClockoutsError] = useState(null);
  const [clockoutFilters, setClockoutFilters] = useState({
    location: ''
  });
  const [clockoutFiltersOpen, setClockoutFiltersOpen] = useState(true);
  
  // Call-Offs State
  const [callOffs, setCallOffs] = useState([]);
  const [callOffsLoading, setCallOffsLoading] = useState(false);
  const [callOffsError, setCallOffsError] = useState(null);
  const [callOffFilters, setCallOffFilters] = useState({
    location: ''
  });
  const [callOffFiltersOpen, setCallOffFiltersOpen] = useState(true);
  const [expandedDays, setExpandedDays] = useState({});
  
  // P&L Upload State
  const [plUploadFile, setPlUploadFile] = useState(null);
  const [plUploading, setPlUploading] = useState(false);
  const [plUploadError, setPlUploadError] = useState('');
  const [plUploadSuccess, setPlUploadSuccess] = useState('');
  
  // P&L Access Management State
  const [plAccessUsers, setPlAccessUsers] = useState([]);
  const [plAccessLoading, setPlAccessLoading] = useState(false);
  const [plAccessError, setPlAccessError] = useState('');
  const [plAccessSuccess, setPlAccessSuccess] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [availableLocations, setAvailableLocations] = useState([]);
  
  // Modal State
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Google Sheets Config
  const SHEET_ID = process.env.NEXT_PUBLIC_GOOGLE_SHEET_ID;
  const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;

  // Load data based on selected dashboard
  useEffect(() => {
    if (status === 'authenticated') {
      if (selectedDashboard === 'weekly-sales-labor') {
        loadSalesData();
      } else if (selectedDashboard === 'daily-dashboard') {
        loadDailyData();
      } else if (selectedDashboard === 'scheduled-today') {
        loadScheduledData();
      } else if (selectedDashboard === 'auto-clockouts') {
        loadAutoClockouts();
      } else if (selectedDashboard === 'call-offs') {
        loadCallOffs();
      } else if (selectedDashboard === 'pl-access-management' && session?.user?.email === 'dalton@rancherscustard.com') {
        loadPlAccessUsers();
        loadAvailableLocations();
      }
    }
  }, [selectedDashboard, status, selectedWeek]);

  // Load Weekly Sales & Labor Data
  const loadSalesData = async () => {
    setSalesLoading(true);
    setSalesError(null);
    
    try {
      const sheetName = selectedWeek === 'current' ? 'Weekly - Current' : 'Weekly - Historical';
      const range = `${sheetName}!A:Z`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch data');
      
      const result = await response.json();
      const rows = result.values || [];
      
      if (selectedWeek === 'current') {
        const parsed = parseSheetData(rows);
        setSalesData(parsed);
      } else {
        const parsed = parseHistoricalData(rows);
        setHistoricalData(parsed);
      }
    } catch (error) {
      console.error('Error loading sales data:', error);
      setSalesError(error.message);
    } finally {
      setSalesLoading(false);
    }
  };

  // Parse Current Week Data
  const parseSheetData = (rows) => {
    if (rows.length < 2) return [];
    
    const parsedData = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || row[0] === '') continue;
      
      const actualSales = parseFloat(row[1]) || 0;
      const actualGuests = parseFloat(row[2]) || 0;
      const lySales = parseFloat(row[3]) || 0;
      const lyGuests = parseFloat(row[4]) || 0;
      const actualHours = parseFloat(row[5]) || 0;
      const scheduledHours = parseFloat(row[6]) || 0;
      const optimalHours = parseFloat(row[7]) || 0;
      const laborPercent = parseFloat(row[8]) || 0;
      
      // Calculate metrics
      const salesVariance = actualSales - lySales;
      const salesVariancePercent = lySales > 0 ? (salesVariance / lySales) * 100 : 0;
      const guestVariance = actualGuests - lyGuests;
      const guestVariancePercent = lyGuests > 0 ? (guestVariance / lyGuests) * 100 : 0;
      const actVsOptHours = actualHours - optimalHours;
      const actVsSchHours = actualHours - scheduledHours;
      const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
      
      // NEW: Calculate Optimal Labor % and Variance
      const optimalLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour) / actualSales * 100 : 0;
      const laborVariance = laborPercent - optimalLaborPercent;
      
      parsedData.push({
        location: row[0],
        actualSales,
        actualGuests,
        lySales,
        lyGuests,
        salesVariance,
        salesVariancePercent,
        guestVariance,
        guestVariancePercent,
        actualHours,
        scheduledHours,
        optimalHours,
        actVsOptHours,
        actVsSchHours,
        laborPercent,
        laborCostPerHour,
        optimalLaborPercent,
        laborVariance
      });
    }
    
    return parsedData;
  };

  // Parse Historical Data
  const parseHistoricalData = (rows) => {
    if (rows.length < 2) return [];
    
    const parsedData = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || row[0] === '') continue;
      
      const actualSales = parseFloat(row[2]) || 0;
      const actualGuests = parseFloat(row[3]) || 0;
      const lySales = parseFloat(row[4]) || 0;
      const lyGuests = parseFloat(row[5]) || 0;
      const actualHours = parseFloat(row[6]) || 0;
      const scheduledHours = parseFloat(row[7]) || 0;
      const optimalHours = parseFloat(row[8]) || 0;
      const laborPercent = parseFloat(row[9]) || 0;
      
      const salesVariance = actualSales - lySales;
      const salesVariancePercent = lySales > 0 ? (salesVariance / lySales) * 100 : 0;
      const guestVariance = actualGuests - lyGuests;
      const guestVariancePercent = lyGuests > 0 ? (guestVariance / lyGuests) * 100 : 0;
      const actVsOptHours = actualHours - optimalHours;
      const actVsSchHours = actualHours - scheduledHours;
      const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
      
      // NEW: Calculate Optimal Labor % and Variance
      const optimalLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour) / actualSales * 100 : 0;
      const laborVariance = laborPercent - optimalLaborPercent;
      
      parsedData.push({
        weekEnding: row[0],
        location: row[1],
        actualSales,
        actualGuests,
        lySales,
        lyGuests,
        salesVariance,
        salesVariancePercent,
        guestVariance,
        guestVariancePercent,
        actualHours,
        scheduledHours,
        optimalHours,
        actVsOptHours,
        actVsSchHours,
        laborPercent,
        laborCostPerHour,
        optimalLaborPercent,
        laborVariance
      });
    }
    
    return parsedData;
  };

  // Load Daily Dashboard Data (7-day history)
  const loadDailyData = async () => {
    setDailyLoading(true);
    setDailyError(null);
    
    try {
      const sheetName = 'Flash - Daily';
      const range = `${sheetName}!A:I`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch daily data');
      
      const result = await response.json();
      const rows = result.values || [];
      
      const parsed = parseDailyData(rows);
      setDailyData(parsed);
    } catch (error) {
      console.error('Error loading daily data:', error);
      setDailyError(error.message);
    } finally {
      setDailyLoading(false);
    }
  };

  // Parse Daily Data (7 days per location)
  const parseDailyData = (rows) => {
    if (rows.length < 2) return [];
    
    const locationMap = {};
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[1] || row[1] === '') continue;
      
      const date = row[0];
      const location = row[1];
      const sales = parseFloat(row[2]) || 0;
      const paySales = parseFloat(row[3]) || 0;
      const salesVariance = parseFloat(row[4]) || 0;
      const guestCount = parseFloat(row[5]) || 0;
      const payGuestCount = parseFloat(row[6]) || 0;
      const guestVariance = parseFloat(row[7]) || 0;
      const laborPercent = parseFloat(row[8]) || 0;
      
      const salesVariancePercent = paySales > 0 ? (salesVariance / paySales) * 100 : 0;
      const guestVariancePercent = payGuestCount > 0 ? (guestVariance / payGuestCount) * 100 : 0;
      
      if (!locationMap[location]) {
        locationMap[location] = {
          location,
          days: []
        };
      }
      
      locationMap[location].days.push({
        date,
        sales,
        paySales,
        salesVariance,
        salesVariancePercent,
        guestCount,
        payGuestCount,
        guestVariance,
        guestVariancePercent,
        laborPercent
      });
    }
    
    // Convert to array and sort days (newest first)
    const result = Object.values(locationMap).map(loc => ({
      ...loc,
      days: loc.days.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 7)
    }));
    
    return result.sort((a, b) => a.location.localeCompare(b.location));
  };

  // Load Scheduled Today Data
  const loadScheduledData = async () => {
    setScheduledLoading(true);
    setScheduledError(null);
    
    try {
      const sheetName = 'Scheduled Today';
      const range = `${sheetName}!A:D`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch scheduled data');
      
      const result = await response.json();
      const rows = result.values || [];
      
      const parsed = parseScheduledData(rows);
      setScheduledData(parsed);
    } catch (error) {
      console.error('Error loading scheduled data:', error);
      setScheduledError(error.message);
    } finally {
      setScheduledLoading(false);
    }
  };

  // Parse Scheduled Today Data
  const parseScheduledData = (rows) => {
    if (rows.length < 2) return [];
    
    const parsedData = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[1] || row[1] === '') continue;
      
      parsedData.push({
        date: row[0],
        location: row[1],
        employee: row[2],
        shiftTime: row[3]
      });
    }
    
    return parsedData;
  };

  // Load Auto-Clockouts
  const loadAutoClockouts = async () => {
    setClockoutsLoading(true);
    setClockoutsError(null);
    
    try {
      const sheetName = 'Auto-Clockouts';
      const range = `${sheetName}!A:F`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch auto-clockouts');
      
      const result = await response.json();
      const rows = result.values || [];
      
      const parsed = parseAutoClockouts(rows);
      setAutoClockouts(parsed);
    } catch (error) {
      console.error('Error loading auto-clockouts:', error);
      setClockoutsError(error.message);
    } finally {
      setClockoutsLoading(false);
    }
  };

  // Parse Auto-Clockouts
  const parseAutoClockouts = (rows) => {
    if (rows.length < 2) return [];
    
    const parsedData = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[1] || row[1] === '') continue;
      
      parsedData.push({
        date: row[0],
        location: row[1],
        employee: row[2],
        clockIn: row[3],
        clockOut: row[4],
        status: row[5] || 'Needs Fix'
      });
    }
    
    return parsedData;
  };

  // Load Call-Offs
  const loadCallOffs = async () => {
    setCallOffsLoading(true);
    setCallOffsError(null);
    
    try {
      const sheetName = 'Call-Offs';
      const range = `${sheetName}!A:D`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?key=${API_KEY}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch call-offs');
      
      const result = await response.json();
      const rows = result.values || [];
      
      const parsed = parseCallOffs(rows);
      setCallOffs(parsed);
    } catch (error) {
      console.error('Error loading call-offs:', error);
      setCallOffsError(error.message);
    } finally {
      setCallOffsLoading(false);
    }
  };

  // Parse Call-Offs (grouped by day)
  const parseCallOffs = (rows) => {
    if (rows.length < 2) return [];
    
    const dayMap = {};
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row[1] || row[1] === '') continue;
      
      const date = row[0];
      
      if (!dayMap[date]) {
        dayMap[date] = {
          date,
          callOffs: []
        };
      }
      
      dayMap[date].callOffs.push({
        location: row[1],
        employee: row[2],
        scheduledTime: row[3]
      });
    }
    
    // Convert to array and sort by date (newest first)
    const result = Object.values(dayMap).sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Initialize all days as expanded
    const expanded = {};
    result.forEach(day => {
      expanded[day.date] = true;
    });
    setExpandedDays(expanded);
    
    return result;
  };

  // P&L Upload Handler
  const handlePlUpload = async () => {
    if (!plUploadFile) {
      setPlUploadError('Please select a file first');
      return;
    }

    setPlUploading(true);
    setPlUploadError('');
    setPlUploadSuccess('');

    try {
      const formData = new FormData();
      formData.append('file', plUploadFile);

      const response = await fetch('/api/upload-pl', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setPlUploadSuccess(`Successfully uploaded P&L data for ${result.locations} locations (Period: ${result.period})`);
      setPlUploadFile(null);

    } catch (error) {
      console.error('Upload error:', error);
      setPlUploadError(error.message || 'Failed to upload file');
    } finally {
      setPlUploading(false);
    }
  };

  // Load P&L Access Users
  const loadPlAccessUsers = async () => {
    setPlAccessLoading(true);
    setPlAccessError('');
    
    try {
      const response = await fetch('/api/admin/manage-pl-access');
      if (!response.ok) throw new Error('Failed to load users');
      
      const result = await response.json();
      setPlAccessUsers(result.users);
    } catch (error) {
      console.error('Error loading users:', error);
      setPlAccessError(error.message);
    } finally {
      setPlAccessLoading(false);
    }
  };

  // Load Available Locations
  const loadAvailableLocations = async () => {
    try {
      const response = await fetch('/api/get-pl-data');
      const data = await response.json();
      if (data.success && data.availableLocations) {
        setAvailableLocations(data.availableLocations);
      }
    } catch (err) {
      console.error('Error loading locations:', err);
    }
  };

  // Update User P&L Access
  const updateUserPlAccess = async (email, plAccess) => {
    setPlAccessLoading(true);
    setPlAccessError('');
    setPlAccessSuccess('');
    
    try {
      const response = await fetch('/api/admin/manage-pl-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, plAccess })
      });
      
      if (!response.ok) throw new Error('Failed to update access');
      
      setPlAccessSuccess(`Updated access for ${email}`);
      setEditingUser(null);
      await loadPlAccessUsers();
    } catch (error) {
      console.error('Error updating access:', error);
      setPlAccessError(error.message);
    } finally {
      setPlAccessLoading(false);
    }
  };

  // Toggle day expansion for call-offs
  const toggleDay = (date) => {
    setExpandedDays(prev => ({
      ...prev,
      [date]: !prev[date]
    }));
  };

  // Filter functions
  const getFilteredSalesData = () => {
    const data = selectedWeek === 'current' ? salesData : historicalData;
    return data.filter(item => {
      if (salesFilters.location && !item.location.toLowerCase().includes(salesFilters.location.toLowerCase())) {
        return false;
      }
      if (salesFilters.salesVariance === 'positive' && item.salesVariance <= 0) return false;
      if (salesFilters.salesVariance === 'negative' && item.salesVariance >= 0) return false;
      if (salesFilters.laborVariance === 'positive' && item.laborVariance <= 0) return false;
      if (salesFilters.laborVariance === 'negative' && item.laborVariance >= 0) return false;
      return true;
    });
  };

  const getFilteredDailyData = () => {
    return dailyData.filter(item => {
      if (dailyFilters.location && !item.location.toLowerCase().includes(dailyFilters.location.toLowerCase())) {
        return false;
      }
      return true;
    });
  };

  const getFilteredScheduledData = () => {
    return scheduledData.filter(item => {
      if (scheduledFilters.location && !item.location.toLowerCase().includes(scheduledFilters.location.toLowerCase())) {
        return false;
      }
      return true;
    });
  };

  const getFilteredClockouts = () => {
    return autoClockouts.filter(item => {
      if (clockoutFilters.location && !item.location.toLowerCase().includes(clockoutFilters.location.toLowerCase())) {
        return false;
      }
      return true;
    });
  };

  const getFilteredCallOffs = () => {
    return callOffs.map(day => ({
      ...day,
      callOffs: day.callOffs.filter(item => {
        if (callOffFilters.location && !item.location.toLowerCase().includes(callOffFilters.location.toLowerCase())) {
          return false;
        }
        return true;
      })
    })).filter(day => day.callOffs.length > 0);
  };

  // Format currency
  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  // Format percent
  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  // Show login screen if not authenticated
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-8">Andy's Dashboard</h1>
          <button
            onClick={() => signIn('google')}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Andy's Dashboard</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 pb-20">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
            <h1 className="text-2xl font-bold text-white">Andy's Dashboard</h1>
            <div className="flex items-center gap-4">
              <span className="text-slate-300 text-sm">{session.user.email}</span>
              <button
                onClick={() => signOut()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Dashboard Selector */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          <select
            value={selectedDashboard}
            onChange={(e) => setSelectedDashboard(e.target.value)}
            className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="weekly-sales-labor">Weekly Sales & Labor</option>
            <option value="daily-dashboard">Daily Dashboard (7-Day History)</option>
            <option value="auto-clockouts">Auto-Clockouts</option>
            <option value="call-offs">Call-Offs</option>
            <option value="scheduled-today">Scheduled Today</option>
            {session?.user?.email === 'dalton@rancherscustard.com' && (
              <>
                <option value="pl-upload">P&L Upload</option>
                <option value="pl-access-management">P&L Access Management</option>
              </>
            )}
          </select>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4">
          
          {/* Weekly Sales & Labor Dashboard */}
          {selectedDashboard === 'weekly-sales-labor' && (
            <div className="space-y-6">
              {/* Filters - Collapsible */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setSalesFiltersOpen(!salesFiltersOpen)}
                  className="w-full px-4 py-3 flex justify-between items-center text-white font-semibold hover:bg-slate-700"
                >
                  <span>Filters</span>
                  <span>{salesFiltersOpen ? '▼' : '▶'}</span>
                </button>
                
                {salesFiltersOpen && (
                  <div className="p-4 border-t border-slate-700 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Week</label>
                      <select
                        value={selectedWeek}
                        onChange={(e) => setSelectedWeek(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                      >
                        <option value="current">Current Week</option>
                        <option value="historical">Historical</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Location</label>
                      <input
                        type="text"
                        placeholder="Filter by location..."
                        value={salesFilters.location}
                        onChange={(e) => setSalesFilters({ ...salesFilters, location: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Sales Variance</label>
                        <select
                          value={salesFilters.salesVariance}
                          onChange={(e) => setSalesFilters({ ...salesFilters, salesVariance: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                        >
                          <option value="all">All</option>
                          <option value="positive">Above LY</option>
                          <option value="negative">Below LY</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Labor Variance</label>
                        <select
                          value={salesFilters.laborVariance}
                          onChange={(e) => setSalesFilters({ ...salesFilters, laborVariance: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                        >
                          <option value="all">All</option>
                          <option value="positive">Over Optimal</option>
                          <option value="negative">Under Optimal</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Loading/Error */}
              {salesLoading && (
                <div className="text-center py-10 text-white">Loading...</div>
              )}
              
              {salesError && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                  Error: {salesError}
                </div>
              )}

              {/* Location Cards */}
              {!salesLoading && !salesError && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getFilteredSalesData().map((location, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedLocation(location);
                        setShowModal(true);
                      }}
                      className="bg-slate-800 border border-slate-700 rounded-lg p-4 hover:border-blue-500 cursor-pointer transition-all"
                    >
                      <h3 className="text-xl font-bold text-white mb-4">{location.location}</h3>

                      {/* SALES Section */}
                      <div className="mb-4 pb-4 border-b border-slate-700">
                        <div className="text-xs font-semibold text-slate-400 mb-2">SALES</div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">Sales</span>
                            <span className="text-white font-semibold">{formatCurrency(location.actualSales)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">LY</span>
                            <span className="text-slate-400 text-sm">{formatCurrency(location.lySales)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">Var</span>
                            <span className={`text-sm font-semibold ${location.salesVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(location.salesVariance)} ({formatPercent(location.salesVariancePercent)})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* GUESTS Section */}
                      <div className="mb-4 pb-4 border-b border-slate-700">
                        <div className="text-xs font-semibold text-slate-400 mb-2">GUESTS</div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">Count</span>
                            <span className="text-white font-semibold">{location.actualGuests.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">LY</span>
                            <span className="text-slate-400 text-sm">{location.lyGuests.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">Var</span>
                            <span className={`text-sm font-semibold ${location.guestVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {location.guestVariance >= 0 ? '+' : ''}{location.guestVariance.toLocaleString()} ({formatPercent(location.guestVariancePercent)})
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* LABOR Section */}
                      <div>
                        <div className="text-xs font-semibold text-slate-400 mb-2">LABOR</div>
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">Labor %</span>
                            <span className="text-white font-semibold">{location.laborPercent.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">Opt %</span>
                            <span className="text-blue-400 text-sm">{location.optimalLaborPercent.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300 text-sm">Variance</span>
                            <span className={`text-sm font-semibold ${location.laborVariance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                              {formatPercent(location.laborVariance)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Daily Dashboard (7-Day History) */}
          {selectedDashboard === 'daily-dashboard' && (
            <div className="space-y-6">
              {/* Filters - Collapsible */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setDailyFiltersOpen(!dailyFiltersOpen)}
                  className="w-full px-4 py-3 flex justify-between items-center text-white font-semibold hover:bg-slate-700"
                >
                  <span>Filters</span>
                  <span>{dailyFiltersOpen ? '▼' : '▶'}</span>
                </button>
                
                {dailyFiltersOpen && (
                  <div className="p-4 border-t border-slate-700">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Location</label>
                    <input
                      type="text"
                      placeholder="Filter by location..."
                      value={dailyFilters.location}
                      onChange={(e) => setDailyFilters({ ...dailyFilters, location: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
                    />
                  </div>
                )}
              </div>

              {/* Loading/Error */}
              {dailyLoading && (
                <div className="text-center py-10 text-white">Loading...</div>
              )}
              
              {dailyError && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                  Error: {dailyError}
                </div>
              )}

              {/* Location Cards with 7-Day History */}
              {!dailyLoading && !dailyError && (
                <div className="grid grid-cols-1 gap-4">
                  {getFilteredDailyData().map((location, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                      <h3 className="text-xl font-bold text-white mb-4">📍 {location.location}</h3>
                      
                      {/* 7-Day Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-slate-400 border-b border-slate-700">
                              <th className="text-left py-2 px-2">Date</th>
                              <th className="text-right py-2 px-2">Sales</th>
                              <th className="text-right py-2 px-2">Var $</th>
                              <th className="text-right py-2 px-2">Var %</th>
                              <th className="text-right py-2 px-2">Guests</th>
                              <th className="text-right py-2 px-2">Var #</th>
                              <th className="text-right py-2 px-2">Var %</th>
                              <th className="text-right py-2 px-2">Labor %</th>
                            </tr>
                          </thead>
                          <tbody>
                            {location.days.map((day, dayIdx) => (
                              <tr key={dayIdx} className="border-b border-slate-700 hover:bg-slate-700">
                                <td className="py-2 px-2 text-slate-300">{day.date}</td>
                                <td className="py-2 px-2 text-right text-white font-semibold">{formatCurrency(day.sales)}</td>
                                <td className={`py-2 px-2 text-right font-semibold ${day.salesVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {formatCurrency(day.salesVariance)}
                                </td>
                                <td className={`py-2 px-2 text-right text-sm ${day.salesVariancePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {formatPercent(day.salesVariancePercent)}
                                </td>
                                <td className="py-2 px-2 text-right text-white font-semibold">{day.guestCount.toLocaleString()}</td>
                                <td className={`py-2 px-2 text-right font-semibold ${day.guestVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {day.guestVariance >= 0 ? '+' : ''}{day.guestVariance.toLocaleString()}
                                </td>
                                <td className={`py-2 px-2 text-right text-sm ${day.guestVariancePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {formatPercent(day.guestVariancePercent)}
                                </td>
                                <td className="py-2 px-2 text-right text-blue-400 font-semibold">{day.laborPercent.toFixed(1)}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Auto-Clockouts Dashboard */}
          {selectedDashboard === 'auto-clockouts' && (
            <div className="space-y-6">
              {/* Filters - Collapsible */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setClockoutFiltersOpen(!clockoutFiltersOpen)}
                  className="w-full px-4 py-3 flex justify-between items-center text-white font-semibold hover:bg-slate-700"
                >
                  <span>Filters</span>
                  <span>{clockoutFiltersOpen ? '▼' : '▶'}</span>
                </button>
                
                {clockoutFiltersOpen && (
                  <div className="p-4 border-t border-slate-700">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Location</label>
                    <input
                      type="text"
                      placeholder="Filter by location..."
                      value={clockoutFilters.location}
                      onChange={(e) => setClockoutFilters({ ...clockoutFilters, location: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
                    />
                  </div>
                )}
              </div>

              {/* Loading/Error */}
              {clockoutsLoading && (
                <div className="text-center py-10 text-white">Loading...</div>
              )}
              
              {clockoutsError && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                  Error: {clockoutsError}
                </div>
              )}

              {/* Auto-Clockouts List */}
              {!clockoutsLoading && !clockoutsError && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-900">
                        <tr className="text-slate-300 text-left text-sm">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Location</th>
                          <th className="py-3 px-4">Employee</th>
                          <th className="py-3 px-4">Clock In</th>
                          <th className="py-3 px-4">Clock Out</th>
                          <th className="py-3 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getFilteredClockouts().map((item, idx) => (
                          <tr key={idx} className="border-t border-slate-700 hover:bg-slate-700">
                            <td className="py-3 px-4 text-slate-300 text-sm">{item.date}</td>
                            <td className="py-3 px-4 text-white font-semibold">{item.location}</td>
                            <td className="py-3 px-4 text-slate-300">{item.employee}</td>
                            <td className="py-3 px-4 text-slate-400 text-sm">{item.clockIn}</td>
                            <td className="py-3 px-4 text-orange-400 text-sm font-semibold">{item.clockOut}</td>
                            <td className="py-3 px-4">
                              <span className="inline-block px-2 py-1 bg-orange-900 text-orange-200 text-xs rounded">
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {getFilteredClockouts().length === 0 && (
                    <div className="text-center py-10 text-slate-400">No auto-clockouts found</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Call-Offs Dashboard (Grouped by Day) */}
          {selectedDashboard === 'call-offs' && (
            <div className="space-y-6">
              {/* Filters - Collapsible */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setCallOffFiltersOpen(!callOffFiltersOpen)}
                  className="w-full px-4 py-3 flex justify-between items-center text-white font-semibold hover:bg-slate-700"
                >
                  <span>Filters</span>
                  <span>{callOffFiltersOpen ? '▼' : '▶'}</span>
                </button>
                
                {callOffFiltersOpen && (
                  <div className="p-4 border-t border-slate-700">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Location</label>
                    <input
                      type="text"
                      placeholder="Filter by location..."
                      value={callOffFilters.location}
                      onChange={(e) => setCallOffFilters({ ...callOffFilters, location: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
                    />
                  </div>
                )}
              </div>

              {/* Loading/Error */}
              {callOffsLoading && (
                <div className="text-center py-10 text-white">Loading...</div>
              )}
              
              {callOffsError && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                  Error: {callOffsError}
                </div>
              )}

              {/* Call-Offs Grouped by Day */}
              {!callOffsLoading && !callOffsError && (
                <div className="space-y-4">
                  {getFilteredCallOffs().map((day, dayIdx) => (
                    <div key={dayIdx} className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleDay(day.date)}
                        className="w-full px-4 py-3 flex justify-between items-center text-white font-semibold hover:bg-slate-700"
                      >
                        <span>📅 {day.date} ({day.callOffs.length} call-off{day.callOffs.length !== 1 ? 's' : ''})</span>
                        <span>{expandedDays[day.date] ? '▼' : '▶'}</span>
                      </button>
                      
                      {expandedDays[day.date] && (
                        <div className="border-t border-slate-700">
                          <table className="w-full">
                            <thead className="bg-slate-900">
                              <tr className="text-slate-300 text-left text-sm">
                                <th className="py-2 px-4">Location</th>
                                <th className="py-2 px-4">Employee</th>
                                <th className="py-2 px-4">Scheduled Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {day.callOffs.map((item, itemIdx) => (
                                <tr key={itemIdx} className="border-t border-slate-700 hover:bg-slate-700">
                                  <td className="py-2 px-4 text-white font-semibold">{item.location}</td>
                                  <td className="py-2 px-4 text-slate-300">{item.employee}</td>
                                  <td className="py-2 px-4 text-orange-400 text-sm">{item.scheduledTime}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {getFilteredCallOffs().length === 0 && (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-10 text-center text-slate-400">
                      No call-offs found
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Scheduled Today Dashboard */}
          {selectedDashboard === 'scheduled-today' && (
            <div className="space-y-6">
              {/* Filters - Collapsible */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => setScheduledFiltersOpen(!scheduledFiltersOpen)}
                  className="w-full px-4 py-3 flex justify-between items-center text-white font-semibold hover:bg-slate-700"
                >
                  <span>Filters</span>
                  <span>{scheduledFiltersOpen ? '▼' : '▶'}</span>
                </button>
                
                {scheduledFiltersOpen && (
                  <div className="p-4 border-t border-slate-700">
                    <label className="block text-sm font-medium text-slate-300 mb-2">Location</label>
                    <input
                      type="text"
                      placeholder="Filter by location..."
                      value={scheduledFilters.location}
                      onChange={(e) => setScheduledFilters({ ...scheduledFilters, location: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400"
                    />
                  </div>
                )}
              </div>

              {/* Loading/Error */}
              {scheduledLoading && (
                <div className="text-center py-10 text-white">Loading...</div>
              )}
              
              {scheduledError && (
                <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
                  Error: {scheduledError}
                </div>
              )}

              {/* Scheduled List */}
              {!scheduledLoading && !scheduledError && (
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-900">
                        <tr className="text-slate-300 text-left text-sm">
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Location</th>
                          <th className="py-3 px-4">Employee</th>
                          <th className="py-3 px-4">Shift Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getFilteredScheduledData().map((item, idx) => (
                          <tr key={idx} className="border-t border-slate-700 hover:bg-slate-700">
                            <td className="py-3 px-4 text-slate-300 text-sm">{item.date}</td>
                            <td className="py-3 px-4 text-white font-semibold">{item.location}</td>
                            <td className="py-3 px-4 text-slate-300">{item.employee}</td>
                            <td className="py-3 px-4 text-blue-400 text-sm">{item.shiftTime}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {getFilteredScheduledData().length === 0 && (
                    <div className="text-center py-10 text-slate-400">No scheduled shifts found</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* P&L Upload Dashboard */}
          {selectedDashboard === 'pl-upload' && session?.user?.email === 'dalton@rancherscustard.com' && (
            <div className="space-y-6">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4">📊 Upload P&L Data</h2>
                
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 mb-6">
                  <h3 className="text-white font-semibold mb-2">Instructions:</h3>
                  <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                    <li>Download the P&L Excel file from R365</li>
                    <li>Make sure it's the "Profit and Loss Details" report with one sheet per location</li>
                    <li>Click "Choose File" below and select the Excel file</li>
                    <li>Click "Upload & Process" to update all location data</li>
                    <li>The system will update all locations automatically</li>
                  </ol>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Select P&L Excel File
                  </label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => {
                      setPlUploadFile(e.target.files[0]);
                      setPlUploadError('');
                      setPlUploadSuccess('');
                    }}
                    className="w-full px-4 py-3 border-2 border-slate-600 bg-slate-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
                  />
                  {plUploadFile && (
                    <p className="text-slate-400 text-sm mt-2">
                      Selected: {plUploadFile.name} ({(plUploadFile.size / 1024).toFixed(2)} KB)
                    </p>
                  )}
                </div>

                {plUploadError && (
                  <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">
                    <strong>Error:</strong> {plUploadError}
                  </div>
                )}

                {plUploadSuccess && (
                  <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-lg text-sm">
                    <strong>Success!</strong> {plUploadSuccess}
                  </div>
                )}

                {plUploading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className="ml-3 text-white">Processing file...</span>
                  </div>
                ) : (
                  <button
                    onClick={handlePlUpload}
                    disabled={!plUploadFile}
                    className={`w-full font-semibold py-3 rounded-lg transition duration-200 ${
                      plUploadFile
                        ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                        : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {plUploadFile ? '📤 Upload & Process P&L Data' : 'Select a file to upload'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* P&L Access Management Dashboard */}
          {selectedDashboard === 'pl-access-management' && session?.user?.email === 'dalton@rancherscustard.com' && (
            <div className="space-y-6">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                <h2 className="text-2xl font-bold text-white mb-4">👥 Manage P&L Access</h2>
                
                <div className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
                  <h3 className="text-white font-semibold mb-2">ℹ️ How Access Works</h3>
                  <ul className="text-blue-200 text-sm space-y-1">
                    <li>• <strong>No Access:</strong> User cannot view any P&L data</li>
                    <li>• <strong>Specific Locations:</strong> User can only view selected locations</li>
                    <li>• <strong>All Locations:</strong> User can view all P&L data</li>
                    <li>• Changes take effect immediately - no redeployment needed</li>
                  </ul>
                </div>

                {plAccessError && (
                  <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm mb-4">
                    <strong>Error:</strong> {plAccessError}
                  </div>
                )}

                {plAccessSuccess && (
                  <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-lg text-sm mb-4">
                    <strong>Success!</strong> {plAccessSuccess}
                  </div>
                )}

                {plAccessLoading && !editingUser ? (
                  <div className="flex justify-center items-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                    <span className="ml-3 text-white">Loading users...</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {plAccessUsers.map(user => (
                      <div key={user.id} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                        {editingUser?.id === user.id ? (
                          // Edit Mode
                          <div className="space-y-4">
                            <div>
                              <label className="text-white font-semibold">{user.name}</label>
                              <p className="text-slate-400 text-sm">{user.email}</p>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-2">
                                Access Level
                              </label>
                              <select
                                value={editingUser.plAccess.type}
                                onChange={(e) => setEditingUser({
                                  ...editingUser,
                                  plAccess: { 
                                    ...editingUser.plAccess, 
                                    type: e.target.value,
                                    locations: e.target.value === 'specific' ? editingUser.plAccess.locations : []
                                  }
                                })}
                                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white"
                              >
                                <option value="none">No Access</option>
                                <option value="specific">Specific Locations</option>
                                <option value="all">All Locations</option>
                              </select>
                            </div>

                            {editingUser.plAccess.type === 'specific' && (
                              <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">
                                  Select Locations ({editingUser.plAccess.locations.length} selected)
                                </label>
                                <div className="bg-slate-800 border border-slate-600 rounded p-3 max-h-60 overflow-y-auto">
                                  <div className="grid grid-cols-2 gap-2">
                                    {availableLocations.map(location => (
                                      <label key={location} className="flex items-center space-x-2 text-sm text-white">
                                        <input
                                          type="checkbox"
                                          checked={editingUser.plAccess.locations.includes(location)}
                                          onChange={(e) => {
                                            const newLocations = e.target.checked
                                              ? [...editingUser.plAccess.locations, location]
                                              : editingUser.plAccess.locations.filter(l => l !== location);
                                            setEditingUser({
                                              ...editingUser,
                                              plAccess: { ...editingUser.plAccess, locations: newLocations }
                                            });
                                          }}
                                          className="rounded"
                                        />
                                        <span>{location}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <button
                                onClick={() => updateUserPlAccess(user.email, editingUser.plAccess)}
                                disabled={plAccessLoading}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-semibold"
                              >
                                {plAccessLoading ? 'Saving...' : 'Save Changes'}
                              </button>
                              <button
                                onClick={() => setEditingUser(null)}
                                disabled={plAccessLoading}
                                className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View Mode
                          <div className="flex justify-between items-center">
                            <div>
                              <h3 className="text-white font-semibold">{user.name}</h3>
                              <p className="text-slate-400 text-sm">{user.email}</p>
                              <div className="mt-2">
                                {user.plAccess.type === 'none' && (
                                  <span className="inline-block px-2 py-1 bg-red-900 text-red-200 text-xs rounded">
                                    No Access
                                  </span>
                                )}
                                {user.plAccess.type === 'all' && (
                                  <span className="inline-block px-2 py-1 bg-green-900 text-green-200 text-xs rounded">
                                    All Locations
                                  </span>
                                )}
                                {user.plAccess.type === 'specific' && (
                                  <span className="inline-block px-2 py-1 bg-blue-900 text-blue-200 text-xs rounded">
                                    {user.plAccess.locations.length} Location{user.plAccess.locations.length !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              {user.plAccess.type === 'specific' && user.plAccess.locations.length > 0 && (
                                <p className="text-slate-400 text-xs mt-1">
                                  {user.plAccess.locations.slice(0, 3).join(', ')}
                                  {user.plAccess.locations.length > 3 && ` +${user.plAccess.locations.length - 3} more`}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => setEditingUser({ ...user })}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-semibold"
                            >
                              Edit Access
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {plAccessUsers.length === 0 && (
                      <div className="text-center py-10 text-slate-400">
                        No users found. Users are added automatically when they first log in.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal for Location Details */}
        {showModal && selectedLocation && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-bold text-white">{selectedLocation.location}</h2>
                  <button
                    onClick={() => {
                      setShowModal(false);
                      setSelectedLocation(null);
                    }}
                    className="text-slate-400 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Sales Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-3">Sales</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Actual Sales:</span>
                        <span className="text-white font-semibold">{formatCurrency(selectedLocation.actualSales)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Last Year:</span>
                        <span className="text-slate-400">{formatCurrency(selectedLocation.lySales)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Variance:</span>
                        <span className={selectedLocation.salesVariance >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                          {formatCurrency(selectedLocation.salesVariance)} ({formatPercent(selectedLocation.salesVariancePercent)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Guest Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-3">Guests</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Guest Count:</span>
                        <span className="text-white font-semibold">{selectedLocation.actualGuests.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Last Year:</span>
                        <span className="text-slate-400">{selectedLocation.lyGuests.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Variance:</span>
                        <span className={selectedLocation.guestVariance >= 0 ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                          {selectedLocation.guestVariance >= 0 ? '+' : ''}{selectedLocation.guestVariance.toLocaleString()} ({formatPercent(selectedLocation.guestVariancePercent)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Labor Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-300 mb-3">Labor</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Actual Hours:</span>
                        <span className="text-white font-semibold">{selectedLocation.actualHours.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Optimal Hours:</span>
                        <span className="text-blue-400">{selectedLocation.optimalHours.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Scheduled Hours:</span>
                        <span className="text-slate-400">{selectedLocation.scheduledHours.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Act vs Opt:</span>
                        <span className={selectedLocation.actVsOptHours > 0 ? 'text-red-400' : 'text-green-400'}>
                          {selectedLocation.actVsOptHours >= 0 ? '+' : ''}{selectedLocation.actVsOptHours.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Labor %:</span>
                        <span className="text-white font-semibold">{selectedLocation.laborPercent.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Optimal %:</span>
                        <span className="text-blue-400">{selectedLocation.optimalLaborPercent.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Variance:</span>
                        <span className={selectedLocation.laborVariance > 0 ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                          {formatPercent(selectedLocation.laborVariance)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
