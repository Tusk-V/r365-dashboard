import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Head from "next/head"
import { useState, useEffect } from 'react';
import React from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw, AlertCircle, ChevronDown, BookOpen, MessageSquare, Settings, Receipt } from 'lucide-react';
import SwipeNavigation from '../components/SwipeNavigation';
import MessagesPanel from '../components/MessagesPanel';
import MessagingPermissions from '../components/MessagingPermissions';
import { getMarket, sortByMarket } from '../lib/markets';
import { parseSheetData, parseHistoricalData } from '../lib/sheetParsers';
import { extractDriveTime, extractMood, generateSummary } from '../lib/logbookHelpers';
import { getDailyLaborGrade } from '../lib/laborGrade';
import { adjustTimeForTimezone, adjustSingleTime } from '../lib/timezone';
import { getWeekMonday, getWeatherEmoji, computeForecastForLocation } from '../lib/forecast';
import TitleBadge from '../components/shared/TitleBadge';
import ClockoutModal from '../components/modals/ClockoutModal';
import CallOffModal from '../components/modals/CallOffModal';
import OvertimeTab from '../components/dashboards/OvertimeTab';
import CallOffsTab from '../components/dashboards/CallOffsTab';
import ClockoutsTab from '../components/dashboards/ClockoutsTab';
import ScheduledTodayTab from '../components/dashboards/ScheduledTodayTab';
import PaidOutsTab from '../components/dashboards/PaidOutsTab';

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
market: 'all'
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
const [showMessagesPanel, setShowMessagesPanel] = useState(false);
const [showPermissionsModal, setShowPermissionsModal] = useState(false);
const [userRole, setUserRole] = useState(null);

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

const loadCurrentUserRole = async () => {
try {
const res = await fetch('/api/check-access');
const data = await res.json();
if (res.ok && data.role) {
setUserRole(data.role);
}
} catch (err) {
console.error('Error loading user role:', err);
}
};

const loadUnreadCount = async () => {
try {
const res = await fetch('/api/messages/read');
const data = await res.json();
if (res.ok) {
setUnreadMessagesCount(data.unreadCount || 0);
}
} catch (err) {
console.error('Error loading unread count:', err);
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
const totalHours = filteredLocations.reduce((sum, loc) => sum + loc.actualHours, 0);
const avgProductivity = totalHours > 0 ? totalSales / totalHours : 0;

return {
  totalSales,
  totalForecast,
  totalPriorYear,
  pyVariance,
  avgLaborPercent,
  totalActVsOpt,
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
router.push('/auth/access-pending');
}
}
}, [status, accessLoading, isAdmin, dashboardAccess, router])

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
loadCurrentUserRole();
loadUnreadCount();
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
<div className="min-h-screen bg-slate-900 flex items-center justify-center">
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
<div className="min-h-screen bg-slate-900 flex items-center justify-center">
<div className="text-white text-lg">Checking access...</div>
</div>
);
}

const totals = calculateTotals();

return (
<>
<Head>
<title>Andy's Dashboards</title>
</Head>
<div className="min-h-screen bg-slate-900 p-2 md:p-4">
<div className="max-w-[1400px] mx-auto">
<div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 mb-3 md:mb-4 shadow-2xl">
<div className="hidden md:flex items-center justify-between gap-3">
<div className="flex items-center gap-3">
<img 
src="https://i.imgur.com/kkJMVz0.png" 
alt="Andy's Frozen Custard" 
className="h-16"
/>
<div>
<h1 className="text-2xl font-bold text-white mb-1">R365 Dashboards</h1>
{activeTab === 'sales' && reportDate && reportDate !== 'Loading...' && !reportDate.includes('.') && (
<p className="text-sm text-slate-400">Week Ending: {reportDate}</p>
)}
</div>
</div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-400 whitespace-nowrap">Select Dashboard:</label>
            <select
              value={activeTab}
              onChange={(e) => {
                if (e.target.value === 'pl') {
                  router.push('/pl');
                } else if (e.target.value === 'bonus') {
                  router.push('/bonus');
                } else {
                  setActiveTab(e.target.value);
                }
              }}
              className="px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="sales">Weekly Sales & Labor</option>
              <option value="daily-sales">Daily Sales</option>
              <option value="daily-labor">Daily Labor</option>
              <option value="clockouts">Auto-Clockouts</option>
              <option value="call-offs">Call-Offs</option>
              <option value="overtime">OT Warnings</option>
              <option value="logbook">Logbook</option>
              <option value="paid-outs">Paid Outs</option>
              <option value="scheduled-today">Scheduled Today</option>
              <option value="forecast">Forecasting</option>
              <option value="pl">Profit & Loss</option>
              <option value="bonus">Quarterly Bonus</option>
            </select>
            
            <button
              onClick={() => {
                if (activeTab === 'sales') {
                  if (selectedWeek === 'current') {
                    loadDataFromGoogleSheets();
                  } else {
                    loadHistoricalWeek(selectedWeek);
                  }
                } else if (activeTab === 'clockouts') {
                  loadAutoClockouts();
                } else if (activeTab === 'call-offs') {
                  loadCallOffs();
                } else if (activeTab === 'overtime') {
                  loadOvertimeWarnings();
                } else if (activeTab === 'scheduled-today') {
                  loadScheduledToday();
                } else if (activeTab === 'daily-sales') {
                  loadDailyFlash();
                } else if (activeTab === 'daily-labor') {
                  loadDailyLabor();
                } else if (activeTab === 'logbook') {
                  loadLogbookEntries();
                } else if (activeTab === 'paid-outs') {
                  loadPaidOuts();
                } else if (activeTab === 'forecast') {
                  loadForecastData();
loadModelForecastData();
loadModelCoefficients();
                }
              }}
              className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              title="Refresh data"
            >
              <RefreshCw size={16} className="text-white" />
            </button>

            {/* Messages Button */}
            <button
              onClick={() => setShowMessagesPanel(true)}
              className="relative p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              title="Messages"
            >
              <MessageSquare size={16} className="text-white" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full">
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              )}
            </button>

            <button
              onClick={() => signOut()}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              title="Sign out"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="md:hidden flex items-center justify-between mb-3">
          <img 
            src="https://i.imgur.com/kkJMVz0.png" 
            alt="Andy's Frozen Custard" 
            className="h-12"
          />
          <div className="flex items-center gap-2">
            {/* Messages Button */}
            <button
              onClick={() => setShowMessagesPanel(true)}
              className="relative p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              title="Messages"
            >
              <MessageSquare size={16} className="text-white" />
              {unreadMessagesCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center text-[10px] font-bold bg-red-600 text-white rounded-full">
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </span>
              )}
            </button>
            <button
              onClick={() => signOut()}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              title="Sign out"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="md:hidden flex items-center gap-2">
          <select
            value={activeTab}
            onChange={(e) => {
              if (e.target.value === 'pl') {
                router.push('/pl');
              } else if (e.target.value === 'bonus') {
                router.push('/bonus');
              } else {
                setActiveTab(e.target.value);
              }
            }}
            className="flex-1 px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="sales">Weekly Sales & Labor</option>
            <option value="daily-sales">Daily Sales</option>
            <option value="daily-labor">Daily Labor</option>
            <option value="clockouts">Auto-Clockouts</option>
            <option value="call-offs">Call-Offs</option>
            <option value="overtime">OT Warnings</option>
            <option value="logbook">Logbook</option>
            <option value="paid-outs">Paid Outs</option>
            <option value="scheduled-today">Scheduled Today</option>
            <option value="forecast">Forecasting</option>
            <option value="pl">Profit & Loss</option>
            <option value="bonus">Quarterly Bonus</option>
          </select>
          
          <button
            onClick={() => {
              if (activeTab === 'sales') {
                if (selectedWeek === 'current') {
                  loadDataFromGoogleSheets();
                } else {
                  loadHistoricalWeek(selectedWeek);
                }
              } else if (activeTab === 'clockouts') {
                loadAutoClockouts();
              } else if (activeTab === 'call-offs') {
                loadCallOffs();
              } else if (activeTab === 'overtime') {
                loadOvertimeWarnings();
              } else if (activeTab === 'scheduled-today') {
                loadScheduledToday();
              } else if (activeTab === 'daily-sales') {
                loadDailyFlash();
              } else if (activeTab === 'daily-labor') {
                loadDailyLabor();
              } else if (activeTab === 'logbook') {
                loadLogbookEntries();
              } else if (activeTab === 'paid-outs') {
                loadPaidOuts();
              } else if (activeTab === 'forecast') {
                loadForecastData();
loadModelForecastData();
loadModelCoefficients();
              }
            }}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={16} className="text-white" />
          </button>
        </div>
      </div>

      <SwipeNavigation activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'logbook' && (
        <>
          {/* Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-400" />
                  Logbook Entries
                </h2>
                {getLogbookDateRange() && (
                  <p className="text-sm text-slate-400">Showing data for: {getLogbookDateRange()}</p>
                )}
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-blue-400">{filteredLogbook.length}</span>
                <p className="text-xs text-slate-400">Entries</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
            <button 
              onClick={() => setIsLogbookFiltersOpen(!isLogbookFiltersOpen)}
              className="flex items-center gap-2 w-full"
            >
              <Filter className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Filters</h3>
              <span className="text-slate-400 text-sm ml-auto">{isLogbookFiltersOpen ? '▼' : '▶'}</span>
            </button>
            {isLogbookFiltersOpen && (
              <div className="flex flex-col md:flex-row gap-2 mt-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <select
                    value={logbookFilters.location}
                    onChange={(e) => setLogbookFilters({...logbookFilters, location: e.target.value})}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="all">All Locations</option>
                    {[...new Set(logbookEntries.map(e => e.location))].sort().map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
                  <select
                    value={logbookFilters.market}
                    onChange={(e) => setLogbookFilters({...logbookFilters, market: e.target.value})}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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

          {logbookError && (
            <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
              <strong>Error:</strong> {logbookError}
            </div>
          )}

          {logbookLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-white text-lg">Loading logbook entries...</div>
            </div>
          ) : filteredLogbook.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <BookOpen className="mx-auto mb-3 text-slate-500" size={48} />
              <h3 className="text-xl font-bold text-white mb-2">No Logbook Entries</h3>
              <p className="text-slate-400">No entries found for the selected filters</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const groupedLogbook = filteredLogbook.reduce((acc, entry) => {
                  const date = entry.reportDate;
                  if (!acc[date]) acc[date] = [];
                  acc[date].push(entry);
                  return acc;
                }, {});
                const sortedDates = Object.keys(groupedLogbook).sort((a, b) => new Date(b) - new Date(a));
                
                return sortedDates.map(date => {
                  const entries = groupedLogbook[date];
                  const formattedDate = new Date(date).toLocaleDateString('en-US', { 
                    weekday: 'long',
                    month: 'numeric', 
                    day: 'numeric', 
                    year: 'numeric' 
                  });
                  
                  return (
                    <div key={date} className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
                      <div className="bg-slate-900 p-3 border-b border-slate-700">
                        <h3 className="text-lg font-bold text-white">{formattedDate}</h3>
                        <p className="text-xs text-slate-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
                      </div>
                      
                      <div className="divide-y divide-slate-700">
                        {entries.map((entry) => {
                          const isExpanded = expandedLogbookIds.has(entry.id);
                          const summary = entry.summary || generateSummary(entry.comment);
                          const driveTime = extractDriveTime(entry.comment) || extractDriveTime(summary);
                          const mood = extractMood(entry.comment) || extractMood(summary);
                          
                          return (
                            <div 
                              key={entry.id}
                              className="p-3 cursor-pointer hover:bg-slate-750 transition-colors"
                              onClick={() => toggleLogbookExpanded(entry.id)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <h4 className="text-sm md:text-base font-bold text-white">{entry.location}</h4>
                                    {driveTime && (
                                      <span className="bg-slate-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">
                                        Drive Time {driveTime}
                                      </span>
                                    )}

                                  </div>
                                  
                                  {!isExpanded && (
                                    <p className="text-xs text-slate-400"><span className="text-slate-500 font-medium">Summary:</span> {summary}</p>
                                  )}
                                  
                                  {isExpanded && (
                                    <div className="mt-3 bg-slate-900 rounded-lg p-3">
                                      <pre className="text-xs md:text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                                        {entry.comment}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                                <button className="p-1 text-slate-400 hover:text-white transition-colors flex-shrink-0">
                                  <ChevronDown 
                                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}


        </>
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
        <>
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
                    <TrendingUp className="text-cyan-400" size={14} />
                    <p className="text-slate-400 text-xs font-medium">PY Variance</p>
                  </div>
                  <p className={`text-sm md:text-lg font-bold ${totals.pyVariance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totals.pyVariance >= 0 ? '+' : ''}${totals.pyVariance.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
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
                    <p className="text-slate-400 text-xs font-medium">Actual vs Optimal</p>
                  </div>
                  <p className={`text-sm md:text-lg font-bold ${totals.totalActVsOpt > 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {totals.totalActVsOpt > 0 ? '+' : ''}{totals.totalActVsOpt.toFixed(1)} hrs
                  </p>
                </div>
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 mb-3 md:mb-4 shadow-lg">
                <button 
                  onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                  className="flex items-center gap-2 w-full"
                >
                  <Filter size={14} className="text-slate-400" />
                  <h3 className="text-xs md:text-sm font-semibold text-white">Filters</h3>
                  <span className="text-slate-400 text-sm ml-auto">{isFiltersOpen ? '▼' : '▶'}</span>
                </button>
                
                {isFiltersOpen && (
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
                )}
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
      )}

      {activeTab === 'daily-sales' && (
        <>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
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
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white text-left focus:outline-none focus:ring-2 focus:ring-blue-600 flex items-center justify-between"
                  >
                    <span>{dailyFlashFilters.locations.length === 0 ? 'All Locations' : `${dailyFlashFilters.locations.length} selected`}</span>
                    <span className="text-slate-400">▼</span>
                  </button>
                  {isDailyFlashLocationDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded shadow-lg max-h-60 overflow-y-auto">
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
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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
            <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
              <strong>Error:</strong> {dailyFlashError}
            </div>
          )}

          {dailyFlashLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-white text-lg">Loading daily sales data...</div>
            </div>
          ) : Object.keys(dailyFlashData).length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <p className="text-slate-400">No daily sales data available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:gap-3">
              {filteredDailyFlash.map((location) => {
                const locationData = filterPrior7Days(dailyFlashData[location]);
                if (locationData.length === 0) return null;
                return (
                  <div key={location} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                    <div className="mb-2 md:mb-3">
                      <h3 className="text-sm md:text-base font-bold text-white">{location}</h3>
                    </div>

                    <div className="bg-slate-900 rounded-lg overflow-x-auto">
                      {/* Desktop Table */}
                      <table className="hidden md:table w-full text-xs">
                        <thead className="bg-slate-800">
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
                              <tr key={idx} className="border-t border-slate-700">
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
                        <div className="border-b border-slate-700 p-2 text-xs flex items-center bg-slate-800 sticky top-0">
                          <div className="text-slate-400 font-semibold w-9">Day</div>
                          <div className="text-slate-400 font-semibold text-right flex-1">Sales</div>
                          <div className="text-slate-400 font-semibold text-right flex-1">PY</div>
                          <div className="text-slate-400 font-semibold text-right w-12">PY%</div>
                          <div className="text-slate-400 font-semibold text-right w-14">Fcst</div>
                          <div className="text-slate-600 text-center w-4">|</div>
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
                            <div key={idx} className="border-b border-slate-700 last:border-b-0 p-2 text-xs flex items-center">
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
                              
                              {/* Separator */}
                              <div className="text-slate-600 text-center w-4">|</div>
                              
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
      )}

      {activeTab === 'daily-labor' && (
        <>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
            <button 
              onClick={() => setIsDailyLaborFiltersOpen(!isDailyLaborFiltersOpen)}
              className="flex items-center gap-2 w-full"
            >
              <Filter className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Filters</h3>
              <span className="text-slate-400 text-sm ml-auto">{isDailyLaborFiltersOpen ? '▼' : '▶'}</span>
            </button>
            {isDailyLaborFiltersOpen && (
              <div className="flex flex-col md:flex-row gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDailyLaborLocationDropdownOpen(!isDailyLaborLocationDropdownOpen);
                      }}
                      className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <span>{dailyLaborFilters.locations.length === 0 ? 'All Locations' : `${dailyLaborFilters.locations.length} selected`}</span>
                      <ChevronDown size={14} />
                    </button>
                    {isDailyLaborLocationDropdownOpen && (
                      <div className="absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded shadow-lg max-h-60 overflow-y-auto">
                        <label className="flex items-center px-3 py-2 hover:bg-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={dailyLaborFilters.locations.length === 0}
                            onChange={() => setDailyLaborFilters({...dailyLaborFilters, locations: []})}
                            className="mr-2"
                          />
                          <span className="text-sm text-white">All Locations</span>
                        </label>
                        {sortByMarket(Object.keys(dailyLaborData)).map((location) => (
                          <label key={location} className="flex items-center px-3 py-2 hover:bg-slate-600 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={dailyLaborFilters.locations.includes(location)}
                              onChange={() => handleDailyLaborLocationToggle(location)}
                              className="mr-2"
                            />
                            <span className="text-sm text-white">{location}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
                  <select
                    value={dailyLaborFilters.market}
                    onChange={(e) => setDailyLaborFilters({...dailyLaborFilters, market: e.target.value})}
                    className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
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

          {dailyLaborError && (
            <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
              <strong>Error:</strong> {dailyLaborError}
            </div>
          )}

          {dailyLaborLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-white text-lg">Loading labor data...</div>
            </div>
          ) : filteredDailyLabor.length === 0 ? (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <AlertCircle className="mx-auto mb-3 text-blue-400" size={48} />
              <h3 className="text-xl font-bold text-white mb-2">No Labor Data</h3>
              <p className="text-slate-400">Select locations to view labor metrics</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredDailyLabor.map((location) => {
                const locationData = filterPrior7Days(dailyLaborData[location]);
                if (locationData.length === 0) return null;
                return (
                  <div key={location} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                    <div className="mb-2 md:mb-3 flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm md:text-base font-bold text-white">{location}</h3>
                      {(() => {
                        const callOffEmployees = getCallOffEmployees(location);
                        if (callOffEmployees.length > 0) {
                          return (
                            <button
                              onClick={() => {
                                setCallOffModalData({ location: location, employees: callOffEmployees });
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

                    <div className="bg-slate-900 rounded-lg overflow-x-auto">
                      {/* Desktop Table */}
                      <table className="hidden md:table w-full text-xs table-fixed">
                        <thead className="bg-slate-800">
                          <tr>
                            <th className="text-center p-2 text-slate-400 font-semibold w-16">Grade</th>
                            <th className="text-left p-2 text-slate-400 font-semibold w-44">Date</th>
                            <th className="text-right p-2 text-slate-400 font-semibold w-24">Act Hrs</th>
                            <th className="text-right p-2 text-slate-400 font-semibold w-24">Sch Hrs</th>
                            <th className="text-right p-2 text-slate-400 font-semibold w-24">Opt Hrs</th>
                            <th className="text-right p-2 text-slate-400 font-semibold w-24">Act %</th>
                            <th className="text-right p-2 text-slate-400 font-semibold w-24">Opt %</th>
                            <th className="text-right p-2 text-slate-400 font-semibold w-24">% Var</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locationData.map((day, idx) => {
                            // Cross-reference forecast variance from Daily Sales data
                            const salesDayData = (dailyFlashData[location] || []).find(s => s.date === day.date);
                            const forecastVar = salesDayData ? salesDayData.forecastVariance : null;
                            const grade = getDailyLaborGrade(day, forecastVar);
                            // Cross-reference auto-clockouts for this location+date
                            const dayClockouts = clockouts.filter(c => c.location === location && c.reportDate === day.date);
                            const dayExtraHrs = dayClockouts.reduce((sum, c) => { const h = parseFloat(c.extraHours); return sum + (isNaN(h) ? 0 : h); }, 0);
                            return (
                              <tr key={idx} className="border-t border-slate-700">
                                <td className="text-center p-2">
                                  {grade ? (
                                    <span className={`inline-block w-7 py-0.5 rounded text-xs font-bold border ${grade.bg} ${grade.color}`}>
                                      {grade.letter}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600 text-xs">—</span>
                                  )}
                                </td>
                                <td className="p-2 text-slate-300">
                                  <div className="flex items-center gap-1.5">
                                    {day.date}
                                    {dayClockouts.length > 0 && (
                                      <button
                                        onClick={() => {
                                          setClockoutModalData({ location: location, data: dayClockouts });
                                          setShowClockoutModal(true);
                                        }}
                                        className="bg-red-600 text-white text-[10px] px-1 py-0.5 rounded font-semibold cursor-pointer hover:bg-red-700 transition-colors"
                                      >
                                        AC{dayClockouts.length > 1 ? `×${dayClockouts.length}` : ''} {dayExtraHrs > 0 ? `${dayExtraHrs.toFixed(1)}h` : ''}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right p-2 text-white font-semibold">{day.actualHours.toFixed(1)}</td>
                                <td className="text-right p-2 text-slate-300">{day.scheduledHours.toFixed(1)}</td>
                                <td className="text-right p-2 text-slate-300">{day.optimalHours.toFixed(1)}</td>
                                <td className="text-right p-2 text-white font-semibold">{day.actualLaborPercent.toFixed(1)}%</td>
                                <td className="text-right p-2 text-slate-300">{day.optimalLaborPercent.toFixed(1)}%</td>
                                <td className={`text-right p-2 font-semibold ${day.laborPercentVariance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                  {day.laborPercentVariance >= 0 ? '+' : ''}{day.laborPercentVariance.toFixed(1)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      {/* Mobile Ultra-Compact - All on one line per day */}
                      <div className="md:hidden">
                        {/* Mobile Headers */}
                        <div className="border-b border-slate-700 px-1.5 py-2 text-[11px] flex items-center bg-slate-800 sticky top-0">
                          <div className="text-slate-400 font-semibold w-5 text-center">G</div>
                          <div className="text-slate-400 font-semibold w-7">Day</div>
                          <div className="text-slate-400 font-semibold text-right flex-1">Act</div>
                          <div className="text-slate-400 font-semibold text-right flex-1">Sch</div>
                          <div className="text-slate-400 font-semibold text-right flex-1">Opt</div>
                          <div className="text-slate-600 text-center w-2">|</div>
                          <div className="text-slate-400 font-semibold text-right flex-1">Act%</div>
                          <div className="text-slate-400 font-semibold text-right flex-1">Opt%</div>
                        </div>
                        
                        {/* Data rows */}
                        {locationData.map((day, idx) => {
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
                          const grade = (() => {
                            const salesDayData = (dailyFlashData[location] || []).find(s => s.date === day.date);
                            const forecastVar = salesDayData ? salesDayData.forecastVariance : null;
                            return getDailyLaborGrade(day, forecastVar);
                          })();
                          // Cross-reference auto-clockouts for this location+date
                          const dayClockouts = clockouts.filter(c => c.location === location && c.reportDate === day.date);
                          const dayExtraHrs = dayClockouts.reduce((sum, c) => { const h = parseFloat(c.extraHours); return sum + (isNaN(h) ? 0 : h); }, 0);
                          
                          return (
                            <div key={idx} className="border-b border-slate-700 last:border-b-0">
                              <div className="px-1.5 py-1.5 text-[11px] flex items-center">
                              {/* Grade */}
                              <div className="w-5 text-center flex-shrink-0 mr-1">
                                {grade ? (
                                  <span className={`inline-block w-5 py-0.5 rounded text-[10px] font-bold border ${grade.bg} ${grade.color}`}>
                                    {grade.letter}
                                  </span>
                                ) : (
                                  <span className="text-slate-600">—</span>
                                )}
                              </div>
                              
                              {/* Day */}
                              <div className="text-slate-300 font-semibold w-7">{dayOfWeek}</div>
                              
                              {/* Act Hours */}
                              <div className="text-white font-semibold text-right flex-1">{day.actualHours.toFixed(1)}</div>
                              
                              {/* Sch Hours */}
                              <div className="text-slate-400 text-right flex-1">{day.scheduledHours.toFixed(1)}</div>
                              
                              {/* Opt Hours */}
                              <div className="text-slate-400 text-right flex-1">{day.optimalHours.toFixed(1)}</div>
                              
                              {/* Separator */}
                              <div className="text-slate-600 text-center w-2">|</div>
                              
                              {/* Act % */}
                              <div className="text-white text-right flex-1">{day.actualLaborPercent.toFixed(1)}%</div>
                              
                              {/* Opt % */}
                              <div className="text-slate-400 text-right flex-1">{day.optimalLaborPercent.toFixed(1)}%</div>

                              {/* AC badge inline */}
                              {dayClockouts.length > 0 ? (
                                <button
                                  onClick={() => {
                                    setClockoutModalData({ location: location, data: dayClockouts });
                                    setShowClockoutModal(true);
                                  }}
                                  className="bg-red-600 text-white text-[8px] leading-tight px-1 py-0.5 rounded font-bold cursor-pointer hover:bg-red-700 transition-colors ml-1 flex-shrink-0"
                                >
                                  AC
                                </button>
                              ) : (
                                <div className="w-5 flex-shrink-0"></div>
                              )}
                              </div>
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
      {/* ===== FORECASTING TAB ===== */}
      {activeTab === 'forecast' && (
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

    {showPermissionsModal && (
      <MessagingPermissions onClose={() => setShowPermissionsModal(false)} />
    )}

    <MessagesPanel
      isOpen={showMessagesPanel}
      onClose={() => setShowMessagesPanel(false)}
      userEmail={session?.user?.email}
      userRole={userRole}
      onUnreadCountChange={setUnreadMessagesCount}
      onOpenPermissions={() => setShowPermissionsModal(true)}
    />
  </div>
</>

);
}
