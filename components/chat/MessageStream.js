import { useEffect, useRef } from 'react';
import { MessageSquare, Pin } from 'lucide-react';
import MessageItem from './MessageItem';

const GROUP_GAP_MS = 5 * 60 * 1000; // start a new group after a 5-min gap

function sameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

function dayLabel(dateString) {
  const d = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - that) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function MessageStream({ messages, pinned, userEmail, canModerate, onReact, onEdit, onDelete, onRetry }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const nearBottomRef = useRef(true);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    // Scroll the message container itself (never scrollIntoView, which on iOS can
    // scroll ancestor containers and drag the sticky header/footer out of place).
    if (nearBottomRef.current && containerRef.current) {
      const el = containerRef.current;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {pinned && pinned.length > 0 && (
        <div className="border-b border-slate-700 bg-slate-900/40 max-h-40 overflow-y-auto">
          {pinned.map(p => (
            <div key={p._id} className={`px-3 py-2 border-l-4 ${p.priority === 'urgent' ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Pin size={11} className="text-yellow-400" />
                <span className="font-medium text-slate-200">{p.authorName}</span>
                {p.priority === 'urgent' && <span className="px-1 text-[9px] font-semibold bg-red-600 text-white rounded">URGENT</span>}
              </div>
              <p className="text-xs text-slate-200 whitespace-pre-wrap mt-0.5">{p.body}</p>
            </div>
          ))}
        </div>
      )}

      <div ref={containerRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <MessageSquare size={40} className="mb-2 opacity-50" />
            <p className="text-sm">No messages yet — say something.</p>
          </div>
        ) : (
          <div className="py-1">
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
              // First message of a visual group gets the full avatar + name + time header.
              const showHeader = newDay || !prev
                || prev.authorEmail !== m.authorEmail
                || m.isAnnouncement || prev.isAnnouncement
                || (new Date(m.createdAt) - new Date(prev.createdAt) > GROUP_GAP_MS);
              return (
                <div key={m._id}>
                  {newDay && (
                    <div className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 h-px bg-slate-700/60" />
                      <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{dayLabel(m.createdAt)}</span>
                      <div className="flex-1 h-px bg-slate-700/60" />
                    </div>
                  )}
                  <MessageItem
                    message={m}
                    userEmail={userEmail}
                    canModerate={canModerate}
                    showHeader={showHeader}
                    onReact={onReact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRetry={onRetry}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
