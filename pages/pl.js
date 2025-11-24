import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';

export default function PLDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessType, setAccessType] = useState('none');
  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [plData, setPlData] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    'Sales': true,
    'Prime Cost': true,
    'Operating Expense': true,
    'Non Controllable Expense': true
  });

  useEffect(() => {
    if (status === 'authenticated') {
      loadInitialData();
    }
  }, [status]);

  useEffect(() => {
    if (selectedLocation) {
      loadPLData(selectedLocation);
    }
  }, [selectedLocation]);

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

  const loadPLData = async (location) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}`);
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

  if (accessType === 'none' && !loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-white text-xl mb-4">No P&L Access</div>
        <div className="text-slate-400 mb-6">Contact your administrator for access.</div>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    );
  }

  // Group rows by section
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
    // Skip duplicate header rows (ones with null values that are just labels)
    if (row.period === null && row.ytd === null && row.isSubHeader && !row.isTotal) {
      // Only show if it's a meaningful sub-header
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

    // Skip rows that are just zeros
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

    // Net Profit special styling
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
        <td className={`py-1.5 px-2 text-right ${textClass} ${fontClass} text-sm tabular-nums`}>
          {formatCurrency(row.period)}
        </td>
        <td className={`py-1.5 px-2 text-right ${textClass} text-sm tabular-nums`}>
          {formatPercent(row.periodPercent)}
        </td>
        <td className={`py-1.5 px-2 text-right ${textClass} ${fontClass} text-sm tabular-nums`}>
          {formatCurrency(row.ytd)}
        </td>
        <td className={`py-1.5 px-2 text-right ${textClass} text-sm tabular-nums`}>
          {formatPercent(row.ytdPercent)}
        </td>
      </tr>
    );
  };

  const renderSection = (sectionName, rows) => {
    if (!rows || rows.length === 0) return null;
    
    const isExpanded = expandedSections[sectionName];
    
    // Get the section total
    const totalRow = rows.find(r => r.label === `Total ${sectionName}` || r.label === 'Net Profit');
    
    return (
      <div key={sectionName} className="mb-2">
        <button
          onClick={() => toggleSection(sectionName)}
          className="w-full flex items-center justify-between bg-slate-800 px-3 py-2 rounded-t-lg hover:bg-slate-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            <span className="font-semibold text-white">{sectionName}</span>
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
          <div className="bg-slate-800/50 rounded-b-lg overflow-hidden">
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
      
      <div className="min-h-screen bg-slate-900 text-white">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
                title="Back to Dashboard"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-lg font-bold">Profit & Loss</h1>
                <p className="text-sm text-slate-400">Ranchers Custard Company</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {availableLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-slate-400">Loading P&L data...</div>
            </div>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400">
              {error}
            </div>
          ) : plData ? (
            <>
              {/* Location Header */}
              <div className="bg-slate-800 rounded-lg p-4 mb-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-bold">{plData.location}</h2>
                    <p className="text-slate-400">Period Ending: {plData.periodEnding}</p>
                  </div>
                  {plData.totalSales && (
                    <div className="text-right">
                      <div className="text-sm text-slate-400">Total Sales</div>
                      <div className="text-2xl font-bold text-green-400">
                        ${plData.totalSales.period?.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table Header */}
              <div className="bg-slate-800 rounded-lg overflow-hidden mb-2">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-700">
                      <th className="py-2 px-2 text-left text-sm font-semibold text-slate-300 w-1/3"></th>
                      <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300">Period</th>
                      <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300 w-16">%</th>
                      <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300">YTD</th>
                      <th className="py-2 px-2 text-right text-sm font-semibold text-slate-300 w-16">%</th>
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
          ) : (
            <div className="text-center py-20 text-slate-400">
              No P&L data available. Select a location or contact admin to upload data.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
