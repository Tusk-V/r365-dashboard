import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession, signIn } from 'next-auth/react';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import ChannelSidebar from '../components/chat/ChannelSidebar';
import MessageStream from '../components/chat/MessageStream';
import Composer from '../components/chat/Composer';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';
const MSG_POLL_MS = 3000;
const CHANNEL_POLL_MS = 10000;

export default function MessagesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [channels, setChannels] = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [messages, setMessages] = useState([]);
  const [pinned, setPinned] = useState([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [mobileShowStream, setMobileShowStream] = useState(false);

  const userEmail = session?.user?.email;
  const isAdmin = userEmail === ADMIN_EMAIL;
  const [userRole, setUserRole] = useState('User');
  const canModerate = userRole === 'Admin' || userRole === 'FOM';

  const lastTsRef = useRef(null);

  useEffect(() => {
    if (status === 'unauthenticated') signIn('google');
  }, [status]);

  useEffect(() => {
    if (!userEmail) return;
    if (isAdmin) { setUserRole('Admin'); return; }
    fetch('/api/check-access')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.role) setUserRole(d.role); })
      .catch(() => {});
  }, [userEmail, isAdmin]);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/channels');
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels || []);
        setActiveKey(prev => prev || (data.channels?.[0]?.key ?? null));
      }
    } catch (_) {}
    setLoadingChannels(false);
  }, []);

  useEffect(() => { if (userEmail) loadChannels(); }, [userEmail, loadChannels]);

  useEffect(() => {
    if (!userEmail) return;
    const id = setInterval(() => { if (!document.hidden) loadChannels(); }, CHANNEL_POLL_MS);
    return () => clearInterval(id);
  }, [userEmail, loadChannels]);

  const markRead = useCallback((channel) => {
    fetch('/api/chat/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    }).then(() => {
      setChannels(prev => prev.map(c => c.key === channel ? { ...c, unread: 0 } : c));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    lastTsRef.current = null;
    setMessages([]); setPinned([]);
    (async () => {
      try {
        const res = await fetch(`/api/chat/messages?channel=${encodeURIComponent(activeKey)}`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setMessages(data.messages || []);
        setPinned(data.pinned || []);
        const last = data.messages?.[data.messages.length - 1];
        if (last) lastTsRef.current = last.createdAt;
        markRead(activeKey);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [activeKey, markRead]);

  useEffect(() => {
    if (!activeKey) return;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const qs = new URLSearchParams({ channel: activeKey });
        if (lastTsRef.current) qs.set('after', lastTsRef.current);
        const res = await fetch(`/api/chat/messages?${qs.toString()}`);
        const data = await res.json();
        if (!res.ok) return;
        setPinned(data.pinned || []);
        if (data.messages && data.messages.length > 0) {
          setMessages(prev => {
            const seen = new Set(prev.map(m => m._id));
            const fresh = data.messages.filter(m => !seen.has(m._id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
          lastTsRef.current = data.messages[data.messages.length - 1].createdAt;
          markRead(activeKey);
        }
      } catch (_) {}
    }, MSG_POLL_MS);
    return () => clearInterval(id);
  }, [activeKey, markRead]);

  const handleSend = async ({ body, isAnnouncement, priority }) => {
    const tempId = `temp-${body.length}-${messages.length}`;
    const optimistic = {
      _id: tempId, channelKey: activeKey, body, authorEmail: userEmail,
      authorName: session?.user?.name || userEmail, authorRole: userRole,
      createdAt: new Date().toISOString(), editedAt: null, isAnnouncement, priority,
      pinned: isAnnouncement, reactions: {}, _pending: true,
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: activeKey, body, isAnnouncement, priority }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(prev => prev.map(m => m._id === tempId ? data.message : m));
        lastTsRef.current = data.message.createdAt;
        if (isAnnouncement) setPinned(prev => [data.message, ...prev]);
      } else {
        setMessages(prev => prev.map(m => m._id === tempId ? { ...m, _failed: true, _pending: false } : m));
      }
    } catch (_) {
      setMessages(prev => prev.map(m => m._id === tempId ? { ...m, _failed: true, _pending: false } : m));
    }
  };

  const handleReact = async (messageId, emoji) => {
    if (String(messageId).startsWith('temp-')) return;
    try {
      const res = await fetch('/api/chat/react', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, emoji }),
      });
      const data = await res.json();
      if (res.ok) setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions: data.reactions } : m));
    } catch (_) {}
  };

  const handleEdit = async (messageId, body) => {
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, body }),
      });
      if (res.ok) setMessages(prev => prev.map(m => m._id === messageId ? { ...m, body, editedAt: new Date().toISOString() } : m));
    } catch (_) {}
  };

  const handleDelete = async (messageId) => {
    if (!confirm('Delete this message?')) return;
    try {
      const res = await fetch(`/api/chat/messages?messageId=${messageId}`, { method: 'DELETE' });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m._id !== messageId));
        setPinned(prev => prev.filter(m => m._id !== messageId));
      }
    } catch (_) {}
  };

  const activeChannel = channels.find(c => c.key === activeKey);

  if (status === 'loading') {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading…</div>;
  }

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 flex-shrink-0">
        <button onClick={() => router.push('/')} className="p-1.5 text-slate-400 hover:text-white" title="Back to dashboard"><ArrowLeft size={18} /></button>
        <MessageSquare size={18} className="text-blue-400" />
        <h1 className="font-bold">Messages</h1>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className={`${mobileShowStream ? 'hidden' : 'flex'} md:flex w-full md:w-64 flex-col border-r border-slate-700 flex-shrink-0`}>
          {loadingChannels ? (
            <div className="p-4 text-slate-500 text-sm">Loading channels…</div>
          ) : channels.length === 0 ? (
            <div className="p-4 text-slate-500 text-sm">No channels available for your access level.</div>
          ) : (
            <ChannelSidebar
              channels={channels}
              activeKey={activeKey}
              onSelect={(key) => { setActiveKey(key); setMobileShowStream(true); }}
            />
          )}
        </div>

        <div className={`${mobileShowStream ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-h-0`}>
          {activeChannel ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 flex-shrink-0">
                <button onClick={() => setMobileShowStream(false)} className="md:hidden p-1 text-slate-400 hover:text-white"><ArrowLeft size={16} /></button>
                <span className="font-semibold"># {activeChannel.name}</span>
                <span className="text-xs text-slate-500">{activeChannel.type}</span>
              </div>
              <MessageStream
                messages={messages}
                pinned={pinned}
                userEmail={userEmail}
                canModerate={canModerate}
                onReact={handleReact}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
              <Composer channelName={`# ${activeChannel.name}`} canAnnounce={canModerate} onSend={handleSend} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">Select a channel</div>
          )}
        </div>
      </div>
    </div>
  );
}
