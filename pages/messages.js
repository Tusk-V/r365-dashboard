import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession, signIn } from 'next-auth/react';
import { ArrowLeft, Home, UserPlus, ShieldCheck, MoreVertical, Bell, BellOff, Building2, Map as MapIcon, Store, MessageSquare } from 'lucide-react';
import ChannelSidebar from '../components/chat/ChannelSidebar';
import MessageStream from '../components/chat/MessageStream';
import Composer from '../components/chat/Composer';
import Onboarding from '../components/chat/Onboarding';
import PendingApprovals from '../components/chat/PendingApprovals';
import ChannelMembersPanel from '../components/chat/ChannelMembersPanel';
import RolesPanel from '../components/chat/RolesPanel';
import EnablePush from '../components/chat/EnablePush';
import { canManageChannel, isDashboardUser } from '../lib/channels';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';
const MSG_POLL_MS = 3000;
const CHANNEL_POLL_MS = 10000;

const CHANNEL_META = {
  company: { Icon: Building2, subtitle: (c) => c.key === 'managers' ? 'Managers only — no associates' : "Everyone at Andy's" },
  market: { Icon: MapIcon, subtitle: (c) => `${c.name} market` },
  location: { Icon: Store, subtitle: () => 'Store channel' },
};

function UserAvatar({ name, image, size = 'h-8 w-8', extra = '' }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt={name || ''} className={`${size} rounded-full object-cover ${extra}`} referrerPolicy="no-referrer" />;
  }
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return <div className={`${size} rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold text-slate-200 ${extra}`}>{initial}</div>;
}

const ROLE_BADGE_CLASS = { Admin: 'bg-red-600', FOM: 'bg-blue-600', Market: 'bg-purple-600', Manager: 'bg-green-600' };
const ROLE_LABEL = { Admin: 'Admin', FOM: 'FOM', Market: 'MM', Manager: 'Manager' };

function tierOf({ isAdmin, owner, fom, managedMarkets, manager }) {
  if (isAdmin || owner) return 'Admin';
  if (fom) return 'FOM';
  if ((managedMarkets || []).length) return 'Market';
  if (manager) return 'Manager';
  return null;
}

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
  const [scope, setScope] = useState({ owner: false, fom: false, manager: false, managedMarkets: [], dashboardAccess: null });

  const dashboardAccess = session?.user?.dashboardAccess || scope.dashboardAccess || { type: 'none' };
  const meActor = { isAdmin, owner: scope.owner, fom: isAdmin || scope.owner || scope.fom, manager: scope.manager, managedMarkets: scope.managedMarkets, dashboardAccess };
  const hasDashboard = isDashboardUser(meActor);
  const myRole = tierOf(meActor);
  const chatStatus = session?.user?.chatAccess?.status || 'none';
  const canApprove = hasDashboard; // dashboard users / FOM / market managers manage members

  const [showApprovals, setShowApprovals] = useState(false);
  const [showChannelMembers, setShowChannelMembers] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [unreadMarkerAt, setUnreadMarkerAt] = useState(null);
  const [channelInfo, setChannelInfo] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const watermarkRef = useRef(null);
  const tempIdRef = useRef(0);
  const channelsRef = useRef([]);
  channelsRef.current = channels;

  useEffect(() => {
    if (status === 'unauthenticated') signIn('google');
  }, [status]);

  useEffect(() => {
    if (!userEmail || isAdmin) return;
    fetch('/api/check-access')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setScope({ owner: !!d.owner, fom: !!d.fom, manager: !!d.manager, managedMarkets: d.managedMarkets || [], dashboardAccess: d.dashboardAccess || null }); })
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

  useEffect(() => {
    const q = router.query.channel;
    if (!q || channels.length === 0) return;
    if (channels.some(c => c.key === q)) {
      setActiveKey(q);
      setMobileShowStream(true);
    }
  }, [router.query.channel, channels]);

  const markRead = useCallback((channel) => {
    fetch('/api/chat/read', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    }).then(() => {
      setChannels(prev => {
        const next = prev.map(c => c.key === channel ? { ...c, unread: 0 } : c);
        try {
          if ('setAppBadge' in navigator) {
            const n = next.reduce((sum, c) => sum + (c.unread || 0), 0);
            if (n > 0) navigator.setAppBadge(n); else navigator.clearAppBadge();
          }
        } catch (_) {}
        return next;
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeKey) return;
    let cancelled = false;
    watermarkRef.current = null;
    // Anchor the "New messages" line at the last-read time captured on open
    // (before markRead moves it). Stays put while you read this channel.
    const ch = channelsRef.current.find(c => c.key === activeKey);
    setUnreadMarkerAt(ch?.lastReadAt || null);
    setMessages([]); setPinned([]); setChannelInfo(null); setLoadingMessages(true);
    setHasMoreOlder(false); setLoadingOlder(false);
    (async () => {
      try {
        const res = await fetch(`/api/chat/messages?channel=${encodeURIComponent(activeKey)}`);
        const data = await res.json();
        if (cancelled || !res.ok) return;
        setMessages(data.messages || []);
        setPinned(data.pinned || []);
        setHasMoreOlder(!!data.hasMore);
        if (data.watermark) watermarkRef.current = data.watermark;
        markRead(activeKey);
      } catch (_) {} finally { if (!cancelled) setLoadingMessages(false); }
    })();
    // Member summary for the header (one-shot, not polled).
    (async () => {
      try {
        const res = await fetch(`/api/chat/channel-members?channel=${encodeURIComponent(activeKey)}`);
        const data = await res.json();
        if (!cancelled && res.ok) setChannelInfo(data);
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
      authorName: session?.user?.name || userEmail, authorImage: session?.user?.image || null, authorRole: myRole,
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

  const toggleMute = async (ch) => {
    const muted = !ch.muted;
    setChannels(prev => prev.map(c => c.key === ch.key ? { ...c, muted } : c));
    try {
      await fetch('/api/chat/mute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: ch.key, muted }),
      });
    } catch (_) {
      setChannels(prev => prev.map(c => c.key === ch.key ? { ...c, muted: !muted } : c)); // revert on failure
    }
  };

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || !activeKey) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/chat/messages?channel=${encodeURIComponent(activeKey)}&before=${encodeURIComponent(oldest.createdAt)}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(prev => {
          const seen = new Set(prev.map(m => m._id));
          const older = (data.messages || []).filter(m => !seen.has(m._id));
          return older.length ? [...older, ...prev] : prev;
        });
        setHasMoreOlder(!!data.hasMore);
      }
    } catch (_) {}
    setLoadingOlder(false);
  }, [activeKey, messages, loadingOlder, hasMoreOlder]);

  const activeChannel = channels.find(c => c.key === activeKey);
  const canManageActive = activeChannel ? canManageChannel(meActor, activeChannel.key) : false;

  if (status === 'loading') {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading…</div>;
  }

  if (!loadingChannels && channels.length === 0 && !hasDashboard) {
    return <Onboarding status={chatStatus} onSubmitted={() => router.reload()} />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-900 text-white flex flex-col">
      <div
        className="z-20 flex items-center justify-between gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2">
          <img src="/icon-192x192.png" alt="Andy's" className="h-7 w-7 rounded-full" />
          <h1 className="font-bold text-lg">Messages</h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 min-h-[40px] px-3 rounded-lg text-sm text-slate-300 hover:text-white hover:bg-slate-700"
            title="Back to dashboard"
          >
            <Home size={18} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          {(canApprove || isAdmin || scope.owner) && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(v => !v)}
                className="min-h-[40px] px-2 text-slate-300 hover:text-white"
                title="Manage"
                aria-label="Manage menu"
              >
                <MoreVertical size={20} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1">
                    {(isAdmin || scope.owner) && (
                      <button onClick={() => { setShowRoles(true); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
                        <ShieldCheck size={16} /> Roles
                      </button>
                    )}
                    {canApprove && (
                      <button onClick={() => { setShowApprovals(true); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700">
                        <UserPlus size={16} /> Approvals
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <EnablePush />

      <div className="flex-1 flex min-h-0">
        <div className={`${mobileShowStream ? 'hidden' : 'flex'} md:flex w-full md:w-64 flex-col border-r border-slate-700 flex-shrink-0`}>
          {loadingChannels ? (
            <div className="flex-1 p-3 space-y-2 animate-pulse">
              {[...Array(7)].map((_, i) => <div key={i} className="h-9 bg-slate-700/50 rounded-md" />)}
            </div>
          ) : channels.length === 0 ? (
            <div className="flex-1 p-4 text-slate-500 text-sm">No channels available for your access level.</div>
          ) : (
            <ChannelSidebar
              channels={channels}
              activeKey={activeKey}
              onSelect={(key) => { setActiveKey(key); setMobileShowStream(true); }}
            />
          )}
          {userEmail && (
            <div className="flex items-center gap-2 border-t border-slate-700 p-2 flex-shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
              <UserAvatar name={session?.user?.name} image={session?.user?.image} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-sm text-white truncate">
                  <span className="truncate">{session?.user?.name || userEmail}</span>
                  {myRole && ROLE_BADGE_CLASS[myRole] && (
                    <span className={`px-1 py-px text-[9px] font-semibold ${ROLE_BADGE_CLASS[myRole]} text-white rounded leading-none flex-shrink-0`}>{ROLE_LABEL[myRole]}</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{userEmail}</div>
              </div>
            </div>
          )}
        </div>

        <div className={`${mobileShowStream ? 'flex' : 'hidden'} md:flex flex-1 flex-col min-h-0`}>
          {activeChannel ? (
            <>
              <div className="flex items-center gap-2.5 px-3 py-2 bg-slate-800 border-b border-slate-700 flex-shrink-0">
                <button onClick={() => setMobileShowStream(false)} className="md:hidden p-2 -ml-1 text-slate-400 hover:text-white" aria-label="Back to channels"><ArrowLeft size={18} /></button>
                {(() => {
                  const meta = CHANNEL_META[activeChannel.type] || CHANNEL_META.location;
                  const Icon = meta.Icon;
                  return (
                    <>
                      <div className="h-8 w-8 rounded-lg bg-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold leading-tight truncate">{activeChannel.name}</div>
                        <div className="text-[11px] text-slate-400 leading-tight truncate">{meta.subtitle(activeChannel)}</div>
                      </div>
                    </>
                  );
                })()}
                <div className="ml-auto flex items-center gap-1 flex-shrink-0">
                  {channelInfo && channelInfo.count > 0 && (
                    <button
                      onClick={() => { if (canApprove) setShowChannelMembers(true); }}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded ${canApprove ? 'hover:bg-slate-700' : 'cursor-default'}`}
                      title={canApprove ? 'Manage members' : `${channelInfo.count} members`}
                    >
                      <div className="flex -space-x-2">
                        {channelInfo.sample.slice(0, 3).map((m, i) => (
                          <UserAvatar key={i} name={m.name} image={m.image} size="h-6 w-6" extra="ring-2 ring-slate-800" />
                        ))}
                      </div>
                      <span className="hidden sm:inline text-xs text-slate-400">{channelInfo.count}</span>
                    </button>
                  )}
                  <button
                    onClick={() => toggleMute(activeChannel)}
                    className="p-2 text-slate-400 hover:text-white"
                    title={activeChannel.muted ? 'Unmute' : 'Mute'}
                  >
                    {activeChannel.muted ? <BellOff size={18} /> : <Bell size={18} />}
                  </button>
                </div>
              </div>
              <MessageStream
                messages={messages}
                pinned={pinned}
                userEmail={userEmail}
                canModerate={canManageActive}
                loading={loadingMessages}
                unreadMarkerAt={unreadMarkerAt}
                hasMoreOlder={hasMoreOlder}
                loadingOlder={loadingOlder}
                onLoadOlder={loadOlder}
                onReact={handleReact}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
              <Composer channelName={activeChannel.name} canAnnounce={canManageActive} onSend={handleSend} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500">
              <MessageSquare size={40} className="opacity-40" />
              <p className="text-sm">Select a channel to start chatting</p>
            </div>
          )}
        </div>
      </div>

      {showApprovals && <PendingApprovals onClose={() => setShowApprovals(false)} />}
      {showRoles && <RolesPanel onClose={() => setShowRoles(false)} />}
      {showChannelMembers && activeChannel && (
        <ChannelMembersPanel channel={activeChannel.key} channelName={activeChannel.name} onClose={() => setShowChannelMembers(false)} />
      )}
    </div>
  );
}
