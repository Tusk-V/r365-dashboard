// pages/index.js - Updated Weekly Sales & Labor Dashboard

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Image from 'next/image';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState([]);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedView, setSelectedView] = useState('weekly');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    locations: [],
    actVsOptVariance: 'all',
    salesVariance: 'all'
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (status === 'authenticated') {
      fetchData();
    }
  }, [selectedWeek, status]);

  const fetchData = async () => {
    try {
      const sheetId = '1G3vhZNLGPvwCcPPGNpkEtMaBt9gKtHcmcWsVlJ4aZ2k';
      const sheetName = selectedWeek || 'Current';
      const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;
      
      const response = await fetch(url);
      const text = await response.text();
      const json = JSON.parse(text.substr(47).slice(0, -2));
      
      const rows = json.table.rows;
      const parsedData = rows.slice(1).map(row => ({
        location: row.c[0]?.v || '',
        sales: parseFloat(row.c[1]?.v) || 0,
        forecast: parseFloat(row.c[2]?.v) || 0,
        variance: parseFloat(row.c[3]?.v) || 0,
        variancePercent: parseFloat(row.c[4]?.v) || 0,
        laborPercent: parseFloat(row.c[5]?.v) || 0,
        scheduledHours: parseFloat(row.c[6]?.v) || 0,
        actualHours: parseFloat(row.c[7]?.v) || 0,
        optimalHours: parseFloat(row.c[8]?.v) || 0,
        actVsOpt: parseFloat(row.c[9]?.v) || 0,
        productivity: parseFloat(row.c[10]?.v) || 0
      }));

      setData(parsedData);

      // Fetch available weeks
      const weeksUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;
      const weeksResponse = await fetch(weeksUrl);
      const weeksText = await weeksResponse.text();
      const weeksJson = JSON.parse(weeksText.substr(47).slice(0, -2));
      
      const availableWeeks = [];
      if (weeksJson.table && weeksJson.table.cols) {
        for (let i = 0; i < weeksJson.table.cols.length; i++) {
          const sheetName = weeksJson.table.cols[i].label;
          if (sheetName && sheetName !== 'Current' && sheetName.includes('/')) {
            availableWeeks.push(sheetName);
          }
        }
      }
      setWeeks(availableWeeks);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
  };

  const getVarianceColor = (variance) => {
    if (variance > 0) return 'text-green-400';
    if (variance < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const filteredData = data.filter(location => {
    const locationMatch = filters.locations.length === 0 || filters.locations.includes(location.location);
    
    const actVsOptMatch = filters.actVsOptVariance === 'all' ||
      (filters.actVsOptVariance === 'positive' && location.actVsOpt > 0) ||
      (filters.actVsOptVariance === 'negative' && location.actVsOpt < 0);
    
    const salesMatch = filters.salesVariance === 'all' ||
      (filters.salesVariance === 'positive' && location.variance > 0) ||
      (filters.salesVariance === 'negative' && location.variance < 0);
    
    return locationMatch && actVsOptMatch && salesMatch;
  });

  const summaryStats = {
    totalSales: filteredData.reduce((sum, loc) => sum + loc.sales, 0),
    totalForecast: filteredData.reduce((sum, loc) => sum + loc.forecast, 0),
    avgLaborPercent: filteredData.length > 0 
      ? filteredData.reduce((sum, loc) => sum + loc.laborPercent, 0) / filteredData.length 
      : 0,
    totalActualHours: filteredData.reduce((sum, loc) => sum + loc.actualHours, 0),
    totalOptimalHours: filteredData.reduce((sum, loc) => sum + loc.optimalHours, 0),
    avgProductivity: filteredData.length > 0
      ? filteredData.reduce((sum, loc) => sum + loc.productivity, 0) / filteredData.length
      : 0
  };

  const allLocations = [...new Set(data.map(d => d.location))].sort();

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1d2739' }}>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#1d2739' }}>
      {/* Header */}
      <header className="bg-slate-800 shadow-lg border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Image
                src="/andys-logo.png"
                alt="Andy's"
                width={50}
                height={50}
                className="object-contain"
              />
              <div>
                <h1 className="text-2xl font-bold text-white hidden sm:block">R365 Dashboards</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={selectedView}
                onChange={(e) => {
                  const view = e.target.value;
                  setSelectedView(view);
                  if (view === 'auto-clockouts') router.push('/auto-clockouts');
                  if (view === 'sales') router.push('/sales');
                  if (view === 'discounts') router.push('/discounts');
                  if (view === 'call-offs') router.push('/call-offs');
                }}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="weekly">Weekly Sales & Labor</option>
                <option value="auto-clockouts">Auto-Clockouts</option>
                <option value="sales">Sales/Guest Counts</option>
                <option value="discounts">Comps/Discounts</option>
                <option value="call-offs">Call-Offs</option>
              </select>
              
              <button
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters - More Compact */}
        <div className="bg-slate-800 rounded-lg shadow-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Week Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Week</label>
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="">Current Week</option>
                {weeks.map(week => (
                  <option key={week} value={week}>{week}</option>
                ))}
              </select>
            </div>

            {/* Location Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Locations</label>
              <div className="relative">
                <select
                  multiple
                  value={filters.locations}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, option => option.value);
                    setFilters({...filters, locations: selected});
                  }}
                  className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  size="1"
                >
                  <option value="">All Locations ({allLocations.length})</option>
                  {allLocations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Act vs Opt Hours */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Act vs Opt</label>
              <select
                value={filters.actVsOptVariance}
                onChange={(e) => setFilters({...filters, actVsOptVariance: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All</option>
                <option value="positive">Over</option>
                <option value="negative">Under</option>
              </select>
            </div>

            {/* Sales Variance */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Sales</label>
              <select
                value={filters.salesVariance}
                onChange={(e) => setFilters({...filters, salesVariance: e.target.value})}
                className="w-full px-2 py-1.5 text-sm bg-slate-700 border border-slate-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All</option>
                <option value="positive">Above</option>
                <option value="negative">Below</option>
              </select>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Sales Card */}
          <div className="bg-slate-800 rounded-lg shadow-lg p-6">
            <h3 className="text-slate-400 text-sm font-medium mb-2">Sales</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-white text-xs">Actual</span>
                <span className="text-white text-lg font-bold">{formatCurrency(summaryStats.totalSales)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white text-xs">Forecast</span>
                <span className="text-white text-lg font-bold">{formatCurrency(summaryStats.totalForecast)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                <span className="text-white text-xs">Variance</span>
                <span className={`text-lg font-bold ${getVarianceColor(summaryStats.totalSales - summaryStats.totalForecast)}`}>
                  {formatCurrency(summaryStats.totalSales - summaryStats.totalForecast)}
                </span>
              </div>
            </div>
          </div>

          {/* Labor Card - UPDATED */}
          <div className="bg-slate-800 rounded-lg shadow-lg p-6">
            <h3 className="text-slate-400 text-sm font-medium mb-2">Labor</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-white text-xs">Labor %</span>
                <span className="text-white text-lg font-bold">{formatPercent(summaryStats.avgLaborPercent)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white text-xs">Opt Labor %</span>
                <span className="text-white text-lg font-bold">
                  {(() => {
                    // Calculate cost/hr: (actual sales × labor %) ÷ actual hours
                    const laborCost = summaryStats.totalSales * (summaryStats.avgLaborPercent / 100);
                    const costPerHour = summaryStats.totalActualHours > 0 ? laborCost / summaryStats.totalActualHours : 0;
                    // Calculate opt labor %: (optimal hours × cost/hr) ÷ actual sales
                    const optLaborCost = summaryStats.totalOptimalHours * costPerHour;
                    const optLaborPercent = summaryStats.totalSales > 0 ? (optLaborCost / summaryStats.totalSales) * 100 : 0;
                    return formatPercent(optLaborPercent);
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                <span className="text-white text-xs">Prod</span>
                <span className="text-white text-lg font-bold">{formatCurrency(summaryStats.avgProductivity)}</span>
              </div>
            </div>
          </div>

          {/* Hours Card */}
          <div className="bg-slate-800 rounded-lg shadow-lg p-6">
            <h3 className="text-slate-400 text-sm font-medium mb-2">Hours</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-white text-xs">Actual</span>
                <span className="text-white text-lg font-bold">{summaryStats.totalActualHours.toFixed(1)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white text-xs">Optimal</span>
                <span className="text-white text-lg font-bold">{summaryStats.totalOptimalHours.toFixed(1)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                <span className="text-white text-xs">Variance</span>
                <span className={`text-lg font-bold ${getVarianceColor(summaryStats.totalActualHours - summaryStats.totalOptimalHours)}`}>
                  {(summaryStats.totalActualHours - summaryStats.totalOptimalHours).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Location Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredData.map((location) => (
            <div key={location.location} className="bg-slate-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
              <h3 className="text-xl font-bold text-white mb-4">{location.location}</h3>
              
              {/* Sales Section */}
              <div className="mb-4">
                <h4 className="text-slate-400 text-xs font-medium mb-2">Sales</h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Actual</span>
                    <span className="text-white font-semibold">{formatCurrency(location.sales)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Forecast</span>
                    <span className="text-white font-semibold">{formatCurrency(location.forecast)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Variance</span>
                    <span className={`font-semibold ${getVarianceColor(location.variance)}`}>
                      {formatCurrency(location.variance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Labor Section */}
              <div className="mb-4">
                <h4 className="text-slate-400 text-xs font-medium mb-2">Labor</h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Labor %</span>
                    <span className="text-white font-semibold">{formatPercent(location.laborPercent)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Opt Labor %</span>
                    <span className="text-white font-semibold">
                      {(() => {
                        // Calculate cost/hr: (actual sales × labor %) ÷ actual hours
                        const laborCost = location.sales * (location.laborPercent / 100);
                        const costPerHour = location.actualHours > 0 ? laborCost / location.actualHours : 0;
                        // Calculate opt labor %: (optimal hours × cost/hr) ÷ actual sales
                        const optLaborCost = location.optimalHours * costPerHour;
                        const optLaborPercent = location.sales > 0 ? (optLaborCost / location.sales) * 100 : 0;
                        return formatPercent(optLaborPercent);
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Prod</span>
                    <span className="text-white font-semibold">{formatCurrency(location.productivity)}</span>
                  </div>
                </div>
              </div>

              {/* Hours Section */}
              <div>
                <h4 className="text-slate-400 text-xs font-medium mb-2">Hours</h4>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Actual</span>
                    <span className="text-white font-semibold">{location.actualHours.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Optimal</span>
                    <span className="text-white font-semibold">{location.optimalHours.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white text-xs">Act vs Opt</span>
                    <span className={`font-semibold ${getVarianceColor(location.actVsOpt)}`}>
                      {location.actVsOpt > 0 ? '+' : ''}{location.actVsOpt.toFixed(1)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredData.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-400 text-lg">No locations match the selected filters</p>
          </div>
        )}
      </main>
    </div>
  );
}
