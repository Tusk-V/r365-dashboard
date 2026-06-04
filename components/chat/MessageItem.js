import { useState } from 'react';
import { Pencil, Trash2, Smile, Megaphone } from 'lucide-react';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🔥'];

const RoleBadge = ({ role }) => {
  if (role === 'Admin') return <span className="px-1 py-px text-[9px] font-semibold bg-red-600 text-white rounded ml-1 leading-none">Admin</span>;
  if (role === 'FOM') return <span className="px-1 py-px text-[9px] font-semibold bg-blue-600 text-white rounded ml-1 leading-none">FOM</span>;
  if (role === 'Manager') return <span className="px-1 py-px text-[9px] font-semibold bg-green-600 text-white rounded ml-1 leading-none">Manager</span>;
  return null;
};

function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMins = Math.floor((now - date) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatClock(dateString) {
  return new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function Avatar({ name, image }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name || ''} className="h-9 w-9 rounded-full object-cover" referrerPolicy="no-referrer" />;
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="h-9 w-9 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200">
      {initial}
    </div>
  );
}

export default function MessageItem({ message, userEmail, canModerate, showHeader = true, onReact, onEdit, onDelete, onRetry }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [actionsOpen, setActionsOpen] = useState(false); // mobile: tap message to reveal
  const mine = message.authorEmail === userEmail;
  const canEdit = mine;
  const canRemove = mine || canModerate;

  const priorityAccent = message.priority === 'urgent'
    ? 'border-l-red-500' : message.priority === 'important'
    ? 'border-l-yellow-500' : 'border-l-blue-500';

  const stop = (e) => e.stopPropagation();
  const saveEdit = () => {
    if (draft.trim() && draft !== message.body) onEdit(message._id, draft.trim());
    setEditing(false);
  };

  return (
    <div
      className={`group relative flex gap-2 px-3 ${showHeader ? 'pt-2' : 'pt-px'} pb-0.5 hover:bg-slate-800/40 ${message.isAnnouncement ? `border-l-4 ${priorityAccent} bg-slate-800/30` : ''}`}
      onClick={() => { if (!editing) setActionsOpen(o => !o); }}
    >
      {/* Avatar column (or hover timestamp for grouped messages) */}
      <div className="w-9 flex-shrink-0 select-none">
        {showHeader
          ? <Avatar name={message.authorName} image={message.authorImage} />
          : <span className="block pt-0.5 pr-1 text-right text-[10px] leading-5 text-slate-600 opacity-0 group-hover:opacity-100">{formatClock(message.createdAt)}</span>}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0">
        {showHeader && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            {message.isAnnouncement && <Megaphone size={12} className="text-yellow-400" />}
            <span className="font-medium text-slate-200">{message.authorName}</span>
            <RoleBadge role={message.authorRole} />
            <span>·</span>
            <span>{formatTime(message.createdAt)}</span>
            {message.editedAt && <span className="italic">(edited)</span>}
          </div>
        )}

        {editing ? (
          <div className="mt-1" onClick={stop}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-600"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-1">
              <button onClick={(e) => { stop(e); setEditing(false); setDraft(message.body); }} className="px-2 py-0.5 text-xs text-slate-400 hover:text-white">Cancel</button>
              <button onClick={(e) => { stop(e); saveEdit(); }} className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">Save</button>
            </div>
          </div>
        ) : (
          <p className={`text-sm whitespace-pre-wrap mt-0.5 break-words ${message._pending ? 'text-slate-400 italic' : 'text-slate-200'}`}>
            {message.body}
            {message.editedAt && !showHeader && <span className="ml-1 text-[10px] italic text-slate-500">(edited)</span>}
          </p>
        )}

        {message._failed && (
          <div className="mt-0.5 text-xs text-red-400">
            Not delivered.{' '}
            <button onClick={(e) => { stop(e); onRetry && onRetry(message); }} className="underline hover:text-red-300">Retry</button>
          </div>
        )}

        {!message._pending && !message._failed && (
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {message.reactions && Object.entries(message.reactions).map(([emoji, users]) => (
              users.length > 0 && (
                <button
                  key={emoji}
                  onClick={(e) => { stop(e); onReact(message._id, emoji); }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${users.includes(userEmail) ? 'bg-blue-600/30 border border-blue-500' : 'bg-slate-700 border border-slate-600 hover:border-slate-500'}`}
                  title={users.join(', ')}
                >
                  <span>{emoji}</span><span className="text-slate-300">{users.length}</span>
                </button>
              )
            ))}

            <div className={`relative flex items-center gap-1 transition-opacity ${actionsOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'}`}>
              <button onClick={(e) => { stop(e); setShowEmoji(v => !v); }} className="p-1 text-slate-400 hover:text-slate-200" title="React"><Smile size={16} /></button>
              {canEdit && !editing && <button onClick={(e) => { stop(e); setEditing(true); }} className="p-1 text-slate-400 hover:text-blue-400" title="Edit"><Pencil size={16} /></button>}
              {canRemove && <button onClick={(e) => { stop(e); onDelete(message._id); }} className="p-1 text-slate-400 hover:text-red-400" title="Delete"><Trash2 size={16} /></button>}
              {showEmoji && (
                <div className="absolute bottom-full left-0 mb-1 bg-slate-700 border border-slate-600 rounded-lg p-1 flex gap-1 shadow-lg z-10" onClick={stop}>
                  {QUICK_EMOJIS.map(emoji => (
                    <button key={emoji} onClick={(e) => { stop(e); onReact(message._id, emoji); setShowEmoji(false); }} className="w-8 h-8 flex items-center justify-center hover:bg-slate-600 rounded text-base">{emoji}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
