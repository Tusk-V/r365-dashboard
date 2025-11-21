import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/router"
import Head from "next/head"
import { useState, useEffect } from 'react';
import { Filter, TrendingUp, Users, DollarSign, Clock, AlertTriangle, Target, Activity, RefreshCw, AlertCircle, Lock, Upload } from 'lucide-react';

// Google Sheets API Configuration
const API_KEY = 'AIzaSyAbUI3oP_0ofBG9tiAudYLUjZ4MSSaFNDA';
const SPREADSHEET_ID = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';
const SHEET_NAME = 'Sheet1';
const AUTO_CLOCKOUTS_SHEET = 'Auto-Clockouts';
const CALL_OFFS_SHEET = 'Call-Offs';
const FLASH_DAY_SHEET = 'Flash - Day';
const FLASH_WTD_SHEET = 'Flash - WTD';
const SCHEDULED_TODAY_SHEET = 'Scheduled Today';

// P&L ACCESS CODES - CHANGE THESE!
const PL_ACCESS_CODES = {
  'Allen': '1001', 'Bixby': '1002', 'Broken Arrow': '1003', 'Carrollton': '1004',
  'Edmond': '1005', 'Frisco #1': '1006', 'Frisco #2': '1007', 'Frisco #3': '1008',
  'Hillcrest Village': '1009', 'Lake Highlands': '1010', 'Lakeland': '1011',
  'Norman': '1012', 'Owasso': '1013', 'Penn': '1014', 'Prosper': '1015',
  'Sanford': '1016', 'The Colony': '1017', 'Treat Truck': '1018',
  'Warr Acres': '1019', 'Yale': '1020'
};

const ADMIN_PIN = '9999'; // CHANGE THIS!

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [activeTab, setActiveTab] = useState('sales');
  const [flashView, setFlashView] = useState('day');
  
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
  const [clockoutModalData, setClockoutModalData] = useState({ location: '', employees: [] });
  const [showCallOffModal, setShowCallOffModal] = useState(false);
  const [callOffModalData, setCallOffModalData] = useState({ location: '', employees: [] });

  const [callOffs, setCallOffs] = useState([]);
  const [filteredCallOffs, setFilteredCallOffs] = useState([]);
  const [callOffsLoading, setCallOffsLoading] = useState(false);
  const [callOffsError, setCallOffsError] = useState(null);
  const [callOffLocationFilter, setCallOffLocationFilter] = useState('all');

  const [scheduledToday, setScheduledToday] = useState([]);
  const [filteredScheduled, setFilteredScheduled] = useState([]);
  const [scheduledLoading, setScheduledLoading] = useState(false);
  const [scheduledError, setScheduledError] = useState(null);
  const [scheduledLocationFilter, setScheduledLocationFilter] = useState('all');
  const [scheduledMarketFilter, setScheduledMarketFilter] = useState('all');

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

  // P&L Dashboard State
  const [plData, setPlData] = useState(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plError, setPlError] = useState(null);
  const [plSelectedLocation, setPlSelectedLocation] = useState('');
  const [plPin, setPlPin] = useState('');
  const [plAuthenticated, setPlAuthenticated] = useState(false);
  const [plAuthError, setPlAuthError] = useState('');

  // P&L Admin Upload State
  const [plAdminAuth, setPlAdminAuth] = useState(false);
  const [plAdminPin, setPlAdminPin] = useState('');
  const [plAdminError, setPlAdminError] = useState('');
  const [plUploadFile, setPlUploadFile] = useState(null);
  const [plUploading, setPlUploading] = useState(false);
  const [plUploadError, setPlUploadError] = useState('');
  const [plUploadSuccess, setPlUploadSuccess] = useState('');
  const [plCollapsed, setPlCollapsed] = useState({});
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

  // P&L Functions
const loadPlData = async () => {
  setPlLoading(true);
  setPlError(null);
  try {
    const response = await fetch('/api/get-pl-data');
    if (!response.ok) throw new Error('Failed to load P&L data');
    const result = await response.json();
    setPlData(result.data);
    } catch (err) {
      console.error('Error loading P&L data:', err);
      setPlError(err.message);
    } finally {
      setPlLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const handlePlAuth = () => {
    if (!plSelectedLocation) {
      setPlAuthError('Please select a location');
      return;
    }
    if (plPin === PL_ACCESS_CODES[plSelectedLocation]) {
      setPlAuthenticated(true);
      setPlAuthError('');
    } else {
      setPlAuthError('Invalid PIN code');
      setPlPin('');
    }
  };

  const handlePlLogout = () => {
    setPlAuthenticated(false);
    setPlPin('');
    setPlSelectedLocation('');
    setPlAuthError('');
  };

  const handlePlAdminAuth = () => {
    if (plAdminPin === ADMIN_PIN) {
      setPlAdminAuth(true);
      setPlAdminError('');
    } else {
      setPlAdminError('Invalid admin PIN');
      setPlAdminPin('');
    }
  };

  const handlePlUpload = async () => {
    if (!plUploadFile) {
      setPlUploadError('Please select a file');
      return;
    }
    setPlUploading(true);
    setPlUploadError('');
    setPlUploadSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', plUploadFile);
      formData.append('adminPin', plAdminPin);
      const response = await fetch('/api/upload-pl', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }
      setPlUploadSuccess(
        `P&L data updated! Period: ${data.periodDate}, Locations: ${data.locationCount}`
      );
      setPlUploadFile(null);
      setTimeout(() => loadPlData(), 1000);
    } catch (error) {
      console.error('Upload error:', error);
      setPlUploadError(error.message);
    } finally {
      setPlUploading(false);
    }
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
        productivity,
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
      const productivity = actualHours > 0 ? actualSales / actualHours : 0;
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
        productivity,
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
        
        // Convert to 24-hour format
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        
        // Subtract 2 hours for timezone correction
        hours -= 2;
        
        // Handle negative hours (wrap to previous day)
        if (hours < 0) hours += 24;
        
        // Convert back to 12-hour format
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
    
    if (callOffLocationFilter !== 'all') {
      filtered = filtered.filter(c => c.location === callOffLocationFilter);
    }
    
    setFilteredCallOffs(filtered);
  };

  const loadFlashData = async () => {
    setFlashLoading(true);
    setFlashError(null);
    
    try {
      const sheetName = flashView === 'day' ? FLASH_DAY_SHEET : FLASH_WTD_SHEET;
      const range = `${sheetName}!A2:N`;
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
        voids: parseFloat(row[11]) || 0,
        totalDiscounts: parseFloat(row[12]) || 0,
        discountPercent: parseFloat(row[13]) || 0
      }));
      
      setFlashData(parsedFlash);
    } catch (err) {
      console.error('Error loading flash data:', err);
      setFlashError(err.message);
    } finally {
      setFlashLoading(false);
    }
  };

  const adjustSingleTime = (timeString) => {
    if (!timeString) return timeString;
    
    try {
      const match = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return timeString;
      
      let hours = parseInt(match[1]);
      const minutes = match[2];
      const period = match[3].toUpperCase();
      
      // Convert to 24-hour format
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      // Subtract 2 hours for timezone correction
      hours -= 2;
      
      // Handle negative hours (wrap to previous day)
      if (hours < 0) hours += 24;
      
      // Convert back to 12-hour format
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

  const applyScheduledFilters = () => {
    let filtered = [...scheduledToday];
    
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

  const getAutoClockoutEmployees = (locationName) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    const monday = new Date(today);
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    const employees = clockouts
      .filter(c => {
        if (c.location !== locationName) return false;
        const reportDate = new Date(c.reportDate);
        return reportDate >= monday && reportDate <= sunday;
      })
      .map(c => c.employee);
    
    return employees;
  };

  const getCallOffEmployees = (locationName) => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    const monday = new Date(today);
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    const employees = callOffs
      .filter(c => {
        if (c.location !== locationName) return false;
        const reportDate = new Date(c.reportDate);
        return reportDate >= monday && reportDate <= sunday;
      })
      .map(c => c.employee);
    
    return employees;
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
    if (status === "authenticated") {
      loadDataFromGoogleSheets();
      loadAvailableWeeks();
      loadAutoClockouts();
      loadCallOffs();
      loadScheduledToday();
      loadFlashData();
      loadPlData(); // ADD THIS LINE
    }
  }, [status]);

  useEffect(() => {
    if (activeTab !== 'pl') {
      setPlAuthenticated(false);
      setPlPin('');
      setPlAuthError('');
    }
    if (activeTab !== 'pl-admin') {
      setPlAdminAuth(false);
      setPlAdminPin('');
      setPlUploadFile(null);
      setPlUploadError('');
      setPlUploadSuccess('');
    }
  }, [activeTab]);

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

  useEffect(() => {
    applyCallOffFilters();
  }, [callOffs, callOffLocationFilter]);

  useEffect(() => {
    applyScheduledFilters();
  }, [scheduledToday, scheduledLocationFilter, scheduledMarketFilter]);

  useEffect(() => {
    if (activeTab.startsWith('flash-')) {
      loadFlashData();
    }
  }, [flashView]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    )
  }

  if (!session) {
    return null
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
                  onChange={(e) => setActiveTab(e.target.value)}
                  className="px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="sales">Weekly Sales & Labor</option>
                  <option value="flash-sales">Sales/Guest Counts</option>
                  <option value="flash-discounts">Comps/Discounts/Voids</option>
                  <option value="scheduled-today">Scheduled Today</option>
                  <option value="clockouts">Auto-Clockouts</option>
                  <option value="call-offs">Call-Offs</option>
                  <option value="pl">P&L Dashboard</option>
                  <option value="pl-admin">P&L Admin Upload</option>
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
                    } else if (activeTab === 'scheduled-today') {
                      loadScheduledToday();
                    } else if (activeTab === 'flash-sales' || activeTab === 'flash-discounts') {
                      loadFlashData();
                    }
                  }}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw size={16} className="text-white" />
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
              <button
                onClick={() => signOut()}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                title="Sign out"
              >
                Sign Out
              </button>
            </div>

            <div className="md:hidden flex items-center gap-2">
              <select
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value)}
                className="flex-1 px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="sales">Weekly Sales & Labor</option>
                <option value="flash-sales">Sales/Guest Counts</option>
                <option value="flash-discounts">Comps/Discounts/Voids</option>
                <option value="scheduled-today">Scheduled Today</option>
                <option value="clockouts">Auto-Clockouts</option>
                <option value="call-offs">Call-Offs</option>
                <option value="pl">P&L Dashboard</option>
                <option value="pl-admin">P&L Admin Upload</option>
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
                    } else if (activeTab === 'scheduled-today') {
                      loadScheduledToday();
                    } else if (activeTab === 'flash-sales' || activeTab === 'flash-discounts') {
                      loadFlashData();
                    } else if (activeTab === 'pl' || activeTab === 'pl-admin') {
                      loadPlData();
                    }
                  }}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                title="Refresh data"
              >
                <RefreshCw size={16} className="text-white" />
              </button>
            </div>
          </div>

            {/* P&L DASHBOARD TAB */}
          {activeTab === 'pl' && (
            <>
              {!plAuthenticated ? (
                <div className="flex items-center justify-center py-12">
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-8 w-full max-w-md">
                    <div className="text-center mb-8">
                      <div className="inline-block p-4 bg-indigo-600 bg-opacity-20 rounded-full mb-4">
                        <Lock className="w-12 h-12 text-indigo-400" />
                      </div>
                      <h2 className="text-2xl font-bold text-white mb-2">P&L Dashboard Access</h2>
                      <p className="text-slate-400 text-sm">Period Ending 10/31/2025</p>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">Select Location</label>
                        <select value={plSelectedLocation} onChange={(e) => { setPlSelectedLocation(e.target.value); setPlAuthError(''); }} className="w-full px-4 py-3 border-2 border-slate-600 bg-slate-700 rounded-lg text-white focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50 transition">
                          <option value="">Choose a location...</option>
                          {Object.keys(PL_ACCESS_CODES).sort().map(loc => (
                            <option key={loc} value={loc}>{loc}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">4-Digit PIN Code</label>
                        <input type="password" maxLength="4" value={plPin} onChange={(e) => { setPlPin(e.target.value.replace(/\D/g, '')); setPlAuthError(''); }} onKeyPress={(e) => { if (e.key === 'Enter') handlePlAuth(); }} placeholder="••••" className="w-full px-4 py-3 border-2 border-slate-600 bg-slate-700 rounded-lg text-white focus:border-indigo-500 focus:ring focus:ring-indigo-500 focus:ring-opacity-50 transition text-center text-2xl tracking-widest" />
                      </div>
                      {plAuthError && (
                        <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">{plAuthError}</div>
                      )}
                      <button onClick={handlePlAuth} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition duration-200 shadow-lg hover:shadow-xl">Access Dashboard</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-bold text-white">{plSelectedLocation}</h2>
                        <p className="text-sm text-slate-400">Period Ending 10/31/2025</p>
                      </div>
                      <button onClick={handlePlLogout} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors text-sm">Change Location</button>
                    </div>
                  </div>
                  {plError && (
                    <div className="bg-red-900 border border-red-700 rounded-lg p-3 mb-3 text-red-200"><strong>Error:</strong> {plError}</div>
                  )}
                  {plLoading ? (
                    <div className="flex justify-center items-center py-20"><div className="text-white text-lg">Loading P&L data...</div></div>
                  ) : !plData || !plData[plSelectedLocation] ? (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center"><p className="text-slate-400">No P&L data available for this location</p></div>
                  ) : (
                    <div className="space-y-3">
                      {Object.entries(plData[plSelectedLocation]).map(([category, items]) => {
                        if (Object.keys(items).length === 0) return null;
                        return (
                          <div key={category} className="bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
                            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-4 py-3">
                              <h3 className="text-lg font-bold text-white">{category}</h3>
                            </div>
                            <div className="p-4">
                              <div className="space-y-2">
                                {Object.entries(items).map(([item, data]) => {
                                  const isNegative = data.value < 0;
                                  const isTotalOrNet = item.toLowerCase().includes('total') || item.toLowerCase().includes('net') || item.toLowerCase().includes('income') || item.toLowerCase().includes('profit');
                                  return (
                                    <div key={item} className={`flex justify-between items-center py-2 px-3 rounded-lg transition ${isTotalOrNet ? 'bg-indigo-900 bg-opacity-30 border border-indigo-600 font-semibold' : 'bg-slate-900 hover:bg-slate-850'}`}>
                                      <div className="flex-1">
                                        <span className={`text-sm ${isTotalOrNet ? 'text-white font-semibold' : 'text-slate-300'}`}>{item}</span>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <span className={`font-mono text-right min-w-[120px] text-sm ${isNegative ? 'text-red-400' : 'text-white'} ${isTotalOrNet ? 'font-bold text-base' : ''}`}>{formatCurrency(data.value)}</span>
                                        <span className={`font-mono text-xs min-w-[60px] text-right ${isNegative ? 'text-red-400' : 'text-slate-400'}`}>{formatPercent(data.percent)}</span>
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
            </>
          )}

          {/* P&L ADMIN UPLOAD TAB */}
          {activeTab === 'pl-admin' && (
            <div className="max-w-2xl mx-auto">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl p-6 md:p-8">
                <div className="text-center mb-6">
                  <div className="inline-block p-4 bg-blue-600 bg-opacity-20 rounded-full mb-4">
                    <Upload className="w-12 h-12 text-blue-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Update P&L Data</h2>
                  <p className="text-slate-400 text-sm">Upload a new P&L Excel file to update all location data</p>
                </div>
                {!plAdminAuth ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Admin PIN</label>
                      <input type="password" maxLength="4" value={plAdminPin} onChange={(e) => { setPlAdminPin(e.target.value.replace(/\D/g, '')); setPlAdminError(''); }} onKeyPress={(e) => { if (e.key === 'Enter') handlePlAdminAuth(); }} placeholder="••••" className="w-full px-4 py-3 border-2 border-slate-600 bg-slate-700 rounded-lg text-white focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50 transition text-center text-2xl tracking-widest" />
                    </div>
                    {plAdminError && (
                      <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm">{plAdminError}</div>
                    )}
                    <button onClick={handlePlAdminAuth} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition duration-200">Access Admin Panel</button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                      <h3 className="text-white font-semibold mb-2">Instructions:</h3>
                      <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                        <li>Download the P&L Excel file from R365</li>
                        <li>Make sure it's the "Profit and Loss Details" report</li>
                        <li>Click "Choose File" below and select the Excel file</li>
                        <li>Click "Upload & Update" to process</li>
                        <li>The system will update all location data automatically</li>
                      </ol>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Select P&L Excel File</label>
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => { setPlUploadFile(e.target.files[0]); setPlUploadError(''); setPlUploadSuccess(''); }} className="w-full px-4 py-3 border-2 border-slate-600 bg-slate-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer" />
                      {plUploadFile && (
                        <p className="text-slate-400 text-sm mt-2">Selected: {plUploadFile.name} ({(plUploadFile.size / 1024).toFixed(2)} KB)</p>
                      )}
                    </div>
                    {plUploadError && (
                      <div className="bg-red-900 border border-red-700 text-red-200 px-4 py-3 rounded-lg text-sm"><strong>Error:</strong> {plUploadError}</div>
                    )}
                    {plUploadSuccess && (
                      <div className="bg-green-900 border border-green-700 text-green-200 px-4 py-3 rounded-lg text-sm"><strong>Success!</strong> {plUploadSuccess}</div>
                    )}
                    {plUploading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                        <span className="ml-3 text-white">Processing file...</span>
                      </div>
                    ) : (
                      <button onClick={handlePlUpload} disabled={!plUploadFile} className={`w-full font-semibold py-3 rounded-lg transition duration-200 ${plUploadFile ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}>Upload & Update P&L Data</button>
                    )}
                    <div className="pt-4 border-t border-slate-700">
                      <button onClick={() => { setPlAdminAuth(false); setPlAdminPin(''); setPlUploadFile(null); setPlUploadError(''); setPlUploadSuccess(''); }} className="text-slate-400 hover:text-white text-sm transition-colors">← Back to Dashboard</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
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

                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                    {filteredLocations.map((loc, idx) => (
                      <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                        <div className="flex items-start justify-between mb-2 md:mb-3">
                          <h3 className="text-sm md:text-base font-bold text-white">{loc.location}</h3>
                          <div className="flex gap-1">
                            {(() => {
                              const clockoutEmployees = getAutoClockoutEmployees(loc.location);
                              if (clockoutEmployees.length > 0) {
                                return (
                                  <button
                                    onClick={() => {
                                      setClockoutModalData({ location: loc.location, employees: clockoutEmployees });
                                      setShowClockoutModal(true);
                                    }}
                                    className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 cursor-pointer hover:bg-red-700 transition-colors" 
                                    title={clockoutEmployees.join(', ')}
                                  >
                                    AUTO-CLOCKOUT ({clockoutEmployees.length})
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
                                    title={callOffEmployees.join(', ')}
                                  >
                                    CALL-OFF ({callOffEmployees.length})
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
                  <div className="grid gap-2 md:gap-4 p-2 md:p-4 border-b border-slate-700 bg-slate-900" style={{gridTemplateColumns: '80px 1fr 120px'}}>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Date</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Name</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Location</div>
                  </div>
                  
                  <div className="divide-y divide-slate-700">
                    {filteredClockouts.map((clockout, idx) => (
                      <div key={idx} className="grid gap-2 md:gap-4 p-2 md:p-4 hover:bg-slate-750 transition-colors" style={{gridTemplateColumns: '80px 1fr 120px'}}>
                        <div className="text-slate-300 text-xs md:text-sm">{clockout.reportDate}</div>
                        <div className="text-white font-medium text-xs md:text-sm">{clockout.employee}</div>
                        <div className="text-slate-300 text-xs md:text-sm">{clockout.location}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'call-offs' && (
            <>
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
                <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-lg">
                  {/* Desktop Header */}
                  <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-4 border-b border-slate-700 bg-slate-900" style={{gridTemplateColumns: '100px 1fr 120px 150px'}}>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Date</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Name</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Location</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Scheduled Time</div>
                  </div>
                  
                  <div className="divide-y divide-slate-700">
                    {filteredCallOffs.map((callOff, idx) => (
                      <div key={idx}>
                        {/* Desktop Layout */}
                        <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-4 hover:bg-slate-750 transition-colors" style={{gridTemplateColumns: '100px 1fr 120px 150px'}}>
                          <div className="text-slate-300 text-xs md:text-sm">{callOff.reportDate}</div>
                          <div className="text-white font-medium text-xs md:text-sm">{callOff.employee}</div>
                          <div className="text-slate-300 text-xs md:text-sm">{callOff.location}</div>
                          <div className="text-slate-300 text-xs md:text-sm">{callOff.scheduledTime}</div>
                        </div>
                        
                        {/* Mobile Layout */}
                        <div className="md:hidden p-3 space-y-1">
                          <div className="flex justify-between items-start">
                            <div className="text-white font-medium text-sm">{callOff.employee}</div>
                            <div className="text-slate-400 text-xs">{callOff.reportDate}</div>
                          </div>
                          <div className="text-slate-300 text-xs">{callOff.location}</div>
                          <div className="text-slate-400 text-xs">{callOff.scheduledTime}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'scheduled-today' && (
            <>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Filter className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-semibold text-white">Filters</h3>
                </div>
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
                                  <span className="text-white text-xs md:text-sm font-medium">{emp.employee}</span>
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

          {activeTab === 'flash-sales' && (
            <>
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

          {activeTab === 'flash-discounts' && (
            <>
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
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 text-xs">Voids</span>
                              <span className={`font-semibold text-xs ${loc.voids > 20 ? 'text-orange-400' : 'text-white'}`}>
                                ${loc.voids.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
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

        {showClockoutModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowClockoutModal(false)}
          >
            <div 
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-md w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Auto-Clockouts</h3>
                <button
                  onClick={() => setShowClockoutModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>
              
              <div className="mb-3">
                <p className="text-sm text-slate-400 mb-2">Location: <span className="text-white font-semibold">{clockoutModalData.location}</span></p>
                <p className="text-xs text-slate-500">The following employees have auto-clockouts this week:</p>
              </div>

              <div className="bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto">
                <ul className="space-y-2">
                  {clockoutModalData.employees.map((emp, idx) => (
                    <li key={idx} className="text-white text-sm py-1 border-b border-slate-700 last:border-b-0">
                      {emp}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setShowClockoutModal(false)}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showCallOffModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCallOffModal(false)}
          >
            <div 
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-md w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Call-Offs</h3>
                <button
                  onClick={() => setShowCallOffModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>
              
              <div className="mb-3">
                <p className="text-sm text-slate-400 mb-2">Location: <span className="text-white font-semibold">{callOffModalData.location}</span></p>
                <p className="text-xs text-slate-500">The following employees called off this week:</p>
              </div>

              <div className="bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto">
                <ul className="space-y-2">
                  {callOffModalData.employees.map((emp, idx) => (
                    <li key={idx} className="text-white text-sm py-1 border-b border-slate-700 last:border-b-0">
                      {emp}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setShowCallOffModal(false)}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
