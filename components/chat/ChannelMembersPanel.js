import { useState, useEffect } from 'react';
import { X, Check, Ban, UserMinus, Users } from 'lucide-react';

function Avatar({ name, image }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name || ''} className="h-8 w-8 rounded-full object-cover flex-shrink-0" referrerPolicy="no-referrer" />;
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return <div className="h-8 w-8 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200 flex-shrink-0">{initial}</div>;
}

export default function ChannelMembersPanel({ channel, channelName, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/chat/channel-admin?channel=${encodeURIComponent(channel)}`);
      const d = await res.json();
      if (res.ok) setData(d);
    } catch (_) {}
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [channel]);

  const post = async (body) => {
    setBusy(body.email);
    try {
      const res = await fetch('/api/chat/channel-admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, ...body }),
      });
      if (res.ok) await load();
    } catch (_) {}
    setBusy(null);
  };

  const isAdmin = data?.isAdmin;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="min-w-0">
            <h2 className="font-bold text-white flex items-center gap-2"><Users size={18} /> Members</h2>
            <p className="text-xs text-slate-400 truncate">{channelName}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-slim p-3 space-y-4">
          {loading ? (
            <p className="text-slate-400 text-sm p-4 text-center">Loading…</p>
          ) : !data ? (
            <p className="text-slate-400 text-sm p-4 text-center">Couldn’t load members.</p>
          ) : (
            <>
              {data.pending.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5 px-1">Pending</h3>
                  <div className="space-y-2">
                    {data.pending.map(p => (
                      <div key={p.email} className="bg-slate-700/50 rounded-lg p-3">
                        <div className="text-white text-sm font-medium">{p.name}</div>
                        <div className="text-slate-400 text-xs">{p.email}</div>
                        <div className="text-slate-300 text-xs mt-1">Stores: {p.stores.join(', ')}</div>
                        <div className="flex gap-2 mt-2">
                          <button disabled={busy === p.email} onClick={() => post({ email: p.email, action: 'approve' })}
                            className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded"><Check size={14} /> Approve</button>
                          <button disabled={busy === p.email} onClick={() => post({ email: p.email, action: 'deny' })}
                            className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white text-sm rounded"><Ban size={14} /> Deny</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5 px-1">{data.members.length} member{data.members.length === 1 ? '' : 's'}</h3>
                <div className="space-y-1">
                  {data.members.map(m => (
                    <div key={m.email} className="flex items-start gap-2 p-1.5 rounded hover:bg-slate-700/40">
                      <Avatar name={m.name} image={m.image} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-sm text-white">
                          <span className="truncate">{m.name}</span>
                          {(m.isAdmin || m.owner) && <span className="px-1 py-px text-[9px] font-semibold bg-red-600 text-white rounded leading-none flex-shrink-0">Admin</span>}
                          {!m.isAdmin && !m.owner && m.fom && <span className="px-1 py-px text-[9px] font-semibold bg-blue-600 text-white rounded leading-none flex-shrink-0">FOM</span>}
                          {!m.isAdmin && !m.owner && !m.fom && (m.managedMarkets || []).length > 0 && <span className="px-1 py-px text-[9px] font-semibold bg-purple-600 text-white rounded leading-none flex-shrink-0">MM</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{m.email}</div>
                      </div>

                      {m.removable && (
                        <button disabled={busy === m.email} onClick={() => post({ email: m.email, action: 'remove' })}
                          className="p-1.5 text-slate-400 hover:text-red-400 disabled:opacity-50 flex-shrink-0" title="Remove from this channel">
                          <UserMinus size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
