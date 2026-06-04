import { useState } from 'react';
import { Store, Check, Clock } from 'lucide-react';

// Mirror of lib/channels LOCATIONS (client-side list for the picker).
const LOCATIONS = [
  'Allen','Bixby','Broken Arrow','Carrollton','Claremore','Edmond','Frisco #1','Frisco #2','Frisco #3',
  'Hillcrest Village',"Hunter's Creek",'Lake Highlands','Lakeland','Norman','Owasso','Penn','Prosper','Sanford','The Colony','Warr Acres','Yale',
].sort((a,b)=>a.localeCompare(b));

export default function Onboarding({ status, onSubmitted }) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (status === 'pending') {
    return (
      <div className="h-[100dvh] bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <Clock size={48} className="text-yellow-400 mb-4" />
        <h1 className="text-xl font-bold mb-2">Request sent</h1>
        <p className="text-slate-300 max-w-sm">Your request is waiting for a manager to approve. You'll get in as soon as they do — check back shortly.</p>
      </div>
    );
  }

  const toggle = (loc) => setSelected(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]);

  const submit = async () => {
    if (selected.length === 0) { setError('Pick at least one store.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/chat/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: selected }),
      });
      const data = await res.json();
      if (res.ok) onSubmitted(); else setError(data.error || 'Something went wrong.');
    } catch (_) { setError('Network error. Try again.'); }
    setSaving(false);
  };

  return (
    <div className="h-[100dvh] bg-slate-900 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold flex items-center gap-2"><Store size={20} className="text-blue-400" /> Welcome to Andy's Messages</h1>
        <p className="text-slate-400 text-sm mt-1">Which store(s) do you work at? Pick all that apply — your manager will approve you.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2">
        {LOCATIONS.map(loc => {
          const on = selected.includes(loc);
          return (
            <button key={loc} onClick={() => toggle(loc)}
              className={`flex items-center justify-between min-h-[48px] px-3 py-2 rounded-lg border text-sm text-left ${on ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <span className="truncate">{loc}</span>
              {on && <Check size={16} className="text-blue-400 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      <div className="p-4 border-t border-slate-700">
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button onClick={submit} disabled={saving || selected.length === 0}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 text-white font-medium rounded-lg">
          {saving ? 'Sending…' : `Request access${selected.length ? ` (${selected.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}
