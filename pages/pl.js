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
    'Operating Expense': true,
    'Non Controllable Expense': true
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

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '—';
    const num = parseFloat(value);
    if (isNaN(num)) return '—';
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

  // Categories that are ONLY headers (never have their own values)
  const pureHeaderLabels = [
    'Sales', 'Prime Cost', 'Operating Expense', 'Non Controllable Expense', 'Net Profit'
  ];

  // Sub-categories that group line items (shown as headers within sections)
  const subCategoryLabels = [
    'Comps & Discounts', 'Food and Paper Cost', 'Salaries and Wages',
    'Payroll Taxes', 'Payroll Benefits', 'Direct Operating Expense',
    'Utilities', 'Advertising', 'General and Administrative',
    'Occupancy Costs', 'Depreciation and Amortization'
  ];

  const groupRowsBySection = (rows) => {
    if (!rows) return {};
    
    const sections = {
      'Sales': [],
      'Prime Cost': [],
      'Operating Expense': [],
      'Non Controllable Expense': [],
      'Net Profit': []
    };
    
    let currentSection = '';
    let currentSubCategory = '';
    
    for (const row of rows) {
      // Skip pure section headers
      if (pureHeaderLabels.includes(row.label) && !row.label.startsWith('Total')) {
        if (row.label !== 'Net Profit') {
          currentSection = row.label;
          currentSubCategory = '';
          continue;
        } else {
          currentSection = 'Net Profit';
        }
      }
      
      // Process the row
      if (currentSection && sections[currentSection]) {
        // Check if this is a sub-category header (label matches AND has no meaningful values)
        const isSubCategoryHeader = subCategoryLabels.includes(row.label) && 
          (row.period === null || row.period === undefined) && 
          (row.ytd === null || row.ytd === undefined);
        
        // Check if this is a "Total [SubCategory]" row
        const isTotalSubCategory = row.label.startsWith('Total ') && 
          subCategoryLabels.includes(row.label.replace('Total ', ''));
        
        if (isSubCategoryHeader) {
          currentSubCategory = row.label;
          sections[currentSection].push({
            ...row,
            rowType: 'subCategoryHeader',
            subCategory: currentSubCategory
          });
        } else if (isTotalSubCategory) {
          sections[currentSection].push({
            ...row,
            rowType: 'subCategoryTotal',
            subCategory: row.label.replace('Total ', '')
          });
          currentSubCategory = '';
        } else if (row.label.startsWith('Total ')) {
          // Section total
          sections[currentSection].push({
            ...row,
            rowType: 'sectionTotal'
          });
        } else if (row.label === 'Net Profit') {
          sections[currentSection].push({
            ...row,
            rowType: 'netProfit'
          });
        } else {
          // Regular line item
          sections[currentSection].push({
            ...row,
            rowType: 'lineItem',
            subCategory: currentSubCategory
          });
        }
      }
    }
    
    return sections;
  };

  const sections = plData ? groupRowsBySection(plData.rows) : {};

  const renderRow = (row, idx) => {
    // Skip rows with zero values that aren't totals or headers
    if (row.rowType === 'lineItem' && row.period === 0 && row.ytd === 0) {
      return null;
    }

    // Determine styling based on row type
    let bgClass = '';
    let textClass = 'text-slate-300';
    let fontClass = '';
    let paddingClass = 'pl-3';
    
    switch (row.rowType) {
      case 'subCategoryHeader':
        textClass = 'text-slate-400';
        fontClass = 'font-medium text-xs uppercase tracking-wide';
        paddingClass = 'pl-3 pt-3';
        break;
      case 'lineItem':
        paddingClass = row.subCategory ? 'pl-6' : 'pl-3';
        break;
      case 'subCategoryTotal':
        bgClass = 'bg-slate-700/30';
        textClass = 'text-slate-200';
        fontClass = 'font-medium';
        paddingClass = 'pl-4';
        break;
      case 'sectionTotal':
        bgClass = 'bg-slate-700/50';
        textClass = 'text-white';
        fontClass = 'font-semibold';
        paddingClass = 'pl-3';
        break;
      case 'netProfit':
        const periodProfit = row.period || 0;
        bgClass = periodProfit >= 0 ? 'bg-green-900/40' : 'bg-red-900/40';
        textClass = periodProfit >= 0 ? 'text-green-400' : 'text-red-400';
        fontClass = 'font-bold';
        paddingClass = 'pl-3';
        break;
    }

    // Sub-category headers don't show values
    if (row.rowType === 'subCategoryHeader') {
      return (
        <tr key={idx} className="border-b border-slate-700/30">
          <td colSpan={5} className={`py-1 ${paddingClass} ${textClass} ${fontClass}`}>
            {row.label}
          </td>
        </tr>
      );
    }

    return (
      <tr key={idx} className={`${bgClass} border-b border-slate-700/30 hover:bg-slate-700/20`}>
        <td className={`py-2 ${paddingClass} ${textClass} ${fontClass} text-sm`}>
          {row.label}
        </td>
        <td className={`py-2 px-2 text-right ${textClass} ${fontClass} text-sm tabular-nums`}>
          {formatCurrency(row.period)}
        </td>
        <td className={`py-2 px-2 text-right text-slate-400 text-sm tabular-nums`}>
          {formatPercent(row.periodPercent)}
        </td>
        <td className={`py-2 px-2 text-right ${textClass} ${fontClass} text-sm tabular-nums hidden sm:table-cell`}>
          {formatCurrency(row.ytd)}
        </td>
        <td className={`py-2 px-2 text-right text-slate-400 text-sm tabular-nums hidden sm:table-cell`}>
          {formatPercent(row.ytdPercent)}
        </td>
      </tr>
    );
  };

  const renderSection = (sectionName, rows) => {
    if (!rows || rows.length === 0) return null;
    
    const isExpanded = expandedSections[sectionName];
    const totalRow = rows.find(r => r.rowType === 'sectionTotal' || r.rowType === 'netProfit');
    
    // Special styling for Net Profit section header
    const isNetProfit = sectionName === 'Net Profit';
    const netProfitPositive = isNetProfit && totalRow && (totalRow.period || 0) >= 0;
    
    return (
      <div key={sectionName} className="mb-3">
        <button
          onClick={() => toggleSection(sectionName)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-t-lg transition-colors ${
            isNetProfit 
              ? (netProfitPositive ? 'bg-green-900/50 hover:bg-green-900/60' : 'bg-red-900/50 hover:bg-red-900/60')
              : 'bg-slate-800 hover:bg-slate-700'
          } border border-slate-700`}
        >
          <div className="flex items-center gap-2 text-white">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="font-semibold">{sectionName}</span>
          </div>
          {totalRow && (
            <div className="flex gap-4 text-sm">
              <span className="text-slate-300">
                <span className="text-slate-500 hidden sm:inline">Period: </span>
                <span className={`font-medium ${isNetProfit ? (netProfitPositive ? 'text-green-400' : 'text-red-400') : 'text-white'}`}>
                  {formatCurrency(totalRow.period)}
                </span>
              </span>
              <span className="text-slate-300 hidden sm:inline">
                <span className="text-slate-500">YTD: </span>
                <span className={`font-medium ${isNetProfit ? (netProfitPositive ? 'text-green-400' : 'text-red-400') : 'text-white'}`}>
                  {formatCurrency(totalRow.ytd)}
                </span>
              </span>
            </div>
          )}
        </button>
        
        {isExpanded && (
          <div className="bg-slate-800/50 border border-t-0 border-slate-700 rounded-b-lg overflow-hidden">
            <table className="w-full">
              <tbody>
                {rows.map((row, idx) => renderRow(row, idx))}
              </tbody>
            </table>
          </div>
        )}
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

          {/* Sub-Header: Location & Period Selection */}
          {accessType !== 'none' && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
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

                {plData?.totalSales && (
                  <div className="sm:ml-auto">
                    <span className="text-sm text-slate-400">Total Sales: </span>
                    <span className="text-lg font-bold text-green-400">
                      ${plData.totalSales.period?.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Column Headers - Desktop */}
          {plData && !loading && (
            <div className="hidden sm:block bg-slate-700/50 border border-slate-600 rounded-lg mb-3 px-3 py-2">
              <div className="grid grid-cols-5 gap-2 text-sm font-semibold text-slate-300">
                <div></div>
                <div className="text-right">Period</div>
                <div className="text-right">%</div>
                <div className="text-right">YTD</div>
                <div className="text-right">%</div>
              </div>
            </div>
          )}

          {/* Mobile Column Headers */}
          {plData && !loading && (
            <div className="sm:hidden bg-slate-700/50 border border-slate-600 rounded-lg mb-3 px-3 py-2">
              <div className="grid grid-cols-3 gap-2 text-sm font-semibold text-slate-300">
                <div></div>
                <div className="text-right">Period</div>
                <div className="text-right">%</div>
              </div>
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
