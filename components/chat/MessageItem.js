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

export default function MessageItem({ message, userEmail, canModerate, onReact, onEdit, onDelete, onRetry }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const mine = message.authorEmail === userEmail;
  const canEdit = mine;
  const canRemove = mine || canModerate;

  const priorityAccent = message.priority === 'urgent'
    ? 'border-l-red-500' : message.priority === 'important'
    ? 'border-l-yellow-500' : 'border-l-blue-500';

  const saveEdit = () => {
    if (draft.trim() && draft !== message.body) onEdit(message._id, draft.trim());
    setEditing(false);
  };

  return (
    <div className={`group px-3 py-2 hover:bg-slate-800/40 ${message.isAnnouncement ? `border-l-4 ${priorityAccent} bg-slate-800/30` : ''}`}>
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {message.isAnnouncement && <Megaphone size={12} className="text-yellow-400" />}
        <span className="font-medium text-slate-200">{message.authorName}</span>
        <RoleBadge role={message.authorRole} />
        <span>·</span>
        <span>{formatTime(message.createdAt)}</span>
        {message.editedAt && <span className="italic">(edited)</span>}
      </div>

      {editing ? (
        <div className="mt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-600"
            autoFocus
          />
          <div className="flex gap-2 justify-end mt-1">
            <button onClick={() => { setEditing(false); setDraft(message.body); }} className="px-2 py-0.5 text-xs text-slate-400 hover:text-white">Cancel</button>
            <button onClick={saveEdit} className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded">Save</button>
          </div>
        </div>
      ) : (
        <p className={`text-sm whitespace-pre-wrap mt-0.5 break-words ${message._pending ? 'text-slate-400 italic' : 'text-slate-200'}`}>{message.body}</p>
      )}

      {message._failed && (
        <div className="mt-0.5 text-xs text-red-400">
          Not delivered.{' '}
          <button onClick={() => onRetry && onRetry(message)} className="underline hover:text-red-300">Retry</button>
        </div>
      )}

      {!message._pending && !message._failed && (
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {message.reactions && Object.entries(message.reactions).map(([emoji, users]) => (
          users.length > 0 && (
            <button
              key={emoji}
              onClick={() => onReact(message._id, emoji)}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${users.includes(userEmail) ? 'bg-blue-600/30 border border-blue-500' : 'bg-slate-700 border border-slate-600 hover:border-slate-500'}`}
              title={users.join(', ')}
            >
              <span>{emoji}</span><span className="text-slate-300">{users.length}</span>
            </button>
          )
        ))}

        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <button onClick={() => setShowEmoji(v => !v)} className="p-1 text-slate-400 hover:text-slate-200" title="React"><Smile size={14} /></button>
          {canEdit && !editing && <button onClick={() => setEditing(true)} className="p-1 text-slate-400 hover:text-blue-400" title="Edit"><Pencil size={14} /></button>}
          {canRemove && <button onClick={() => onDelete(message._id)} className="p-1 text-slate-400 hover:text-red-400" title="Delete"><Trash2 size={14} /></button>}
          {showEmoji && (
            <div className="absolute bottom-full left-0 mb-1 bg-slate-700 border border-slate-600 rounded-lg p-1 flex gap-1 shadow-lg z-10">
              {QUICK_EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => { onReact(message._id, emoji); setShowEmoji(false); }} className="w-7 h-7 flex items-center justify-center hover:bg-slate-600 rounded text-base">{emoji}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
