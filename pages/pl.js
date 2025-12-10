import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ChevronDown, ChevronRight, RefreshCw, Upload, Printer } from 'lucide-react';

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
  const [reportType, setReportType] = useState('period-ytd');
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
  }, [status, reportType]);

  useEffect(() => {
    if (selectedLocation) {
      loadPeriodsForLocation(selectedLocation);
    }
  }, [selectedLocation, reportType]);

  useEffect(() => {
    if (selectedLocation && selectedPeriod) {
      loadPLData(selectedLocation, selectedPeriod);
    }
  }, [selectedLocation, selectedPeriod, reportType]);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      setPlData(null);
      setSelectedPeriod('');
      const res = await fetch(`/api/get-pl?reportType=${reportType}`);
      const data = await res.json();
      
      if (res.ok) {
        setAccessType(data.accessType);
        setAvailableLocations(data.availableLocations || []);
        if (data.availableLocations?.length > 0) {
          setSelectedLocation(data.availableLocations[0]);
        } else {
          setSelectedLocation('');
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
      const res = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}&listPeriods=true&reportType=${reportType}`);
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
      const res = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}&period=${encodeURIComponent(period)}&reportType=${reportType}`);
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
    if (value === null || value === undefined) return '$0';
    const num = parseFloat(value);
    if (isNaN(num)) return '$0';
    if (num === 0) return '$0';
    const formatted = Math.abs(num).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return num < 0 ? `($${formatted})` : `$${formatted}`;
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '0.0%';
    const num = parseFloat(value);
    if (isNaN(num)) return '0.0%';
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

  const formatKPIPercent = (value) => {
    if (value === null || value === undefined) return '0.0%';
    const num = parseFloat(value);
    if (isNaN(num)) return '0.0%';
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

  const sectionHeaders = ['Sales', 'Prime Cost', 'Operating Expense', 'Non Controllable Expense'];
  
  const subCategoryLabels = [
    'Comps & Discounts', 'Food and Paper Cost', 'Salaries and Wages',
    'Payroll Taxes', 'Payroll Benefits', 'Direct Operating Expense',
    'Utilities', 'Advertising', 'General and Administrative',
    'Occupancy Costs', 'Depreciation and Amortization'
  ];

  const managerWageLabels = ['Manager Wages', 'Market Manager Wages', 'General Manager Wages', 'Assistant Manager Wages'];

  const processData = (rows) => {
    if (!rows) return { sections: {}, kpis: {}, netIncome: null };
    
    const sections = {
      'Sales': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } },
      'Prime Cost': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } },
      'Operating Expense': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } },
      'Non Controllable Expense': { rows: [], total: { period: 0, ytd: 0, periodPercent: null, ytdPercent: null } }
    };
    
    let currentSection = '';
    let currentSubCategory = '';
    let subCategoryTotals = {};
    
    let totalSales = { period: 0, ytd: 0 };
    let totalFoodPaper = { period: 0, ytd: 0 };
    let totalSalariesWages = { period: 0, ytd: 0 };
    let netIncome = { period: 0, ytd: 0, periodPercent: 0, ytdPercent: 0 };
    
    let managerWagesAccum = { period: 0, ytd: 0, periodPercent: 0, ytdPercent: 0 };
    let managerWagesAdded = false;
    
    for (const row of rows) {
      const label = row.label?.trim();
      
      if (sectionHeaders.includes(label) && !label.startsWith('Total')) {
        currentSection = label;
        currentSubCategory = '';
        managerWagesAdded = false;
        continue;
      }
      
      if (label === 'Net Profit') {
        netIncome.period = row.period || 0;
        netIncome.ytd = row.ytd || 0;
        netIncome.periodPercent = row.periodPercent || 0;
        netIncome.ytdPercent = row.ytdPercent || 0;
        continue;
      }
      
      if (!currentSection || !sections[currentSection]) continue;
      
      const isSubCategoryHeader = subCategoryLabels.includes(label) && 
        (row.period === null || row.period === undefined) && 
        (row.ytd === null || row.ytd === undefined);
      
      const isTotalRow = label?.startsWith('Total ');
      const isSubCategoryTotal = isTotalRow && subCategoryLabels.includes(label.replace('Total ', ''));
      const isSectionTotal = isTotalRow && sectionHeaders.includes(label.replace('Total ', ''));
      
      const isManagerWage = managerWageLabels.includes(label);
      
      if (isSubCategoryHeader) {
        currentSubCategory = label;
        subCategoryTotals[label] = { period: 0, ytd: 0 };
        if (label === 'Salaries and Wages') {
          managerWagesAccum = { period: 0, ytd: 0, periodPercent: 0, ytdPercent: 0 };
          managerWagesAdded = false;
        }
        sections[currentSection].rows.push({
          ...row,
          rowType: 'subCategoryHeader'
        });
      } else if (isSectionTotal) {
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
        
        if (label === 'Total Sales') {
          totalSales = { period: actualPeriod, ytd: actualYtd };
        }
        
        sections[currentSection].rows.push({
          ...row,
          period: actualPeriod,
          ytd: actualYtd,
          rowType: 'sectionTotal',
          label: label === 'Total Sales' ? 'Net Sales' : label
        });
      } else if (isSubCategoryTotal) {
        const subCatName = label.replace('Total ', '');
        const calculated = subCategoryTotals[subCatName] || { period: 0, ytd: 0 };
        const actualPeriod = (row.period !== null && row.period !== undefined && row.period !== 0) 
          ? row.period : calculated.period;
        const actualYtd = (row.ytd !== null && row.ytd !== undefined && row.ytd !== 0) 
          ? row.ytd : calculated.ytd;
        
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
      } else if (isManagerWage) {
        managerWagesAccum.period += parseFloat(row.period) || 0;
        managerWagesAccum.ytd += parseFloat(row.ytd) || 0;
        
        if (!managerWagesAdded && (managerWagesAccum.period !== 0 || managerWagesAccum.ytd !== 0)) {
          const rowIndex = sections[currentSection].rows.length;
          sections[currentSection].rows.push({
            label: 'Manager Wages',
            period: managerWagesAccum.period,
            ytd: managerWagesAccum.ytd,
            periodPercent: row.periodPercent,
            ytdPercent: row.ytdPercent,
            rowType: 'lineItem',
            indent: currentSubCategory ? 1 : 0,
            _managerWagesIndex: rowIndex
          });
          managerWagesAdded = true;
        } else if (managerWagesAdded) {
          const existingRow = sections[currentSection].rows.find(r => r._managerWagesIndex !== undefined);
          if (existingRow) {
            existingRow.period = managerWagesAccum.period;
            existingRow.ytd = managerWagesAccum.ytd;
          }
        }
        
        const periodVal = parseFloat(row.period) || 0;
        const ytdVal = parseFloat(row.ytd) || 0;
        sections[currentSection].total.period += periodVal;
        sections[currentSection].total.ytd += ytdVal;
        if (currentSubCategory && subCategoryTotals[currentSubCategory]) {
          subCategoryTotals[currentSubCategory].period += periodVal;
          subCategoryTotals[currentSubCategory].ytd += ytdVal;
        }
      } else {
        const periodVal = parseFloat(row.period) || 0;
        const ytdVal = parseFloat(row.ytd) || 0;
        
        if (periodVal === 0 && ytdVal === 0) continue;
        
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
    
    const cogsPercent = totalSales.period !== 0 ? (totalFoodPaper.period / totalSales.period) * 100 : 0;
    const laborPercent = totalSales.period !== 0 ? (totalSalariesWages.period / totalSales.period) * 100 : 0;
    const cogsPercentYtd = totalSales.ytd !== 0 ? (totalFoodPaper.ytd / totalSales.ytd) * 100 : 0;
    const laborPercentYtd = totalSales.ytd !== 0 ? (totalSalariesWages.ytd / totalSales.ytd) * 100 : 0;
    
    if (netIncome.period === 0 && netIncome.ytd === 0) {
      const primeCost = sections['Prime Cost'].total;
      const opExp = sections['Operating Expense'].total;
      const nonControllable = sections['Non Controllable Expense'].total;
      
      netIncome.period = totalSales.period - primeCost.period - opExp.period - nonControllable.period;
      netIncome.ytd = totalSales.ytd - primeCost.ytd - opExp.ytd - nonControllable.ytd;
    }
    
    if (totalSales.period !== 0) {
      netIncome.periodPercent = (netIncome.period / totalSales.period) * 100;
    }
    if (totalSales.ytd !== 0) {
      netIncome.ytdPercent = (netIncome.ytd / totalSales.ytd) * 100;
    }
    
    return {
      sections,
      kpis: {
        sales: totalSales,
        cogsPercent,
        cogsPercentYtd,
        laborPercent,
        laborPercentYtd,
        netIncome
      },
      netIncome,
      totalSales
    };
  };

  const { sections, kpis, netIncome, totalSales } = plData ? processData(plData.rows) : { sections: {}, kpis: {}, netIncome: null, totalSales: { period: 0, ytd: 0 } };

  const calcPercent = (value, total) => {
    if (!value || !total || total === 0) return 0;
    return (value / total) * 100;
  };

  const renderRow = (row, idx) => {
    let bgClass = '';
    let textClass = 'text-slate-300';
    let fontClass = 'text-xs md:text-sm';
    let paddingClass = 'pl-2 md:pl-3';
    let isTotalRow = false;
    
    let periodPercent = row.periodPercent;
    let ytdPercent = row.ytdPercent;
    
    if ((row.rowType === 'sectionTotal' || row.rowType === 'subCategoryTotal') && 
        (periodPercent === null || periodPercent === undefined)) {
      periodPercent = calcPercent(row.period, totalSales?.period);
      ytdPercent = calcPercent(row.ytd, totalSales?.ytd);
    }
    
    switch (row.rowType) {
      case 'subCategoryHeader':
        return (
          <tr key={idx} className="border-b border-slate-700/30">
            <td colSpan={5} className="py-1 pl-2 md:pl-3 text-slate-400 text-[10px] md:text-xs font-medium uppercase tracking-wide">
              {row.label}
            </td>
          </tr>
        );
      case 'lineItem':
        paddingClass = row.indent ? 'pl-4 md:pl-5' : 'pl-2 md:pl-3';
        break;
      case 'subCategoryTotal':
        bgClass = 'bg-slate-700/30';
        textClass = 'text-slate-200';
        fontClass = 'text-xs md:text-sm font-semibold';
        paddingClass = 'pl-3 md:pl-4';
        isTotalRow = true;
        break;
      case 'sectionTotal':
        bgClass = 'bg-slate-700/50';
        textClass = 'text-white';
        fontClass = 'text-xs md:text-sm font-bold';
        isTotalRow = true;
        break;
    }

    return (
      <tr key={idx} className={`${bgClass} border-b border-slate-700/30`}>
        <td className={`py-1 ${paddingClass} ${textClass} ${fontClass}`} style={{ width: '32%' }}>
          {row.label}
        </td>
        <td className={`py-1 px-1 text-right ${textClass} ${fontClass} tabular-nums`} style={{ width: '17%' }}>
          {formatCurrency(row.period)}
        </td>
        <td className={`py-1 px-1 text-right ${isTotalRow ? textClass : 'text-slate-400'} ${isTotalRow ? fontClass : 'text-xs md:text-sm'} tabular-nums`} style={{ width: '12%' }}>
          {formatPercent(periodPercent)}
        </td>
        <td className={`py-1 px-1 text-right ${textClass} ${fontClass} tabular-nums`} style={{ width: '17%' }}>
          {formatCurrency(row.ytd)}
        </td>
        <td className={`py-1 px-1 text-right ${isTotalRow ? textClass : 'text-slate-400'} ${isTotalRow ? fontClass : 'text-xs md:text-sm'} tabular-nums`} style={{ width: '12%' }}>
          {formatPercent(ytdPercent)}
        </td>
      </tr>
    );
  };

  const renderSection = (sectionName, sectionData) => {
    if (!sectionData || sectionData.rows.length === 0) return null;
    
    const isExpanded = expandedSections[sectionName];
    
    return (
      <div key={sectionName} className="mb-2">
        <button
          onClick={() => toggleSection(sectionName)}
          className="w-full flex items-center px-2 md:px-3 py-1.5 rounded-t-lg transition-colors bg-slate-800 hover:bg-slate-750 border-2 border-slate-600 print:hover:bg-slate-800"
        >
          <div className="flex items-center gap-2 text-white">
            <span className="print:hidden">{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
            <span className="font-semibold text-xs md:text-sm">{sectionName}</span>
          </div>
        </button>
        
        {isExpanded && (
          <div className="bg-slate-800/50 border-2 border-t-0 border-slate-600 rounded-b-lg overflow-x-auto">
            <table className="w-full table-fixed" style={{ minWidth: '100%' }}>
              <colgroup>
                <col style={{ width: '32%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '12%' }} />
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

  const renderNetIncome = () => {
    if (!netIncome) return null;
    
    return (
      <div className="mb-2">
        <div className="bg-slate-800 border-2 border-slate-600 rounded-lg overflow-x-auto">
          <table className="w-full table-fixed" style={{ minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: '32%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <tbody>
              <tr>
                <td className="py-2 pl-2 md:pl-3 text-white text-xs md:text-sm font-bold">
                  Net Income/Loss
                </td>
                <td className="py-2 px-1 text-right text-white text-xs md:text-sm font-bold tabular-nums">
                  {formatCurrency(netIncome.period)}
                </td>
                <td className="py-2 px-1 text-right text-white text-xs md:text-sm font-bold tabular-nums">
                  {formatPercent(netIncome.periodPercent)}
                </td>
                <td className="py-2 px-1 text-right text-white text-xs md:text-sm font-bold tabular-nums">
                  {formatCurrency(netIncome.ytd)}
                </td>
                <td className="py-2 px-1 text-right text-white text-xs md:text-sm font-bold tabular-nums">
                  {formatPercent(netIncome.ytdPercent)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const KPICard = ({ label, periodValue, ytdValue, isPercent = false, color = 'blue', periodLabel = 'Period', ytdLabel = 'YTD' }) => {
    const colorClasses = {
      blue: 'border-2 border-blue-500/50 bg-blue-900/20',
      green: 'border-2 border-green-500/50 bg-green-900/20',
      orange: 'border-2 border-orange-500/50 bg-orange-900/20',
      purple: 'border-2 border-purple-500/50 bg-purple-900/20',
      red: 'border-2 border-red-500/50 bg-red-900/20'
    };
    
    const textColors = {
      blue: 'text-blue-400',
      green: 'text-green-400',
      orange: 'text-orange-400',
      purple: 'text-purple-400',
      red: 'text-red-400'
    };
    
    const isNegative = typeof periodValue === 'number' && periodValue < 0;
    const displayColor = isNegative ? 'red' : color;
    
    return (
      <div className={`rounded-lg ${colorClasses[displayColor]} p-2 md:p-3`}>
        <div className="text-xs md:text-sm text-slate-300 uppercase tracking-wide mb-2 text-center font-semibold">
          {label}
        </div>
        <div className="grid grid-cols-2 gap-1 md:gap-2 text-center">
          <div>
            <div className="text-[10px] md:text-xs text-slate-500 uppercase mb-0.5">{periodLabel}</div>
            <div className={`text-sm md:text-lg font-bold ${textColors[displayColor]}`}>
              {isPercent ? formatKPIPercent(periodValue) : formatKPICurrency(periodValue)}
            </div>
          </div>
          <div>
            <div className="text-[10px] md:text-xs text-slate-500 uppercase mb-0.5">{ytdLabel}</div>
            <div className={`text-sm md:text-lg font-bold ${textColors[displayColor]}`}>
              {isPercent ? formatKPIPercent(ytdValue) : formatKPICurrency(ytdValue)}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>P&L Dashboard - Andy's Frozen Custard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <style>{`
          @media print {
            /* Make gray text black but preserve KPI colors */
            .text-slate-300, .text-slate-400, .text-slate-500, .text-white {
              color: black !important;
            }
            /* White background for print */
            body, .bg-slate-900, .bg-slate-800, .bg-gradient-to-br {
              background: white !important;
            }
            /* Hide screen-only elements */
            .no-print {
              display: none !important;
            }
            /* Show print-only elements */
            .print-only {
              display: block !important;
            }
            /* Remove borders that look bad on print */
            .border-slate-600, .border-slate-700 {
              border-color: #999 !important;
            }
          }
        `}</style>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">
          
          {/* Print Header - Only shows when printing */}
          <div className="print-only hidden mb-2">
            <div className="flex flex-col items-center justify-center py-2">
              <img 
                src="https://i.imgur.com/kkJMVz0.png" 
                alt="Andy's Frozen Custard" 
                className="h-12"
              />
              <div className="mt-1 text-sm font-bold">{selectedLocation} — Period Ending {selectedPeriod}</div>
            </div>
          </div>

          {/* Main Header - Hidden when printing */}
          <div className="no-print bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-4 mb-2 md:mb-3 shadow-2xl">
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
                  <option value="logbook">Logbook</option>
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
            <div className="md:hidden">
              <div className="flex items-center justify-between mb-2">
                <img 
                  src="https://i.imgur.com/kkJMVz0.png" 
                  alt="Andy's Frozen Custard" 
                  className="h-10"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleRefresh}
                    className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    title="Refresh data"
                  >
                    <RefreshCw size={14} className="text-white" />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => router.push('/pl-upload')}
                      className="p-1.5 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                      title="Upload P&L"
                    >
                      <Upload size={14} className="text-white" />
                    </button>
                  )}
                  <button
                    onClick={() => signOut()}
                    className="px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
              
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
              </select>
            </div>
          </div>

          {/* Location & Period Selection */}
          {accessType !== 'none' && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 mb-2 md:mb-3 shadow-lg no-print">
              {/* Desktop: Location left, Period right with Print button */}
              <div className="hidden md:flex items-center justify-between">
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
                  <button
                    onClick={() => window.print()}
                    className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                    title="Print P&L"
                  >
                    <Printer size={16} className="text-white" />
                  </button>
                </div>
              </div>
              
              {/* Mobile: Fill the row */}
              <div className="md:hidden flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1">
                  <label className="text-xs font-medium text-slate-400">Location:</label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {availableLocations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex-1 flex items-center gap-1">
                  <label className="text-xs font-medium text-slate-400">Period:</label>
                  <select
                    value={selectedPeriod}
                    onChange={(e) => setSelectedPeriod(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {availablePeriods.map(period => (
                      <option key={period} value={period}>{period}</option>
                    ))}
                  </select>
                </div>
                
                <button
                  onClick={() => window.print()}
                  className="p-1.5 bg-slate-600 hover:bg-slate-500 rounded-lg transition-colors"
                  title="Print P&L"
                >
                  <Printer size={14} className="text-white" />
                </button>
              </div>
              
              {/* Report Type Toggle - Below dropdowns */}
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() => setReportType('period-ytd')}
                  className={`flex-1 px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors ${
                    reportType === 'period-ytd'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Period / YTD
                </button>
                <button
                  onClick={() => setReportType('current-prior')}
                  className={`flex-1 px-3 py-1.5 text-xs md:text-sm font-medium rounded-lg transition-colors ${
                    reportType === 'current-prior'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Current / Prior Period
                </button>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          {plData && !loading && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2 md:mb-3">
              <KPICard 
                label="Net Sales" 
                periodValue={kpis.sales?.period} 
                ytdValue={kpis.sales?.ytd}
                color="blue"
                periodLabel={reportType === 'period-ytd' ? 'Period' : 'Current'}
                ytdLabel={reportType === 'period-ytd' ? 'YTD' : 'Prior'}
              />
              <KPICard 
                label="COGS %" 
                periodValue={kpis.cogsPercent} 
                ytdValue={kpis.cogsPercentYtd}
                isPercent={true} 
                color="orange"
                periodLabel={reportType === 'period-ytd' ? 'Period' : 'Current'}
                ytdLabel={reportType === 'period-ytd' ? 'YTD' : 'Prior'}
              />
              <KPICard 
                label="Labor %" 
                periodValue={kpis.laborPercent} 
                ytdValue={kpis.laborPercentYtd}
                isPercent={true} 
                color="purple"
                periodLabel={reportType === 'period-ytd' ? 'Period' : 'Current'}
                ytdLabel={reportType === 'period-ytd' ? 'YTD' : 'Prior'}
              />
              <KPICard 
                label="Net Income" 
                periodValue={kpis.netIncome?.period}
                ytdValue={kpis.netIncome?.ytd}
                color={kpis.netIncome?.period >= 0 ? 'green' : 'red'}
                periodLabel={reportType === 'period-ytd' ? 'Period' : 'Current'}
                ytdLabel={reportType === 'period-ytd' ? 'YTD' : 'Prior'}
              />
            </div>
          )}

          {/* Column Headers */}
          {plData && !loading && (
            <div className="bg-slate-700/50 border-2 border-slate-600 rounded-lg mb-2 overflow-hidden">
              <table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: '32%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '17%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="py-1.5 px-2 md:px-3 text-left text-xs md:text-sm font-semibold text-slate-300"></th>
                    <th className="py-1.5 px-1 text-right text-xs md:text-sm font-semibold text-slate-300">
                      {reportType === 'period-ytd' ? 'Period' : 'Current'}
                    </th>
                    <th className="py-1.5 px-1 text-right text-xs md:text-sm font-semibold text-slate-300">%</th>
                    <th className="py-1.5 px-1 text-right text-xs md:text-sm font-semibold text-slate-300">
                      {reportType === 'period-ytd' ? 'YTD' : 'Prior'}
                    </th>
                    <th className="py-1.5 px-1 text-right text-xs md:text-sm font-semibold text-slate-300">%</th>
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
              {renderNetIncome()}
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
