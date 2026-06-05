import { useState, useEffect } from 'react';
import { X, Users, ChevronDown, ChevronRight } from 'lucide-react';

const ROLE_BADGE = {
  Admin: 'bg-red-600',
  FOM: 'bg-blue-600',
  Manager: 'bg-green-600',
};

export default function UsersDirectory({ onClose }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/chat/directory');
        const data = await res.json();
        if (res.ok) {
          setChannels(data.channels || []);
          if (data.channels?.[0]) setOpen({ [data.channels[0].key]: true });
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const toggle = (key) => setOpen(o => ({ ...o, [key]: !o[key] }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h2 className="font-bold text-white flex items-center gap-2"><Users size={18} /> Members by channel</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
          {loading ? <p className="text-slate-400 text-sm p-4 text-center">Loading…</p>
            : channels.length === 0 ? <p className="text-slate-400 text-sm p-4 text-center">No channels to show.</p>
            : channels.map(ch => (
              <div key={ch.key} className="bg-slate-700/40 rounded-lg overflow-hidden">
                <button onClick={() => toggle(ch.key)} className="w-full flex items-center justify-between gap-2 p-3 text-left hover:bg-slate-700/60">
                  <span className="flex items-center gap-2 text-white text-sm font-medium">
                    {open[ch.key] ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                    {ch.name}
                  </span>
                  <span className="text-slate-400 text-xs flex-shrink-0">{ch.members.length}</span>
                </button>
                {open[ch.key] && (
                  <div className="px-3 pb-3 pt-0 space-y-1.5">
                    {ch.members.length === 0 ? (
                      <p className="text-slate-500 text-xs">No members yet.</p>
                    ) : ch.members.map(m => (
                      <div key={m.email} className="flex items-center gap-2 text-sm">
                        <span className="text-slate-200 flex-shrink-0">{m.name}</span>
                        {ROLE_BADGE[m.role] && (
                          <span className={`px-1 py-px text-[9px] font-semibold ${ROLE_BADGE[m.role]} text-white rounded leading-none flex-shrink-0`}>{m.role}</span>
                        )}
                        <span className="text-slate-500 text-xs truncate">{m.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
