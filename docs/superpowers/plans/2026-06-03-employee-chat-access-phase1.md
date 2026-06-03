# Employee Chat Access — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let line employees sign in by email magic-link, pick their store(s), wait for a manager to approve, and then chat in Company + their markets + their stores — without ever exposing the dashboard.

**Architecture:** Add a `chatAccess` track on the user record (Phase 1: `{ level:'employee', status, stores[] }`). Extend `lib/channels.js` to derive chat channels and to answer "who can approve which store" from the approver's existing `dashboardAccess` (GMs approve their own stores; admin approves all). New endpoints `/api/chat/onboard` and `/api/chat/members`; onboarding + approvals UI inside `/messages`; relax the sign-in domain rule for the email provider.

**Tech Stack:** Next.js 14 (pages router), MongoDB, NextAuth (Google + Email providers), Tailwind dark-slate, `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-03-employee-chat-access-design.md` (Phase 1 = employee self-signup + dashboard-scoped approval; Phase 2 = chat-native manager roles + admin page, NOT in this plan).

---

## File Structure

**Modify:**
- `lib/channels.js` — add `channelsForLocations`, `allChannels`, `chatChannelsFor`, `canManageStore`; extend `deriveChannelsForUser`/`canAccessChannel` to take `chatAccess`. (+ tests)
- `pages/api/auth/[...nextauth].js` — allow email-provider sign-ins from any domain; default `chatAccess` on email users; expose `session.user.chatAccess`.
- `pages/api/chat/channels.js`, `messages.js`, `read.js`, `react.js` — load `chatAccess`, pass into derivation.
- `pages/messages.js` — render onboarding/pending when the viewer has no channels; show a manager "Pending approvals" entry; read `chatAccess` from session.
- `pages/index.js` — redirect approved chat-only users (no dashboard access) from `/` to `/messages`.
- `pages/auth/signin.js` — allow non-company emails in the email form; employee-friendly copy; email callbackUrl `/messages`.

**Create:**
- `pages/api/chat/onboard.js` — employee sets store(s) → pending.
- `pages/api/chat/members.js` — manager lists/approves/denies pending requests in scope.
- `components/chat/Onboarding.js` — store multi-select + pending screen.
- `components/chat/PendingApprovals.js` — manager approve/deny UI.

---

## Task 1: `lib/channels.js` chat helpers + access scoping (TDD)

**Files:** Modify `lib/channels.js`; Test `tests/channels.test.js`

- [ ] **Step 1: Write failing tests** — append to `tests/channels.test.js`:

```js
const { chatChannelsFor, canManageStore } = require('../lib/channels');

test('approved employee sees company + their markets + their stores (multi-store)', () => {
  const chatAccess = { level: 'employee', status: 'approved', stores: ['Bixby', 'Allen'] };
  const keys = deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' }, chatAccess }).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:tulsa', 'market:dallas', 'loc:bixby', 'loc:allen']);
});

test('pending or none chatAccess yields no channels', () => {
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' }, chatAccess: { status: 'pending', stores: ['Bixby'] } }), []);
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' } }), []);
});

test('a user with BOTH dashboard and chat access gets the union, deduped and ordered', () => {
  const keys = deriveChannelsForUser({
    isAdmin: false,
    dashboardAccess: { type: 'specific', locations: ['Bixby'] },
    chatAccess: { level: 'employee', status: 'approved', stores: ['Allen'] },
  }).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:tulsa', 'market:dallas', 'loc:bixby', 'loc:allen']);
});

test('chatChannelsFor returns [] unless approved', () => {
  assert.deepEqual(chatChannelsFor({ status: 'pending', stores: ['Bixby'] }), []);
  assert.equal(chatChannelsFor({ status: 'approved', stores: ['Bixby'] }).length, 3); // company + tulsa + bixby
});

test('canManageStore: admin/all manage any; specific manages only their locations', () => {
  assert.equal(canManageStore({ isAdmin: true }, 'Allen'), true);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'all' } }, 'Allen'), true);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Allen'] } }, 'Allen'), true);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby'] } }, 'Allen'), false);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'none' } }, 'Allen'), false);
});
```

- [ ] **Step 2: Run `npm test`** — expect the new tests to FAIL (functions undefined / chatAccess ignored).

- [ ] **Step 3: Implement.** Refactor `lib/channels.js`: extract the channel-building used by `deriveChannelsForUser` into shared helpers and add the new exports. Replace the body of `deriveChannelsForUser` and add helpers:

```js
const CANONICAL = (a, b) => {
  const rank = c => c.type === 'company' ? 0 : c.type === 'market' ? 1 : 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.type === 'market') return (MARKET_ORDER[a.market] ?? 99) - (MARKET_ORDER[b.market] ?? 99);
  if (a.type === 'location') {
    const ma = MARKET_ORDER[a.market] ?? 99, mb = MARKET_ORDER[b.market] ?? 99;
    if (ma !== mb) return ma - mb;
    return a.name.localeCompare(b.name);
  }
  return 0;
};

function allChannels() {
  return channelsForLocations(LOCATIONS);
}

function channelsForLocations(locations) {
  const locs = LOCATIONS.filter(l => (locations || []).includes(l));
  const markets = MARKETS.filter(m => locs.some(l => LOCATION_MARKETS[l] === m));
  const channels = [{ key: COMPANY_CHANNEL, type: 'company', name: 'Company-Wide' }];
  for (const m of markets) channels.push({ key: channelKeyForMarket(m), type: 'market', name: m, market: m });
  for (const l of locs) channels.push({ key: channelKeyForLocation(l), type: 'location', name: l, market: LOCATION_MARKETS[l] });
  return channels.sort(CANONICAL);
}

function chatChannelsFor(chatAccess) {
  if (!chatAccess || chatAccess.status !== 'approved') return [];
  // Phase 1: employee/gm scope is a store list.
  return channelsForLocations(chatAccess.stores || []);
}

function deriveChannelsForUser(user) {
  const isAdmin = !!(user && user.isAdmin);
  const access = isAdmin ? { type: 'all' } : (user && user.dashboardAccess) || { type: 'none' };

  let dash = [];
  if (access.type === 'all') dash = allChannels();
  else if (access.type === 'specific') dash = channelsForLocations(access.locations || []);

  const chat = chatChannelsFor(user && user.chatAccess);

  const byKey = new Map();
  for (const c of [...dash, ...chat]) if (!byKey.has(c.key)) byKey.set(c.key, c);
  return [...byKey.values()].sort(CANONICAL);
}

function canManageStore(actor, store) {
  if (!actor) return false;
  if (actor.isAdmin) return true;
  const da = actor.dashboardAccess || { type: 'none' };
  if (da.type === 'all') return true;
  if (da.type === 'specific') return (da.locations || []).includes(store);
  return false;
}
```

Add `chatChannelsFor`, `channelsForLocations`, `allChannels`, `canManageStore` to `module.exports`. Keep `canAccessChannel` as-is (it calls `deriveChannelsForUser`, which now handles chatAccess automatically). Ensure `MARKET_ORDER`, `MARKETS`, `LOCATION_MARKETS`, `COMPANY_CHANNEL`, `channelKeyForMarket/Location` are all defined above these (reorder if needed).

- [ ] **Step 4: Run `npm test`** — ALL pass (existing 95+ and the new ones). The existing "specific-access" ordering tests must still pass (channelsForLocations reproduces the same order).

- [ ] **Step 5: Commit** — `git add lib/channels.js tests/channels.test.js && git commit -m "feat(chat): chatAccess channel derivation + canManageStore scoping"`

---

## Task 2: Auth — allow employee email sign-in + expose chatAccess

**Files:** Modify `pages/api/auth/[...nextauth].js`

- [ ] **Step 1: Relax the domain block to Google only.** In the `signIn` callback, replace the unconditional domain check so it only blocks **Google** non-company sign-ins; email sign-ins are allowed from any domain:

```js
    async signIn({ user, account, profile }) {
      // Google stays company-only; email magic-link is open (employees).
      if (account?.provider === 'google' && (!user.email || !user.email.endsWith('@rancherscustard.com'))) {
        console.log(`Blocked Google login from: ${user.email}`);
        return '/auth/error?error=AccessDenied';
      }
      // ...keep the existing user auto-create/update block below...
```

- [ ] **Step 2: Default `chatAccess` for new users.** In the same callback's "first time login - create user" `insertOne`, add a `chatAccess` default:

```js
            chatAccess: { level: 'employee', status: 'none', stores: [] },
```

(Place alongside the existing `dashboardAccess`/`plAccess` defaults. Existing users without the field are treated as no chat access by the helpers.)

- [ ] **Step 3: Expose `chatAccess` on the session.** In the `session` callback, after fetching `userData`, add:

```js
            session.user.chatAccess = userData.chatAccess || { level: 'employee', status: 'none', stores: [] };
```

- [ ] **Step 4: Verify build.** Run `npm run build` — clean. Run `npm test` — still green.

- [ ] **Step 5: Commit** — `git add pages/api/auth/[...nextauth].js && git commit -m "feat(auth): allow employee email sign-in; default+expose chatAccess"`

---

## Task 3: Thread `chatAccess` through the chat API routes

**Files:** Modify `pages/api/chat/channels.js`, `messages.js`, `read.js`, `react.js`

For each route, where it loads the user and builds `dashboardAccess`, also read `chatAccess` and include it in the object passed to `deriveChannelsForUser`/`canAccessChannel`.

- [ ] **Step 1: `channels.js`** — after `const user = await db.collection('users').findOne(...)`, compute `const chatAccess = user?.chatAccess || { status: 'none', stores: [] };` and change the derive call to `deriveChannelsForUser({ isAdmin, dashboardAccess, chatAccess })`.

- [ ] **Step 2: `messages.js`** — in `loadContext`, add `chatAccess` to the returned context (`const chatAccess = user?.chatAccess || { status:'none', stores:[] };` ... `return { ..., chatAccess }`), and build `const accessUser = { isAdmin, dashboardAccess, chatAccess };` (replace the existing `accessUser`). All `canAccessChannel(accessUser, ...)` calls now respect chat access.

- [ ] **Step 3: `read.js`** — load `chatAccess` and pass `{ isAdmin, dashboardAccess, chatAccess }` to `canAccessChannel`.

- [ ] **Step 4: `react.js`** — same: load `chatAccess`, pass `{ isAdmin, dashboardAccess, chatAccess }` to `canAccessChannel`.

- [ ] **Step 5: Verify** — `npm run build` clean; `npm test` green. Commit:
`git add pages/api/chat/channels.js pages/api/chat/messages.js pages/api/chat/read.js pages/api/chat/react.js && git commit -m "feat(chat): honor chatAccess in all chat API routes"`

---

## Task 4: `POST /api/chat/onboard`

**Files:** Create `pages/api/chat/onboard.js`

- [ ] **Step 1: Write the route.**

```js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { LOCATIONS } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { stores } = req.body;
    const chosen = Array.isArray(stores) ? stores.filter(s => LOCATIONS.includes(s)) : [];
    if (chosen.length === 0) return res.status(400).json({ error: 'Pick at least one store' });

    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;
    const user = await db.collection('users').findOne({ email: userEmail });

    // Employees only: anyone with dashboard access or an admin doesn't onboard.
    const hasDashboard = userEmail === ADMIN_EMAIL || (user?.dashboardAccess?.type && user.dashboardAccess.type !== 'none');
    if (hasDashboard) return res.status(400).json({ error: 'Account already has access' });
    if (user?.chatAccess?.status === 'approved') return res.status(400).json({ error: 'Already approved' });

    await db.collection('users').updateOne(
      { email: userEmail },
      { $set: { chatAccess: { level: 'employee', status: 'pending', stores: chosen, requestedAt: new Date() } } },
      { upsert: true }
    );
    return res.status(200).json({ success: true, status: 'pending', stores: chosen });
  } catch (error) {
    console.error('Error onboarding chat user:', error);
    return res.status(500).json({ error: 'Failed to submit request' });
  }
}
```

- [ ] **Step 2:** `npm run build` clean. Commit: `git add pages/api/chat/onboard.js && git commit -m "feat(chat): /api/chat/onboard — employee requests store access"`

---

## Task 5: `GET/POST /api/chat/members` (scoped approvals)

**Files:** Create `pages/api/chat/members.js`

- [ ] **Step 1: Write the route.**

```js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { canManageStore } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

async function actorFrom(session, db) {
  const email = session.user.email;
  const isAdmin = email === ADMIN_EMAIL;
  const user = await db.collection('users').findOne({ email });
  const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });
  return { email, isAdmin, dashboardAccess };
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const db = client.db("andysdashboard");
  const actor = await actorFrom(session, db);

  // Only users who can manage at least some store may use this.
  const canManageAny = actor.isAdmin || actor.dashboardAccess.type === 'all' ||
    (actor.dashboardAccess.type === 'specific' && (actor.dashboardAccess.locations || []).length > 0);
  if (!canManageAny) return res.status(403).json({ error: 'Not authorized to manage members' });

  if (req.method === 'GET') {
    const pending = await db.collection('users')
      .find({ 'chatAccess.status': 'pending' })
      .project({ email: 1, name: 1, chatAccess: 1 })
      .toArray();
    const visible = pending
      .map(u => ({ email: u.email, name: u.name || u.email, stores: u.chatAccess?.stores || [], requestedAt: u.chatAccess?.requestedAt }))
      .filter(u => u.stores.some(s => canManageStore(actor, s)));
    return res.status(200).json({ pending: visible });
  }

  if (req.method === 'POST') {
    const { email, action } = req.body;
    if (!email || !['approve', 'deny'].includes(action)) return res.status(400).json({ error: 'email and valid action required' });
    const target = await db.collection('users').findOne({ email });
    if (!target || target.chatAccess?.status !== 'pending') return res.status(404).json({ error: 'No pending request for that user' });

    const requested = target.chatAccess?.stores || [];
    const manageable = requested.filter(s => canManageStore(actor, s));
    if (manageable.length === 0) return res.status(403).json({ error: 'You do not manage any of this employee\'s stores' });

    if (action === 'deny') {
      await db.collection('users').updateOne({ email }, { $set: { chatAccess: { level: 'employee', status: 'none', stores: [] } } });
      return res.status(200).json({ success: true, status: 'none' });
    }

    // Approve: grant the stores this actor manages; if any requested stores are out of
    // scope, keep the request pending for those so another manager/admin can grant them.
    const outOfScope = requested.filter(s => !manageable.includes(s));
    if (outOfScope.length > 0) {
      await db.collection('users').updateOne({ email }, { $set: {
        'chatAccess.status': 'pending',
        'chatAccess.stores': outOfScope,
      } });
      // Also record the approved stores on a separate approved list.
      await db.collection('users').updateOne({ email }, { $addToSet: { 'chatAccess.approvedStores': { $each: manageable } } });
      return res.status(200).json({ success: true, status: 'partial', approved: manageable, stillPending: outOfScope });
    }

    const approvedStores = [...new Set([...(target.chatAccess?.approvedStores || []), ...manageable])];
    await db.collection('users').updateOne({ email }, { $set: {
      chatAccess: { level: 'employee', status: 'approved', stores: approvedStores, approvedBy: actor.email, approvedAt: new Date() },
    } });
    return res.status(200).json({ success: true, status: 'approved', stores: approvedStores });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

Note: `chatAccess.stores` is the source of truth for an approved employee's channels; the partial-approval path accumulates approved stores in `approvedStores` and only flips to `approved` (folding them into `stores`) once nothing is left pending. Simpler full-scope approvals (one manager covers all requested stores, or admin) are the common path.

- [ ] **Step 2:** `npm run build` clean. Commit: `git add pages/api/chat/members.js && git commit -m "feat(chat): /api/chat/members — scoped pending approvals"`

---

## Task 6: `components/chat/Onboarding.js`

**Files:** Create `components/chat/Onboarding.js`

- [ ] **Step 1: Write the component** — a mobile-first store multi-select + submit, and a pending state. Props: `{ status, onSubmitted }`.

```jsx
import { useState } from 'react';
import { Store, Check, Clock } from 'lucide-react';

// Mirror of lib/channels LOCATIONS (client-side list for the picker).
const LOCATIONS = [
  'Allen','Bixby','Broken Arrow','Carrollton','Claremore','Edmond','Frisco #1','Frisco #2','Frisco #3',
  'Hillcrest Village',"Hunter's Creek",'Lake Highlands','Lakeland','Norman','Owasso','Penn','Prosper','Sanford','The Colony','Warr Acres','Yale',
].sort((a,b)=>a.localeCompare(b));

export default function Onboarding({ status, onSubmitted }) {
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (status === 'pending') {
    return (
      <div className="h-[100dvh] bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center">
        <Clock size={48} className="text-yellow-400 mb-4" />
        <h1 className="text-xl font-bold mb-2">Request sent</h1>
        <p className="text-slate-300 max-w-sm">Your request is waiting for a manager to approve. You'll get in as soon as they do — check back shortly.</p>
      </div>
    );
  }

  const toggle = (loc) => setSelected(prev => prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]);

  const submit = async () => {
    if (selected.length === 0) { setError('Pick at least one store.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/chat/onboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stores: selected }),
      });
      const data = await res.json();
      if (res.ok) onSubmitted(); else setError(data.error || 'Something went wrong.');
    } catch (_) { setError('Network error. Try again.'); }
    setSaving(false);
  };

  return (
    <div className="h-[100dvh] bg-slate-900 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold flex items-center gap-2"><Store size={20} className="text-blue-400" /> Welcome to Andy's Messages</h1>
        <p className="text-slate-400 text-sm mt-1">Which store(s) do you work at? Pick all that apply — your manager will approve you.</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-2">
        {LOCATIONS.map(loc => {
          const on = selected.includes(loc);
          return (
            <button key={loc} onClick={() => toggle(loc)}
              className={`flex items-center justify-between min-h-[48px] px-3 py-2 rounded-lg border text-sm text-left ${on ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300'}`}>
              <span className="truncate">{loc}</span>
              {on && <Check size={16} className="text-blue-400 flex-shrink-0" />}
            </button>
          );
        })}
      </div>
      <div className="p-4 border-t border-slate-700">
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <button onClick={submit} disabled={saving || selected.length === 0}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 text-white font-medium rounded-lg">
          {saving ? 'Sending…' : `Request access${selected.length ? ` (${selected.length})` : ''}`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `npm run build` clean. Commit: `git add components/chat/Onboarding.js && git commit -m "feat(chat): employee onboarding store picker + pending screen"`

---

## Task 7: `components/chat/PendingApprovals.js`

**Files:** Create `components/chat/PendingApprovals.js`

- [ ] **Step 1: Write the component** — a panel listing in-scope pending employees with Approve/Deny. Props: `{ onClose }`. Fetches `/api/chat/members`.

```jsx
import { useState, useEffect } from 'react';
import { X, Check, Ban } from 'lucide-react';

export default function PendingApprovals({ onClose }) {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const res = await fetch('/api/chat/members');
      const data = await res.json();
      if (res.ok) setPending(data.pending || []);
    } catch (_) {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const act = async (email, action) => {
    setBusy(email);
    try {
      const res = await fetch('/api/chat/members', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, action }),
      });
      if (res.ok) setPending(prev => prev.filter(p => p.email !== email));
    } catch (_) {}
    setBusy(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 w-full sm:max-w-md sm:rounded-lg rounded-t-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="font-bold text-white">Pending approvals</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? <p className="text-slate-400 text-sm p-4 text-center">Loading…</p>
            : pending.length === 0 ? <p className="text-slate-400 text-sm p-4 text-center">No pending requests.</p>
            : pending.map(p => (
              <div key={p.email} className="bg-slate-700/50 rounded-lg p-3">
                <div className="text-white text-sm font-medium">{p.name}</div>
                <div className="text-slate-400 text-xs">{p.email}</div>
                <div className="text-slate-300 text-xs mt-1">Stores: {p.stores.join(', ')}</div>
                <div className="flex gap-2 mt-2">
                  <button disabled={busy === p.email} onClick={() => act(p.email, 'approve')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm rounded"><Check size={14} /> Approve</button>
                  <button disabled={busy === p.email} onClick={() => act(p.email, 'deny')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white text-sm rounded"><Ban size={14} /> Deny</button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** `npm run build` clean. Commit: `git add components/chat/PendingApprovals.js && git commit -m "feat(chat): manager pending-approvals panel"`

---

## Task 8: Integrate onboarding + approvals into `pages/messages.js`

**Files:** Modify `pages/messages.js`

- [ ] **Step 1: Read chatAccess + manager capability.** From `useSession`, read `session.user.chatAccess`. Compute `const hasDashboard = isAdmin || (session?.user?.dashboardAccess?.type && session.user.dashboardAccess.type !== 'none')`. (dashboardAccess is already on the session per the existing session callback.) Compute `const canApprove = hasDashboard;` (any dashboard user can approve their stores; admin all).

- [ ] **Step 2: Gate rendering.** After channels load, if `!loadingChannels && channels.length === 0`:
  - If `hasDashboard` → keep the existing "No channels available" message.
  - Else render `<Onboarding status={session?.user?.chatAccess?.status} onSubmitted={() => router.reload()} />` (import it). This shows the store picker (status none) or the pending screen (status pending).
  Place this branch BEFORE the normal sidebar/stream layout returns.

- [ ] **Step 3: Approvals entry.** When `canApprove`, add a button in the branded header (e.g. a `UserPlus` icon, label "Approvals") that opens `<PendingApprovals onClose={...} />` in a state-controlled modal. Import both. Keep it unobtrusive on mobile (icon-only under sm).

- [ ] **Step 4: Verify** — `npm run build` clean; `npm test` green. Commit:
`git add pages/messages.js && git commit -m "feat(chat): onboarding + pending state + manager approvals in /messages"`

---

## Task 9: Redirect approved chat-only users from `/` to `/messages`

**Files:** Modify `pages/index.js`

- [ ] **Step 1.** In the auth/access effect that currently handles `dashboardAccess.type === 'none'` (around the access-pending redirect), add: if the user has no dashboard access (`dashboardAccess.type === 'none'`) but `session?.user?.chatAccess?.status === 'approved'`, `router.replace('/messages')` instead of the access-pending screen. Read the surrounding code first and integrate cleanly; don't change GM/admin behavior.

- [ ] **Step 2:** `npm run build` clean. Commit: `git add pages/index.js && git commit -m "feat(chat): send approved chat-only employees to /messages"`

---

## Task 10: Sign-in page — welcome employees via email

**Files:** Modify `pages/auth/signin.js`

- [ ] **Step 1: Allow non-company emails in the email form.** Remove the `@rancherscustard.com` requirement in `handleEmailSubmit` (delete the `.endsWith` check + its error). Keep the empty check. Change the email `callbackUrl` to `'/messages'` so employees land in the chat.

- [ ] **Step 2: Employee-friendly copy.** Update the heading/subtext block: keep it welcoming to both — e.g. heading "Andy's Messages & Dashboard", subtext "Employees: enter your email for a sign-in link. Managers: use your @rancherscustard.com Google account." Update the email label to "Sign in with email (employees)" and the input placeholder to "you@email.com".

- [ ] **Step 2.5:** Keep Google sign-in `callbackUrl: '/'` (managers land on the dashboard).

- [ ] **Step 3:** `npm run build` clean. Commit: `git add pages/auth/signin.js && git commit -m "feat(auth): sign-in page welcomes employees via email magic link"`

---

## Task 11: End-to-end verification + push

- [ ] **Step 1:** `npm run build` (clean) and `npm test` (all green).
- [ ] **Step 2:** `git push`.
- [ ] **Step 3: Manual on preview** — (a) sign in with a non-company email → store picker → pick 2 stores → pending screen; (b) as admin/GM, open Approvals → see the request → approve; (c) re-open the employee session → now sees Company + the 2 markets + 2 stores, can post; (d) the employee hitting `/` is redirected to `/messages`; (e) GM/admin dashboard unaffected; (f) employee cannot load a non-assigned channel (direct `/api/chat/messages?channel=loc:<other>` → 403).
- [ ] **Step 4:** Report results; do not merge to `main`.

---

## Self-Review

- **Spec coverage (Phase 1):** email employee auth (T2, T10); chatAccess track (T2); channel derivation incl. multi-store (T1); onboarding pick-store → pending (T4, T6); dashboard-scoped approval (T1 canManageStore, T5, T7); approved employees see company+markets+stores (T1, T3); route separation + redirect (T8, T9); never exposes dashboard (dashboard APIs unchanged, gated by dashboardAccess). ✅ Phase 2 (chat-native Market/Ops roles + admin page + rosters) intentionally deferred.
- **Placeholders:** none — code given for every logic/API/component task; existing-file edits specify exact changes + snippets.
- **Type/name consistency:** `chatAccess` shape `{ level, status, stores[] }`, helpers `chatChannelsFor`/`canManageStore`/`channelsForLocations`/`allChannels`, and endpoints `/api/chat/onboard` + `/api/chat/members` are consistent across tasks.
- **Known follow-ups:** partial cross-scope approval uses an `approvedStores` accumulator — revisit UX in Phase 2; client-side LOCATIONS list in Onboarding duplicates `lib/channels` (kept simple; could import the CJS list later).
