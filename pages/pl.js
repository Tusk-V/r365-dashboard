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
    if (value === null || value === undefined) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
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
    
    for (const row of rows) {
      if (row.label === 'Sales') {
        currentSection = 'Sales';
        continue;
      } else if (row.label === 'Prime Cost') {
        currentSection = 'Prime Cost';
        continue;
      } else if (row.label === 'Operating Expense') {
        currentSection = 'Operating Expense';
        continue;
      } else if (row.label === 'Non Controllable Expense') {
        currentSection = 'Non Controllable Expense';
        continue;
      } else if (row.label === 'Net Profit') {
        currentSection = 'Net Profit';
      }
      
      if (currentSection && sections[currentSection]) {
        sections[currentSection].push(row);
      }
    }
    
    return sections;
  };

  const sections = plData ? groupRowsBySection(plData.rows) : {};

  const renderRow = (row, idx) => {
    if (row.period === null && row.ytd === null && row.isSubHeader && !row.isTotal) {
      const meaningfulSubHeaders = [
        'Comps & Discounts', 'Food and Paper Cost', 'Salaries and Wages',
        'Payroll Taxes', 'Payroll Benefits', 'Direct Operating Expense',
        'Utilities', 'Advertising', 'General and Administrative',
        'Occupancy Costs', 'Depreciation and Amortization'
      ];
      if (!meaningfulSubHeaders.includes(row.label)) {
        return null;
      }
    }

    if (row.period === 0 && row.ytd === 0 && !row.isTotal && !row.isSubHeader) {
      return null;
    }

    const isTotal = row.isTotal || row.label === 'Net Profit';
    const isSubHeader = row.isSubHeader;
    
    let bgClass = '';
    let textClass = 'text-slate-300';
    let fontClass = '';
    
    if (isTotal) {
      bgClass = 'bg-slate-700/50';
      textClass = 'text-white';
      fontClass = 'font-semibold';
    } else if (isSubHeader) {
      textClass = 'text-slate-200';
      fontClass = 'font-medium';
    }

    if (row.label === 'Net Profit') {
      const periodProfit = row.period || 0;
      bgClass = periodProfit >= 0 ? 'bg-green-900/30' : 'bg-red-900/30';
      textClass = periodProfit >= 0 ? 'text-green-400' : 'text-red-400';
      fontClass = 'font-bold';
    }

    const indent = row.indent || 0;
    const paddingLeft = indent === 0 ? 'pl-2' : indent === 1 ? 'pl-4' : 'pl-8';

    return (
      <tr key={idx} className={`${bgClass} border-b border-slate-700/50 hover:bg-slate-700/30`}>
        <td className={`py-1.5 ${paddingLeft} ${textClass} ${fontClass} text-sm`}>
          {row.label}
        </td>
        <td className={`py-1.5 px-3 text-right ${textClass} ${fontClass} text-sm tabular-nums whitespace-nowrap`}>
          {formatCurrency(row.period)}
        </td>
        <td className={`py-1.5 px-3 text-right ${textClass} text-sm tabular-nums whitespace-nowrap`}>
          {formatPercent(row.periodPercent)}
        </td>
        <td className={`py-1.5 px-3 text-right ${textClass} ${fontClass} text-sm tabular-nums whitespace-nowrap`}>
          {formatCurrency(row.ytd)}
        </td>
        <td className={`py-1.5 px-3 text-right ${textClass} text-sm tabular-nums whitespace-nowrap`}>
          {formatPercent(row.ytdPercent)}
        </td>
      </tr>
    );
  };

  const renderSection = (sectionName, rows) => {
    if (!rows || rows.length === 0) return null;
    
    const isExpanded = expandedSections[sectionName];
    const totalRow = rows.find(r => r.label === `Total ${sectionName}` || r.label === 'Net Profit');
    
    return (
      <div key={sectionName} className="mb-2">
        <button
          onClick={() => toggleSection(sectionName)}
          className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 px-3 py-2 rounded-t-lg hover:bg-slate-700 transition-colors"
        >
          <div className="flex items-center gap-2 text-white">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="font-semibold">{sectionName}</span>
          </div>
          {totalRow && (
            <div className="flex gap-6 text-sm">
              <span className="text-slate-400">
                Period: <span className="text-white font-medium">{formatCurrency(totalRow.period)}</span>
              </span>
              <span className="text-slate-400">
                YTD: <span className="text-white font-medium">{formatCurrency(totalRow.ytd)}</span>
              </span>
            </div>
          )}
        </button>
        
        {isExpanded && (
          <div className="bg-slate-800/50 border border-t-0 border-slate-700 rounded-b-lg overflow-x-auto">
            <table className="w-full table-fixed min-w-[500px]">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[17%]" />
                <col className="w-[11%]" />
                <col className="w-[24%]" />
                <col className="w-[18%]" />
              </colgroup>
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
          
          {/* Main Header - Same as Dashboard */}
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
                  <option value="overtime">OT Warnings</option>
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
                <option value="overtime">OT Warnings</option>
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
              <div className="flex flex-col md:flex-row md:items-center gap-3">
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
                  <label className="text-sm font-medium text-slate-400">Period Ending:</label>
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
                  <div className="md:ml-auto text-right">
                    <span className="text-sm text-slate-400">Total Sales: </span>
                    <span className="text-lg font-bold text-green-400">
                      ${plData.totalSales.period?.toLocaleString()}
                    </span>
                  </div>
                )}
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

          {/* P&L Data */}
          {plData && !loading && (
            <>
              {/* Table Header */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-x-auto mb-2">
                <table className="w-full table-fixed min-w-[500px]">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[17%]" />
                    <col className="w-[11%]" />
                    <col className="w-[24%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-700">
                      <th className="py-2 px-2 text-left text-sm font-semibold text-slate-300"></th>
                      <th className="py-2 px-3 text-right text-sm font-semibold text-slate-300 whitespace-nowrap">Period</th>
                      <th className="py-2 px-3 text-right text-sm font-semibold text-slate-300 whitespace-nowrap">%</th>
                      <th className="py-2 px-3 text-right text-sm font-semibold text-slate-300 whitespace-nowrap">YTD</th>
                      <th className="py-2 px-3 text-right text-sm font-semibold text-slate-300 whitespace-nowrap">%</th>
                    </tr>
                  </thead>
                </table>
              </div>

              {/* Sections */}
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
