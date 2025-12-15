import { useState, useEffect } from 'react';
import { X, MessageSquare, Send, Pin, ChevronDown, ChevronUp, Trash2, Plus, Settings, CheckCheck, Archive, Pencil } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

const LOCATIONS = [
  'Allen', 'Bixby', 'Broken Arrow', 'Carrollton', 'Edmond', 
  'Frisco #1', 'Frisco #2', 'Frisco #3', 'Hillcrest Village', 
  'Lake Highlands', 'Lakeland', 'Norman', 'Owasso', 'Penn', 
  'Prosper', 'Sanford', 'The Colony', 'Warr Acres', 'Yale'
];

const MARKETS = ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando'];

// Role badge component
const RoleBadge = ({ role }) => {
  if (role === 'Admin') {
    return <span className="px-1 py-px text-[9px] font-semibold bg-red-600 text-white rounded ml-1 leading-none">Admin</span>;
  }
  if (role === 'FOM') {
    return <span className="px-1 py-px text-[9px] font-semibold bg-blue-600 text-white rounded ml-1 leading-none">FOM</span>;
  }
  if (role === 'Manager') {
    return <span className="px-1 py-px text-[9px] font-semibold bg-green-600 text-white rounded ml-1 leading-none">Manager</span>;
  }
  return null; // No badge for User
};

export default function MessagesPanel({ isOpen, onClose, userEmail, userRole, onUnreadCountChange, onOpenPermissions }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedMessages, setExpandedMessages] = useState(new Set());
  const [showComposer, setShowComposer] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [filter, setFilter] = useState('all');
  const [editingMessage, setEditingMessage] = useState(null);

  const isAdmin = userEmail === ADMIN_EMAIL;
  const canDelete = userRole === 'Admin' || userRole === 'FOM';
  const canPin = userRole === 'Admin' || userRole === 'FOM';

  const [newMessage, setNewMessage] = useState({
    title: '',
    content: '',
    priority: 'normal',
    targetType: 'all',
    targetMarkets: [],
    targetLocations: [],
    pinned: false
  });

  useEffect(() => {
    if (isOpen) {
      loadMessages();
    }
  }, [isOpen]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/messages');
      const data = await res.json();
      
      if (res.ok) {
        setMessages(data.messages || []);
        if (onUnreadCountChange) {
          onUnreadCountChange(data.unreadCount || 0);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load messages');
    }
    setLoading(false);
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAll: true })
      });
      
      if (res.ok) {
        setMessages(prev => prev.map(m => ({ ...m, isRead: true })));
        if (onUnreadCountChange) {
          onUnreadCountChange(0);
        }
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleArchiveMessage = async (messageId) => {
    try {
      const res = await fetch('/api/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, archived: true })
      });

      if (res.ok) {
        setMessages(prev => prev.map(m => 
          m._id === messageId ? { ...m, archived: true } : m
        ));
      }
    } catch (err) {
      alert('Failed to archive message');
    }
  };

  const handleUnarchiveMessage = async (messageId) => {
    try {
      const res = await fetch('/api/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, archived: false })
      });

      if (res.ok) {
        setMessages(prev => prev.map(m => 
          m._id === messageId ? { ...m, archived: false } : m
        ));
      }
    } catch (err) {
      alert('Failed to unarchive message');
    }
  };

  const startEditing = (message) => {
    setEditingMessage({
      _id: message._id,
      title: message.title,
      content: message.content
    });
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editingMessage.title.trim() || !editingMessage.content.trim()) return;

    try {
      const res = await fetch('/api/messages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: editingMessage._id,
          title: editingMessage.title,
          content: editingMessage.content
        })
      });

      if (res.ok) {
        setMessages(prev => prev.map(m => 
          m._id === editingMessage._id 
            ? { ...m, title: editingMessage.title, content: editingMessage.content }
            : m
        ));
        setEditingMessage(null);
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to save changes');
    }
  };

  const markAsRead = async (messageId) => {
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
      });
      
      setMessages(prev => prev.map(m => 
        m._id === messageId ? { ...m, isRead: true } : m
      ));
      
      if (onUnreadCountChange) {
        const newUnread = messages.filter(m => !m.isRead && m._id !== messageId).length;
        onUnreadCountChange(newUnread);
      }
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const toggleExpanded = (messageId) => {
    const message = messages.find(m => m._id === messageId);
    if (message && !message.isRead) {
      markAsRead(messageId);
    }
    
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handlePostMessage = async () => {
    if (!newMessage.title.trim() || !newMessage.content.trim()) return;

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMessage)
      });

      const data = await res.json();

      if (res.ok) {
        setMessages(prev => [data.message, ...prev]);
        setNewMessage({
          title: '',
          content: '',
          priority: 'normal',
          targetType: 'all',
          targetMarkets: [],
          targetLocations: [],
          pinned: false
        });
        setShowComposer(false);
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to post message');
    }
  };

  const handleReply = async (messageId) => {
    if (!replyContent.trim()) return;

    try {
      const res = await fetch('/api/messages/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, content: replyContent })
      });

      const data = await res.json();

      if (res.ok) {
        setMessages(prev => prev.map(m => {
          if (m._id === messageId) {
            return {
              ...m,
              replies: [...(m.replies || []), data.reply],
              replyCount: (m.replyCount || 0) + 1
            };
          }
          return m;
        }));
        setReplyContent('');
        setReplyingTo(null);
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to post reply');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!confirm('Delete this message?')) return;

    try {
      const res = await fetch(`/api/messages?messageId=${messageId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setMessages(prev => prev.filter(m => m._id !== messageId));
      }
    } catch (err) {
      alert('Failed to delete message');
    }
  };

  const handleDeleteReply = async (messageId, replyId) => {
    if (!confirm('Delete this reply?')) return;

    try {
      const res = await fetch(`/api/messages/reply?messageId=${messageId}&replyId=${replyId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setMessages(prev => prev.map(m => {
          if (m._id === messageId) {
            return {
              ...m,
              replies: m.replies.filter(r => r._id !== replyId),
              replyCount: Math.max(0, (m.replyCount || 1) - 1)
            };
          }
          return m;
        }));
      }
    } catch (err) {
      alert('Failed to delete reply');
    }
  };

  const getPriorityStyles = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-4 border-l-red-500 bg-red-900/20';
      case 'important':
        return 'border-l-4 border-l-yellow-500 bg-yellow-900/20';
      default:
        return 'border-l-4 border-l-slate-600';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-1 py-px text-[9px] font-semibold bg-red-600 text-white rounded leading-none">URGENT</span>;
      case 'important':
        return <span className="px-1 py-px text-[9px] font-semibold bg-yellow-600 text-white rounded leading-none">IMPORTANT</span>;
      default:
        return null;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const filteredMessages = messages.filter(m => {
    // Show archived only when filter is 'archived'
    if (filter === 'archived') return m.archived === true;
    
    // For all other filters, exclude archived messages
    if (m.archived) return false;
    
    if (filter === 'unread') return !m.isRead;
    if (filter === 'mine') return m.authorEmail === userEmail;
    return true;
  });

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-slate-800 border-l border-slate-700 z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Messages</h2>
            {messages.filter(m => !m.isRead).length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-red-600 text-white rounded-full">
                {messages.filter(m => !m.isRead).length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center gap-2 p-2 border-b border-slate-700 flex-shrink-0">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-white flex-1"
          >
            <option value="all">All Messages</option>
            <option value="unread">Unread</option>
            <option value="mine">My Posts</option>
            <option value="archived">Archived</option>
          </select>

          <button
            onClick={() => setShowComposer(true)}
            className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
          >
            <Plus size={14} />
            New
          </button>

          {messages.filter(m => !m.isRead && !m.archived).length > 0 && (
            <button
              onClick={markAllAsRead}
              className="p-1.5 text-slate-400 hover:text-green-400 transition-colors"
              title="Mark all as read"
            >
              <CheckCheck size={16} />
            </button>
          )}

          {isAdmin && onOpenPermissions && (
            <button
              onClick={() => {
                onClose();
                onOpenPermissions();
              }}
              className="p-1 text-slate-400 hover:text-white transition-colors"
              title="Manage Permissions"
            >
              <Settings size={16} />
            </button>
          )}
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="text-slate-400">Loading...</div>
            </div>
          ) : error ? (
            <div className="p-3 text-red-400 text-sm">{error}</div>
          ) : filteredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <MessageSquare size={40} className="mb-2 opacity-50" />
              <p className="text-sm">No messages</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700">
              {filteredMessages.map(message => (
                <div 
                  key={message._id}
                  className={`${getPriorityStyles(message.priority)}`}
                >
                  {/* Message Header */}
                  <div 
                    className="p-3 cursor-pointer hover:bg-slate-700/30 transition-colors"
                    onClick={() => toggleExpanded(message._id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {message.pinned && (
                            <Pin size={12} className="text-blue-400 flex-shrink-0" />
                          )}
                          {!message.isRead && !message.archived && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                          )}
                          <h3 className={`font-medium text-sm truncate ${message.isRead || message.archived ? 'text-slate-300' : 'text-white'}`}>
                            {message.title}
                          </h3>
                          {getPriorityBadge(message.priority)}
                          {message.archived && (
                            <span className="px-1 py-px text-[9px] font-semibold bg-slate-600 text-slate-300 rounded leading-none">ARCHIVED</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
                          <span className="flex items-center">
                            {message.authorName}
                            <RoleBadge role={message.authorRole} />
                          </span>
                          <span>•</span>
                          <span>{formatDate(message.createdAt)}</span>
                          {message.replyCount > 0 && (
                            <>
                              <span>•</span>
                              <span>{message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {expandedMessages.has(message._id) ? (
                          <ChevronUp size={16} className="text-slate-400" />
                        ) : (
                          <ChevronDown size={16} className="text-slate-400" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedMessages.has(message._id) && (
                    <div className="border-t border-slate-700/50">
                      <div className="p-3 bg-slate-900/30">
                        <p className="text-slate-300 text-sm whitespace-pre-wrap">{message.content}</p>
                        
                        {message.targetType !== 'all' && (
                          <div className="mt-2 text-[10px] text-slate-500">
                            To: {message.targetLocations?.join(', ') || message.targetMarkets?.join(', ')}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReplyingTo(message._id);
                            }}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                          >
                            Reply
                          </button>
                          {(canDelete || message.authorEmail === userEmail) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditing(message);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-400 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <>
                              {message.archived ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUnarchiveMessage(message._id);
                                  }}
                                  className="p-1 text-green-400 hover:text-green-300 transition-colors"
                                  title="Unarchive"
                                >
                                  <Archive size={14} />
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleArchiveMessage(message._id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-yellow-400 transition-colors"
                                  title="Archive"
                                >
                                  <Archive size={14} />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteMessage(message._id);
                                }}
                                className="p-1 text-red-400 hover:text-red-300 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          {!canDelete && message.authorEmail === userEmail && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMessage(message._id);
                              }}
                              className="p-1 text-red-400 hover:text-red-300 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Replies */}
                      {message.replies?.length > 0 && (
                        <div className="bg-slate-900/50">
                          {message.replies.map(reply => (
                            <div key={reply._id} className="px-3 py-2 border-t border-slate-700/30">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                    <span className="font-medium text-slate-300 flex items-center">
                                      {reply.authorName}
                                      <RoleBadge role={reply.authorRole} />
                                    </span>
                                    <span>•</span>
                                    <span>{formatDate(reply.createdAt)}</span>
                                  </div>
                                  <p className="text-slate-300 text-xs mt-0.5">{reply.content}</p>
                                </div>
                                {(canDelete || reply.authorEmail === userEmail) && (
                                  <button
                                    onClick={() => handleDeleteReply(message._id, reply._id)}
                                    className="p-0.5 text-red-400 hover:text-red-300 transition-colors"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Reply Input */}
                      {replyingTo === message._id && (
                        <div className="p-2 border-t border-slate-700/50 bg-slate-900/50">
                          <textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Write a reply..."
                            rows={2}
                            className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none text-xs"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2 mt-1.5">
                            <button
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyContent('');
                              }}
                              className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleReply(message._id)}
                              disabled={!replyContent.trim()}
                              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded transition-colors"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Message Modal */}
        {showComposer && (
          <div 
            className="absolute inset-0 bg-slate-800 z-10 flex flex-col"
          >
            <div className="flex items-center justify-between p-3 border-b border-slate-700">
              <h3 className="text-base font-bold text-white">New Message</h3>
              <button
                onClick={() => setShowComposer(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={newMessage.title}
                  onChange={(e) => setNewMessage({ ...newMessage, title: e.target.value })}
                  placeholder="Message title..."
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600 text-sm"
                  maxLength={100}
                />
              </div>

              {/* Content */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Message</label>
                <textarea
                  value={newMessage.content}
                  onChange={(e) => setNewMessage({ ...newMessage, content: e.target.value })}
                  placeholder="Write your message..."
                  rows={4}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none text-sm"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
                <div className="flex gap-1.5">
                  {['normal', 'important', ...(isAdmin ? ['urgent'] : [])].map(p => (
                    <button
                      key={p}
                      onClick={() => setNewMessage({ ...newMessage, priority: p })}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        newMessage.priority === p
                          ? p === 'urgent' ? 'bg-red-600/20 border-red-600 text-red-400'
                            : p === 'important' ? 'bg-yellow-600/20 border-yellow-600 text-yellow-400'
                            : 'bg-blue-600/20 border-blue-600 text-blue-400'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Send To</label>
                <div className="flex gap-1.5 mb-2">
                  {['all', 'markets', 'locations'].map(t => (
                    <button
                      key={t}
                      onClick={() => setNewMessage({ ...newMessage, targetType: t, targetMarkets: [], targetLocations: [] })}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        newMessage.targetType === t
                          ? 'bg-blue-600/20 border-blue-600 text-blue-400'
                          : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {t === 'all' ? 'Everyone' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>

                {newMessage.targetType === 'markets' && (
                  <div className="flex flex-wrap gap-1 p-2 bg-slate-700/50 rounded">
                    {MARKETS.map(market => (
                      <button
                        key={market}
                        onClick={() => {
                          const newMarkets = newMessage.targetMarkets.includes(market)
                            ? newMessage.targetMarkets.filter(m => m !== market)
                            : [...newMessage.targetMarkets, market];
                          setNewMessage({ ...newMessage, targetMarkets: newMarkets });
                        }}
                        className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                          newMessage.targetMarkets.includes(market)
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                        }`}
                      >
                        {market}
                      </button>
                    ))}
                  </div>
                )}

                {newMessage.targetType === 'locations' && (
                  <div className="flex flex-wrap gap-1 p-2 bg-slate-700/50 rounded max-h-24 overflow-y-auto">
                    {LOCATIONS.map(loc => (
                      <button
                        key={loc}
                        onClick={() => {
                          const newLocs = newMessage.targetLocations.includes(loc)
                            ? newMessage.targetLocations.filter(l => l !== loc)
                            : [...newMessage.targetLocations, loc];
                          setNewMessage({ ...newMessage, targetLocations: newLocs });
                        }}
                        className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                          newMessage.targetLocations.includes(loc)
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                        }`}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Pin Option (Admin/FOM only) */}
              {canPin && (
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newMessage.pinned}
                      onChange={(e) => setNewMessage({ ...newMessage, pinned: e.target.checked })}
                      className="w-3.5 h-3.5 rounded bg-slate-700 border-slate-600 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="text-xs text-slate-300">Pin this message</span>
                  </label>
                </div>
              )}
            </div>

            {/* Post Button */}
            <div className="p-3 border-t border-slate-700">
              <button
                onClick={handlePostMessage}
                disabled={!newMessage.title.trim() || !newMessage.content.trim()}
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors flex items-center justify-center gap-2"
              >
                <Send size={14} />
                Post Message
              </button>
            </div>
          </div>
        )}

        {/* Edit Message Modal */}
        {editingMessage && (
          <div className="absolute inset-0 bg-slate-800 z-10 flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-700">
              <h3 className="text-base font-bold text-white">Edit Message</h3>
              <button
                onClick={() => setEditingMessage(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Title</label>
                <input
                  type="text"
                  value={editingMessage.title}
                  onChange={(e) => setEditingMessage({ ...editingMessage, title: e.target.value })}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600 text-sm"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Message</label>
                <textarea
                  value={editingMessage.content}
                  onChange={(e) => setEditingMessage({ ...editingMessage, content: e.target.value })}
                  rows={6}
                  className="w-full px-2 py-1.5 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-600 resize-none text-sm"
                />
              </div>
            </div>

            <div className="p-3 border-t border-slate-700 flex gap-2">
              <button
                onClick={() => setEditingMessage(null)}
                className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editingMessage.title.trim() || !editingMessage.content.trim()}
                className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
