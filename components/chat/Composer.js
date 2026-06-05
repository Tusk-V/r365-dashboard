import { useState } from 'react';
import { Send, Megaphone, SmilePlus } from 'lucide-react';

const EMOJIS = [
  '👍', '👎', '❤️', '🔥', '🎉', '👀', '😂', '😅',
  '😊', '😍', '🤔', '😮', '😢', '😡', '🙏', '👏',
  '💪', '✅', '❌', '⭐', '💯', '🚀', '☕', '🍦',
  '🙌', '👌', '🤝', '🥳', '😴', '🤷', '📈', '⚠️',
];

export default function Composer({ channelName, canAnnounce, onSend }) {
  const [body, setBody] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [priority, setPriority] = useState('important');
  const [showEmoji, setShowEmoji] = useState(false);

  const submit = () => {
    if (!body.trim()) return;
    onSend({ body: body.trim(), isAnnouncement: announce, priority: announce ? priority : 'normal' });
    setBody('');
    setAnnounce(false);
    setShowEmoji(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  const insertEmoji = (em) => { setBody(b => b + em); setShowEmoji(false); };

  return (
    <div
      className="flex-shrink-0 border-t border-white/5 p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-4xl mx-auto">
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

        <div className="relative flex items-end gap-2">
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-2 w-60 max-h-44 overflow-y-auto scrollbar-slim bg-slate-800/80 hairline rounded-lg p-2 shadow-xl grid grid-cols-8 gap-0.5 z-10">
              {EMOJIS.map(em => (
                <button key={em} onClick={() => insertEmoji(em)} className="w-6 h-6 flex items-center justify-center hover:bg-slate-600 rounded text-base">{em}</button>
              ))}
            </div>
          )}

          <div className="flex-1 flex items-end bg-slate-800/80 hairline rounded-2xl pl-1 pr-2 focus-within:ring-1 focus-within:ring-blue-600">
            <button
              onClick={() => setShowEmoji(v => !v)}
              className={`p-2 flex-shrink-0 rounded-full hover:text-slate-200 ${showEmoji ? 'text-blue-400' : 'text-slate-400'}`}
              title="Emoji"
            >
              <SmilePlus size={18} />
            </button>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Message ${channelName}…`}
              rows={1}
              className="flex-1 bg-transparent py-2 text-white text-base md:text-sm placeholder-slate-500 resize-none focus:outline-none max-h-32"
            />
          </div>

          <button
            onClick={submit}
            disabled={!body.trim()}
            className="h-10 w-10 flex items-center justify-center flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-full transition-transform active:scale-90 disabled:active:scale-100"
            title="Send (Enter)"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
