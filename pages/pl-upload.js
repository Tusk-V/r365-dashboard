import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Upload, Trash2, CheckCircle, XCircle, FileSpreadsheet, RefreshCw, Users } from 'lucide-react';
import DashboardSelect from '../components/shared/DashboardSelect';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default function PLUpload() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState(null);
  const [existingData, setExistingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      if (session.user.email !== ADMIN_EMAIL) {
        router.push('/pl');
      } else {
        loadExistingData();
      }
    }
  }, [status, session]);

  const loadExistingData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/get-pl-summary');
      const data = await res.json();
      if (res.ok) {
        setExistingData(data.data || []);
      }
    } catch (err) {
      console.error('Error loading existing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  const handleUpload = async (file) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setUploadResults({ error: 'Please upload an Excel file (.xlsx or .xls)' });
      return;
    }

    setUploading(true);
    setUploadResults(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-pl', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        setUploadResults({
          success: true,
          results: data.results,
          fileName: file.name
        });
        loadExistingData();
      } else {
        setUploadResults({ error: data.error });
      }
    } catch (err) {
      setUploadResults({ error: err.message });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (location, periodEnding) => {
    if (!confirm(`Delete all P&L data for ${location} (${periodEnding})? This removes all report types.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/delete-pl?location=${encodeURIComponent(location)}&periodEnding=${encodeURIComponent(periodEnding)}&all=true`, {
        method: 'DELETE'
      });

      if (res.ok) {
        loadExistingData();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (status === 'loading' || loading) {
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
          Sign in
        </button>
      </div>
    );
  }

  if (session?.user?.email !== ADMIN_EMAIL) {
    return null;
  }

  // Group data by location, then by period
  const groupedData = existingData.reduce((acc, item) => {
    if (!acc[item.location]) {
      acc[item.location] = {};
    }
    const period = item.periodEnding;
    if (!acc[item.location][period]) {
      acc[item.location][period] = [];
    }
    acc[item.location][period].push(item.reportType || 'period-ytd');
    return acc;
  }, {});

  const uniquePeriods = [...new Set(existingData.map(d => d.periodEnding))];
  const totalLocations = Object.keys(groupedData).length;

  return (
    <>
      <Head>
        <title>P&L Upload - Andy's Dashboard</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">
          
          {/* Main Header - Same as Dashboard */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 mb-3 shadow-2xl">
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
                <DashboardSelect
                  value="pl"
                  className="px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                
                <button
                  onClick={loadExistingData}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={16} className="text-white" />
                </button>

                <button
                  onClick={() => router.push('/admin/users')}
                  className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  title="Manage Users"
                >
                  <Users size={16} className="text-white" />
                </button>

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
                <button
                  onClick={() => router.push('/admin/users')}
                  className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                >
                  <Users size={16} className="text-white" />
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>

            <div className="md:hidden flex items-center gap-2">
              <DashboardSelect
                value="pl"
                className="flex-1 px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white"
              />
              
              <button
                onClick={loadExistingData}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <RefreshCw size={16} className="text-white" />
              </button>
            </div>
          </div>

          {/* Sub Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">P&L Upload</h2>
              <button
                onClick={() => router.push('/pl')}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                View P&L Dashboard
              </button>
            </div>
          </div>

          {/* Upload Area */}
          <div
            className={`bg-slate-800 border-2 border-dashed rounded-xl p-8 text-center mb-4 transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-slate-600 hover:border-slate-500'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                <p className="text-slate-300">Uploading and processing...</p>
              </div>
            ) : (
              <>
                <FileSpreadsheet size={48} className="mx-auto mb-4 text-slate-400" />
                <p className="text-lg text-white mb-2">Drag & drop P&L Excel file here</p>
                <p className="text-slate-400 mb-4">or click to browse</p>
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer inline-flex items-center gap-2 text-white">
                    <Upload size={18} />
                    Select File
                  </span>
                </label>
                <p className="text-sm text-slate-500 mt-4">
                  One upload populates all report types automatically
                </p>
              </>
            )}
          </div>

          {/* Upload Results */}
          {uploadResults && (
            <div className={`rounded-lg p-4 mb-4 ${
              uploadResults.error
                ? 'bg-red-900/20 border border-red-800'
                : 'bg-green-900/20 border border-green-800'
            }`}>
              {uploadResults.error ? (
                <div className="flex items-center gap-2 text-red-400">
                  <XCircle size={20} />
                  <span>{uploadResults.error}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-green-400 mb-3">
                    <CheckCircle size={20} />
                    <span>Uploaded: {uploadResults.fileName}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {uploadResults.results?.map((result, idx) => (
                      <div key={idx} className={`text-sm flex items-center gap-2 ${
                        result.status === 'success' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {result.status === 'success' ? (
                          <CheckCircle size={14} />
                        ) : (
                          <XCircle size={14} />
                        )}
                        <span>{result.location}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Existing Data */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="font-semibold text-white">
                Uploaded P&L Data ({totalLocations} locations, {uniquePeriods.length} periods)
              </h2>
            </div>
            
            {Object.keys(groupedData).length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No P&L data uploaded yet
              </div>
            ) : (
              <div className="divide-y divide-slate-700 max-h-[500px] overflow-y-auto">
                {Object.entries(groupedData).sort().map(([location, periods]) => (
                  <div key={location} className="p-3">
                    <div className="font-medium text-white mb-2">{location}</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(periods).sort((a, b) => new Date(b[0]) - new Date(a[0])).map(([period, reportTypes]) => (
                        <div
                          key={period}
                          className="flex items-center gap-2 px-2 py-1.5 bg-slate-700 rounded text-sm"
                        >
                          <span className="text-slate-300">{period}</span>
                          <div className="flex gap-1">
                            {reportTypes.includes('current-prior') && (
                              <span className="px-1.5 py-0.5 bg-blue-600/30 text-blue-400 text-[10px] rounded">CP</span>
                            )}
                            {reportTypes.includes('period-ytd') && (
                              <span className="px-1.5 py-0.5 bg-green-600/30 text-green-400 text-[10px] rounded">PY</span>
                            )}
                            {reportTypes.includes('ytd-prior-ytd') && (
                              <span className="px-1.5 py-0.5 bg-purple-600/30 text-purple-400 text-[10px] rounded">YTD</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDelete(location, period)}
                            className="text-red-400 hover:text-red-300"
                            title="Delete all report types for this period"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
