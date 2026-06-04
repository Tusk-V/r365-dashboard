import { useEffect, useRef } from 'react';
import { MessageSquare, Pin } from 'lucide-react';
import MessageItem from './MessageItem';

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
    if (nearBottomRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
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

      <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <MessageSquare size={40} className="mb-2 opacity-50" />
            <p className="text-sm">No messages yet — say something.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60 py-1">
            {messages.map(m => (
              <MessageItem key={m._id} message={m} userEmail={userEmail} canModerate={canModerate} onReact={onReact} onEdit={onEdit} onDelete={onDelete} onRetry={onRetry} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
