// pages/pl.js
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react';

export default function PLDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [availableLocations, setAvailableLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [plData, setPlData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    sales: true,
    foodCost: true,
    labor: true,
    operating: false,
    occupancy: false
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (status === "authenticated") {
      loadAvailableLocations();
    }
  }, [status, router]);

  const loadAvailableLocations = async () => {
    try {
      const response = await fetch('/api/get-pl');
      const data = await response.json();

      if (response.ok) {
        setAvailableLocations(data.availableLocations || []);
        setHasAccess(true);
        if (data.availableLocations && data.availableLocations.length > 0) {
          setSelectedLocation(data.availableLocations[0]);
        }
      } else {
        setHasAccess(false);
        setError(data.error || 'No P&L access');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLocation) {
      loadPLData(selectedLocation);
    }
  }, [selectedLocation]);

  const loadPLData = async (location) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/get-pl?location=${encodeURIComponent(location)}`);
      const data = await response.json();

      if (response.ok) {
        setPlData(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatCurrency = (value) => {
    if (value === undefined || value === null) return '$0.00';
    return '$' + Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatPercent = (value) => {
    if (value === undefined || value === null) return '0.0%';
    return value.toFixed(1) + '%';
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <>
      <Head>
        <title>P&L Dashboard - Andy's</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 mb-4 shadow-2xl">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <img 
                  src="https://i.imgur.com/kkJMVz0.png" 
                  alt="Andy's Frozen Custard" 
                  className="h-12"
                />
                <div>
                  <h1 className="text-xl font-bold text-white">Profit & Loss</h1>
                  {plData && (
                    <p className="text-sm text-slate-400">Period Ending: {plData.periodEnding}</p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {hasAccess && availableLocations.length > 0 && (
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {availableLocations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => router.push('/')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* No Access Message */}
          {!hasAccess && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <DollarSign className="mx-auto mb-4 text-slate-500" size={48} />
              <h2 className="text-xl font-bold text-white mb-2">No P&L Access</h2>
              <p className="text-slate-400">You don't have access to P&L data. Contact your administrator.</p>
            </div>
          )}

          {/* Loading */}
          {loading && hasAccess && (
            <div className="flex justify-center items-center py-20">
              <div className="text-white text-lg">Loading P&L data...</div>
            </div>
          )}

          {/* P&L Data */}
          {!loading && hasAccess && plData && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Total Sales</p>
                  <p className="text-white text-lg font-bold">{formatCurrency(plData.period.totalSales)}</p>
                  <p className="text-slate-500 text-xs">YTD: {formatCurrency(plData.ytd.totalSales)}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Food Cost %</p>
                  <p className={`text-lg font-bold ${plData.period.foodCostPercent > 30 ? 'text-red-400' : 'text-green-400'}`}>
                    {formatPercent(plData.period.foodCostPercent)}
                  </p>
                  <p className="text-slate-500 text-xs">YTD: {formatPercent(plData.ytd.foodCostPercent)}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Labor Cost %</p>
                  <p className={`text-lg font-bold ${plData.period.laborCostPercent > 30 ? 'text-red-400' : 'text-green-400'}`}>
                    {formatPercent(plData.period.laborCostPercent)}
                  </p>
                  <p className="text-slate-500 text-xs">YTD: {formatPercent(plData.ytd.laborCostPercent)}</p>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                  <p className="text-slate-400 text-xs mb-1">Prime Cost %</p>
                  <p className={`text-lg font-bold ${plData.period.primeCostPercent > 60 ? 'text-red-400' : 'text-green-400'}`}>
                    {formatPercent(plData.period.primeCostPercent)}
                  </p>
                  <p className="text-slate-500 text-xs">YTD: {formatPercent(plData.ytd.primeCostPercent)}</p>
                </div>
              </div>

              {/* Detail Sections */}
              <div className="space-y-3">
                {/* Sales Section */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('sales')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedSections.sales ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                      <span className="text-white font-semibold">Sales</span>
                    </div>
                    <span className="text-white font-bold">{formatCurrency(plData.period.totalSales)}</span>
                  </button>
                  {expandedSections.sales && (
                    <div className="border-t border-slate-700 p-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="text-left py-1">Item</th>
                            <th className="text-right py-1">Period</th>
                            <th className="text-right py-1">YTD</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          <tr><td className="py-1">Food Sales</td><td className="text-right">{formatCurrency(plData.period.foodSales)}</td><td className="text-right">{formatCurrency(plData.ytd.foodSales)}</td></tr>
                          <tr><td className="py-1">Comps</td><td className="text-right text-red-400">({formatCurrency(plData.period.comps)})</td><td className="text-right text-red-400">({formatCurrency(plData.ytd.comps)})</td></tr>
                          <tr><td className="py-1">Discounts</td><td className="text-right text-red-400">({formatCurrency(plData.period.discounts)})</td><td className="text-right text-red-400">({formatCurrency(plData.ytd.discounts)})</td></tr>
                          <tr><td className="py-1">Refunds</td><td className="text-right">{formatCurrency(plData.period.refunds)}</td><td className="text-right">{formatCurrency(plData.ytd.refunds)}</td></tr>
                          <tr className="border-t border-slate-700 font-semibold text-white"><td className="py-2">Total Sales</td><td className="text-right">{formatCurrency(plData.period.totalSales)}</td><td className="text-right">{formatCurrency(plData.ytd.totalSales)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Food Cost Section */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('foodCost')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedSections.foodCost ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                      <span className="text-white font-semibold">Food & Paper Cost</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-bold">{formatCurrency(plData.period.totalFoodCost)}</span>
                      <span className={`ml-2 text-sm ${plData.period.foodCostPercent > 30 ? 'text-red-400' : 'text-green-400'}`}>
                        ({formatPercent(plData.period.foodCostPercent)})
                      </span>
                    </div>
                  </button>
                  {expandedSections.foodCost && (
                    <div className="border-t border-slate-700 p-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="text-left py-1">Item</th>
                            <th className="text-right py-1">Period</th>
                            <th className="text-right py-1">YTD</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          <tr><td className="py-1">Custard Cost</td><td className="text-right">{formatCurrency(plData.period.custardCost)}</td><td className="text-right">{formatCurrency(plData.ytd.custardCost)}</td></tr>
                          <tr><td className="py-1">Nuts Cost</td><td className="text-right">{formatCurrency(plData.period.nutsCost)}</td><td className="text-right">{formatCurrency(plData.ytd.nutsCost)}</td></tr>
                          <tr><td className="py-1">Toppings Cost</td><td className="text-right">{formatCurrency(plData.period.toppingsCost)}</td><td className="text-right">{formatCurrency(plData.ytd.toppingsCost)}</td></tr>
                          <tr><td className="py-1">Beverage Cost</td><td className="text-right">{formatCurrency(plData.period.beverageCost)}</td><td className="text-right">{formatCurrency(plData.ytd.beverageCost)}</td></tr>
                          <tr><td className="py-1">Take Home Cost</td><td className="text-right">{formatCurrency(plData.period.takeHomeCost)}</td><td className="text-right">{formatCurrency(plData.ytd.takeHomeCost)}</td></tr>
                          <tr><td className="py-1">Other Food Cost</td><td className="text-right">{formatCurrency(plData.period.otherFoodCost)}</td><td className="text-right">{formatCurrency(plData.ytd.otherFoodCost)}</td></tr>
                          <tr><td className="py-1">Paper Products</td><td className="text-right">{formatCurrency(plData.period.paperProductsCost)}</td><td className="text-right">{formatCurrency(plData.ytd.paperProductsCost)}</td></tr>
                          <tr><td className="py-1">Mistakes</td><td className="text-right">{formatCurrency(plData.period.mistakes)}</td><td className="text-right">{formatCurrency(plData.ytd.mistakes)}</td></tr>
                          <tr className="border-t border-slate-700 font-semibold text-white"><td className="py-2">Total Food Cost</td><td className="text-right">{formatCurrency(plData.period.totalFoodCost)}</td><td className="text-right">{formatCurrency(plData.ytd.totalFoodCost)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Labor Section */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('labor')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedSections.labor ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                      <span className="text-white font-semibold">Labor Cost</span>
                    </div>
                    <div className="text-right">
                      <span className="text-white font-bold">{formatCurrency(plData.period.totalLaborCost)}</span>
                      <span className={`ml-2 text-sm ${plData.period.laborCostPercent > 30 ? 'text-red-400' : 'text-green-400'}`}>
                        ({formatPercent(plData.period.laborCostPercent)})
                      </span>
                    </div>
                  </button>
                  {expandedSections.labor && (
                    <div className="border-t border-slate-700 p-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="text-left py-1">Item</th>
                            <th className="text-right py-1">Period</th>
                            <th className="text-right py-1">YTD</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          <tr><td className="py-1">Market Manager Wages</td><td className="text-right">{formatCurrency(plData.period.marketManagerWages)}</td><td className="text-right">{formatCurrency(plData.ytd.marketManagerWages)}</td></tr>
                          <tr><td className="py-1">General Manager Wages</td><td className="text-right">{formatCurrency(plData.period.generalManagerWages)}</td><td className="text-right">{formatCurrency(plData.ytd.generalManagerWages)}</td></tr>
                          <tr><td className="py-1">Assistant Manager Wages</td><td className="text-right">{formatCurrency(plData.period.assistantManagerWages)}</td><td className="text-right">{formatCurrency(plData.ytd.assistantManagerWages)}</td></tr>
                          <tr><td className="py-1">Hourly Wages</td><td className="text-right">{formatCurrency(plData.period.hourlyWages)}</td><td className="text-right">{formatCurrency(plData.ytd.hourlyWages)}</td></tr>
                          <tr><td className="py-1">Training Wages</td><td className="text-right">{formatCurrency(plData.period.trainingWages)}</td><td className="text-right">{formatCurrency(plData.ytd.trainingWages)}</td></tr>
                          <tr><td className="py-1">Employee Bonuses</td><td className="text-right">{formatCurrency(plData.period.employeeBonuses)}</td><td className="text-right">{formatCurrency(plData.ytd.employeeBonuses)}</td></tr>
                          <tr className="text-slate-500"><td className="py-1 pl-4">FICA Taxes</td><td className="text-right">{formatCurrency(plData.period.ficaTaxes)}</td><td className="text-right">{formatCurrency(plData.ytd.ficaTaxes)}</td></tr>
                          <tr className="text-slate-500"><td className="py-1 pl-4">FUTA Taxes</td><td className="text-right">{formatCurrency(plData.period.futaTaxes)}</td><td className="text-right">{formatCurrency(plData.ytd.futaTaxes)}</td></tr>
                          <tr className="text-slate-500"><td className="py-1 pl-4">State Unemployment</td><td className="text-right">{formatCurrency(plData.period.stateUnemploymentTax)}</td><td className="text-right">{formatCurrency(plData.ytd.stateUnemploymentTax)}</td></tr>
                          <tr className="text-slate-500"><td className="py-1 pl-4">Health Insurance</td><td className="text-right">{formatCurrency(plData.period.healthInsurance)}</td><td className="text-right">{formatCurrency(plData.ytd.healthInsurance)}</td></tr>
                          <tr className="border-t border-slate-700 font-semibold text-white"><td className="py-2">Total Labor Cost</td><td className="text-right">{formatCurrency(plData.period.totalLaborCost)}</td><td className="text-right">{formatCurrency(plData.ytd.totalLaborCost)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Operating Expenses Section */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('operating')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedSections.operating ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                      <span className="text-white font-semibold">Operating Expenses</span>
                    </div>
                    <span className="text-white font-bold">{formatCurrency(plData.period.totalUtilities)}</span>
                  </button>
                  {expandedSections.operating && (
                    <div className="border-t border-slate-700 p-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="text-left py-1">Item</th>
                            <th className="text-right py-1">Period</th>
                            <th className="text-right py-1">YTD</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          <tr><td className="py-1">Electricity</td><td className="text-right">{formatCurrency(plData.period.electricity)}</td><td className="text-right">{formatCurrency(plData.ytd.electricity)}</td></tr>
                          <tr><td className="py-1">Gas</td><td className="text-right">{formatCurrency(plData.period.gas)}</td><td className="text-right">{formatCurrency(plData.ytd.gas)}</td></tr>
                          <tr><td className="py-1">Trash Removal</td><td className="text-right">{formatCurrency(plData.period.trashRemoval)}</td><td className="text-right">{formatCurrency(plData.ytd.trashRemoval)}</td></tr>
                          <tr><td className="py-1">Water & Sewage</td><td className="text-right">{formatCurrency(plData.period.waterAndSewage)}</td><td className="text-right">{formatCurrency(plData.ytd.waterAndSewage)}</td></tr>
                          <tr><td className="py-1">Repairs & Maintenance</td><td className="text-right">{formatCurrency(plData.period.repairsAndMaintenance)}</td><td className="text-right">{formatCurrency(plData.ytd.repairsAndMaintenance)}</td></tr>
                          <tr><td className="py-1">Credit Card Fees</td><td className="text-right">{formatCurrency(plData.period.creditCardFees)}</td><td className="text-right">{formatCurrency(plData.ytd.creditCardFees)}</td></tr>
                          <tr><td className="py-1">Royalties</td><td className="text-right">{formatCurrency(plData.period.royalties)}</td><td className="text-right">{formatCurrency(plData.ytd.royalties)}</td></tr>
                          <tr className="border-t border-slate-700 font-semibold text-white"><td className="py-2">Total Utilities</td><td className="text-right">{formatCurrency(plData.period.totalUtilities)}</td><td className="text-right">{formatCurrency(plData.ytd.totalUtilities)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Occupancy Section */}
                <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection('occupancy')}
                    className="w-full flex items-center justify-between p-3 hover:bg-slate-750 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {expandedSections.occupancy ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                      <span className="text-white font-semibold">Occupancy Costs</span>
                    </div>
                    <span className="text-white font-bold">{formatCurrency(plData.period.totalOccupancy)}</span>
                  </button>
                  {expandedSections.occupancy && (
                    <div className="border-t border-slate-700 p-3">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="text-left py-1">Item</th>
                            <th className="text-right py-1">Period</th>
                            <th className="text-right py-1">YTD</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-300">
                          <tr><td className="py-1">Rent</td><td className="text-right">{formatCurrency(plData.period.rent)}</td><td className="text-right">{formatCurrency(plData.ytd.rent)}</td></tr>
                          <tr><td className="py-1">Personal Property Taxes</td><td className="text-right">{formatCurrency(plData.period.personalPropertyTaxes)}</td><td className="text-right">{formatCurrency(plData.ytd.personalPropertyTaxes)}</td></tr>
                          <tr><td className="py-1">Real Estate Taxes</td><td className="text-right">{formatCurrency(plData.period.realEstateTaxes)}</td><td className="text-right">{formatCurrency(plData.ytd.realEstateTaxes)}</td></tr>
                          <tr className="border-t border-slate-700 font-semibold text-white"><td className="py-2">Total Occupancy</td><td className="text-right">{formatCurrency(plData.period.totalOccupancy)}</td><td className="text-right">{formatCurrency(plData.ytd.totalOccupancy)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Prime Cost Summary */}
                <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-green-400 font-semibold text-lg">Prime Cost</span>
                    <div className="text-right">
                      <span className="text-white font-bold text-xl">{formatCurrency(plData.period.primeCost)}</span>
                      <span className={`ml-2 ${plData.period.primeCostPercent > 60 ? 'text-red-400' : 'text-green-400'}`}>
                        ({formatPercent(plData.period.primeCostPercent)})
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-400 text-sm mt-1">YTD: {formatCurrency(plData.ytd.primeCost)} ({formatPercent(plData.ytd.primeCostPercent)})</p>
                </div>
              </div>
            </>
          )}

          {/* No Data */}
          {!loading && hasAccess && !plData && selectedLocation && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
              <p className="text-slate-400">No P&L data available for {selectedLocation}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
