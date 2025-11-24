import { useState, useEffect, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Upload, Trash2, ArrowLeft, CheckCircle, XCircle, FileSpreadsheet } from 'lucide-react';

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
    if (!confirm(`Delete P&L data for ${location} (${periodEnding})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/delete-pl?location=${encodeURIComponent(location)}&periodEnding=${encodeURIComponent(periodEnding)}`, {
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
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Admin access required</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>P&L Upload - Andy's Dashboard</title>
      </Head>
      
      <div className="min-h-screen bg-slate-900 text-white">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-lg font-bold">P&L Upload</h1>
                <p className="text-sm text-slate-400">Upload R365 P&L Reports</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => router.push('/pl')}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
              >
                View P&L
              </button>
              <button
                onClick={() => router.push('/admin/users')}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
              >
                Manage Users
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto p-4">
          {/* Upload Area */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 transition-colors ${
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
                <p className="text-lg mb-2">Drag & drop P&L Excel file here</p>
                <p className="text-slate-400 mb-4">or click to browse</p>
                <label className="inline-block">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <span className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer inline-flex items-center gap-2">
                    <Upload size={18} />
                    Select File
                  </span>
                </label>
                <p className="text-sm text-slate-500 mt-4">
                  Each sheet in the Excel file will be processed as a separate location
                </p>
              </>
            )}
          </div>

          {/* Upload Results */}
          {uploadResults && (
            <div className={`rounded-lg p-4 mb-6 ${
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
                  <div className="space-y-1">
                    {uploadResults.results?.map((result, idx) => (
                      <div key={idx} className={`text-sm flex items-center gap-2 ${
                        result.status === 'success' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {result.status === 'success' ? (
                          <CheckCircle size={14} />
                        ) : (
                          <XCircle size={14} />
                        )}
                        <span>
                          {result.location}
                          {result.periodEnding && ` (${result.periodEnding})`}
                          {result.error && `: ${result.error}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Existing Data */}
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h2 className="font-semibold">Uploaded P&L Data</h2>
            </div>
            
            {existingData.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No P&L data uploaded yet
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {existingData.map((item, idx) => (
                  <div key={idx} className="px-4 py-3 flex items-center justify-between hover:bg-slate-700/50">
                    <div>
                      <div className="font-medium">{item.location}</div>
                      <div className="text-sm text-slate-400">
                        Period: {item.periodEnding}
                        {item.uploadedAt && ` • Uploaded: ${new Date(item.uploadedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDelete(item.location, item.periodEnding)}
                      className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
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
