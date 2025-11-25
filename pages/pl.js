import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ChevronDown, ChevronRight, RefreshCw, Upload } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default function PLDashboard() {
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
  const [expandedSections, setExpandedSections] = useState({
    'Sales': true,
    'Prime Cost': true,
    'Operating Expense': false,
    'Non Controllable Expense': false
  });

  const isAdmin = session?.user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (status === 'authenticated') {
      loadInitialData();
    }
  }, [status]);

  useEffect(() => {
    if (selectedLocation) {
      loadPeriodsForLocation(selectedLocation);
    }
  }, [selectedLocation]);

  useEffect(() => {
    if (selectedLocation && selectedPeriod) {
      loadPLData(selectedLocation, selectedPeriod);
    }
  }, [selectedLocation, selectedPeriod]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/get-pl');
      const data = await res.json();
      
      if (res.ok) {
        setAccessType(data.accessType);
        setAvailableLocations(data.availableLocations || []);
        if (data.availableLocations?.length > 0) {
          setSelectedLocation(data.availableLocations[0]);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriodsForLocation = async (location) => {
    try {
      const res = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}&listPeriods=true`);
      const data = await res.json();
      
      if (res.ok && data.periods) {
        setAvailablePeriods(data.periods);
        if (data.periods.length > 0) {
          setSelectedPeriod(data.periods[0]);
        }
      }
    } catch (err) {
      console.error('Error loading periods:', err);
    }
  };

  const loadPLData = async (location, period) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}&period=${encodeURIComponent(period)}`);
      const data = await res.json();
      
      if (res.ok) {
        setPlData(data.data);
        setError(null);
      } else {
        setError(data.error);
        setPlData(null);
      }
    } catch (err) {
      setError(err.message);
      setPlData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (selectedLocation && selectedPeriod) {
      loadPLData(selectedLocation, selectedPeriod);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const formatCurrency = (value, showZero = true) => {
    if (value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    if (num === 0 && !showZero) return '';
    if (num === 0) return '0';
    const formatted = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return num < 0 ? `(${formatted})` : formatted;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(1) + '%';
  };

  const formatKPICurrency = (value) => {
    if (value === null || value === undefined) return '$0';
    const num = parseFloat(value);
    if (isNaN(num)) return '$0';
    const formatted = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return num < 0 ? `-$${formatted}` : `$${formatted}`;
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <button
          onClick={() => signIn('google')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Sign in to view P&L
        </button>
      </div>
    );
  }

  // Main section headers
  const sectionHeaders = ['Sales', 'Prime Cost', 'Operating Expense', 'Non Controllable Expense'];
  
  // Sub-categories within sections
  const subCategoryLabels = [
    'Comps & Discounts', 'Food and Paper Cost', 'Salaries and Wages',
    'Payroll Taxes', 'Payroll Benefits', 'Direct Operating Expense',
    'Utilities', 'Advertising', 'General and Administrative',
    'Occupancy Costs', 'Depreciation and Amortization'
  ];

  // Process rows and calculate totals
  const processData = (rows) => {
    if (!rows) return { sections: {}, kpis: {} };
    
    const sections = {
      'Sales': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } },
      'Prime Cost': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } },
      'Operating Expense': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } },
      'Non Controllable Expense': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } },
      'Net Profit': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } }
    };
    
    let currentSection = '';
    let currentSubCategory = '';
    let subCategoryTotals = {};
    
    // KPIs we need to extract
    let totalSales = { period: 0, ytd: 0 };
    let totalFoodPaper = { period: 0, ytd: 0 };
    let totalSalariesWages = { period: 0, ytd: 0 };
    let netProfit = { period: 0, ytd: 0 };
    
    for (const row of rows) {
      const label = row.label?.trim();
      
      // Detect section changes
      if (sectionHeaders.includes(label) && !label.startsWith('Total')) {
        currentSection = label;
        currentSubCategory = '';
        continue;
      }
      
      if (label === 'Net Profit') {
        currentSection = 'Net Profit';
        netProfit.period = row.period || 0;
        netProfit.ytd = row.ytd || 0;
        sections['Net Profit'].rows.push({
          ...row,
          rowType: 'netProfit'
        });
        sections['Net Profit'].total = {
          period: row.period,
          ytd: row.ytd,
          periodPercent: row.periodPercent,
          ytdPercent: row.ytdPercent
        };
        continue;
      }
      
      if (!currentSection || !sections[currentSection]) continue;
      
      // Check for sub-category header (no values)
      const isSubCategoryHeader = subCategoryLabels.includes(label) && 
        (row.period === null || row.period === undefined) && 
        (row.ytd === null || row.ytd === undefined);
      
      // Check for Total rows
      const isTotalRow = label?.startsWith('Total ');
      const isSubCategoryTotal = isTotalRow && subCategoryLabels.includes(label.replace('Total ', ''));
      const isSectionTotal = isTotalRow && sectionHeaders.includes(label.replace('Total ', ''));
      
      if (isSubCategoryHeader) {
        currentSubCategory = label;
        subCategoryTotals[label] = { period: 0, ytd: 0 };
        sections[currentSection].rows.push({
          ...row,
          rowType: 'subCategoryHeader'
        });
      } else if (isSectionTotal) {
        // Use the actual total if available, otherwise calculate
        const calcTotal = sections[currentSection].total;
        const actualPeriod = (row.period !== null && row.period !== undefined && row.period !== 0) 
          ? row.period : calcTotal.period;
        const actualYtd = (row.ytd !== null && row.ytd !== undefined && row.ytd !== 0) 
          ? row.ytd : calcTotal.ytd;
        
        sections[currentSection].total = {
          period: actualPeriod,
          ytd: actualYtd,
          periodPercent: row.periodPercent,
          ytdPercent: row.ytdPercent
        };
        
        // Extract KPIs
        if (label === 'Total Sales') {
          totalSales = { period: actualPeriod, ytd: actualYtd };
        }
        
        sections[currentSection].rows.push({
          ...row,
          period: actualPeriod,
          ytd: actualYtd,
          rowType: 'sectionTotal'
        });
      } else if (isSubCategoryTotal) {
        const subCatName = label.replace('Total ', '');
        const calculated = subCategoryTotals[subCatName] || { period: 0, ytd: 0 };
        const actualPeriod = (row.period !== null && row.period !== undefined && row.period !== 0) 
          ? row.period : calculated.period;
        const actualYtd = (row.ytd !== null && row.ytd !== undefined && row.ytd !== 0) 
          ? row.ytd : calculated.ytd;
        
        // Extract specific KPIs
        if (subCatName === 'Food and Paper Cost') {
          totalFoodPaper = { period: actualPeriod, ytd: actualYtd };
        } else if (subCatName === 'Salaries and Wages') {
          totalSalariesWages = { period: actualPeriod, ytd: actualYtd };
        }
        
        sections[currentSection].rows.push({
          ...row,
          period: actualPeriod,
          ytd: actualYtd,
          rowType: 'subCategoryTotal'
        });
        currentSubCategory = '';
      } else {
        // Regular line item - skip zero values
        if (row.period === 0 && row.ytd === 0) continue;
        
        // Add to running totals
        const periodVal = parseFloat(row.period) || 0;
        const ytdVal = parseFloat(row.ytd) || 0;
        
        sections[currentSection].total.period += periodVal;
        sections[currentSection].total.ytd += ytdVal;
        
        if (currentSubCategory && subCategoryTotals[currentSubCategory]) {
          subCategoryTotals[currentSubCategory].period += periodVal;
          subCategoryTotals[currentSubCategory].ytd += ytdVal;
        }
        
        sections[currentSection].rows.push({
          ...row,
          rowType: 'lineItem',
          indent: currentSubCategory ? 1 : 0
        });
      }
    }
    
    return {
      sections,
      kpis: {
        sales: totalSales,
        cogs: totalFoodPaper,
        labor: totalSalariesWages,
        netIncome: netProfit
      }
    };
  };

  const { sections, kpis } = plData ? processData(plData.rows) : { sections: {}, kpis: {} };

  const renderRow = (row, idx) => {
    let bgClass = '';
    let textClass = 'text-slate-300';
    let fontClass = 'text-sm';
    let paddingClass = 'pl-3';
    
    switch (row.rowType) {
      case 'subCategoryHeader':
        return (
          <tr key={idx} className="border-b border-slate-700/30">
            <td colSpan={5} className="py-2 pl-3 text-slate-400 text-xs font-medium uppercase tracking-wide">
              {row.label}
            </td>
          </tr>
        );
      case 'lineItem':
        paddingClass = row.indent ? 'pl-6' : 'pl-3';
        break;
      case 'subCategoryTotal':
        bgClass = 'bg-slate-700/30';
        textClass = 'text-slate-200';
        fontClass = 'text-sm font-medium';
        paddingClass = 'pl-4';
        break;
      case 'sectionTotal':
        bgClass = 'bg-slate-700/50';
        textClass = 'text-white';
        fontClass = 'text-sm font-semibold';
        break;
      case 'netProfit':
        const profit = row.period || 0;
        bgClass = profit >= 0 ? 'bg-green-900/40' : 'bg-red-900/40';
        textClass = profit >= 0 ? 'text-green-400' : 'text-red-400';
        fontClass = 'text-sm font-bold';
        break;
    }

    return (
      <tr key={idx} className={`${bgClass} border-b border-slate-700/30`}>
        <td className={`py-1.5 ${paddingClass} ${textClass} ${fontClass}`} style={{ width: '40%' }}>
          {row.label}
        </td>
        <td className={`py-1.5 px-2 text-right ${textClass} ${fontClass} tabular-nums`} style={{ width: '15%' }}>
          {formatCurrency(row.period)}
        </td>
        <td className="py-1.5 px-2 text-right text-slate-400 text-sm tabular-nums" style={{ width: '10%' }}>
          {formatPercent(row.periodPercent)}
        </td>
        <td className={`py-1.5 px-2 text-right ${textClass} ${fontClass} tabular-nums hidden md:table-cell`} style={{ width: '15%' }}>
          {formatCurrency(row.ytd)}
        </td>
        <td className="py-1.5 px-2 text-right text-slate-400 text-sm tabular-nums hidden md:table-cell" style={{ width: '10%' }}>
          {formatPercent(row.ytdPercent)}
        </td>
      </tr>
    );
  };

  const renderSection = (sectionName, sectionData) => {
    if (!sectionData || sectionData.rows.length === 0) return null;
    
    const isExpanded = expandedSections[sectionName];
    const total = sectionData.total;
    
    // Special styling for Net Profit
    const isNetProfit = sectionName === 'Net Profit';
    const profitPositive = isNetProfit && total && (total.period || 0) >= 0;
    
    return (
      <div key={sectionName} className="mb-2">
        <button
          onClick={() => toggleSection(sectionName)}
          className={`w-full flex items-center px-3 py-2 rounded-t-lg transition-colors ${
            isNetProfit 
              ? (profitPositive ? 'bg-green-900/50 hover:bg-green-900/60' : 'bg-red-900/50 hover:bg-red-900/60')
              : 'bg-slate-800 hover:bg-slate-750'
          } border border-slate-700`}
        >
          <div className="flex items-center gap-2 text-white">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="font-semibold">{sectionName}</span>
          </div>
        </button>
        
        {isExpanded && (
          <div className="bg-slate-800/50 border border-t-0 border-slate-700 rounded-b-lg overflow-hidden">
            <table className="w-full table-fixed">
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '15%' }} className="hidden md:table-column" />
                <col style={{ width: '10%' }} className="hidden md:table-column" />
              </colgroup>
              <tbody>
                {sectionData.rows.map((row, idx) => renderRow(row, idx))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // KPI Card component
  const KPICard = ({ label, value, color = 'blue' }) => {
    const colorClasses = {
      blue: 'border-blue-500/30 bg-blue-900/20',
      green: 'border-green-500/30 bg-green-900/20',
      orange: 'border-orange-500/30 bg-orange-900/20',
      purple: 'border-purple-500/30 bg-purple-900/20',
      red: 'border-red-500/30 bg-red-900/20'
    };
    
    const textColors = {
      blue: 'text-blue-400',
      green: 'text-green-400',
      orange: 'text-orange-400',
      purple: 'text-purple-400',
      red: 'text-red-400'
    };
    
    const isNegative = typeof value === 'number' && value < 0;
    const displayColor = isNegative ? 'red' : color;
    
    return (
      <div className={`rounded-lg border ${colorClasses[displayColor]} p-3`}>
        <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</div>
        <div className={`text-xl font-bold ${textColors[displayColor]}`}>
          {formatKPICurrency(value)}
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>P&L Dashboard - Andy's Frozen Custard</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">
          
          {/* Main Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 mb-3 shadow-2xl">
            {/* Desktop Header */}
            <div className="hidden md:flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img 
                  src="https://i.imgur.com/kkJMVz0.png" 
                  alt="Andy's Frozen Custard" 
                  className="h-16"
                />
                <h1 className="text-2xl font-bold text-white">R365 Dashboards</h1>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-400 whitespace-nowrap">Select Dashboard:</label>
                <select
                  value="pl"
                  onChange={(e) => {
                    if (e.target.value !== 'pl') {
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
                  <option value="scheduled-today">Scheduled Today</option>
                  <option value="pl">Profit & Loss</option>
                </select>
                
                <button
                  onClick={handleRefresh}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw size={16} className="text-white" />
                </button>

                {isAdmin && (
                  <button
                    onClick={() => router.push('/pl-upload')}
                    className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    title="Upload P&L"
                  >
                    <Upload size={16} className="text-white" />
                  </button>
                )}

                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between mb-3">
              <img 
                src="https://i.imgur.com/kkJMVz0.png" 
                alt="Andy's Frozen Custard" 
                className="h-12"
              />
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => router.push('/pl-upload')}
                    className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    title="Upload P&L"
                  >
                    <Upload size={16} className="text-white" />
                  </button>
                )}
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Mobile Dropdown */}
            <div className="md:hidden flex items-center gap-2">
              <select
                value="pl"
                onChange={(e) => {
                  if (e.target.value !== 'pl') {
                    router.push('/');
                    if (typeof window !== 'undefined') {
                      sessionStorage.setItem('pendingTab', e.target.value);
                    }
                  }
                }}
                className="flex-1 px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="sales">Weekly Sales & Labor</option>
                <option value="daily-sales">Daily Sales</option>
                <option value="daily-labor">Daily Labor</option>
                <option value="clockouts">Auto-Clockouts</option>
                <option value="call-offs">Call-Offs</option>
                <option value="scheduled-today">Scheduled Today</option>
                <option value="pl">Profit & Loss</option>
              </select>
              
              <button
                onClick={handleRefresh}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                title="Refresh data"
              >
                <RefreshCw size={16} className="text-white" />
              </button>
            </div>
          </div>

          {/* Location & Period Selection - Same Line */}
          {accessType !== 'none' && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-400">Location:</label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {availableLocations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-slate-400">Period:</label>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="px-3 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {availablePeriods.map(period => (
                      <option key={period} value={period}>{period}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          {plData && !loading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <KPICard label="Sales" value={kpis.sales?.period} color="blue" />
              <KPICard label="COGS" value={kpis.cogs?.period} color="orange" />
              <KPICard label="Labor" value={kpis.labor?.period} color="purple" />
              <KPICard label="Net Income" value={kpis.netIncome?.period} color={kpis.netIncome?.period >= 0 ? 'green' : 'red'} />
            </div>
          )}

          {/* Column Headers */}
          {plData && !loading && (
            <div className="bg-slate-700/50 border border-slate-600 rounded-lg mb-3 overflow-hidden">
              <table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '15%' }} className="hidden md:table-column" />
                  <col style={{ width: '10%' }} className="hidden md:table-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="py-2 px-3 text-left text-sm font-semibold text-slate-300"></th>
                    <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300">Period</th>
                    <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300">%</th>
                    <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300 hidden md:table-cell">YTD</th>
                    <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300 hidden md:table-cell">%</th>
                  </tr>
                </thead>
              </table>
            </div>
          )}

          {/* No Access State */}
          {accessType === 'none' && !loading && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <div className="text-white text-xl mb-2">No P&L Access</div>
              <div className="text-slate-400">Contact your administrator for access.</div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <div className="text-slate-400">Loading P&L data...</div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {/* P&L Data Sections */}
          {plData && !loading && (
            <>
              {renderSection('Sales', sections['Sales'])}
              {renderSection('Prime Cost', sections['Prime Cost'])}
              {renderSection('Operating Expense', sections['Operating Expense'])}
              {renderSection('Non Controllable Expense', sections['Non Controllable Expense'])}
              {renderSection('Net Profit', sections['Net Profit'])}
            </>
          )}

          {/* No Data State */}
          {!plData && !loading && !error && accessType !== 'none' && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center text-slate-400">
              No P&L data available. {isAdmin ? 'Click the upload button to add P&L data.' : 'Contact admin to upload data.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
