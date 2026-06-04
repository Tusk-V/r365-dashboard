import { useState } from 'react';
import { Send, Megaphone } from 'lucide-react';

export default function Composer({ channelName, canAnnounce, onSend }) {
  const [body, setBody] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [priority, setPriority] = useState('important');

  const submit = () => {
    if (!body.trim()) return;
    onSend({ body: body.trim(), isAnnouncement: announce, priority: announce ? priority : 'normal' });
    setBody('');
    setAnnounce(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div
      className="flex-shrink-0 border-t border-slate-700 p-3"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      {canAnnounce && (
        <div className="flex items-center gap-3 mb-2">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-300">
            <input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-blue-600" />
            <Megaphone size={13} className="text-yellow-400" /> Post as announcement
          </label>
          {announce && (
            <div className="flex gap-1">
              {['important', 'urgent'].map(p => (
                <button key={p} onClick={() => setPriority(p)} className={`px-2 py-0.5 text-[10px] rounded border ${priority === p ? (p === 'urgent' ? 'bg-red-600/20 border-red-600 text-red-400' : 'bg-yellow-600/20 border-yellow-600 text-yellow-400') : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${channelName}…`}
          rows={1}
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-600 max-h-32"
        />
        <button onClick={submit} disabled={!body.trim()} className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg" title="Send (Enter)">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
