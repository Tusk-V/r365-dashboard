import { useState, useEffect } from 'react';
import { X, Check, Ban } from 'lucide-react';

export default function PendingApprovals({ onClose }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await fetch('/api/chat/members');
      const data = await res.json();
      if (res.ok) setPending(data.pending || []);
    } catch (_) {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const act = async (email, action) => {
    setBusy(email);
    try {
      const res = await fetch('/api/chat/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });
      if (res.ok) setPending(prev => prev.filter(p => p.email !== email));
    } catch (_) {}
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h2 className="font-bold text-white">Pending approvals</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? <p className="text-slate-400 text-sm p-4 text-center">Loading…</p>
            : pending.length === 0 ? <p className="text-slate-400 text-sm p-4 text-center">No pending requests.</p>
            : pending.map(p => (
              <div key={p.email} className="bg-slate-700/50 rounded-lg p-3">
                <div className="text-white text-sm font-medium">{p.name}</div>
                <div className="text-slate-400 text-xs">{p.email}</div>
                <div className="text-slate-300 text-xs mt-1">Stores: {p.stores.join(', ')}</div>
                <div className="flex gap-2 mt-2">
                  <button disabled={busy === p.email} onClick={() => act(p.email, 'approve')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded"><Check size={14} /> Approve</button>
                  <button disabled={busy === p.email} onClick={() => act(p.email, 'deny')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white text-sm rounded"><Ban size={14} /> Deny</button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
