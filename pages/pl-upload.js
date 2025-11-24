// pages/pl-upload.js
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useState, useEffect } from 'react';
import { Upload, CheckCircle, XCircle, FileSpreadsheet, Trash2 } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default function PLUpload() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [existingData, setExistingData] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (status === "authenticated") {
      // Check if user is admin
      if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        router.push("/");
      } else {
        loadExistingData();
      }
    }
  }, [status, session, router]);

  const loadExistingData = async () => {
    try {
      const response = await fetch('/api/get-pl-summary');
      if (response.ok) {
        const data = await response.json();
        setExistingData(data.summary || []);
      }
    } catch (error) {
      console.error('Error loading existing data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const handleFiles = async (files) => {
    const excelFiles = files.filter(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );

    if (excelFiles.length === 0) {
      setUploadResults([{ fileName: 'No files', success: false, message: 'Please upload Excel files (.xlsx or .xls)' }]);
      return;
    }

    setUploading(true);
    setUploadResults([]);

    const results = [];

    for (const file of excelFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload-pl', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          results.push({
            fileName: file.name,
            success: true,
            message: data.message,
            location: data.location,
            periodEnding: data.periodEnding
          });
        } else {
          results.push({
            fileName: file.name,
            success: false,
            message: data.error || 'Upload failed'
          });
        }
      } catch (error) {
        results.push({
          fileName: file.name,
          success: false,
          message: error.message
        });
      }
    }

    setUploadResults(results);
    setUploading(false);
    loadExistingData(); // Refresh the list
  };

  const handleDelete = async (location, periodEnding) => {
    if (!confirm(`Delete P&L data for ${location} (${periodEnding})?`)) {
      return;
    }

    try {
      const response = await fetch('/api/delete-pl', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location, periodEnding })
      });

      if (response.ok) {
        loadExistingData();
      } else {
        const data = await response.json();
        alert(data.error || 'Delete failed');
      }
    } catch (error) {
      alert(error.message);
    }
  };

  if (status === "loading" || loadingData) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!session || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return null;
  }

  return (
    <>
      <Head>
        <title>P&L Upload - Andy's Dashboard</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src="https://i.imgur.com/kkJMVz0.png" 
                  alt="Andy's Frozen Custard" 
                  className="h-12"
                />
                <div>
                  <h1 className="text-xl font-bold text-white">P&L Upload</h1>
                  <p className="text-sm text-slate-400">Upload P&L reports from R365</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                >
                  Back to Dashboard
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

          {/* Upload Area */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-4 shadow-lg">
            <h2 className="text-lg font-semibold text-white mb-4">Upload P&L Files</h2>
            
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive 
                  ? 'border-blue-500 bg-blue-500/10' 
                  : 'border-slate-600 hover:border-slate-500'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Upload className="mx-auto mb-4 text-slate-400" size={48} />
              <p className="text-white mb-2">Drag and drop P&L Excel files here</p>
              <p className="text-slate-400 text-sm mb-4">or</p>
              <label className="cursor-pointer">
                <span className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                  Browse Files
                </span>
                <input
                  type="file"
                  multiple
                  accept=".xlsx,.xls"
                  onChange={handleFileInput}
                  className="hidden"
                />
              </label>
              <p className="text-slate-500 text-xs mt-4">Supports .xlsx and .xls files</p>
            </div>

            {uploading && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
                <p className="text-white mt-2">Uploading...</p>
              </div>
            )}

            {uploadResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {uploadResults.map((result, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      result.success ? 'bg-green-900/30 border border-green-700' : 'bg-red-900/30 border border-red-700'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle className="text-green-400 flex-shrink-0" size={20} />
                    ) : (
                      <XCircle className="text-red-400 flex-shrink-0" size={20} />
                    )}
                    <div className="flex-1">
                      <p className="text-white font-medium">{result.fileName}</p>
                      <p className={result.success ? 'text-green-400 text-sm' : 'text-red-400 text-sm'}>
                        {result.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Existing Data */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-white mb-4">Uploaded P&L Data</h2>
            
            {existingData.length === 0 ? (
              <p className="text-slate-400 text-center py-8">No P&L data uploaded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Location</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Period Ending</th>
                      <th className="text-left py-3 px-4 text-slate-400 font-semibold">Uploaded</th>
                      <th className="text-right py-3 px-4 text-slate-400 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingData.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="py-3 px-4 text-white">{item.location}</td>
                        <td className="py-3 px-4 text-slate-300">{item.periodEnding}</td>
                        <td className="py-3 px-4 text-slate-400">
                          {new Date(item.uploadedAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDelete(item.location, item.periodEnding)}
                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
