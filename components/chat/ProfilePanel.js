import { useState, useRef } from 'react';
import { X, Camera } from 'lucide-react';

export default function ProfilePanel({ initialName, initialImage, onClose, onUpdated }) {
  const [name, setName] = useState(initialName || '');
  const [previewImage, setPreviewImage] = useState(initialImage || null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef(null);

  const nameChanged = name.trim() !== '' && name.trim() !== (initialName || '').trim();
  const canSave = nameChanged && !saving;

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const res = await fetch('/api/chat/avatar', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await res.json();
      if (res.ok && data.image) {
        setPreviewImage(data.image);
        onUpdated();
      } else {
        setUploadError(data.error || 'Upload failed');
      }
    } catch (_) {
      setUploadError('Upload failed — please try again.');
    }
    setUploading(false);
    // Reset input so re-selecting the same file triggers onChange again
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaveError('');
    setSaving(true);
    try {
      const res = await fetch('/api/chat/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        onUpdated();
        onClose();
      } else {
        setSaveError(data.error || 'Failed to save');
      }
    } catch (_) {
      setSaveError('Failed to save — please try again.');
    }
    setSaving(false);
  };

  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 w-full sm:max-w-sm sm:rounded-lg rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="font-bold text-white">Edit Profile</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col items-center gap-5">
          {/* Avatar preview + change button */}
          <div className="relative">
            {previewImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewImage}
                alt={name || ''}
                className="h-20 w-20 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-slate-600 flex items-center justify-center text-2xl font-semibold text-slate-200">
                {initial}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center shadow"
              title="Change photo"
            >
              <Camera size={14} className="text-white" />
            </button>
          </div>

          {uploading && <p className="text-xs text-slate-400">Uploading…</p>}
          {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Name input */}
          <div className="w-full">
            <label className="block text-xs text-slate-400 mb-1">Display name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave(); }}
              className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600"
              placeholder="Your name"
            />
          </div>

          {saveError && <p className="text-xs text-red-400 self-start">{saveError}</p>}

          {/* Actions */}
          <div className="w-full flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm rounded-md border border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="flex-1 px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
