import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Head from "next/head"
import { useState, useEffect } from 'react';
import React from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw, AlertCircle, ChevronDown, BookOpen, MessageSquare, Settings, Receipt, LogOut } from 'lucide-react';
import SwipeNavigation from '../components/SwipeNavigation';
import { getMarket, sortByMarket } from '../lib/markets';
import { parseSheetData, parseHistoricalData } from '../lib/sheetParsers';
import { extractDriveTime, extractMood, generateSummary } from '../lib/logbookHelpers';
import { getDailyLaborGrade } from '../lib/laborGrade';
import { adjustTimeForTimezone, adjustSingleTime } from '../lib/timezone';
import { getWeekMonday, getWeatherEmoji, computeForecastForLocation } from '../lib/forecast';
import TitleBadge from '../components/shared/TitleBadge';
import DashboardSelect from '../components/shared/DashboardSelect';
import ClockoutModal from '../components/modals/ClockoutModal';
import CallOffModal from '../components/modals/CallOffModal';
import OvertimeTab from '../components/dashboards/OvertimeTab';
import CallOffsTab from '../components/dashboards/CallOffsTab';
import ClockoutsTab from '../components/dashboards/ClockoutsTab';
import ScheduledTodayTab from '../components/dashboards/ScheduledTodayTab';
import PaidOutsTab from '../components/dashboards/PaidOutsTab';
import LogbookTab from '../components/dashboards/LogbookTab';
import DailySalesTab from '../components/dashboards/DailySalesTab';
import DailyLaborTab from '../components/dashboards/DailyLaborTab';
import WeeklySalesTab from '../components/dashboards/WeeklySalesTab';
import ForecastingTab from '../components/dashboards/ForecastingTab';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Google Sheets API Configuration
// Google Sheets reads go through /api/sheets-proxy (server-side, session-gated).
// SPREADSHEET_ID and API_KEY live in env vars and never reach the client bundle.
const SHEET_NAME = 'Sheet1';
const AUTO_CLOCKOUTS_SHEET = 'Auto-Clockouts';
const CALL_OFFS_SHEET = 'Call-Offs';
const OVERTIME_SHEET = 'Overtime Warning';
const FLASH_DAILY_SALES_SHEET = 'Flash - Daily Sales';  // NEW: Sales & Guests  
const FLASH_DAILY_LABOR_SHEET = 'Flash - Daily Labor';  // NEW: Labor hours
const SCHEDULED_TODAY_SHEET = 'Scheduled Today';
const EMPLOYEE_TITLES_SHEET = 'Employee Titles';
const LOGBOOK_ENTRIES_SHEET = 'Logbook Entries';
const PAID_OUTS_SHEET = 'Paid Outs';
const FORECAST_DATA_SHEET = 'Forecast Data';
const MODEL_FORECAST_SHEET = 'Model Forecast';
const MODEL_COEFFICIENTS_SHEET = 'Model Coefficients';

export default function Home() {
const { data: session, status } = useSession()
const router = useRouter()

const [activeTab, setActiveTab] = useState('sales');

const [locations, setLocations] = useState([]);
const [filteredLocations, setFilteredLocations] = useState([]);
const [availableWeeks, setAvailableWeeks] = useState([]);
const [selectedWeek, setSelectedWeek] = useState('current');
const [filters, setFilters] = useState({
locations: [],
actVsOptVariance: 'all',
salesVariance: 'all',
market: 'all',
flaggedOnly: false
});
const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false);
const [isWeekDropdownOpen, setIsWeekDropdownOpen] = useState(false);
const [isLoading, setIsLoading] = useState(false);
const [reportDate, setReportDate] = useState('Loading...');
const [error, setError] = useState(null);

const [clockouts, setClockouts] = useState([]);
const [filteredClockouts, setFilteredClockouts] = useState([]);
const [clockoutsLoading, setClockoutsLoading] = useState(false);
const [clockoutsError, setClockoutsError] = useState(null);
const [locationFilter, setLocationFilter] = useState('all');
const [statusFilter, setStatusFilter] = useState('all');
const [showClockoutModal, setShowClockoutModal] = useState(false);
const [clockoutModalData, setClockoutModalData] = useState({ location: '', data: [] });
const [showCallOffModal, setShowCallOffModal] = useState(false);
const [callOffModalData, setCallOffModalData] = useState({ location: '', employees: [] });

const [callOffs, setCallOffs] = useState([]);
const [filteredCallOffs, setFilteredCallOffs] = useState([]);
const [callOffsLoading, setCallOffsLoading] = useState(false);
const [callOffsError, setCallOffsError] = useState(null);
const [callOffLocationFilter, setCallOffLocationFilter] = useState('all');

const [overtimeWarnings, setOvertimeWarnings] = useState([]);
const [filteredOvertime, setFilteredOvertime] = useState([]);
const [overtimeLoading, setOvertimeLoading] = useState(false);
const [overtimeError, setOvertimeError] = useState(null);

const [scheduledToday, setScheduledToday] = useState([]);
const [filteredScheduled, setFilteredScheduled] = useState([]);
const [scheduledLoading, setScheduledLoading] = useState(false);
const [scheduledError, setScheduledError] = useState(null);
const [scheduledLocationFilter, setScheduledLocationFilter] = useState('all');
const [scheduledMarketFilter, setScheduledMarketFilter] = useState('all');
const [employeeTitles, setEmployeeTitles] = useState({});

const [dailyFlashData, setDailyFlashData] = useState({});
const [dailyFlashLoading, setDailyFlashLoading] = useState(false);
const [dailyFlashError, setDailyFlashError] = useState(null);
const [filteredDailyFlash, setFilteredDailyFlash] = useState([]);
const [dailyFlashFilters, setDailyFlashFilters] = useState({
locations: [],
market: 'all'
});
const [isDailyFlashLocationDropdownOpen, setIsDailyFlashLocationDropdownOpen] = useState(false);

const [dailyLaborData, setDailyLaborData] = useState({});
const [dailyLaborLoading, setDailyLaborLoading] = useState(false);
const [dailyLaborError, setDailyLaborError] = useState(null);
const [filteredDailyLabor, setFilteredDailyLabor] = useState([]);
const [dailyLaborFilters, setDailyLaborFilters] = useState({
locations: [],
market: 'all'
});
const [isDailyLaborLocationDropdownOpen, setIsDailyLaborLocationDropdownOpen] = useState(false);
const [isDailyLaborFiltersOpen, setIsDailyLaborFiltersOpen] = useState(false);

const [isFiltersOpen, setIsFiltersOpen] = useState(false);
const [isDailyFlashFiltersOpen, setIsDailyFlashFiltersOpen] = useState(false);
const [isScheduledFiltersOpen, setIsScheduledFiltersOpen] = useState(false);

// Logbook state
const [logbookEntries, setLogbookEntries] = useState([]);
const [filteredLogbook, setFilteredLogbook] = useState([]);
const [logbookLoading, setLogbookLoading] = useState(false);
const [logbookError, setLogbookError] = useState(null);
const [logbookFilters, setLogbookFilters] = useState({
location: 'all',
market: 'all'
});
const [expandedLogbookIds, setExpandedLogbookIds] = useState(new Set());
const [isLogbookFiltersOpen, setIsLogbookFiltersOpen] = useState(false);

// Paid Outs state
const [paidOuts, setPaidOuts] = useState([]);
const [filteredPaidOuts, setFilteredPaidOuts] = useState([]);
const [paidOutsLoading, setPaidOutsLoading] = useState(false);
const [paidOutsError, setPaidOutsError] = useState(null);
const [paidOutsFilters, setPaidOutsFilters] = useState({
location: 'all',
type: 'all',
market: 'all'
});
const [isPaidOutsFiltersOpen, setIsPaidOutsFiltersOpen] = useState(false);

// Forecast state
const [forecastData, setForecastData] = useState([]);
const [forecastLoading, setForecastLoading] = useState(false);
const [forecastWeekOffset, setForecastWeekOffset] = useState(1);
const [forecastAccuracyExpanded, setForecastAccuracyExpanded] = useState(false);
const [forecastMarketFilter, setForecastMarketFilter] = useState('all');
const [modelForecastData, setModelForecastData] = useState([]);
const [modelCoefficients, setModelCoefficients] = useState(null);

// Messages state
const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

// Access control
const [dashboardAccess, setDashboardAccess] = useState(null);
const [accessLoading, setAccessLoading] = useState(true);

const isAdmin = session?.user?.email === ADMIN_EMAIL;

// Helper: filter daily data entries to prior 7 days, not including today
const filterPrior7Days = (entries) => {
  if (!entries || entries.length === 0) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return entries.filter(day => {
    const d = new Date(day.date);
    d.setHours(0, 0, 0, 0);
    return d < today && d >= sevenDaysAgo;
  });
};

const getLogbookDateRange = () => {
if (filteredLogbook.length === 0) return null;
const dates = filteredLogbook
.map(e => new Date(e.reportDate))
.filter(d => !isNaN(d.getTime()))
.sort((a, b) => a - b);
if (dates.length === 0) return null;
const formatDate = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
const minDate = dates[0];
const maxDate = dates[dates.length - 1];
if (minDate.getTime() === maxDate.getTime()) return formatDate(minDate);
return `${formatDate(minDate)} - ${formatDate(maxDate)}`;
};

// Paid Outs helper functions
const getPaidOutsDateRange = () => {
if (filteredPaidOuts.length === 0) return null;
const dates = filteredPaidOuts
.map(e => new Date(e.reportDate))
.filter(d => !isNaN(d.getTime()))
.sort((a, b) => a - b);
if (dates.length === 0) return null;
const formatDate = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
const minDate = dates[0];
const maxDate = dates[dates.length - 1];
if (minDate.getTime() === maxDate.getTime()) return formatDate(minDate);
return `${formatDate(minDate)} - ${formatDate(maxDate)}`;
};

const getPaidOutsTotals = () => {
const total = filteredPaidOuts.reduce((sum, e) => sum + (e.amount || 0), 0);
const byType = filteredPaidOuts.reduce((acc, e) => {
const type = e.type || 'Unknown';
acc[type] = (acc[type] || 0) + (e.amount || 0);
return acc;
}, {});
return { total, byType };
};

const loadDataFromGoogleSheets = async () => {
setIsLoading(true);
setError(null);

try {
  const range = `${SHEET_NAME}!A2:Z`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
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
const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;

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
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
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
} catch (err) {
  console.error('Error loading historical week:', err);
  setError(err.message);
} finally {
  setIsLoading(false);
}

};

const loadAutoClockouts = async () => {
setClockoutsLoading(true);
setClockoutsError(null);

try {
  const range = `${AUTO_CLOCKOUTS_SHEET}!A2:G`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
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
    schEnd: row[5] || '',
    extraHours: row[6] || ''
  }));
  
  setClockouts(parsedClockouts);
} catch (err) {
  console.error('Error loading auto-clockouts:', err);
  setClockoutsError(err.message);
} finally {
  setClockoutsLoading(false);
}

};

const loadCallOffs = async () => {
setCallOffsLoading(true);
setCallOffsError(null);

try {
  const range = `${CALL_OFFS_SHEET}!A2:D`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to load call-offs');
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    setCallOffs([]);
    return;
  }
  
  const parsedCallOffs = data.values.map(row => ({
    reportDate: row[0] || '',
    location: row[1] || '',
    employee: row[2] || '',
    scheduledTime: adjustTimeForTimezone(row[3] || '')
  }));
  
  setCallOffs(parsedCallOffs);
} catch (err) {
  console.error('Error loading call-offs:', err);
  setCallOffsError(err.message);
} finally {
  setCallOffsLoading(false);
}

};

const applyCallOffFilters = () => {
let filtered = [...callOffs];

// Apply access control first
if (!isAdmin && dashboardAccess?.type === 'specific') {
  filtered = filtered.filter(c => dashboardAccess.locations?.includes(c.location));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  filtered = [];
}

if (callOffLocationFilter !== 'all') {
  filtered = filtered.filter(c => c.location === callOffLocationFilter);
}

setFilteredCallOffs(filtered);

};

const loadOvertimeWarnings = async () => {
setOvertimeLoading(true);
setOvertimeError(null);

try {
  const range = `${OVERTIME_SHEET}!A2:C`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to load overtime warnings');
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    setOvertimeWarnings([]);
    return;
  }
  
  const parsedOvertime = data.values.map(row => ({
    employee: row[0] || '',
    location: row[1] || '',
    estOTStart: row[2] || ''
  }));
  
  setOvertimeWarnings(parsedOvertime);
} catch (err) {
  console.error('Error loading overtime warnings:', err);
  setOvertimeError(err.message);
} finally {
  setOvertimeLoading(false);
}

};

const applyOvertimeFilters = () => {
let filtered = [...overtimeWarnings];

// Apply access control
if (!isAdmin && dashboardAccess?.type === 'specific') {
  filtered = filtered.filter(o => dashboardAccess.locations?.includes(o.location));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  filtered = [];
}

setFilteredOvertime(filtered);

};

const loadDailyFlash = async () => {
setDailyFlashLoading(true);
setDailyFlashError(null);

try {
  const range = `${FLASH_DAILY_SALES_SHEET}!A2:I`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to load daily sales data');
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    setDailyFlashData({});
    return;
  }
  
  const groupedByLocation = {};
  
  data.values.forEach(row => {
    const location = row[1];
    if (!location) return;
    
    if (!groupedByLocation[location]) {
      groupedByLocation[location] = [];
    }
    
    groupedByLocation[location].push({
      date: row[0] || '',
      sales: parseFloat(row[2]) || 0,
      paySales: parseFloat(row[3]) || 0,
      salesVariance: parseFloat(row[4]) || 0,
      forecastVariance: parseFloat(row[5]) || 0,
      r365Forecast: (() => {
        const s = parseFloat(row[2]) || 0;
        const fv = parseFloat(row[5]) || 0;
        return (s > 0 && fv !== 0) ? Math.round(s - fv) : null;
      })(),
      guestCount: parseFloat(row[6]) || 0,
      payGuestCount: parseFloat(row[7]) || 0,
      laborPercent: parseFloat(row[8]) || 0
    });
  });
  
  Object.keys(groupedByLocation).forEach(location => {
    groupedByLocation[location].sort((a, b) => new Date(b.date) - new Date(a.date));
  });
  
  setDailyFlashData(groupedByLocation);
} catch (err) {
  console.error('Error loading daily sales data:', err);
  setDailyFlashError(err.message);
} finally {
  setDailyFlashLoading(false);
}

};

const loadDailyLabor = async () => {
setDailyLaborLoading(true);
setDailyLaborError(null);

try {
  const range = `${FLASH_DAILY_LABOR_SHEET}!A2:J`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to load daily labor data');
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    setDailyLaborData({});
    return;
  }
  
  const groupedByLocation = {};
  
  data.values.forEach(row => {
    const location = row[1];
    if (!location) return;
    
    if (!groupedByLocation[location]) {
      groupedByLocation[location] = [];
    }
    
    // New column mapping for Flash - Daily Labor sheet:
    // 0: Report Date
    // 1: Location
    // 2: Sales
    // 3: Actual Hours
    // 4: Optimal Hours
    // 5: Scheduled Hours
    // 6: Labor %
    // 7: Optimal Labor %
    // 8: Labor % Variance
    // 9: Labor Cost Per Hour
    
    groupedByLocation[location].push({
      date: row[0] || '',
      sales: parseFloat(row[2]) || 0,
      actualHours: parseFloat(row[3]) || 0,
      optimalHours: parseFloat(row[4]) || 0,
      scheduledHours: parseFloat(row[5]) || 0,
      actualLaborPercent: parseFloat(row[6]) || 0,
      optimalLaborPercent: parseFloat(row[7]) || 0,
      laborPercentVariance: parseFloat(row[8]) || 0
    });
  });
  
  Object.keys(groupedByLocation).forEach(location => {
    groupedByLocation[location].sort((a, b) => new Date(b.date) - new Date(a.date));
  });
  
  setDailyLaborData(groupedByLocation);
} catch (err) {
  console.error('Error loading daily labor data:', err);
  setDailyLaborError(err.message);
} finally {
  setDailyLaborLoading(false);
}

};

const loadLogbookEntries = async () => {
setLogbookLoading(true);
setLogbookError(null);

try {
  const range = `${LOGBOOK_ENTRIES_SHEET}!A2:F`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to load logbook entries');
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    setLogbookEntries([]);
    return;
  }
  
  const parsedEntries = data.values.map((row, idx) => ({
    id: idx,
    reportDate: row[0] || '',
    location: row[1] || '',
    category: row[2] || '',
    priority: row[3] || '',
    comment: row[4] || '',
    summary: row[5] || ''
  }));
  
  parsedEntries.sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
  
  setLogbookEntries(parsedEntries);
} catch (err) {
  console.error('Error loading logbook entries:', err);
  setLogbookError(err.message);
} finally {
  setLogbookLoading(false);
}

};

const applyLogbookFilters = () => {
let filtered = [...logbookEntries];

if (!isAdmin && dashboardAccess?.type === 'specific') {
  filtered = filtered.filter(e => dashboardAccess.locations?.includes(e.location));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  filtered = [];
}

if (logbookFilters.location !== 'all') {
  filtered = filtered.filter(e => e.location === logbookFilters.location);
}

if (logbookFilters.market !== 'all') {
  filtered = filtered.filter(e => getMarket(e.location) === logbookFilters.market);
}

setFilteredLogbook(filtered);

};

// Load Paid Outs
const loadPaidOuts = async () => {
setPaidOutsLoading(true);
setPaidOutsError(null);

try {
  const range = `${PAID_OUTS_SHEET}!A2:F`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to load paid outs');
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    setPaidOuts([]);
    return;
  }
  
  const parsedPaidOuts = data.values.map((row, idx) => ({
    id: idx,
    reportDate: row[0] || '',
    location: row[1] || '',
    type: row[2] || '',
    ticketNum: row[3] || '-',
    amount: parseFloat(row[4]) || 0,
    comment: row[5] || ''
  }));
  
  parsedPaidOuts.sort((a, b) => new Date(b.reportDate) - new Date(a.reportDate));
  
  setPaidOuts(parsedPaidOuts);
} catch (err) {
  console.error('Error loading paid outs:', err);
  setPaidOutsError(err.message);
} finally {
  setPaidOutsLoading(false);
}

};

const applyPaidOutsFilters = () => {
let filtered = [...paidOuts];

if (!isAdmin && dashboardAccess?.type === 'specific') {
  filtered = filtered.filter(e => dashboardAccess.locations?.includes(e.location));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  filtered = [];
}

if (paidOutsFilters.location !== 'all') {
  filtered = filtered.filter(e => e.location === paidOutsFilters.location);
}

if (paidOutsFilters.type !== 'all') {
  filtered = filtered.filter(e => e.type === paidOutsFilters.type);
}

if (paidOutsFilters.market !== 'all') {
  filtered = filtered.filter(e => getMarket(e.location) === paidOutsFilters.market);
}

setFilteredPaidOuts(filtered);

};

// ===== FORECAST DATA LOADING =====
const loadForecastData = async () => {
setForecastLoading(true);
try {
const range = `${FORECAST_DATA_SHEET}!A2:E`;
const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
const response = await fetch(url);
if (!response.ok) throw new Error('Failed to load forecast data');
const data = await response.json();
if (!data.values) { setForecastData([]); return; }
const parsed = data.values.map(row => ({
date: row[0] || '', location: row[1] || '',
sales: parseFloat((row[2] || '').toString().replace(/[$,]/g, '')) || 0,
highTemp: parseFloat(row[3]) || null, conditions: row[4] || ''
}));
setForecastData(parsed);
} catch (err) { console.error('Error loading forecast data:', err); setForecastData([]); }
finally { setForecastLoading(false); }
};


// ===== MODEL FORECAST DATA LOADING =====
const loadModelForecastData = async () => {
try {
const range = `${MODEL_FORECAST_SHEET}!A2:N`;
const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
const response = await fetch(url);
if (!response.ok) throw new Error('Failed to load model forecast data');
const data = await response.json();
if (!data.values) { setModelForecastData([]); return; }
const parsed = data.values.map(row => ({
date: row[0] || '', location: row[1] || '',
predicted: parseFloat((row[2] || '').toString().replace(/[$,]/g, '')) || 0,
actual: parseFloat((row[3] || '').toString().replace(/[$,]/g, '')) || 0,
variance: parseFloat((row[4] || '').toString().replace(/[$,]/g, '')) || 0,
accuracy: parseFloat(row[5]) || 0,
pwSalesUsed: parseFloat((row[6] || '').toString().replace(/[$,]/g, '')) || 0,
weatherAdjPct: parseFloat(row[7]) || 0,
tempDiff: parseFloat(row[8]) || null,
conditionChange: row[9] || '',
method: row[10] || '',
confidence: row[11] || '',
coeffVersion: parseFloat(row[12]) || 1,
generatedAt: row[13] || ''
}));
setModelForecastData(parsed);
} catch (err) { console.error('Error loading model forecast data:', err); setModelForecastData([]); }
};

// ===== MODEL COEFFICIENTS LOADING =====
const loadModelCoefficients = async () => {
try {
const range = `${MODEL_COEFFICIENTS_SHEET}!A2:C`;
const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
const response = await fetch(url);
if (!response.ok) return;
const data = await response.json();
if (!data.values) return;
const coefs = {};
data.values.forEach(row => {
const key = row[0] || '';
const val = row[1];
if (key) coefs[key] = isNaN(parseFloat(val)) ? val : parseFloat(val);
});
setModelCoefficients(coefs);
} catch (err) { console.error('Error loading model coefficients:', err); }
};

const toggleLogbookExpanded = (id) => {
setExpandedLogbookIds(prev => {
const newSet = new Set(prev);
if (newSet.has(id)) {
newSet.delete(id);
} else {
newSet.add(id);
}
return newSet;
});
};

const loadScheduledToday = async () => {
setScheduledLoading(true);
setScheduledError(null);

try {
  const range = `${SCHEDULED_TODAY_SHEET}!A2:E`;
  const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
  
  const response = await fetch(url);
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error?.message || 'Failed to load scheduled data');
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    setScheduledToday([]);
    return;
  }
  
  const parsedScheduled = data.values.map(row => ({
    date: row[0] || '',
    location: row[1] || '',
    employee: row[2] || '',
    schStart: adjustSingleTime(row[3] || ''),
    schEnd: adjustSingleTime(row[4] || '')
  }));
  
  setScheduledToday(parsedScheduled);
} catch (err) {
  console.error('Error loading scheduled data:', err);
  setScheduledError(err.message);
} finally {
  setScheduledLoading(false);
}

};

const loadEmployeeTitles = async () => {
try {
const range = `${EMPLOYEE_TITLES_SHEET}!A2:B`;
const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;

  const response = await fetch(url);
  
  if (!response.ok) {
    console.error('Failed to load employee titles');
    return;
  }
  
  const data = await response.json();
  
  if (!data.values || data.values.length === 0) {
    return;
  }
  
  const titlesMap = {};
  data.values.forEach(row => {
    const name = row[0]?.trim();
    const title = row[1]?.trim();
    if (name && title) {
      titlesMap[name.toLowerCase()] = title;
    }
  });
  
  setEmployeeTitles(titlesMap);
} catch (err) {
  console.error('Error loading employee titles:', err);
}

};

const getEmployeeTitle = (name) => {
if (!name) return null;
return employeeTitles[name.toLowerCase()] || null;
};

const applyScheduledFilters = () => {
let filtered = [...scheduledToday];

// Apply access control first
if (!isAdmin && dashboardAccess?.type === 'specific') {
  filtered = filtered.filter(emp => dashboardAccess.locations?.includes(emp.location));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  filtered = [];
}

if (scheduledLocationFilter !== 'all') {
  filtered = filtered.filter(emp => emp.location === scheduledLocationFilter);
}

if (scheduledMarketFilter !== 'all') {
  filtered = filtered.filter(emp => getMarket(emp.location) === scheduledMarketFilter);
}

setFilteredScheduled(filtered);

};

const applyClockoutFilters = () => {
let filtered = [...clockouts];

// Apply access control first
if (!isAdmin && dashboardAccess?.type === 'specific') {
  filtered = filtered.filter(c => dashboardAccess.locations?.includes(c.location));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  filtered = [];
}

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

// Helper function to get the date range from actual data
const getDataDateRange = (dataArray) => {
if (!dataArray || dataArray.length === 0) return null;

const dates = dataArray
  .map(item => new Date(item.reportDate))
  .filter(date => !isNaN(date.getTime()))
  .sort((a, b) => a - b);

if (dates.length === 0) return null;

const minDate = dates[0];
const maxDate = dates[dates.length - 1];

const formatDate = (date) => {
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

if (minDate.getTime() === maxDate.getTime()) {
  return formatDate(minDate);
}

return `${formatDate(minDate)} - ${formatDate(maxDate)}`;

};

// Get all auto-clockout data for a location (data is already limited to 7 days by script)
const getAutoClockoutData = (locationName) => {
return clockouts.filter(c => c.location === locationName);
};

// Get auto-clockout employees for a location (just names for backwards compatibility)
const getAutoClockoutEmployees = (locationName) => {
return clockouts
.filter(c => c.location === locationName)
.map(c => c.employee);
};

// Get total extra hours for auto-clockouts at a location
const getAutoClockoutExtraHours = (locationName) => {
const total = clockouts
.filter(c => c.location === locationName)
.reduce((sum, c) => {
const hrs = parseFloat(c.extraHours);
return sum + (isNaN(hrs) ? 0 : hrs);
}, 0);
return total > 0 ? total.toFixed(1) : '';
};

// Get all call-off employees for a location (data is already limited to 7 days by script)
const getCallOffEmployees = (locationName) => {
const employees = callOffs
.filter(c => c.location === locationName)
.map(c => c.employee);

return employees;

};

const applyFilters = () => {
let filtered = [...locations];

// Apply access control first
if (!isAdmin && dashboardAccess?.type === 'specific') {
  filtered = filtered.filter(loc => dashboardAccess.locations?.includes(loc.location));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  filtered = [];
}

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

// Double-whammy quick filter (toggled via the "Fcst down / Sched up" KPI card)
if (filters.flaggedOnly) {
  filtered = filtered.filter(loc => loc.salesVariance < 0 && loc.actVsSchHours > 0);
}

setFilteredLocations(filtered);

};

const applyDailyFlashFilters = () => {
let allLocations = Object.keys(dailyFlashData);

// Apply access control first
if (!isAdmin && dashboardAccess?.type === 'specific') {
  allLocations = allLocations.filter(loc => dashboardAccess.locations?.includes(loc));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  allLocations = [];
}

let filtered = allLocations;

if (dailyFlashFilters.locations.length > 0) {
  filtered = filtered.filter(loc => dailyFlashFilters.locations.includes(loc));
}

if (dailyFlashFilters.market !== 'all') {
  filtered = filtered.filter(loc => getMarket(loc) === dailyFlashFilters.market);
}

setFilteredDailyFlash(sortByMarket(filtered));

};

const handleLocationToggle = (location) => {
const newLocations = filters.locations.includes(location)
? filters.locations.filter(l => l !== location)
: [...filters.locations, location];
setFilters({...filters, locations: newLocations});
};

const handleDailyFlashLocationToggle = (location) => {
const newLocations = dailyFlashFilters.locations.includes(location)
? dailyFlashFilters.locations.filter(l => l !== location)
: [...dailyFlashFilters.locations, location];
setDailyFlashFilters({...dailyFlashFilters, locations: newLocations});
};

const applyDailyLaborFilters = () => {
let allLocations = Object.keys(dailyLaborData);

// Apply access control first
if (!isAdmin && dashboardAccess?.type === 'specific') {
  allLocations = allLocations.filter(loc => dashboardAccess.locations?.includes(loc));
} else if (!isAdmin && dashboardAccess?.type === 'none') {
  allLocations = [];
}

let filtered = allLocations;

if (dailyLaborFilters.locations.length > 0) {
  filtered = filtered.filter(loc => dailyLaborFilters.locations.includes(loc));
}

if (dailyLaborFilters.market !== 'all') {
  filtered = filtered.filter(loc => getMarket(loc) === dailyLaborFilters.market);
}

setFilteredDailyLabor(sortByMarket(filtered));

};

const handleDailyLaborLocationToggle = (location) => {
const newLocations = dailyLaborFilters.locations.includes(location)
? dailyLaborFilters.locations.filter(l => l !== location)
: [...dailyLaborFilters.locations, location];
setDailyLaborFilters({...dailyLaborFilters, locations: newLocations});
};

const calculateTotals = () => {
if (filteredLocations.length === 0) {
return {
totalSales: 0,
totalForecast: 0,
totalPriorYear: 0,
pyVariance: 0,
avgLaborPercent: 0,
totalActVsOpt: 0,
totalActVsSch: 0,
flaggedCount: 0,
comparablePyVariancePercent: 0,
avgProductivity: 0
};
}

const totalSales = filteredLocations.reduce((sum, loc) => sum + loc.actualSales, 0);
const totalForecast = filteredLocations.reduce((sum, loc) => sum + loc.forecastSales, 0);
const totalPriorYear = filteredLocations.reduce((sum, loc) => sum + loc.priorYearSales, 0);
const pyVariance = totalSales - totalPriorYear;
const totalLaborCost = filteredLocations.reduce((sum, loc) => sum + (loc.actualSales * loc.laborPercent / 100), 0);
const avgLaborPercent = totalSales > 0 ? (totalLaborCost / totalSales) * 100 : 0;
const totalActVsOpt = filteredLocations.reduce((sum, loc) => sum + loc.actVsOptHours, 0);
const totalActVsSch = filteredLocations.reduce((sum, loc) => sum + loc.actVsSchHours, 0);
// Double-whammy red flag: stores under forecast AND over scheduled hours
const flaggedCount = filteredLocations.filter(loc => loc.salesVariance < 0 && loc.actVsSchHours > 0).length;
// Comparable (same-store) prior-year variance: only stores that existed last year
// (priorYearSales > 0), so new locations don't distort the YoY number.
const comparableLocs = filteredLocations.filter(loc => loc.priorYearSales > 0);
const comparablePriorYear = comparableLocs.reduce((sum, loc) => sum + loc.priorYearSales, 0);
const comparableActual = comparableLocs.reduce((sum, loc) => sum + loc.actualSales, 0);
const comparablePyVariancePercent = comparablePriorYear > 0 ? ((comparableActual - comparablePriorYear) / comparablePriorYear) * 100 : 0;
const totalHours = filteredLocations.reduce((sum, loc) => sum + loc.actualHours, 0);
const avgProductivity = totalHours > 0 ? totalSales / totalHours : 0;

return {
  totalSales,
  totalForecast,
  totalPriorYear,
  pyVariance,
  avgLaborPercent,
  totalActVsOpt,
  totalActVsSch,
  flaggedCount,
  comparablePyVariancePercent,
  avgProductivity
};

};

useEffect(() => {
if (status === "unauthenticated") {
router.push("/auth/signin")
}
}, [status, router])

// Check for pending tab from P&L page navigation
useEffect(() => {
if (typeof window !== 'undefined') {
const pendingTab = sessionStorage.getItem('pendingTab');
if (pendingTab) {
setActiveTab(pendingTab);
sessionStorage.removeItem('pendingTab');
}
}
}, [])

// Redirect to access-pending page if user has no access
useEffect(() => {
if (status === "authenticated" && !accessLoading && !isAdmin) {
if (!dashboardAccess || dashboardAccess.type === 'none') {
// Approved chat-only employees (no dashboard access) belong in /messages
if (session?.user?.chatAccess?.status === 'approved') {
router.replace('/messages');
} else {
router.push('/auth/access-pending');
}
}
}
}, [status, accessLoading, isAdmin, dashboardAccess, session, router])

// Load dashboard access permissions
const loadDashboardAccess = async () => {
try {
const res = await fetch('/api/check-access');
const data = await res.json();

  if (res.ok) {
    setDashboardAccess(data.dashboardAccess || { type: 'none', locations: [] });
  } else {
    setDashboardAccess({ type: 'none', locations: [] });
  }
} catch (err) {
  console.error('Error loading dashboard access:', err);
  setDashboardAccess({ type: 'none', locations: [] });
} finally {
  setAccessLoading(false);
}

};

// Check if user has access to a location
const hasLocationAccess = (locationName) => {
if (isAdmin) return true;
if (!dashboardAccess) return false;
if (dashboardAccess.type === 'all') return true;
if (dashboardAccess.type === 'specific') {
return dashboardAccess.locations?.includes(locationName);
}
return false;
};

// Filter data based on access
const filterByAccess = (data, locationKey = 'location') => {
if (isAdmin || dashboardAccess?.type === 'all') return data;
if (!dashboardAccess || dashboardAccess.type === 'none') return [];
return data.filter(item => dashboardAccess.locations?.includes(item[locationKey]));
};

useEffect(() => {
const handleClickOutside = () => {
if (isLocationDropdownOpen) {
setIsLocationDropdownOpen(false);
}
if (isWeekDropdownOpen) {
setIsWeekDropdownOpen(false);
}
if (isDailyFlashLocationDropdownOpen) {
setIsDailyFlashLocationDropdownOpen(false);
}
if (isDailyLaborLocationDropdownOpen) {
setIsDailyLaborLocationDropdownOpen(false);
}
};

if (isLocationDropdownOpen || isWeekDropdownOpen || isDailyFlashLocationDropdownOpen || isDailyLaborLocationDropdownOpen) {
  document.addEventListener('click', handleClickOutside);
}

return () => {
  document.removeEventListener('click', handleClickOutside);
};

}, [isLocationDropdownOpen, isWeekDropdownOpen, isDailyFlashLocationDropdownOpen, isDailyLaborLocationDropdownOpen]);

useEffect(() => {
if (status === "authenticated") {
loadDashboardAccess();
loadDataFromGoogleSheets();
loadAvailableWeeks();
loadAutoClockouts();
loadCallOffs();
loadOvertimeWarnings();
loadScheduledToday();
loadEmployeeTitles();
loadDailyFlash();
loadDailyLabor();
loadLogbookEntries();
loadPaidOuts();
} else if (activeTab === 'forecast') {
loadForecastData();
loadModelForecastData();
loadModelCoefficients();
}
}, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch('/api/chat/channels');
        const data = await res.json();
        if (active && res.ok) {
          setUnreadMessagesCount(data.totalUnread || 0);
          try {
            if ('setAppBadge' in navigator) {
              const n = data.totalUnread || 0;
              if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
            }
          } catch (_) {}
        }
      } catch (_) {}
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => { active = false; clearInterval(id); };
  }, [status]);

useEffect(() => {
if (selectedWeek === 'current') {
loadDataFromGoogleSheets();
} else {
loadHistoricalWeek(selectedWeek);
}
}, [selectedWeek]);

useEffect(() => {
applyFilters();
}, [locations, filters, dashboardAccess]);

useEffect(() => {
applyDailyFlashFilters();
}, [dailyFlashData, dailyFlashFilters, dashboardAccess]);

useEffect(() => {
applyDailyLaborFilters();
}, [dailyLaborData, dailyLaborFilters, dashboardAccess]);

useEffect(() => {
applyClockoutFilters();
}, [clockouts, locationFilter, statusFilter, dashboardAccess]);

useEffect(() => {
applyCallOffFilters();
}, [callOffs, callOffLocationFilter, dashboardAccess]);

useEffect(() => {
applyOvertimeFilters();
}, [overtimeWarnings, dashboardAccess]);

useEffect(() => {
applyScheduledFilters();
}, [scheduledToday, scheduledLocationFilter, scheduledMarketFilter, dashboardAccess]);

useEffect(() => {
applyLogbookFilters();
}, [logbookEntries, logbookFilters, dashboardAccess]);

useEffect(() => {
applyPaidOutsFilters();
}, [paidOuts, paidOutsFilters, dashboardAccess]);

useEffect(() => {
if (activeTab === 'forecast' && forecastData.length === 0 && !forecastLoading) {
loadForecastData();
loadModelForecastData();
loadModelCoefficients();
}
}, [activeTab]);

if (status === "loading" || accessLoading) {
return (
<div className="min-h-screen flex items-center justify-center">
<div className="text-white text-lg">Loading...</div>
</div>
)
}

if (!session) {
return null
}

// Show loading while redirecting to access-pending (useEffect handles the redirect)
if (!isAdmin && (!dashboardAccess || dashboardAccess.type === 'none')) {
return (
<div className="min-h-screen flex items-center justify-center">
<div className="text-white text-lg">Checking access...</div>
</div>
);
}

const totals = calculateTotals();

// Refresh the data for whichever dashboard is active (shared by the
// desktop + mobile refresh buttons so the logic lives in one place).
const handleRefresh = () => {
  if (activeTab === 'sales') {
    if (selectedWeek === 'current') { loadDataFromGoogleSheets(); } else { loadHistoricalWeek(selectedWeek); }
  } else if (activeTab === 'clockouts') { loadAutoClockouts(); }
  else if (activeTab === 'call-offs') { loadCallOffs(); }
  else if (activeTab === 'overtime') { loadOvertimeWarnings(); }
  else if (activeTab === 'scheduled-today') { loadScheduledToday(); }
  else if (activeTab === 'daily-sales') { loadDailyFlash(); }
  else if (activeTab === 'daily-labor') { loadDailyLabor(); }
  else if (activeTab === 'logbook') { loadLogbookEntries(); }
  else if (activeTab === 'paid-outs') { loadPaidOuts(); }
  else if (activeTab === 'forecast') { loadForecastData(); loadModelForecastData(); loadModelCoefficients(); }
};

const handleDashboardChange = (e) => {
  if (e.target.value === 'pl') { router.push('/pl'); }
  else if (e.target.value === 'bonus') { router.push('/bonus'); }
  else { setActiveTab(e.target.value); }
};

return (
<>
<Head>
<title>The Scoop — Andy's Operations</title>
</Head>
<div className="min-h-screen p-2 md:p-4">
<div className="max-w-[1400px] mx-auto">
<div className="surface rounded-2xl mb-3 md:mb-4 shadow-card overflow-hidden">
<div className="h-1 bg-gradient-to-r from-andy-red via-andy-gold to-andy-red" />
<div className="p-3 md:p-4">
<div className="hidden md:flex items-center justify-between gap-4">
          {/* Brand / wordmark */}
          <div className="flex items-center gap-3.5">
            <img
              src="https://i.imgur.com/kkJMVz0.png"
              alt="Andy's Frozen Custard"
              className="h-14 w-auto drop-shadow"
            />
            <div className="leading-none">
              <h1 className="text-3xl font-bold tracking-tight text-white">The Scoop</h1>
              <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Andy&apos;s Operations
                {activeTab === 'sales' && reportDate && reportDate !== 'Loading...' && !reportDate.includes('.') && (
                  <span className="text-slate-400"> · Week ending {reportDate}</span>
                )}
              </p>
            </div>
          </div>

          {/* Actions — Refresh sits to the LEFT of the dashboard selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="grid place-items-center min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={18} />
            </button>

            <DashboardSelect
              value={activeTab}
              onChange={handleDashboardChange}
              className="px-4 min-h-[44px] text-sm font-medium bg-slate-800/80 hairline rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <button
              onClick={() => router.push('/messages')}
              className="relative flex items-center gap-2 min-h-[44px] px-4 bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors text-white text-sm font-semibold shadow-lg shadow-blue-600/20"
              title="Message Board"
            >
              <MessageSquare size={16} />
              <span>Messages</span>
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 flex items-center justify-center text-[11px] font-bold bg-andy-red text-white rounded-full ring-2 ring-slate-900">
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              )}
            </button>

            {isAdmin && (
              <button
                onClick={() => router.push('/admin')}
                className="grid place-items-center min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                title="Admin"
              >
                <Settings size={18} />
              </button>
            )}

            <button
              onClick={() => signOut()}
              className="grid place-items-center min-h-[44px] min-w-[44px] rounded-xl text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        <div className="md:hidden">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5">
              <img
                src="https://i.imgur.com/kkJMVz0.png"
                alt="Andy's Frozen Custard"
                className="h-10 w-auto"
              />
              <h1 className="text-xl font-bold tracking-tight text-white">The Scoop</h1>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => router.push('/messages')}
                className="relative grid place-items-center h-10 w-10 bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors text-white"
                title="Message Board"
              >
                <MessageSquare size={18} />
                {unreadMessagesCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 flex items-center justify-center text-[11px] font-bold bg-andy-red text-white rounded-full ring-2 ring-slate-900">
                    {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                  </span>
                )}
              </button>
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="grid place-items-center h-10 w-10 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                  title="Admin"
                >
                  <Settings size={18} />
                </button>
              )}
              <button
                onClick={() => signOut()}
                className="grid place-items-center h-10 w-10 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-white/5 transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {/* Refresh sits to the LEFT of the dashboard selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="grid place-items-center h-10 w-10 flex-shrink-0 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={18} />
            </button>
            <DashboardSelect
              value={activeTab}
              onChange={handleDashboardChange}
              className="flex-1 px-4 h-10 text-sm font-medium bg-slate-800/80 hairline rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      </div>

      <SwipeNavigation activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'logbook' && (
        <LogbookTab
          logbookEntries={logbookEntries}
          filteredLogbook={filteredLogbook}
          logbookLoading={logbookLoading}
          logbookError={logbookError}
          logbookFilters={logbookFilters}
          setLogbookFilters={setLogbookFilters}
          isLogbookFiltersOpen={isLogbookFiltersOpen}
          setIsLogbookFiltersOpen={setIsLogbookFiltersOpen}
          expandedLogbookIds={expandedLogbookIds}
          toggleLogbookExpanded={toggleLogbookExpanded}
          getLogbookDateRange={getLogbookDateRange}
        />
      )}

      {activeTab === 'paid-outs' && (
        <PaidOutsTab
          paidOuts={paidOuts}
          filteredPaidOuts={filteredPaidOuts}
          paidOutsLoading={paidOutsLoading}
          paidOutsError={paidOutsError}
          paidOutsFilters={paidOutsFilters}
          setPaidOutsFilters={setPaidOutsFilters}
          isPaidOutsFiltersOpen={isPaidOutsFiltersOpen}
          setIsPaidOutsFiltersOpen={setIsPaidOutsFiltersOpen}
          getPaidOutsDateRange={getPaidOutsDateRange}
          getPaidOutsTotals={getPaidOutsTotals}
        />
      )}

      {activeTab === 'sales' && (
        <WeeklySalesTab
          availableWeeks={availableWeeks}
          selectedWeek={selectedWeek}
          setSelectedWeek={setSelectedWeek}
          isWeekDropdownOpen={isWeekDropdownOpen}
          setIsWeekDropdownOpen={setIsWeekDropdownOpen}
          error={error}
          isLoading={isLoading}
          totals={totals}
          isFiltersOpen={isFiltersOpen}
          setIsFiltersOpen={setIsFiltersOpen}
          filters={filters}
          setFilters={setFilters}
          isLocationDropdownOpen={isLocationDropdownOpen}
          setIsLocationDropdownOpen={setIsLocationDropdownOpen}
          locations={locations}
          handleLocationToggle={handleLocationToggle}
          filteredLocations={filteredLocations}
          getAutoClockoutData={getAutoClockoutData}
          getAutoClockoutExtraHours={getAutoClockoutExtraHours}
          getCallOffEmployees={getCallOffEmployees}
          setClockoutModalData={setClockoutModalData}
          setShowClockoutModal={setShowClockoutModal}
          setCallOffModalData={setCallOffModalData}
          setShowCallOffModal={setShowCallOffModal}
        />
      )}

      {activeTab === 'daily-sales' && (
        <DailySalesTab
          dailyFlashData={dailyFlashData}
          filteredDailyFlash={filteredDailyFlash}
          dailyFlashLoading={dailyFlashLoading}
          dailyFlashError={dailyFlashError}
          dailyFlashFilters={dailyFlashFilters}
          setDailyFlashFilters={setDailyFlashFilters}
          isDailyFlashFiltersOpen={isDailyFlashFiltersOpen}
          setIsDailyFlashFiltersOpen={setIsDailyFlashFiltersOpen}
          isDailyFlashLocationDropdownOpen={isDailyFlashLocationDropdownOpen}
          setIsDailyFlashLocationDropdownOpen={setIsDailyFlashLocationDropdownOpen}
          handleDailyFlashLocationToggle={handleDailyFlashLocationToggle}
          filterPrior7Days={filterPrior7Days}
        />
      )}

      {activeTab === 'daily-labor' && (
        <DailyLaborTab
          dailyLaborData={dailyLaborData}
          dailyFlashData={dailyFlashData}
          filteredDailyLabor={filteredDailyLabor}
          dailyLaborLoading={dailyLaborLoading}
          dailyLaborError={dailyLaborError}
          dailyLaborFilters={dailyLaborFilters}
          setDailyLaborFilters={setDailyLaborFilters}
          isDailyLaborFiltersOpen={isDailyLaborFiltersOpen}
          setIsDailyLaborFiltersOpen={setIsDailyLaborFiltersOpen}
          isDailyLaborLocationDropdownOpen={isDailyLaborLocationDropdownOpen}
          setIsDailyLaborLocationDropdownOpen={setIsDailyLaborLocationDropdownOpen}
          handleDailyLaborLocationToggle={handleDailyLaborLocationToggle}
          clockouts={clockouts}
          getCallOffEmployees={getCallOffEmployees}
          setCallOffModalData={setCallOffModalData}
          setShowCallOffModal={setShowCallOffModal}
          setClockoutModalData={setClockoutModalData}
          setShowClockoutModal={setShowClockoutModal}
          filterPrior7Days={filterPrior7Days}
        />
      )}

      {activeTab === 'clockouts' && (
        <ClockoutsTab
          filteredClockouts={filteredClockouts}
          clockoutsLoading={clockoutsLoading}
          clockoutsError={clockoutsError}
          getDataDateRange={getDataDateRange}
        />
      )}

      {activeTab === 'call-offs' && (
        <CallOffsTab
          filteredCallOffs={filteredCallOffs}
          callOffsLoading={callOffsLoading}
          callOffsError={callOffsError}
          getDataDateRange={getDataDateRange}
        />
      )}

      {activeTab === 'overtime' && (
        <OvertimeTab
          filteredOvertime={filteredOvertime}
          overtimeLoading={overtimeLoading}
          overtimeError={overtimeError}
          clockouts={clockouts}
        />
      )}

      {activeTab === 'scheduled-today' && (
        <ScheduledTodayTab
          scheduledToday={scheduledToday}
          filteredScheduled={filteredScheduled}
          scheduledLoading={scheduledLoading}
          scheduledError={scheduledError}
          scheduledLocationFilter={scheduledLocationFilter}
          setScheduledLocationFilter={setScheduledLocationFilter}
          scheduledMarketFilter={scheduledMarketFilter}
          setScheduledMarketFilter={setScheduledMarketFilter}
          isScheduledFiltersOpen={isScheduledFiltersOpen}
          setIsScheduledFiltersOpen={setIsScheduledFiltersOpen}
          getEmployeeTitle={getEmployeeTitle}
        />
      )}
      {activeTab === 'forecast' && (
        <ForecastingTab
          forecastData={forecastData}
          dailyFlashData={dailyFlashData}
          modelForecastData={modelForecastData}
          forecastLoading={forecastLoading}
          forecastWeekOffset={forecastWeekOffset}
          setForecastWeekOffset={setForecastWeekOffset}
          forecastMarketFilter={forecastMarketFilter}
          setForecastMarketFilter={setForecastMarketFilter}
          forecastAccuracyExpanded={forecastAccuracyExpanded}
          setForecastAccuracyExpanded={setForecastAccuracyExpanded}
          modelCoefficients={modelCoefficients}
          isAdmin={isAdmin}
          dashboardAccess={dashboardAccess}
        />
      )}

      </SwipeNavigation>
    </div>

    {showClockoutModal && (
      <ClockoutModal
        data={clockoutModalData}
        onClose={() => setShowClockoutModal(false)}
      />
    )}

    {showCallOffModal && (
      <CallOffModal
        data={callOffModalData}
        onClose={() => setShowCallOffModal(false)}
      />
    )}

  </div>
</>

);
}
