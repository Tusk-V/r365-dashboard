import { useState, useEffect } from 'react';
import { X, ShieldCheck, Search, Pencil } from 'lucide-react';

const MARKETS = ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando'];
const MARKET_LABEL = { 'Oklahoma City': 'OKC' };

function Avatar({ name, image }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name || ''} className="h-8 w-8 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />;
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return <div className="h-8 w-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200 flex-shrink-0">{initial}</div>;
}

function chipClass(on, disabled) {
  return `px-1.5 py-0.5 text-[10px] rounded border ${on ? 'bg-blue-600/30 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'} ${disabled ? 'opacity-40' : ''}`;
}

export default function RolesPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState('');

  const load = async () => {
    try {
      const res = await fetch('/api/chat/roles');
      const d = await res.json();
      if (res.ok) setData(d);
    } catch (_) {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const post = async (body) => {
    setBusy(body.targetEmail);
    try {
      const res = await fetch('/api/chat/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) await load();
      else { const e = await res.json().catch(() => ({})); if (e.error) alert(e.error); }
    } catch (_) {}
    setBusy(null);
  };

  const isSuperAdmin = data?.isSuperAdmin;
  const query = q.trim().toLowerCase();
  const users = (data?.users || []).filter(u => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 w-full sm:max-w-lg sm:rounded-lg rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="font-bold text-white flex items-center gap-2"><ShieldCheck size={18} /> Roles</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="p-3 pb-1 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people"
              className="w-full pl-7 pr-2 py-1.5 bg-slate-700/50 border border-slate-600 rounded-md text-base md:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600" />
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5 px-1">
            Admin = full access (all channels, moderation, management){isSuperAdmin ? ' — only you can grant Admin.' : '.'} FOM = all channels. MM = a market.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim p-3 pt-1 space-y-1">
          {loading ? (
            <p className="text-slate-400 text-sm p-4 text-center">Loading…</p>
          ) : users.length === 0 ? (
            <p className="text-slate-400 text-sm p-4 text-center">No people found.</p>
          ) : users.map(u => {
            const isAdminRow = u.isSuperAdmin || u.owner;
            return (
              <div key={u.email} className="flex items-start gap-2 p-1.5 rounded hover:bg-slate-700/40">
                <Avatar name={u.name} image={u.image} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-sm text-white">
                    <span className="truncate">{u.name}</span>
                    <button onClick={() => { const name = window.prompt('Edit name', u.name); if (name && name.trim() && name.trim() !== u.name) post({ targetEmail: u.email, action: 'name', name: name.trim() }); }} className="p-0.5 text-slate-500 hover:text-white flex-shrink-0" title="Edit name"><Pencil size={12} /></button>
                    {isAdminRow && <span className="px-1 py-px text-[9px] font-semibold bg-red-600 text-white rounded leading-none flex-shrink-0">{u.isSuperAdmin ? 'Super Admin' : 'Admin'}</span>}
                    {!isAdminRow && u.fom && <span className="px-1 py-px text-[9px] font-semibold bg-blue-600 text-white rounded leading-none flex-shrink-0">FOM</span>}
                    {!isAdminRow && !u.fom && u.managedMarkets.length > 0 && <span className="px-1 py-px text-[9px] font-semibold bg-purple-600 text-white rounded leading-none flex-shrink-0">MM</span>}
                    {!isAdminRow && !u.fom && u.managedMarkets.length === 0 && u.hasDashboard && <span className="px-1 py-px text-[9px] font-semibold bg-green-600 text-white rounded leading-none flex-shrink-0">Manager</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{u.email}</div>

                  {!u.isSuperAdmin && (
                    <div className="flex flex-wrap items-center gap-1 mt-1">
                      {isSuperAdmin && (
                        <button disabled={busy === u.email} onClick={() => post({ targetEmail: u.email, action: 'owner', value: !u.owner })} className={chipClass(u.owner)} title="Admin — full access; only the super admin can set this">Admin</button>
                      )}
                      <button disabled={busy === u.email || u.owner} onClick={() => post({ targetEmail: u.email, action: 'fom', value: !u.fom })} className={chipClass(u.fom, u.owner)} title="Field Ops Manager — all channels">FOM</button>
                      {MARKETS.map(mk => {
                        const on = u.managedMarkets.includes(mk);
                        const next = on ? u.managedMarkets.filter(x => x !== mk) : [...u.managedMarkets, mk];
                        const disabled = u.owner || u.fom;
                        return (
                          <button key={mk} disabled={busy === u.email || disabled} onClick={() => post({ targetEmail: u.email, action: 'markets', markets: next })} className={chipClass(on, disabled)} title={`Market manager — ${mk}`}>
                            {MARKET_LABEL[mk] || mk}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
