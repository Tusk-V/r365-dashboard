import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession, signIn } from 'next-auth/react';
import { ArrowLeft, Home, UserPlus } from 'lucide-react';
import ChannelSidebar from '../components/chat/ChannelSidebar';
import MessageStream from '../components/chat/MessageStream';
import Composer from '../components/chat/Composer';
import Onboarding from '../components/chat/Onboarding';
import PendingApprovals from '../components/chat/PendingApprovals';

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

  const dashType = session?.user?.dashboardAccess?.type;
  const hasDashboard = isAdmin || (dashType && dashType !== 'none');
  const chatStatus = session?.user?.chatAccess?.status || 'none';
  const canApprove = hasDashboard; // dashboard users approve their stores; admin approves all

  const [showApprovals, setShowApprovals] = useState(false);

  const watermarkRef = useRef(null);
  const tempIdRef = useRef(0);

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
        try {
          if ('setAppBadge' in navigator) {
            const n = data.totalUnread || 0;
            if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
          }
        } catch (_) {}
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
    watermarkRef.current = null;
    setMessages([]); setPinned([]);
    (async () => {
      try {
        const res = await fetch(`/api/chat/messages?channel=${encodeURIComponent(activeKey)}`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setMessages(data.messages || []);
        setPinned(data.pinned || []);
        if (data.watermark) watermarkRef.current = data.watermark;
        markRead(activeKey);
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [activeKey, markRead]);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    const id = setInterval(async () => {
      if (document.hidden) return;
      try {
        const qs = new URLSearchParams({ channel: activeKey });
        if (watermarkRef.current) qs.set('since', watermarkRef.current);
        const res = await fetch(`/api/chat/messages?${qs.toString()}`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setPinned(data.pinned || []);
        if (data.messages && data.messages.length > 0) {
          // Reconcile by _id: upsert changed messages, drop soft-deleted ones,
          // then re-sort by createdAt so live edits/reactions/deletes from other
          // users land in the right place (not just brand-new appended messages).
          let added = 0;
          setMessages(prev => {
            const byId = new Map(prev.map(m => [m._id, m]));
            for (const m of data.messages) {
              if (m.deleted) { byId.delete(m._id); continue; }
              if (!byId.has(m._id)) added++;
              byId.set(m._id, m);
            }
            return Array.from(byId.values())
              .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
          });
          if (data.watermark) watermarkRef.current = data.watermark;
          if (added > 0) markRead(activeKey);
        }
      } catch (_) {}
    }, MSG_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeKey, markRead]);

  const handleSend = async ({ body, isAnnouncement, priority }) => {
    const tempId = `temp-${tempIdRef.current++}`;
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
      if (res.ok) {
        const apply = (arr) => arr.map(m => m._id === messageId ? { ...m, body, editedAt: new Date().toISOString() } : m);
        setMessages(apply);
        setPinned(apply);
      }
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

  const handleRetry = (msg) => {
    setMessages(prev => prev.filter(m => m._id !== msg._id));
    handleSend({ body: msg.body, isAnnouncement: msg.isAnnouncement, priority: msg.priority });
  };

  const activeChannel = channels.find(c => c.key === activeKey);

  if (status === 'loading') {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading…</div>;
  }

  if (!loadingChannels && channels.length === 0 && !hasDashboard) {
    return <Onboarding status={chatStatus} onSubmitted={() => router.reload()} />;
  }

  return (
    <div className="h-[100dvh] bg-slate-900 text-white flex flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src="/icon-192x192.png" alt="Andy's" className="h-7 w-7 rounded-full" />
          <h1 className="font-bold text-lg">Messages</h1>
        </div>
        <div className="flex items-center gap-1">
          {canApprove && (
            <button
              onClick={() => setShowApprovals(true)}
              className="flex items-center gap-1.5 min-h-[40px] px-2 text-slate-300 hover:text-white"
              title="Pending approvals"
            >
              <UserPlus size={18} />
              <span className="hidden sm:inline text-sm">Approvals</span>
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700"
            title="Back to dashboard"
          >
            <Home size={18} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
        </div>
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
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
                <button onClick={() => setMobileShowStream(false)} className="md:hidden p-2 -ml-1 text-slate-400 hover:text-white" aria-label="Back to channels"><ArrowLeft size={18} /></button>
                <span className="font-semibold">{activeChannel.name}</span>
              </div>
              <MessageStream
                messages={messages}
                pinned={pinned}
                userEmail={userEmail}
                canModerate={canModerate}
                onReact={handleReact}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
              <Composer channelName={activeChannel.name} canAnnounce={canModerate} onSend={handleSend} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">Select a channel</div>
          )}
        </div>
      </div>

      {showApprovals && <PendingApprovals onClose={() => setShowApprovals(false)} />}
    </div>
  );
}
