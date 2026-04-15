import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ChevronDown, ChevronRight, Settings, DollarSign, Calculator } from 'lucide-react';

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
  if (val === null || val === undefined || isNaN(val)) return '$0.00';
  const negative = val < 0;
  const formatted = Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return negative ? `($${formatted})` : `$${formatted}`;
};

const formatPercent = (val) => {
  if (val === null || val === undefined || isNaN(val)) return '0.0%';
  return val.toFixed(1) + '%';
};

export default function BonusDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessType, setAccessType] = useState('none');
  const [availableLocations, setAvailableLocations] = useState([]);
  const [availablePeriods, setAvailablePeriods] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [plData, setPlData] = useState(null);
  const [reportType, setReportType] = useState('quarterly');

  // Account toggles - which accounts are included in controllable NI
  const [accountToggles, setAccountToggles] = useState(() => {
    const toggles = {};
    Object.entries(DEFAULT_ACCOUNTS).forEach(([section, { items }]) => {
      items.forEach(item => {
        toggles[item.key] = item.defaultOn;
      });
    });
    return toggles;
  });

  // UI state
  const [showAccountConfig, setShowAccountConfig] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  // Load available locations on mount
  useEffect(() => {
    if (status === 'authenticated') {
      loadLocations();
    }
  }, [status, reportType]);

  // Load periods when location changes
  useEffect(() => {
    if (selectedLocation) {
      loadPeriods(selectedLocation);
    }
  }, [selectedLocation, reportType]);

  // Load data when period changes
  useEffect(() => {
    if (selectedLocation && selectedPeriod) {
      loadPlData(selectedLocation, selectedPeriod);
    }
  }, [selectedLocation, selectedPeriod]);

  const loadLocations = async () => {
    try {
      const res = await fetch(`/api/get-pl?reportType=${reportType}`);
      const data = await res.json();
      if (res.ok) {
        setAccessType(data.accessType || 'all');
        setAvailableLocations(data.availableLocations || []);
        if (data.availableLocations?.length > 0 && !selectedLocation) {
          setSelectedLocation(data.availableLocations[0]);
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
        if (data.periods.length > 0) {
          setSelectedPeriod(data.periods[0]);
        }
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

  // Get a line item value from plData.rows array (MongoDB storage format)
  // "period" field = col B (current quarter), "ytd" field = col D (prior quarter)
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

  // Calculate controllable net income based on toggled accounts
  const calculateBonus = useCallback(() => {
    if (!plData) return { current: { sales: 0, expenses: 0, controllableNI: 0 }, prior: { sales: 0, expenses: 0, controllableNI: 0 } };

    let currentSales = 0;
    let currentExpenses = 0;
    let priorSales = 0;
    let priorExpenses = 0;

    Object.entries(DEFAULT_ACCOUNTS).forEach(([section, { items }]) => {
      items.forEach(item => {
        if (!accountToggles[item.key]) return;
        const currentVal = getLineValue(item.key, 'current');
        const priorVal = getLineValue(item.key, 'prior');

        if (item.isSales) {
          currentSales += currentVal;
          priorSales += priorVal;
        } else {
          currentExpenses += currentVal;
          priorExpenses += priorVal;
        }
      });
    });

    return {
      current: {
        sales: currentSales,
        expenses: currentExpenses,
        controllableNI: currentSales - currentExpenses,
      },
      prior: {
        sales: priorSales,
        expenses: priorExpenses,
        controllableNI: priorSales - priorExpenses,
      }
    };
  }, [plData, accountToggles, getLineValue]);

  const bonusCalc = calculateBonus();

  const toggleAccount = (key) => {
    setAccountToggles(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleAllInSection = (sectionName, value) => {
    const updates = {};
    DEFAULT_ACCOUNTS[sectionName].items.forEach(item => {
      updates[item.key] = value;
    });
    setAccountToggles(prev => ({ ...prev, ...updates }));
  };

  const resetDefaults = () => {
    const toggles = {};
    Object.entries(DEFAULT_ACCOUNTS).forEach(([section, { items }]) => {
      items.forEach(item => {
        toggles[item.key] = item.defaultOn;
      });
    });
    setAccountToggles(toggles);
  };

  // Column header labels based on report type
  const getColumnLabels = () => {
    switch (reportType) {
      case 'quarterly':
        return {
          col1: plData?.quarterLabel || 'Current Quarter',
          col2: plData?.priorQuarterLabel || 'Prior Quarter'
        };
      case 'current-prior':
        return { col1: 'Current Period', col2: 'Prior Year Period' };
      case 'ytd-prior-ytd':
        return { col1: 'YTD', col2: 'Prior YTD' };
      case 'period-ytd':
      default:
        return { col1: 'Period', col2: 'YTD' };
    }
  };

  const columnLabels = getColumnLabels();

  // Auth
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Bonus Dashboard</h1>
          <p className="text-slate-400 mb-6">Sign in to access the quarterly bonus calculator.</p>
          <button onClick={() => signIn('google')} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg w-full transition-colors">
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const enabledCount = Object.values(accountToggles).filter(Boolean).length;
  const totalCount = Object.values(accountToggles).length;

  return (
    <>
      <Head>
        <title>Bonus Dashboard | Andy&apos;s Frozen Custard</title>
        <style>{`
          @media print {
            .no-print { display: none !important; }
            .text-slate-300, .text-slate-400, .text-slate-500, .text-white {
              color: black !important;
            }
          }
        `}</style>
      </Head>

      <div className="min-h-screen bg-slate-900">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 px-4 py-3 no-print">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/')} className="text-slate-400 hover:text-white text-sm transition-colors">
                ← Dashboard
              </button>
              <span className="text-slate-600">|</span>
              <h1 className="text-lg font-bold text-white flex items-center gap-2">
                <Calculator className="w-5 h-5 text-green-400" />
                Quarterly Bonus
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/pl')} className="text-slate-400 hover:text-white text-sm transition-colors">
                P&L View
              </button>
              <span className="text-slate-500 text-sm">{session.user.email}</span>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

          {/* Filters Row */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 no-print">
            <div className="flex flex-wrap gap-4 items-end">
              {/* Report Type */}
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-slate-400 mb-1">Report Type</label>
                <select
                  value={reportType}
                  onChange={(e) => {
                    setReportType(e.target.value);
                    setSelectedPeriod('');
                    setPlData(null);
                  }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="quarterly">Quarterly</option>
                  <option value="period-ytd">Period / YTD</option>
                  <option value="current-prior">Current / Prior Year</option>
                  <option value="ytd-prior-ytd">YTD / Prior YTD</option>
                </select>
              </div>

              {/* Location */}
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-slate-400 mb-1">Location</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => {
                    setSelectedLocation(e.target.value);
                    setSelectedPeriod('');
                    setPlData(null);
                  }}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="">Select location...</option>
                  {availableLocations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>

              {/* Period */}
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs text-slate-400 mb-1">Period</label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm"
                >
                  <option value="">Select period...</option>
                  {availablePeriods.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Configure Accounts Button */}
              <div>
                <button
                  onClick={() => setShowAccountConfig(!showAccountConfig)}
                  className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors ${
                    showAccountConfig 
                      ? 'bg-green-600 text-white' 
                      : 'bg-slate-700 border border-slate-600 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  Accounts ({enabledCount}/{totalCount})
                </button>
              </div>
            </div>
          </div>

          {/* Account Configuration Panel */}
          {showAccountConfig && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 no-print">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Account Selection</h2>
                <button
                  onClick={resetDefaults}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Reset to Defaults
                </button>
              </div>
              <p className="text-slate-400 text-sm mb-4">
                Toggle accounts on/off to customize the controllable net income calculation. Checked accounts are included.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {Object.entries(DEFAULT_ACCOUNTS).map(([sectionName, { items }]) => {
                  const isExpanded = expandedSections[sectionName] !== false;
                  const enabledInSection = items.filter(i => accountToggles[i.key]).length;
                  const allOn = enabledInSection === items.length;
                  const noneOn = enabledInSection === 0;

                  return (
                    <div key={sectionName} className="border border-slate-600 rounded-lg overflow-hidden" style={{ backgroundColor: 'rgb(40, 48, 64)' }}>
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-700 cursor-pointer" onClick={() => toggleSection(sectionName)}>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                          <span className="text-sm font-medium text-white">{sectionName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{enabledInSection}/{items.length}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleAllInSection(sectionName, !allOn); }}
                            className={`text-xs px-2 py-0.5 rounded ${allOn ? 'bg-green-600/30 text-green-400' : noneOn ? 'bg-red-600/30 text-red-400' : 'bg-yellow-600/30 text-yellow-400'}`}
                          >
                            {allOn ? 'All On' : noneOn ? 'All Off' : 'Mixed'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-3 py-2 space-y-1">
                          {items.map(item => (
                            <label key={item.key} className="flex items-center gap-2 cursor-pointer group py-0.5">
                              <input
                                type="checkbox"
                                checked={accountToggles[item.key]}
                                onChange={() => toggleAccount(item.key)}
                                className="w-4 h-4 rounded border-slate-500 text-green-500 focus:ring-green-500 focus:ring-offset-0 bg-slate-600"
                              />
                              <span className={`text-sm transition-colors ${accountToggles[item.key] ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                                {item.label}
                              </span>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-xs text-slate-400 mb-1">Net Sales</div>
                <div className="text-xl font-bold text-white">{formatCurrency(bonusCalc.current.sales)}</div>
                {bonusCalc.prior.sales !== 0 && (
                  <div className="text-xs text-slate-500 mt-1">Prior: {formatCurrency(bonusCalc.prior.sales)}</div>
                )}
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-xs text-slate-400 mb-1">Total Controllable Expenses</div>
                <div className="text-xl font-bold text-white">{formatCurrency(bonusCalc.current.expenses)}</div>
                {bonusCalc.prior.expenses !== 0 && (
                  <div className="text-xs text-slate-500 mt-1">Prior: {formatCurrency(bonusCalc.prior.expenses)}</div>
                )}
              </div>

              <div className="bg-slate-800 border border-green-700/50 rounded-lg p-4">
                <div className="text-xs text-green-400 mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Controllable Net Income
                </div>
                <div className={`text-xl font-bold ${bonusCalc.current.controllableNI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(bonusCalc.current.controllableNI)}
                </div>
                {bonusCalc.prior.controllableNI !== 0 && (
                  <div className="text-xs text-slate-500 mt-1">Prior: {formatCurrency(bonusCalc.prior.controllableNI)}</div>
                )}
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div className="text-xs text-slate-400 mb-1">CNI % of Sales</div>
                <div className={`text-xl font-bold ${bonusCalc.current.controllableNI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {bonusCalc.current.sales !== 0 ? formatPercent((bonusCalc.current.controllableNI / bonusCalc.current.sales) * 100) : '0.0%'}
                </div>
                {bonusCalc.prior.sales !== 0 && (
                  <div className="text-xs text-slate-500 mt-1">
                    Prior: {formatPercent((bonusCalc.prior.controllableNI / bonusCalc.prior.sales) * 100)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detailed Breakdown by Section */}
          {plData && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
              {/* Table Header */}
              <div className="bg-slate-700 px-4 py-3">
                <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-300">
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

                let sectionCurrentTotal = 0;
                let sectionPriorTotal = 0;
                activeItems.forEach(item => {
                  sectionCurrentTotal += getLineValue(item.key, 'current');
                  sectionPriorTotal += getLineValue(item.key, 'prior');
                });

                return (
                  <div key={sectionName}>
                    <div className="bg-slate-700/50 px-4 py-2 border-t border-slate-600">
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-4 text-sm font-semibold text-blue-400">{sectionName}</div>
                        <div className="col-span-2 text-right text-sm font-semibold text-white">
                          {formatCurrency(sectionCurrentTotal)}
                        </div>
                        <div className="col-span-2 text-right text-sm text-slate-400">
                          {bonusCalc.current.sales !== 0 ? formatPercent((sectionCurrentTotal / bonusCalc.current.sales) * 100) : '-'}
                        </div>
                        <div className="col-span-2 text-right text-sm font-semibold text-slate-300">
                          {formatCurrency(sectionPriorTotal)}
                        </div>
                        <div className="col-span-2 text-right text-sm text-slate-400">
                          {bonusCalc.prior.sales !== 0 ? formatPercent((sectionPriorTotal / bonusCalc.prior.sales) * 100) : '-'}
                        </div>
                      </div>
                    </div>

                    {activeItems.map(item => {
                      const currentVal = getLineValue(item.key, 'current');
                      const priorVal = getLineValue(item.key, 'prior');
                      if (currentVal === 0 && priorVal === 0) return null;

                      return (
                        <div key={item.key} className="px-4 py-1.5 border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-4 text-sm text-slate-300 pl-4">{item.label}</div>
                            <div className="col-span-2 text-right text-sm text-white">{formatCurrency(currentVal)}</div>
                            <div className="col-span-2 text-right text-sm text-slate-500">
                              {bonusCalc.current.sales !== 0 ? formatPercent((currentVal / bonusCalc.current.sales) * 100) : '-'}
                            </div>
                            <div className="col-span-2 text-right text-sm text-slate-400">{formatCurrency(priorVal)}</div>
                            <div className="col-span-2 text-right text-sm text-slate-500">
                              {bonusCalc.prior.sales !== 0 ? formatPercent((priorVal / bonusCalc.prior.sales) * 100) : '-'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Controllable NI Total Row */}
              <div className="bg-slate-700 px-4 py-3 border-t-2 border-green-600/50">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4 text-sm font-bold text-green-400">Controllable Net Income</div>
                  <div className={`col-span-2 text-right text-sm font-bold ${bonusCalc.current.controllableNI >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(bonusCalc.current.controllableNI)}
                  </div>
                  <div className="col-span-2 text-right text-sm font-bold text-green-400">
                    {bonusCalc.current.sales !== 0 ? formatPercent((bonusCalc.current.controllableNI / bonusCalc.current.sales) * 100) : '-'}
                  </div>
                  <div className={`col-span-2 text-right text-sm font-bold ${bonusCalc.prior.controllableNI >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                    {formatCurrency(bonusCalc.prior.controllableNI)}
                  </div>
                  <div className="col-span-2 text-right text-sm font-bold text-slate-300">
                    {bonusCalc.prior.sales !== 0 ? formatPercent((bonusCalc.prior.controllableNI / bonusCalc.prior.sales) * 100) : '-'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading / Error / Empty States */}
          {loading && !plData && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
              Loading...
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-red-200">
              {error}
            </div>
          )}

          {!loading && !error && !plData && selectedLocation && selectedPeriod && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
              No P&L data found for this location and period.
            </div>
          )}

          {!loading && !error && !selectedLocation && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
              Select a location to view the bonus calculation.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
