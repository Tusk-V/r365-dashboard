import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ChevronDown, ChevronRight, Settings, RefreshCw, Printer, Upload, CheckCircle, XCircle } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// All P&L line items organized by section, with default on/off for controllable net income
const DEFAULT_ACCOUNTS = {
  'Sales': {
    items: [
      { label: 'Food Sales', key: 'Food Sales', defaultOn: true, isSales: true },
      { label: 'Comps', key: 'Comps', defaultOn: true, isSales: true },
      { label: 'Discounts', key: 'Discounts', defaultOn: true, isSales: true },
      { label: 'Refunds', key: 'Refunds', defaultOn: true, isSales: true },
    ]
  },
  'Food and Paper Cost': {
    items: [
      { label: 'Custard Cost', key: 'Custard Cost', defaultOn: true },
      { label: 'Nuts Cost', key: 'Nuts Cost', defaultOn: true },
      { label: 'Toppings Cost', key: 'Toppings Cost', defaultOn: true },
      { label: 'Beverage Cost', key: 'Beverage Cost', defaultOn: true },
      { label: 'Take Home Cost', key: 'Take Home Cost', defaultOn: true },
      { label: 'Other Food Cost', key: 'Other Food Cost', defaultOn: true },
      { label: 'Paper Products Cost', key: 'Paper Products Cost', defaultOn: true },
      { label: 'Mistakes', key: 'Mistakes', defaultOn: true },
    ]
  },
  'Salaries and Wages': {
    items: [
      { label: 'Market Manager Wages', key: 'Market Manager Wages', defaultOn: true },
      { label: 'General Manager Wages', key: 'General Manager Wages', defaultOn: true },
      { label: 'Assistant Manager Wages', key: 'Assistant Manager Wages', defaultOn: true },
      { label: 'Hourly Wages', key: 'Hourly Wages', defaultOn: true },
      { label: 'Training Wages', key: 'Training Wages', defaultOn: true },
      { label: 'Employee Bonuses', key: 'Employee Bonuses', defaultOn: true },
    ]
  },
  'Payroll Taxes': {
    items: [
      { label: 'FICA Taxes', key: 'FICA Taxes', defaultOn: true },
      { label: 'FUTA Taxes', key: 'FUTA Taxes', defaultOn: true },
      { label: 'State Unemployment Tax', key: 'State Unemployment Tax', defaultOn: true },
    ]
  },
  'Payroll Benefits': {
    items: [
      { label: 'Employer Contributions', key: 'Employer Contributions', defaultOn: true },
      { label: 'Health Insurance', key: 'Health Insurance', defaultOn: true },
      { label: 'Life Insurance', key: 'Life Insurance', defaultOn: true },
    ]
  },
  'Direct Operating Expense': {
    items: [
      { label: 'Cleaning Supplies', key: 'Cleaning Supplies', defaultOn: true },
      { label: 'Contract Cleaning', key: 'Contract Cleaning', defaultOn: true },
      { label: 'Kitchen Supplies and Smallwares', key: 'Kitchen Supplies and Smallwares', defaultOn: true },
      { label: 'Uniforms and Linen Rental', key: 'Uniforms and Linen Rental', defaultOn: true },
      { label: 'Miscellaneous Expense', key: 'Miscellaneous Expense', defaultOn: true },
      { label: 'Pest Control', key: 'Pest Control', defaultOn: true },
      { label: 'Employee Meals', key: 'Employee Meals', defaultOn: true },
      { label: 'Cash Over/Short', key: 'Cash Over/Short', defaultOn: true },
      { label: 'Product Waste', key: 'Product Waste', defaultOn: true },
      { label: 'Repairs and Maintenance', key: 'Repairs and Maintenance', defaultOn: true },
      { label: 'Custard Machine Repairs', key: 'Custard Machine Repairs', defaultOn: true },
      { label: 'Grounds Maintenance', key: 'Grounds Maintenance', defaultOn: true },
    ]
  },
  'Utilities': {
    items: [
      { label: 'Electricity', key: 'Electricity', defaultOn: true },
      { label: 'Gas', key: 'Gas', defaultOn: true },
      { label: 'Trash Removal', key: 'Trash Removal', defaultOn: true },
      { label: 'Water and Sewage', key: 'Water and Sewage', defaultOn: true },
    ]
  },
  'Advertising': {
    items: [
      { label: 'Advertising Fund', key: 'Advertising Fund', defaultOn: true },
      { label: 'Marketing Manager', key: 'Marketing Manager', defaultOn: true },
      { label: 'Cost of Giveaways and Comps', key: 'Cost of Giveaways and Comps', defaultOn: true },
      { label: 'Other Sponsorships', key: 'Other Sponsorships', defaultOn: true },
      { label: 'Donations', key: 'Donations', defaultOn: true },
    ]
  },
  'General and Administrative': {
    items: [
      { label: 'Credit Card Fees', key: 'Credit Card Fees', defaultOn: true },
      { label: 'Dues and Subscriptions', key: 'Dues and Subscriptions', defaultOn: true },
      { label: 'Store Menus and Displays', key: 'Store Menus and Displays', defaultOn: true },
      { label: 'Computer Costs', key: 'Computer Costs', defaultOn: true },
      { label: 'Royalties', key: 'Royalties', defaultOn: true },
      { label: 'Licenses and Permits Expense', key: 'Licenses and Permits Expense', defaultOn: true },
      { label: 'Insurance Expense', key: 'Insurance Expense', defaultOn: true },
      { label: 'Security System Expense', key: 'Security System Expense', defaultOn: true },
      { label: 'Internet/Telephone', key: 'Internet/Telephone', defaultOn: true },
      { label: 'Gift Cards Expense', key: 'Gift Cards Expense', defaultOn: true },
      { label: 'Office Supplies', key: 'Office Supplies', defaultOn: true },
    ]
  },
  'Occupancy Costs': {
    items: [
      { label: 'Rent', key: 'Rent', defaultOn: false },
      { label: 'Personal Property Taxes', key: 'Personal Property Taxes', defaultOn: false },
      { label: 'Real Estate Taxes', key: 'Real Estate Taxes', defaultOn: false },
    ]
  },
  'Depreciation and Amortization': {
    items: [
      { label: 'Equipment Depreciation', key: 'Equipment Depreciation', defaultOn: false },
      { label: 'Signage Depreciation', key: 'Signage Depreciation', defaultOn: false },
      { label: 'Building Depreciation', key: 'Building Depreciation', defaultOn: false },
      { label: 'Leasehold Improvement Depreciation', key: 'Leasehold Improvement Depreciation', defaultOn: false },
      { label: 'Amortization Expense', key: 'Amortization Expense', defaultOn: false },
    ]
  },
};

const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '$0';
  const negative = val < 0;
  const formatted = Math.round(Math.abs(val)).toLocaleString('en-US');
  return negative ? `($${formatted})` : `$${formatted}`;
};

const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0.0%';
  return val.toFixed(1) + '%';
};

export default function BonusDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessType, setAccessType] = useState('none');
  const [availableLocations, setAvailableLocations] = useState([]);
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [plData, setPlData] = useState(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const reportType = 'quarterly';

  const [accountToggles, setAccountToggles] = useState(() => {
    const toggles = {};
    Object.entries(DEFAULT_ACCOUNTS).forEach(([section, { items }]) => {
      items.forEach(item => { toggles[item.key] = item.defaultOn; });
    });
    return toggles;
  });

  const [showAccountConfig, setShowAccountConfig] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (status === 'authenticated') loadLocations();
  }, [status, reportType]);

  useEffect(() => {
    if (selectedLocation) loadPeriods(selectedLocation);
  }, [selectedLocation, reportType]);

  useEffect(() => {
    if (selectedLocation && selectedPeriod) loadPlData(selectedLocation, selectedPeriod);
  }, [selectedLocation, selectedPeriod]);

  const loadLocations = async () => {
    try {
      setLoading(true);
      setPlData(null);
      const currentLocation = selectedLocation;
      const res = await fetch(`/api/get-pl?reportType=${reportType}`);
      const data = await res.json();
      if (res.ok) {
        setAccessType(data.accessType || 'all');
        setAvailableLocations(data.availableLocations || []);
        if (data.availableLocations?.length > 0) {
          if (currentLocation && data.availableLocations.includes(currentLocation)) {
            setSelectedLocation(currentLocation);
            loadPeriods(currentLocation);
          } else {
            setSelectedLocation(data.availableLocations[0]);
          }
        } else {
          setSelectedLocation('');
          setSelectedPeriod('');
        }
      }
    } catch (err) {
      setError('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const loadPeriods = async (location) => {
    try {
      const res = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}&listPeriods=true&reportType=${reportType}`);
      const data = await res.json();
      if (res.ok && data.periods) {
        setAvailablePeriods(data.periods);
        if (data.periods.length > 0) setSelectedPeriod(data.periods[0]);
      }
    } catch (err) {
      console.error('Failed to load periods:', err);
    }
  };

  const loadPlData = async (location, period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}&period=${encodeURIComponent(period)}&reportType=${reportType}`);
      const data = await res.json();
      if (res.ok && data.data) {
        setPlData(data.data);
      } else {
        setPlData(null);
        if (res.status !== 404) setError(data.error || 'Failed to load data');
      }
    } catch (err) {
      setError('Failed to load P&L data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (selectedLocation && selectedPeriod) {
      loadPlData(selectedLocation, selectedPeriod);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-pl', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        const successCount = data.results?.filter(r => r.status === 'success').length || 0;
        const errorCount = data.results?.filter(r => r.status === 'error').length || 0;
        setUploadResult({ success: true, message: `${successCount} locations uploaded${errorCount > 0 ? `, ${errorCount} errors` : ''}`, results: data.results });
        // Reload data after upload
        loadLocations();
      } else {
        setUploadResult({ success: false, message: data.error || 'Upload failed' });
      }
    } catch (err) {
      setUploadResult({ success: false, message: err.message });
    } finally {
      setUploading(false);
    }
  };

  const getLineValue = useCallback((key, column = 'current') => {
    if (!plData?.rows) return 0;
    for (const row of plData.rows) {
      if (row.label === key) {
        if (column === 'current') return row.period || 0;
        if (column === 'prior') return row.ytd || 0;
      }
    }
    return 0;
  }, [plData]);

  const calculateBonus = useCallback(() => {
    if (!plData) return { current: { sales: 0, expenses: 0, controllableNI: 0 }, prior: { sales: 0, expenses: 0, controllableNI: 0 } };

    let currentSales = 0, currentExpenses = 0, priorSales = 0, priorExpenses = 0;

    Object.entries(DEFAULT_ACCOUNTS).forEach(([section, { items }]) => {
      items.forEach(item => {
        if (!accountToggles[item.key]) return;
        const currentVal = getLineValue(item.key, 'current');
        const priorVal = getLineValue(item.key, 'prior');
        if (item.isSales) { currentSales += currentVal; priorSales += priorVal; }
        else { currentExpenses += currentVal; priorExpenses += priorVal; }
      });
    });

    return {
      current: { sales: currentSales, expenses: currentExpenses, controllableNI: currentSales - currentExpenses },
      prior: { sales: priorSales, expenses: priorExpenses, controllableNI: priorSales - priorExpenses }
    };
  }, [plData, accountToggles, getLineValue]);

  const bonusCalc = calculateBonus();

  const toggleAccount = (key) => setAccountToggles(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleSection = (section) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  const toggleAllInSection = (sectionName, value) => {
    const updates = {};
    DEFAULT_ACCOUNTS[sectionName].items.forEach(item => { updates[item.key] = value; });
    setAccountToggles(prev => ({ ...prev, ...updates }));
  };
  const resetDefaults = () => {
    const toggles = {};
    Object.entries(DEFAULT_ACCOUNTS).forEach(([section, { items }]) => {
      items.forEach(item => { toggles[item.key] = item.defaultOn; });
    });
    setAccountToggles(toggles);
  };

  const getColumnLabels = () => {
    return {
      col1: plData?.quarterLabel || 'Current Quarter',
      col2: plData?.priorQuarterLabel || 'Prior Quarter'
    };
  };
  const columnLabels = getColumnLabels();

  if (status === 'loading') {
    return <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center"><div className="text-white text-lg">Loading...</div></div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <img src="https://i.imgur.com/kkJMVz0.png" alt="Andy's Frozen Custard" className="h-16 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-4">Quarterly Bonus</h1>
          <p className="text-slate-400 mb-6">Sign in to access the bonus dashboard.</p>
          <button onClick={() => signIn('google')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg w-full transition-colors">Sign in with Google</button>
        </div>
      </div>
    );
  }

  const enabledCount = Object.values(accountToggles).filter(Boolean).length;
  const totalCount = Object.values(accountToggles).length;

  return (
    <>
      <Head>
        <title>Quarterly Bonus | Andy&apos;s Frozen Custard</title>
        <style>{`
          @media print {
            .text-slate-300, .text-slate-400, .text-slate-500, .text-white {
              color: black !important;
            }
            body, .bg-slate-900, .bg-slate-800, .bg-gradient-to-br {
              background: white !important;
            }
            .no-print {
              display: none !important;
            }
            .print-only {
              display: block !important;
            }
            .border-slate-600, .border-slate-700 {
              border-color: #999 !important;
            }
          }
        `}</style>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">
          
          {/* Print Header */}
          <div className="print-only hidden mb-2">
            <div className="flex flex-col items-center justify-center py-2">
              <img src="https://i.imgur.com/kkJMVz0.png" alt="Andy's Frozen Custard" className="h-12" />
              <div className="mt-1 text-sm font-bold">{selectedLocation} — Quarterly Bonus — {selectedPeriod}</div>
            </div>
          </div>

          {/* Main Header */}
          <div className="no-print bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-4 mb-2 md:mb-3 shadow-2xl">
            {/* Desktop Header */}
            <div className="hidden md:flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img src="https://i.imgur.com/kkJMVz0.png" alt="Andy's Frozen Custard" className="h-16" />
                <h1 className="text-2xl font-bold text-white">R365 Dashboards</h1>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-400 whitespace-nowrap">Select Dashboard:</label>
                <select
                  value="bonus"
                  onChange={(e) => {
                    if (e.target.value === 'pl') {
                      router.push('/pl');
                    } else if (e.target.value !== 'bonus') {
                      router.push('/');
                      if (typeof window !== 'undefined') {
                        sessionStorage.setItem('pendingTab', e.target.value);
                      }
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
                  <option value="scheduled-today">Scheduled Today</option>
                  <option value="pl">Profit & Loss</option>
                  <option value="bonus">Quarterly Bonus</option>
                </select>
                
                <button onClick={handleRefresh} className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors" title="Refresh data">
                  <RefreshCw size={16} className="text-white" />
                </button>

                {isAdmin && (
                  <label className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors cursor-pointer" title="Upload Quarterly P&L">
                    <Upload size={16} className="text-white" />
                    <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleUpload(e.target.files[0]); e.target.value = ''; } }} />
                  </label>
                )}

                <button onClick={() => window.print()} className="p-2 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors" title="Print">
                  <Printer size={16} className="text-white" />
                </button>

                <button onClick={() => signOut()} className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap">
                  Sign Out
                </button>
              </div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden">
              <div className="flex items-center justify-between mb-2">
                <img src="https://i.imgur.com/kkJMVz0.png" alt="Andy's Frozen Custard" className="h-10" />
                <div className="flex items-center gap-1">
                  <button onClick={handleRefresh} className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors" title="Refresh data">
                    <RefreshCw size={14} className="text-white" />
                  </button>
                  {isAdmin && (
                    <label className="p-1.5 bg-green-600 hover:bg-green-700 rounded-lg transition-colors cursor-pointer" title="Upload Quarterly P&L">
                      <Upload size={14} className="text-white" />
                      <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { handleUpload(e.target.files[0]); e.target.value = ''; } }} />
                    </label>
                  )}
                  <button onClick={() => signOut()} className="px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors">
                    Sign Out
                  </button>
                </div>
              </div>
              
              <select
                value="bonus"
                onChange={(e) => {
                  if (e.target.value === 'pl') {
                    router.push('/pl');
                  } else if (e.target.value !== 'bonus') {
                    router.push('/');
                    if (typeof window !== 'undefined') {
                      sessionStorage.setItem('pendingTab', e.target.value);
                    }
                  }
                }}
                className="w-full px-2 py-1.5 text-xs bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="sales">Weekly Sales & Labor</option>
                <option value="daily-sales">Daily Sales</option>
                <option value="daily-labor">Daily Labor</option>
                <option value="clockouts">Auto-Clockouts</option>
                <option value="call-offs">Call-Offs</option>
                <option value="overtime">OT Warnings</option>
                <option value="logbook">Logbook</option>
                <option value="scheduled-today">Scheduled Today</option>
                <option value="pl">Profit & Loss</option>
                <option value="bonus">Quarterly Bonus</option>
              </select>
            </div>
          </div>

          {/* Filters: Location, Period, Account Config */}
          <div className="no-print bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 mb-2 md:mb-3 shadow-lg">
            {/* Upload Result Banner */}
            {uploadResult && (
              <div className={`flex items-center gap-2 p-2 mb-2 rounded-lg text-sm ${uploadResult.success ? 'bg-green-900/50 border border-green-700 text-green-200' : 'bg-red-900/50 border border-red-700 text-red-200'}`}>
                {uploadResult.success ? <CheckCircle size={16} /> : <XCircle size={16} />}
                <span>{uploadResult.message}</span>
                <button onClick={() => setUploadResult(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">✕</button>
              </div>
            )}
            {uploading && (
              <div className="flex items-center gap-2 p-2 mb-2 rounded-lg text-sm bg-blue-900/50 border border-blue-700 text-blue-200">
                <RefreshCw size={14} className="animate-spin" />
                <span>Uploading quarterly P&L...</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2 md:gap-3 items-end">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-slate-400 mb-1">Location</label>
                <select value={selectedLocation} onChange={(e) => { setSelectedLocation(e.target.value); setSelectedPeriod(''); setPlData(null); }}
                  className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600">
                  <option value="">Select location...</option>
                  {availableLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-slate-400 mb-1">Quarter</label>
                <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600">
                  <option value="">Select quarter...</option>
                  {availablePeriods.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <button onClick={() => setShowAccountConfig(!showAccountConfig)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showAccountConfig ? 'bg-green-600 text-white' : 'bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600'}`}>
                  <Settings size={14} />
                  Accounts ({enabledCount}/{totalCount})
                </button>
              </div>
            </div>
          </div>

          {/* Account Configuration Panel */}
          {showAccountConfig && (
            <div className="no-print bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 mb-2 md:mb-3 shadow-lg">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">Account Selection</h2>
                <button onClick={resetDefaults} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Reset to Defaults</button>
              </div>
              <p className="text-slate-400 text-xs mb-3">Toggle accounts on/off to customize the controllable net income calculation.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(DEFAULT_ACCOUNTS).map(([sectionName, { items }]) => {
                  const isExpanded = expandedSections[sectionName] !== false;
                  const enabledInSection = items.filter(i => accountToggles[i.key]).length;
                  const allOn = enabledInSection === items.length;
                  const noneOn = enabledInSection === 0;
                  return (
                    <div key={sectionName} className="border border-slate-600 rounded-lg overflow-hidden bg-slate-800/50">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-700 cursor-pointer" onClick={() => toggleSection(sectionName)}>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                          <span className="text-sm font-medium text-white">{sectionName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{enabledInSection}/{items.length}</span>
                          <button onClick={(e) => { e.stopPropagation(); toggleAllInSection(sectionName, !allOn); }}
                            className={`text-xs px-2 py-0.5 rounded ${allOn ? 'bg-green-600/30 text-green-400' : noneOn ? 'bg-red-600/30 text-red-400' : 'bg-yellow-600/30 text-yellow-400'}`}>
                            {allOn ? 'All On' : noneOn ? 'All Off' : 'Mixed'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-3 py-2 space-y-1">
                          {items.map(item => (
                            <label key={item.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                              <input type="checkbox" checked={accountToggles[item.key]} onChange={() => toggleAccount(item.key)}
                                className="w-3.5 h-3.5 rounded border-slate-500 text-green-500 focus:ring-green-500 focus:ring-offset-0 bg-slate-600" />
                              <span className={`text-xs transition-colors ${accountToggles[item.key] ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{item.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* KPI Summary Cards */}
          {plData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-2 md:mb-3">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 shadow-lg">
                <div className="text-xs text-slate-400 mb-1">Net Sales</div>
                <div className="text-lg md:text-xl font-bold text-white">{formatCurrency(bonusCalc.current.sales)}</div>
                {bonusCalc.prior.sales !== 0 && <div className="text-xs text-slate-500 mt-1">Prior: {formatCurrency(bonusCalc.prior.sales)}</div>}
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 shadow-lg">
                <div className="text-xs text-slate-400 mb-1">Controllable Expenses</div>
                <div className="text-lg md:text-xl font-bold text-white">{formatCurrency(bonusCalc.current.expenses)}</div>
                {bonusCalc.prior.expenses !== 0 && <div className="text-xs text-slate-500 mt-1">Prior: {formatCurrency(bonusCalc.prior.expenses)}</div>}
              </div>
              <div className="bg-slate-800 border border-green-700/50 rounded-lg p-3 md:p-4 shadow-lg">
                <div className="text-xs text-green-400 mb-1">Controllable Net Income</div>
                <div className={`text-lg md:text-xl font-bold ${bonusCalc.current.controllableNI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(bonusCalc.current.controllableNI)}
                </div>
                {bonusCalc.prior.controllableNI !== 0 && <div className="text-xs text-slate-500 mt-1">Prior: {formatCurrency(bonusCalc.prior.controllableNI)}</div>}
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 shadow-lg">
                <div className="text-xs text-slate-400 mb-1">CNI % of Sales</div>
                <div className={`text-lg md:text-xl font-bold ${bonusCalc.current.controllableNI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {bonusCalc.current.sales !== 0 ? formatPercent((bonusCalc.current.controllableNI / bonusCalc.current.sales) * 100) : '0.0%'}
                </div>
                {bonusCalc.prior.sales !== 0 && <div className="text-xs text-slate-500 mt-1">Prior: {formatPercent((bonusCalc.prior.controllableNI / bonusCalc.prior.sales) * 100)}</div>}
              </div>
            </div>
          )}

          {/* Detailed Breakdown Table */}
          {plData && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden shadow-lg">
              <div className="bg-slate-700 px-3 md:px-4 py-2 md:py-3">
                <div className="grid grid-cols-12 gap-1 md:gap-2 text-xs font-semibold text-slate-300">
                  <div className="col-span-4">Account</div>
                  <div className="col-span-2 text-right">{columnLabels.col1}</div>
                  <div className="col-span-2 text-right">% of Sales</div>
                  <div className="col-span-2 text-right">{columnLabels.col2}</div>
                  <div className="col-span-2 text-right">% of Sales</div>
                </div>
              </div>

              {Object.entries(DEFAULT_ACCOUNTS).map(([sectionName, { items }]) => {
                const activeItems = items.filter(i => accountToggles[i.key]);
                if (activeItems.length === 0) return null;
                let sectionCurrentTotal = 0, sectionPriorTotal = 0;
                activeItems.forEach(item => {
                  sectionCurrentTotal += getLineValue(item.key, 'current');
                  sectionPriorTotal += getLineValue(item.key, 'prior');
                });
                return (
                  <div key={sectionName}>
                    <div className="bg-slate-700/50 px-3 md:px-4 py-1.5 md:py-2 border-t border-slate-600">
                      <div className="grid grid-cols-12 gap-1 md:gap-2">
                        <div className="col-span-4 text-xs md:text-sm font-semibold text-blue-400">{sectionName}</div>
                        <div className="col-span-2 text-right text-xs md:text-sm font-semibold text-white">{formatCurrency(sectionCurrentTotal)}</div>
                        <div className="col-span-2 text-right text-xs md:text-sm text-slate-400">{bonusCalc.current.sales !== 0 ? formatPercent((sectionCurrentTotal / bonusCalc.current.sales) * 100) : '-'}</div>
                        <div className="col-span-2 text-right text-xs md:text-sm font-semibold text-slate-300">{formatCurrency(sectionPriorTotal)}</div>
                        <div className="col-span-2 text-right text-xs md:text-sm text-slate-400">{bonusCalc.prior.sales !== 0 ? formatPercent((sectionPriorTotal / bonusCalc.prior.sales) * 100) : '-'}</div>
                      </div>
                    </div>
                    {activeItems.map(item => {
                      const currentVal = getLineValue(item.key, 'current');
                      const priorVal = getLineValue(item.key, 'prior');
                      if (currentVal === 0 && priorVal === 0) return null;
                      return (
                        <div key={item.key} className="px-3 md:px-4 py-1 md:py-1.5 border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                          <div className="grid grid-cols-12 gap-1 md:gap-2">
                            <div className="col-span-4 text-xs md:text-sm text-slate-300 pl-3 md:pl-4">{item.label}</div>
                            <div className="col-span-2 text-right text-xs md:text-sm text-white">{formatCurrency(currentVal)}</div>
                            <div className="col-span-2 text-right text-xs md:text-sm text-slate-500">{bonusCalc.current.sales !== 0 ? formatPercent((currentVal / bonusCalc.current.sales) * 100) : '-'}</div>
                            <div className="col-span-2 text-right text-xs md:text-sm text-slate-400">{formatCurrency(priorVal)}</div>
                            <div className="col-span-2 text-right text-xs md:text-sm text-slate-500">{bonusCalc.prior.sales !== 0 ? formatPercent((priorVal / bonusCalc.prior.sales) * 100) : '-'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* CNI Total Row */}
              <div className="bg-slate-700 px-3 md:px-4 py-2 md:py-3 border-t-2 border-green-600/50">
                <div className="grid grid-cols-12 gap-1 md:gap-2">
                  <div className="col-span-4 text-xs md:text-sm font-bold text-green-400">Controllable Net Income</div>
                  <div className={`col-span-2 text-right text-xs md:text-sm font-bold ${bonusCalc.current.controllableNI >= 0 ? 'text-green-400' : 'text-red-400'}`}>{formatCurrency(bonusCalc.current.controllableNI)}</div>
                  <div className="col-span-2 text-right text-xs md:text-sm font-bold text-green-400">{bonusCalc.current.sales !== 0 ? formatPercent((bonusCalc.current.controllableNI / bonusCalc.current.sales) * 100) : '-'}</div>
                  <div className={`col-span-2 text-right text-xs md:text-sm font-bold ${bonusCalc.prior.controllableNI >= 0 ? 'text-green-300' : 'text-red-300'}`}>{formatCurrency(bonusCalc.prior.controllableNI)}</div>
                  <div className="col-span-2 text-right text-xs md:text-sm font-bold text-slate-300">{bonusCalc.prior.sales !== 0 ? formatPercent((bonusCalc.prior.controllableNI / bonusCalc.prior.sales) * 100) : '-'}</div>
                </div>
              </div>
            </div>
          )}

          {/* States */}
          {loading && !plData && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400 shadow-lg">Loading...</div>
          )}
          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200 shadow-lg">{error}</div>
          )}
          {!loading && !error && !plData && selectedLocation && selectedPeriod && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400 shadow-lg">No data found for this location and period.</div>
          )}
          {!loading && !error && !selectedLocation && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400 shadow-lg">Select a location to view the bonus calculation.</div>
          )}
        </div>
      </div>
    </>
  );
}
