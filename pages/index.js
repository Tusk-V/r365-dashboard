import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Head from "next/head"
import { useState, useEffect } from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw, AlertCircle, ChevronDown, BookOpen, MessageSquare, Settings, Receipt } from 'lucide-react';
import SwipeNavigation from '../components/SwipeNavigation';
import MessagesPanel from '../components/MessagesPanel';
import MessagingPermissions from '../components/MessagingPermissions';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Google Sheets API Configuration
const API_KEY = 'AIzaSyAbUI3oP_0ofBG9tiAudYLUjZ4MSSaFNDA';
const SPREADSHEET_ID = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';
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

const TitleBadge = ({ title }) => {
  if (!title) return null;
  
  const colors = {
    'GM': 'bg-purple-600 text-white',
    'AGM': 'bg-blue-600 text-white',
    'SL': 'bg-green-600 text-white'
  };
  
  return (
    <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${colors[title] || 'bg-slate-600 text-white'}`}>
      {title}
    </span>
  );
};

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

  // Messages state
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [showMessagesPanel, setShowMessagesPanel] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [userRole, setUserRole] = useState(null);

  // Access control
  const [dashboardAccess, setDashboardAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

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

  // Logbook helper functions
  const extractDriveTime = (comment) => {
    if (!comment) return null;
    const patterns = [
      /DT[:\s]+(\d+:\d+)/i,
      /Drive\s*[-]?\s*Time[s]?[:\s]+(\d+:\d+)/i,
      /Drive\s*[-]?\s*Time[s]?\s+averaged?\s+(\d+:\d+)/i,
      /Drive\s*[-]?\s*Time[s]?\s+of\s+(\d+:\d+)/i,
      /(\d+:\d+)\s+Drive\s*[-]?\s*Time/i,
      /a\s+(\d+:\d+)\s+Drive\s*[-]?\s*Time/i,
      /Drive\s*[-]?\s*through\s+Time[s]?[:\s]+(\d+:\d+)/i,
      /(\d+:\d+)\s+Drive\s*[-]?\s*through\s+Time/i,
      /Drop\s+Time[s]?[:\s]+(\d+:\d+)/i,
      /(\d+:\d+)\s+Drop\s+Time/i,
      /DT\s+was\s+(\d+:\d+)/i,
      /DT\s+at\s+(\d+:\d+)/i,
      /averaged?\s+(\d+:\d+)\s+DT/i,
      /(\d+:\d+)\s+avg/i
    ];
    for (const pattern of patterns) {
      const match = comment.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const extractMood = (comment) => {
    if (!comment) return null;
    const lowerComment = comment.toLowerCase();
    if (/\b(hectic|crazy|insane|nightmare)\b/.test(lowerComment)) return 'Hectic';
    if (/\b(tough|hard|struggled|difficult|short[- ]?staffed)\b/.test(lowerComment)) return 'Tough';
    if (/\b(busy|rush|crowds|packed|slammed)\b/.test(lowerComment)) return 'Busy';
    if (/\b(great|excellent|perfect|flawless|amazing|awesome)\b/.test(lowerComment)) return 'Great';
    if (/\b(good|solid|nice)\b/.test(lowerComment)) return 'Good';
    if (/\b(slow|quiet|light|dead)\b/.test(lowerComment)) return 'Slow';
    if (/\b(smooth|steady|normal|standard|typical)\b/.test(lowerComment)) return 'Normal';
    return null;
  };

  const getMoodColor = (mood) => {
    switch (mood) {
      case 'Great':
      case 'Good':
        return 'bg-green-500';
      case 'Normal':
      case 'Smooth':
      case 'Steady':
        return 'bg-slate-500';
      case 'Slow':
        return 'bg-yellow-500';
      case 'Busy':
      case 'Tough':
        return 'bg-orange-500';
      case 'Hectic':
        return 'bg-red-500';
      default:
        return 'bg-slate-500';
    }
  };

  const generateSummary = (comment) => {
    if (!comment) return '';
    let cleaned = comment.replace(/^(Sales:.*?\n|DT:.*?\n|Drive Time:.*?\n)/gim, '').trim();
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
    let summary = sentences.slice(0, 2).join('. ').trim();
    if (summary.length > 150) {
      summary = summary.substring(0, 147) + '...';
    }
    return summary || cleaned.substring(0, 150);
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
      const optimalLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour) / actualSales * 100 : 0;
      const laborVariance = laborPercent - optimalLaborPercent;
      
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
        optimalLaborPercent,
        laborVariance,
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
      const optimalLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour) / actualSales * 100 : 0;
      const laborVariance = laborPercent - optimalLaborPercent;
      
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
        optimalLaborPercent,
        laborVariance,
        reportDate: weekEnding
      });
    }
    
    return parsedData;
  };

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

  const adjustTimeForTimezone = (timeString) => {
    if (!timeString || !timeString.includes(' - ')) return timeString;
    
    try {
      const parts = timeString.split(' - ');
      const adjustTime = (timeStr) => {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return timeStr;
        
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const period = match[3].toUpperCase();
        
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        hours -= 2;
        
        if (hours < 0) hours += 24;
        
        const newPeriod = hours >= 12 ? 'PM' : 'AM';
        let displayHours = hours % 12;
        if (displayHours === 0) displayHours = 12;
        
        return `${displayHours}:${minutes} ${newPeriod}`;
      };
      
      return `${adjustTime(parts[0])} - ${adjustTime(parts[1])}`;
    } catch (e) {
      return timeString;
    }
  };

  const loadCallOffs = async () => {
    setCallOffsLoading(true);
    setCallOffsError(null);
    
    try {
      const range = `${CALL_OFFS_SHEET}!A2:D`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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
        // 5: Hours Variance
        // 6: Labor %
        // 7: Optimal Labor %
        // 8: Labor % Variance
        // 9: Labor Cost Per Hour
        
        groupedByLocation[location].push({
          date: row[0] || '',
          actualHours: parseFloat(row[3]) || 0,
          optimalHours: parseFloat(row[4]) || 0,
          hoursVariance: parseFloat(row[5]) || 0,
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
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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

  const adjustSingleTime = (timeString) => {
    if (!timeString) return timeString;
    
    try {
      const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return timeString;
      
      let hours = parseInt(match[1]);
      const minutes = match[2];
      const period = match[3].toUpperCase();
      
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      hours -= 2;
      
      if (hours < 0) hours += 24;
      
      const newPeriod = hours >= 12 ? 'PM' : 'AM';
      let displayHours = hours % 12;
      if (displayHours === 0) displayHours = 12;
      
      return `${displayHours}:${minutes} ${newPeriod}`;
    } catch (e) {
      return timeString;
    }
  };

  const loadScheduledToday = async () => {
    setScheduledLoading(true);
    setScheduledError(null);
    
    try {
      const range = `${SCHEDULED_TODAY_SHEET}!A2:E`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
      
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
    
    setFilteredDailyFlash(filtered);
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
    
    setFilteredDailyLabor(filtered);
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
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
                  <option value="pl">Profit & Loss</option>
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
                <option value="pl">Profit & Loss</option>
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
                                        {mood && (
                                          <span className={`${getMoodColor(mood)} text-white text-[10px] px-1.5 py-0.5 rounded font-semibold`}>
                                            {mood}
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

              {/* Legend */}
              <div className="mt-4 bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
                <p className="text-xs text-slate-400 mb-2 font-semibold">Shift Status:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Great</span>
                  <span className="bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Good</span>
                  <span className="bg-slate-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Normal</span>
                  <span className="bg-yellow-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Slow</span>
                  <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Busy</span>
                  <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Tough</span>
                  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold">Hectic</span>
                </div>
              </div>
            </>
          )}

          {activeTab === 'paid-outs' && (
            <>
              {/* Header */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-amber-400" />
                      Paid Outs
                    </h2>
                    {getPaidOutsDateRange() && (
                      <p className="text-sm text-slate-400">Showing data for: {getPaidOutsDateRange()}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-amber-400">${getPaidOutsTotals().total.toFixed(2)}</span>
                    <p className="text-xs text-slate-400">{filteredPaidOuts.length} entries</p>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <button 
                  onClick={() => setIsPaidOutsFiltersOpen(!isPaidOutsFiltersOpen)}
                  className="flex items-center gap-2 w-full"
                >
                  <Filter className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Filters</h3>
                  <span className="text-slate-400 text-sm ml-auto">{isPaidOutsFiltersOpen ? '▼' : '▶'}</span>
                </button>
                {isPaidOutsFiltersOpen && (
                  <div className="flex flex-col md:flex-row gap-2 mt-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                      <select
                        value={paidOutsFilters.location}
                        onChange={(e) => setPaidOutsFilters({...paidOutsFilters, location: e.target.value})}
                        className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="all">All Locations</option>
                        {[...new Set(paidOuts.map(e => e.location))].sort().map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                      <select
                        value={paidOutsFilters.type}
                        onChange={(e) => setPaidOutsFilters({...paidOutsFilters, type: e.target.value})}
                        className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="all">All Types</option>
                        {[...new Set(paidOuts.map(e => e.type))].sort().map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
                      <select
                        value={paidOutsFilters.market}
                        onChange={(e) => setPaidOutsFilters({...paidOutsFilters, market: e.target.value})}
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

              {paidOutsError && (
                <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
                  <strong>Error:</strong> {paidOutsError}
                </div>
              )}

              {paidOutsLoading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="text-white text-lg">Loading paid outs...</div>
                </div>
              ) : filteredPaidOuts.length === 0 ? (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                  <Receipt className="mx-auto mb-3 text-slate-500" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">No Paid Outs</h3>
                  <p className="text-slate-400">No paid outs found for the selected filters</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const groupedPaidOuts = filteredPaidOuts.reduce((acc, entry) => {
                      const date = entry.reportDate;
                      if (!acc[date]) acc[date] = [];
                      acc[date].push(entry);
                      return acc;
                    }, {});
                    const sortedDates = Object.keys(groupedPaidOuts).sort((a, b) => new Date(b) - new Date(a));
                    
                    return sortedDates.map(date => {
                      const entries = groupedPaidOuts[date];
                      const dayTotal = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
                      
                      return (
                        <div key={date} className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
                          <div className="bg-slate-900 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
                            <span className="text-sm font-semibold text-white">{date}</span>
                            <span className="text-sm font-bold text-amber-400">${dayTotal.toFixed(2)}</span>
                          </div>
                          <div className="divide-y divide-slate-700">
                            {entries.map((entry, idx) => (
                              <div key={idx} className="p-3">
                                <div className="flex justify-between items-start mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white font-medium text-sm">{entry.location}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                      entry.type === 'Paid out' ? 'bg-amber-600 text-white' : 'bg-red-600 text-white'
                                    }`}>
                                      {entry.type}
                                    </span>
                                  </div>
                                  <span className="text-amber-400 font-bold text-sm">${entry.amount.toFixed(2)}</span>
                                </div>
                                {entry.ticketNum && entry.ticketNum !== '-' && (
                                  <p className="text-xs text-slate-500 mb-1">Ticket #{entry.ticketNum}</p>
                                )}
                                {entry.comment && (
                                  <p className="text-xs text-slate-400">{entry.comment}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}

                  {/* Summary by Type */}
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
                    <h3 className="text-sm font-semibold text-white mb-2">Summary by Type</h3>
                    <div className="space-y-1">
                      {Object.entries(getPaidOutsTotals().byType).sort((a, b) => b[1] - a[1]).map(([type, total]) => (
                        <div key={type} className="flex justify-between items-center">
                          <span className="text-slate-400 text-sm">{type}</span>
                          <span className="text-amber-400 font-medium text-sm">${total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
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
                          {Object.keys(dailyFlashData).sort().map(location => (
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
                    const locationData = dailyFlashData[location];
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
                                      {day.forecastVariance >= 0 ? '+' : ''}${Math.abs(day.forecastVariance).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0})}
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
                                    {day.forecastVariance >= 0 ? '+' : ''}{Math.round(day.forecastVariance)}
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
                            {Object.keys(dailyLaborData).sort().map((location) => (
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
                    const locationData = dailyLaborData[location];
                    return (
                      <div key={location} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                        <div className="mb-2 md:mb-3 flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm md:text-base font-bold text-white">{location}</h3>
                          {(() => {
                            const clockoutData = getAutoClockoutData(location);
                            const extraHrs = getAutoClockoutExtraHours(location);
                            if (clockoutData.length > 0) {
                              return (
                                <button
                                  onClick={() => {
                                    setClockoutModalData({ location: location, data: clockoutData });
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
                          <table className="hidden md:table w-full text-xs">
                            <thead className="bg-slate-800">
                              <tr>
                                <th className="text-left p-2 text-slate-400 font-semibold">Date</th>
                                <th className="text-right p-2 text-slate-400 font-semibold">Act Hrs</th>
                                <th className="text-right p-2 text-slate-400 font-semibold">Opt Hrs</th>
                                <th className="text-right p-2 text-slate-400 font-semibold">Hrs Var</th>
                                <th className="text-right p-2 text-slate-400 font-semibold">Act %</th>
                                <th className="text-right p-2 text-slate-400 font-semibold">Opt %</th>
                                <th className="text-right p-2 text-slate-400 font-semibold">% Var</th>
                              </tr>
                            </thead>
                            <tbody>
                              {locationData.map((day, idx) => {
                                return (
                                  <tr key={idx} className="border-t border-slate-700">
                                    <td className="p-2 text-slate-300">{day.date}</td>
                                    <td className="text-right p-2 text-white font-semibold">{day.actualHours.toFixed(1)}</td>
                                    <td className="text-right p-2 text-slate-300">{day.optimalHours.toFixed(1)}</td>
                                    <td className={`text-right p-2 font-semibold ${day.hoursVariance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                      {day.hoursVariance >= 0 ? '+' : ''}{day.hoursVariance.toFixed(1)}
                                    </td>
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
                            <div className="border-b border-slate-700 p-2 text-xs flex items-center bg-slate-800 sticky top-0">
                              <div className="text-slate-400 font-semibold w-9">Day</div>
                              <div className="text-slate-400 font-semibold text-right flex-1">Act</div>
                              <div className="text-slate-400 font-semibold text-right flex-1">Opt</div>
                              <div className="text-slate-400 font-semibold text-right w-12">Var</div>
                              <div className="text-slate-600 text-center w-4">|</div>
                              <div className="text-slate-400 font-semibold text-right flex-1">Act%</div>
                              <div className="text-slate-400 font-semibold text-right flex-1">Opt%</div>
                              <div className="text-slate-400 font-semibold text-right w-12">Var</div>
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
                              
                              return (
                                <div key={idx} className="border-b border-slate-700 last:border-b-0 p-2 text-xs flex items-center">
                                  {/* Day */}
                                  <div className="text-slate-300 font-semibold w-9">{dayOfWeek}</div>
                                  
                                  {/* Act Hours */}
                                  <div className="text-white font-semibold text-right flex-1">{day.actualHours.toFixed(1)}</div>
                                  
                                  {/* Opt Hours */}
                                  <div className="text-slate-400 text-right flex-1">{day.optimalHours.toFixed(1)}</div>
                                  
                                  {/* Hours Var */}
                                  <div className={`font-semibold text-right w-12 ${day.hoursVariance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {day.hoursVariance >= 0 ? '+' : ''}{day.hoursVariance.toFixed(1)}
                                  </div>
                                  
                                  {/* Separator */}
                                  <div className="text-slate-600 text-center w-4">|</div>
                                  
                                  {/* Act % */}
                                  <div className="text-white text-right flex-1">{day.actualLaborPercent.toFixed(1)}%</div>
                                  
                                  {/* Opt % */}
                                  <div className="text-slate-400 text-right flex-1">{day.optimalLaborPercent.toFixed(1)}%</div>
                                  
                                  {/* % Var */}
                                  <div className={`text-right w-12 ${day.laborPercentVariance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {day.laborPercentVariance >= 0 ? '+' : ''}{day.laborPercentVariance.toFixed(1)}%
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
            <>
              {/* Header with date range */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">Auto-Clockouts</h2>
                    {filteredClockouts.length > 0 && (
                      <p className="text-sm text-slate-400">
                        Showing data for: {getDataDateRange(filteredClockouts)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <span className="text-2xl font-bold text-red-400">{filteredClockouts.length}</span>
                      <p className="text-xs text-slate-400">Total</p>
                    </div>
                    <div>
                      <span className="text-2xl font-bold text-orange-400">
                        {filteredClockouts.reduce((sum, c) => {
                          const hrs = parseFloat(c.extraHours);
                          return sum + (isNaN(hrs) ? 0 : hrs);
                        }, 0).toFixed(1)}h
                      </span>
                      <p className="text-xs text-slate-400">Extra Hours</p>
                    </div>
                  </div>
                </div>
              </div>

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
                <div className="space-y-3">
                  {(() => {
                    // Group auto-clockouts by date
                    const groupedByDate = filteredClockouts.reduce((acc, clockout) => {
                      if (!acc[clockout.reportDate]) {
                        acc[clockout.reportDate] = [];
                      }
                      acc[clockout.reportDate].push(clockout);
                      return acc;
                    }, {});

                    // Sort dates in descending order (most recent first)
                    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

                    return sortedDates.map((date) => {
                      const clockouts = groupedByDate[date];
                      const totalExtraHours = clockouts.reduce((sum, c) => {
                        const hrs = parseFloat(c.extraHours);
                        return sum + (isNaN(hrs) ? 0 : hrs);
                      }, 0);
                      
                      return (
                        <div key={date} className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
                          <div className="bg-slate-900 p-3 border-b border-slate-700 flex justify-between items-center">
                            <div>
                              <h3 className="text-lg font-bold text-white">{date}</h3>
                              <p className="text-xs text-slate-400">{clockouts.length} auto-clockout{clockouts.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold text-red-400">{totalExtraHours.toFixed(1)}h</span>
                              <p className="text-xs text-slate-400">Extra</p>
                            </div>
                          </div>
                          
                          {/* Desktop Header */}
                          <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 border-b border-slate-700 bg-slate-800" style={{gridTemplateColumns: '1fr 120px 70px'}}>
                            <div className="text-slate-400 text-xs md:text-sm font-semibold">Name</div>
                            <div className="text-slate-400 text-xs md:text-sm font-semibold">Location</div>
                            <div className="text-slate-400 text-xs md:text-sm font-semibold text-right">Extra Hrs</div>
                          </div>
                          
                          <div className="divide-y divide-slate-700">
                            {clockouts.map((clockout, idx) => (
                              <div key={idx}>
                                {/* Desktop Layout */}
                                <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 hover:bg-slate-750 transition-colors" style={{gridTemplateColumns: '1fr 120px 70px'}}>
                                  <div className="text-white font-medium text-xs md:text-sm">{clockout.employee}</div>
                                  <div className="text-slate-300 text-xs md:text-sm">{clockout.location}</div>
                                  <div className="text-red-400 font-semibold text-xs md:text-sm text-right">{clockout.extraHours === 'N/A' ? 'N/A' : clockout.extraHours ? `${clockout.extraHours}h` : ''}</div>
                                </div>
                                
                                {/* Mobile Layout - All on one row */}
                                <div className="md:hidden p-2 flex items-center justify-between gap-2 text-xs">
                                  <div className="text-white font-medium flex-1">{clockout.employee}</div>
                                  <div className="text-slate-300">{clockout.location}</div>
                                  <div className="text-red-400 font-semibold">{clockout.extraHours === 'N/A' ? 'N/A' : clockout.extraHours ? `${clockout.extraHours}h` : ''}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </>
          )}

          {activeTab === 'call-offs' && (
            <>
              {/* Header with date range */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">Call-Offs</h2>
                    {filteredCallOffs.length > 0 && (
                      <p className="text-sm text-slate-400">
                        Showing data for: {getDataDateRange(filteredCallOffs)}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-orange-400">{filteredCallOffs.length}</span>
                    <p className="text-xs text-slate-400">Total</p>
                  </div>
                </div>
              </div>

              {callOffsError && (
                <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
                  <strong>Error:</strong> {callOffsError}
                </div>
              )}

              {callOffsLoading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="text-white text-lg">Loading call-offs...</div>
                </div>
              ) : filteredCallOffs.length === 0 ? (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                  <AlertCircle className="mx-auto mb-3 text-green-400" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">No Call-Offs Found</h3>
                  <p className="text-slate-400">All scheduled employees showed up!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    // Group call-offs by date
                    const groupedByDate = filteredCallOffs.reduce((acc, callOff) => {
                      if (!acc[callOff.reportDate]) {
                        acc[callOff.reportDate] = [];
                      }
                      acc[callOff.reportDate].push(callOff);
                      return acc;
                    }, {});

                    // Sort dates in descending order (most recent first)
                    const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

                    return sortedDates.map((date) => {
                      const callOffs = groupedByDate[date];
                      return (
                        <div key={date} className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
                          <div className="bg-slate-900 p-3 border-b border-slate-700">
                            <h3 className="text-lg font-bold text-white">{date}</h3>
                            <p className="text-xs text-slate-400">{callOffs.length} call-off{callOffs.length !== 1 ? 's' : ''}</p>
                          </div>
                          
                          {/* Desktop Header */}
                          <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 border-b border-slate-700 bg-slate-800" style={{gridTemplateColumns: '1fr 120px 150px'}}>
                            <div className="text-slate-400 text-xs md:text-sm font-semibold">Name</div>
                            <div className="text-slate-400 text-xs md:text-sm font-semibold">Location</div>
                            <div className="text-slate-400 text-xs md:text-sm font-semibold">Scheduled Time</div>
                          </div>
                          
                          <div className="divide-y divide-slate-700">
                            {callOffs.map((callOff, idx) => (
                              <div key={idx}>
                                {/* Desktop Layout */}
                                <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 hover:bg-slate-750 transition-colors" style={{gridTemplateColumns: '1fr 120px 150px'}}>
                                  <div className="text-white font-medium text-xs md:text-sm">{callOff.employee}</div>
                                  <div className="text-slate-300 text-xs md:text-sm">{callOff.location}</div>
                                  <div className="text-slate-300 text-xs md:text-sm">{callOff.scheduledTime}</div>
                                </div>
                                
                                {/* Mobile Layout - All on one row */}
                                <div className="md:hidden p-2 flex items-center justify-between gap-2 text-xs">
                                  <div className="text-white font-medium flex-1">{callOff.employee}</div>
                                  <div className="text-slate-300">{callOff.location}</div>
                                  <div className="text-slate-400">{callOff.scheduledTime}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </>
          )}

          {activeTab === 'overtime' && (
            <>
              {/* Header */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white">OT Warnings</h2>
                    <p className="text-sm text-slate-400">Employees approaching overtime this week</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-yellow-400">{filteredOvertime.length}</span>
                    <p className="text-xs text-slate-400">Total</p>
                  </div>
                </div>
              </div>

              {overtimeError && (
                <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
                  <strong>Error:</strong> {overtimeError}
                </div>
              )}

              {overtimeLoading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="text-white text-lg">Loading overtime warnings...</div>
                </div>
              ) : filteredOvertime.length === 0 ? (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                  <AlertCircle className="mx-auto mb-3 text-green-400" size={48} />
                  <h3 className="text-xl font-bold text-white mb-2">No OT Warnings</h3>
                  <p className="text-slate-400">No employees approaching overtime this week!</p>
                </div>
              ) : (
                <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-x-auto">
                  {/* Header Row */}
                  <div className="grid gap-2 p-2 border-b border-slate-700 bg-slate-900 min-w-[360px]" style={{gridTemplateColumns: '1fr 90px 130px'}}>
                    <div className="text-slate-400 text-xs font-semibold">Name</div>
                    <div className="text-slate-400 text-xs font-semibold">Location</div>
                    <div className="text-slate-400 text-xs font-semibold text-right">Est OT Start</div>
                  </div>
                  
                  <div className="divide-y divide-slate-700 min-w-[360px]">
                    {filteredOvertime.map((ot, idx) => {
                      const hasAutoClockout = clockouts.some(c => 
                        c.employee.toLowerCase() === ot.employee.toLowerCase() && 
                        c.location === ot.location
                      );
                      return (
                        <div key={idx} className="grid gap-2 p-2 hover:bg-slate-750 transition-colors" style={{gridTemplateColumns: '1fr 90px 130px'}}>
                          <div className="flex items-center gap-1 overflow-hidden">
                            <span className="text-white font-medium text-xs truncate">{ot.employee}</span>
                            {hasAutoClockout && (
                              <span className="bg-red-600 text-white text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0">AC</span>
                            )}
                          </div>
                          <div className="text-slate-300 text-xs truncate">{ot.location}</div>
                          <div className="text-yellow-400 font-medium text-xs text-right whitespace-nowrap">{ot.estOTStart}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'scheduled-today' && (
            <>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <button 
                  onClick={() => setIsScheduledFiltersOpen(!isScheduledFiltersOpen)}
                  className="flex items-center gap-2 w-full"
                >
                  <Filter className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Filters</h3>
                  <span className="text-slate-400 text-sm ml-auto">{isScheduledFiltersOpen ? '▼' : '▶'}</span>
                </button>
                {isScheduledFiltersOpen && (
                  <div className="flex flex-col md:flex-row gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Location</label>
                      <select
                        value={scheduledLocationFilter}
                        onChange={(e) => setScheduledLocationFilter(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="all">All Locations</option>
                        {[...new Set(scheduledToday.map(emp => emp.location))].sort().map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-400 mb-1">Market</label>
                      <select
                        value={scheduledMarketFilter}
                        onChange={(e) => setScheduledMarketFilter(e.target.value)}
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

              {scheduledError && (
                <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200">
                  <strong>Error:</strong> {scheduledError}
                </div>
              )}

              {scheduledLoading ? (
                <div className="flex justify-center items-center py-20">
                  <div className="text-white text-lg">Loading scheduled employees...</div>
                </div>
              ) : filteredScheduled.length === 0 ? (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                  <p className="text-slate-400">No scheduled employees found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                  {(() => {
                    const groupedByLocation = filteredScheduled.reduce((acc, emp) => {
                      if (!acc[emp.location]) {
                        acc[emp.location] = [];
                      }
                      acc[emp.location].push(emp);
                      return acc;
                    }, {});

                    const sortedLocations = Object.keys(groupedByLocation).sort();

                    return sortedLocations.map((location, locIdx) => {
                      const employees = groupedByLocation[location];
                      
                      return (
                        <div key={locIdx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                          <div className="mb-2 md:mb-3">
                            <h3 className="text-sm md:text-base font-bold text-white">{location}</h3>
                            <p className="text-xs text-slate-400">{employees.length} employee{employees.length !== 1 ? 's' : ''} scheduled</p>
                          </div>

                          <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                            <div className="space-y-1">
                              {employees.map((emp, empIdx) => (
                                <div key={empIdx} className="flex justify-between items-center py-1 border-b border-slate-700 last:border-b-0">
                                  <span className="text-white text-xs md:text-sm font-medium flex items-center">
                                    {emp.employee}
                                    <TitleBadge title={getEmployeeTitle(emp.employee)} />
                                  </span>
                                  <span className="text-slate-300 text-xs md:text-sm whitespace-nowrap ml-2">{emp.schStart} - {emp.schEnd}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </>
          )}
          </SwipeNavigation>
        </div>

        {showClockoutModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowClockoutModal(false)}
          >
            <div 
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">{clockoutModalData.location} - Auto-Clockouts</h3>
                <button
                  onClick={() => setShowClockoutModal(false)}
                  className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-1">
                {clockoutModalData.data.map((c, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-700 last:border-b-0">
                    <span className="text-white">{c.employee}</span>
                    <span className="text-red-400 font-medium">{c.extraHours === 'N/A' ? 'N/A' : c.extraHours ? `${c.extraHours}h` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showCallOffModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCallOffModal(false)}
          >
            <div 
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-white">{callOffModalData.location} - Call-Offs</h3>
                <button
                  onClick={() => setShowCallOffModal(false)}
                  className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-1">
                {callOffModalData.employees.map((emp, idx) => (
                  <div key={idx} className="text-white text-sm py-1 border-b border-slate-700 last:border-b-0">
                    {emp}
                  </div>
                ))}
              </div>
            </div>
          </div>
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
