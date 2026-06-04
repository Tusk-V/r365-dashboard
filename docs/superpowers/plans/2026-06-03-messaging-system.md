# Messaging System (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unused announcement board with a Slack/Discord-style, channel-based chat (company/market/location tiers) that managers will actually use, with pinned announcements and polling-based near-real-time updates.

**Architecture:** Channels are *derived* from a single canonical location→market map in `lib/channels.js` (CommonJS pure helpers, per the existing `storeManagers.js` pattern). Three new MongoDB collections (`chat_messages`, `chat_reads`, reusing `users`). A full-page `/messages` route with a channel sidebar polls thin API routes under `pages/api/chat/*`. The old `MessagesPanel`/`/api/messages/*` system is deleted after cutover; its dormant collections are left untouched.

**Tech Stack:** Next.js 14 (pages router), MongoDB (driver v5), NextAuth, Tailwind (dark slate), lucide-react, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-03-messaging-system-design.md`

**Deviations from spec (deliberate, lower-risk):**
- Spec named `lib/locations.js`; we use **`lib/channels.js`** (CommonJS pure-helper) as the single source of truth and refactor `lib/markets.js` to derive from it. Reason: matches the codebase's documented "pure helpers in CJS so tests + Next can both consume" convention.
- Spec listed a separate `/api/chat/unread`; we fold the unread total into **`/api/chat/channels`** (returns per-channel unread + `totalUnread`) and reuse it for the header badge. Reason: YAGNI — one endpoint serves both.
- Deletes are **soft** (`deleted: true`), matching the spec's `deleted` field.

---

## File Structure

**Create:**
- `lib/channels.js` — CJS. Canonical `MARKETS`, `LOCATION_MARKETS`, `LOCATIONS`; helpers `slugify`, `channelKeyForMarket`, `channelKeyForLocation`, `COMPANY_CHANNEL`, `deriveChannelsForUser`, `canAccessChannel`, `canPostAnnouncements`, `unreadCount`.
- `tests/channels.test.js` — unit tests for the above.
- `pages/api/chat/channels.js` — GET: list the user's channels with unread counts + `totalUnread`.
- `pages/api/chat/messages.js` — GET (stream + pinned), POST (send), PUT (edit), DELETE (soft).
- `pages/api/chat/read.js` — POST: upsert `lastReadAt` for a channel.
- `pages/api/chat/react.js` — POST: toggle an emoji reaction.
- `pages/api/chat/permissions.js` — moved from `pages/api/messages/permissions.js` (role admin), cleaning `chat_reads` on user delete.
- `components/chat/MessageItem.js` — one message row (author, body, reactions, edit/delete, announcement styling).
- `components/chat/Composer.js` — message input + send + announcement toggle.
- `components/chat/MessageStream.js` — pinned banner + scrolling message list.
- `components/chat/ChannelSidebar.js` — grouped channel list with unread badges.
- `pages/messages.js` — full-page route: layout, channel selection, polling orchestration, auth/role gate.

**Modify:**
- `lib/markets.js` — derive internal lists from `lib/channels.js` (no consumer changes).
- `components/MessagingPermissions.js` — point its 3 fetch calls at `/api/chat/permissions`.
- `pages/index.js` — header 💬 button navigates to `/messages`; badge fed by polling `/api/chat/channels`; remove `MessagesPanel`/`MessagingPermissions` panel wiring.

**Delete (final task):**
- `components/MessagesPanel.js`
- `pages/api/messages/index.js`, `reply.js`, `react.js`, `read.js`, `permissions.js` (permissions moved first).

---

## Task 1: Canonical data + slug/key helpers in `lib/channels.js`

**Files:**
- Create: `lib/channels.js`
- Test: `tests/channels.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/channels.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MARKETS, LOCATIONS, LOCATION_MARKETS,
  slugify, channelKeyForMarket, channelKeyForLocation, COMPANY_CHANNEL,
} = require('../lib/channels');

test('MARKETS lists the four markets in business order', () => {
  assert.deepEqual(MARKETS, ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando']);
});

test('LOCATION_MARKETS maps every location to its market', () => {
  assert.equal(LOCATION_MARKETS['Bixby'], 'Tulsa');
  assert.equal(LOCATION_MARKETS['Warr Acres'], 'Oklahoma City');
  assert.equal(LOCATION_MARKETS['Frisco #3'], 'Dallas');
  assert.equal(LOCATION_MARKETS["Hunter's Creek"], 'Orlando');
});

test('LOCATIONS is the sorted list of all mapped locations', () => {
  assert.equal(LOCATIONS.length, Object.keys(LOCATION_MARKETS).length);
  assert.deepEqual(LOCATIONS, [...LOCATIONS].sort((a, b) => a.localeCompare(b)));
  assert.ok(LOCATIONS.includes('Allen'));
});

test('slugify lowercases and strips punctuation/spaces', () => {
  assert.equal(slugify('Frisco #3'), 'frisco-3');
  assert.equal(slugify('Warr Acres'), 'warr-acres');
  assert.equal(slugify("Hunter's Creek"), 'hunters-creek');
  assert.equal(slugify('The Colony'), 'the-colony');
  assert.equal(slugify('Oklahoma City'), 'oklahoma-city');
});

test('channel key helpers build prefixed keys', () => {
  assert.equal(COMPANY_CHANNEL, 'company-wide');
  assert.equal(channelKeyForMarket('Dallas'), 'market:dallas');
  assert.equal(channelKeyForLocation('Frisco #3'), 'loc:frisco-3');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/channels'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/channels.js`:

```js
// Pure, framework-free channel/location helpers. CommonJS so both the Next.js
// app (via import interop) and the `node --test` runner can consume them.
// This is the single source of truth for markets, locations, and channels.

const LOCATION_MARKETS = {
  // Tulsa
  'Bixby': 'Tulsa',
  'Yale': 'Tulsa',
  'Broken Arrow': 'Tulsa',
  'Owasso': 'Tulsa',
  'Claremore': 'Tulsa',
  // Oklahoma City
  'Warr Acres': 'Oklahoma City',
  'Penn': 'Oklahoma City',
  'Edmond': 'Oklahoma City',
  'Norman': 'Oklahoma City',
  // Dallas
  'Carrollton': 'Dallas',
  'Frisco #1': 'Dallas',
  'Frisco #2': 'Dallas',
  'Frisco #3': 'Dallas',
  'The Colony': 'Dallas',
  'Hillcrest Village': 'Dallas',
  'Lake Highlands': 'Dallas',
  'Allen': 'Dallas',
  'Prosper': 'Dallas',
  // Orlando
  'Sanford': 'Orlando',
  'Lakeland': 'Orlando',
  "Hunter's Creek": 'Orlando',
};

const MARKETS = ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando'];
const LOCATIONS = Object.keys(LOCATION_MARKETS).sort((a, b) => a.localeCompare(b));
const COMPANY_CHANNEL = 'company-wide';

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[#']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function channelKeyForMarket(market) {
  return `market:${slugify(market)}`;
}

function channelKeyForLocation(location) {
  return `loc:${slugify(location)}`;
}

module.exports = {
  MARKETS,
  LOCATIONS,
  LOCATION_MARKETS,
  COMPANY_CHANNEL,
  slugify,
  channelKeyForMarket,
  channelKeyForLocation,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for all `channels.test.js` cases (existing suites also still pass).

- [ ] **Step 5: Commit**

```bash
git add lib/channels.js tests/channels.test.js
git commit -m "feat(chat): canonical location/market data + channel key helpers"
```

---

## Task 2: `deriveChannelsForUser` + `canAccessChannel`

**Files:**
- Modify: `lib/channels.js`
- Test: `tests/channels.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/channels.test.js`:

```js
const { deriveChannelsForUser, canAccessChannel } = require('../lib/channels');

test('admin sees company + all markets + all locations', () => {
  const channels = deriveChannelsForUser({ isAdmin: true });
  assert.equal(channels[0].key, 'company-wide');
  assert.equal(channels.filter(c => c.type === 'market').length, 4);
  assert.equal(channels.filter(c => c.type === 'location').length, LOCATIONS.length);
});

test('specific-access user sees company + spanned markets + their locations', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Frisco #3', 'Allen'] } };
  const keys = deriveChannelsForUser(user).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:dallas', 'loc:allen', 'loc:frisco-3']);
});

test('specific user spanning two markets gets both market channels', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby', 'Norman'] } };
  const keys = deriveChannelsForUser(user).map(c => c.key);
  // Markets ordered Tulsa, Oklahoma City; locations alpha within
  assert.deepEqual(keys, ['company-wide', 'market:tulsa', 'market:oklahoma-city', 'loc:bixby', 'loc:norman']);
});

test('type "all" in dashboardAccess behaves like admin', () => {
  const channels = deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'all' } });
  assert.equal(channels.filter(c => c.type === 'location').length, LOCATIONS.length);
});

test('no-access user sees no channels', () => {
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' } }), []);
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false }), []);
});

test('canAccessChannel enforces derived membership', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby'] } };
  assert.equal(canAccessChannel(user, 'company-wide'), true);
  assert.equal(canAccessChannel(user, 'market:tulsa'), true);
  assert.equal(canAccessChannel(user, 'loc:bixby'), true);
  assert.equal(canAccessChannel(user, 'market:dallas'), false);
  assert.equal(canAccessChannel(user, 'loc:allen'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `deriveChannelsForUser is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/channels.js`, add before `module.exports` (and add the new names to the exports):

```js
const MARKET_ORDER = { 'Tulsa': 0, 'Oklahoma City': 1, 'Dallas': 2, 'Orlando': 3 };

function deriveChannelsForUser(user) {
  const isAdmin = !!(user && user.isAdmin);
  const access = isAdmin ? { type: 'all' } : (user && user.dashboardAccess) || { type: 'none' };
  if (access.type === 'none') return [];

  const locations = access.type === 'all'
    ? [...LOCATIONS]
    : LOCATIONS.filter(loc => (access.locations || []).includes(loc));

  // Markets spanned by the visible locations, in business order.
  const markets = MARKETS.filter(m => locations.some(loc => LOCATION_MARKETS[loc] === m));

  const channels = [{ key: COMPANY_CHANNEL, type: 'company', name: 'Company-Wide' }];

  for (const market of markets) {
    channels.push({ key: channelKeyForMarket(market), type: 'market', name: market, market });
  }

  const sortedLocations = [...locations].sort((a, b) => {
    const ma = MARKET_ORDER[LOCATION_MARKETS[a]] ?? 99;
    const mb = MARKET_ORDER[LOCATION_MARKETS[b]] ?? 99;
    if (ma !== mb) return ma - mb;
    return a.localeCompare(b);
  });
  for (const loc of sortedLocations) {
    channels.push({ key: channelKeyForLocation(loc), type: 'location', name: loc, market: LOCATION_MARKETS[loc] });
  }

  return channels;
}

function canAccessChannel(user, channelKey) {
  return deriveChannelsForUser(user).some(c => c.key === channelKey);
}
```

Update `module.exports` to include `deriveChannelsForUser` and `canAccessChannel`.

Note: the "two markets" test expects locations alpha within the whole list after both market headers (`loc:bixby`, `loc:norman`) — locations are sorted by market order then name, which yields Bixby (Tulsa) before Norman (OKC). Confirm the order matches.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/channels.js tests/channels.test.js
git commit -m "feat(chat): derive a user's channels from their location access"
```

---

## Task 3: `canPostAnnouncements` + `unreadCount`

**Files:**
- Modify: `lib/channels.js`
- Test: `tests/channels.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/channels.test.js`:

```js
const { canPostAnnouncements, unreadCount } = require('../lib/channels');

test('only Admin and FOM can post announcements', () => {
  assert.equal(canPostAnnouncements('Admin'), true);
  assert.equal(canPostAnnouncements('FOM'), true);
  assert.equal(canPostAnnouncements('Manager'), false);
  assert.equal(canPostAnnouncements('User'), false);
  assert.equal(canPostAnnouncements(undefined), false);
});

test('unreadCount counts messages after lastReadAt not authored by the user', () => {
  const msgs = [
    { createdAt: '2026-06-03T10:00:00Z', authorEmail: 'a@r.com' },
    { createdAt: '2026-06-03T11:00:00Z', authorEmail: 'me@r.com' }, // own message, not unread
    { createdAt: '2026-06-03T12:00:00Z', authorEmail: 'b@r.com' },
  ];
  assert.equal(unreadCount(msgs, '2026-06-03T10:30:00Z', 'me@r.com'), 1);
  assert.equal(unreadCount(msgs, null, 'me@r.com'), 2);      // never read => all others
  assert.equal(unreadCount([], null, 'me@r.com'), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `canPostAnnouncements is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/channels.js`, add and export:

```js
function canPostAnnouncements(role) {
  return role === 'Admin' || role === 'FOM';
}

function unreadCount(messages, lastReadAt, userEmail) {
  const after = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return (messages || []).filter(m =>
    new Date(m.createdAt).getTime() > after && m.authorEmail !== userEmail
  ).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/channels.js tests/channels.test.js
git commit -m "feat(chat): announcement-permission + unread-count helpers"
```

---

## Task 4: Refactor `lib/markets.js` to derive from `lib/channels.js`

**Files:**
- Modify: `lib/markets.js`
- Test: existing `tests/*` must still pass (no markets-specific unit test exists; verify via build + consumers).

- [ ] **Step 1: Replace `lib/markets.js` contents**

```js
// Market helpers. Location→market data now lives in lib/channels.js (the single
// source of truth); this module keeps the existing getMarket/sortByMarket API
// that dashboards import.
import { LOCATION_MARKETS } from './channels';

export const getMarket = (locationName) => LOCATION_MARKETS[locationName] || 'Other';

export const marketSortOrder = { 'Tulsa': 0, 'Oklahoma City': 1, 'Dallas': 2, 'Orlando': 3, 'Other': 4 };

export const sortByMarket = (locations) => {
  return [...locations].sort((a, b) => {
    const ma = marketSortOrder[getMarket(a)] ?? 4;
    const mb = marketSortOrder[getMarket(b)] ?? 4;
    if (ma !== mb) return ma - mb;
    return a.localeCompare(b);
  });
};
```

- [ ] **Step 2: Verify the unit suite still passes**

Run: `npm test`
Expected: PASS (channels + all existing suites).

- [ ] **Step 3: Verify the app still builds (markets consumers compile)**

Run: `npm run build`
Expected: Build completes with no errors. (Confirms ESM-imports-CJS interop works for `getMarket`/`sortByMarket` consumers in `pages/index.js` and the dashboard tabs.)

- [ ] **Step 4: Commit**

```bash
git add lib/markets.js
git commit -m "refactor(markets): derive location→market map from lib/channels"
```

---

## Task 5: `GET /api/chat/channels` — list channels + unread

**Files:**
- Create: `pages/api/chat/channels.js`

- [ ] **Step 1: Write the route**

```js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { deriveChannelsForUser } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;
    const isAdmin = userEmail === ADMIN_EMAIL;

    const user = await db.collection('users').findOne({ email: userEmail });
    const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });

    const channels = deriveChannelsForUser({ isAdmin, dashboardAccess });
    if (channels.length === 0) {
      return res.status(200).json({ channels: [], totalUnread: 0 });
    }

    const keys = channels.map(c => c.key);

    // Per-channel last-read pointers for this user.
    const reads = await db.collection('chat_reads')
      .find({ userEmail, channelKey: { $in: keys } })
      .toArray();
    const readMap = new Map(reads.map(r => [r.channelKey, r.lastReadAt]));

    // Unread = messages in channel newer than lastReadAt, not authored by user.
    // Aggregate once across all the user's channels.
    const unreadAgg = await db.collection('chat_messages').aggregate([
      { $match: { channelKey: { $in: keys }, deleted: { $ne: true }, authorEmail: { $ne: userEmail } } },
      { $project: { channelKey: 1, createdAt: 1 } },
    ]).toArray();

    const unreadByChannel = {};
    for (const m of unreadAgg) {
      const last = readMap.get(m.channelKey);
      const after = last ? new Date(last).getTime() : 0;
      if (new Date(m.createdAt).getTime() > after) {
        unreadByChannel[m.channelKey] = (unreadByChannel[m.channelKey] || 0) + 1;
      }
    }

    let totalUnread = 0;
    const withUnread = channels.map(c => {
      const unread = unreadByChannel[c.key] || 0;
      totalUnread += unread;
      return { ...c, unread };
    });

    return res.status(200).json({ channels: withUnread, totalUnread });
  } catch (error) {
    console.error('Error listing channels:', error);
    return res.status(500).json({ error: 'Failed to load channels' });
  }
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/chat/channels.js
git commit -m "feat(chat): GET /api/chat/channels with per-channel unread counts"
```

---

## Task 6: `/api/chat/messages` — stream, send, edit, soft-delete

**Files:**
- Create: `pages/api/chat/messages.js`

- [ ] **Step 1: Write the route**

```js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { canAccessChannel, canPostAnnouncements } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';
const PAGE_SIZE = 50;

let indexesEnsured = false;
async function ensureIndexes(db) {
  if (indexesEnsured) return;
  await db.collection('chat_messages').createIndex({ channelKey: 1, createdAt: 1 });
  await db.collection('chat_reads').createIndex({ userEmail: 1, channelKey: 1 }, { unique: true });
  indexesEnsured = true;
}

async function loadContext(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  const client = await clientPromise;
  const db = client.db("andysdashboard");
  await ensureIndexes(db);
  const userEmail = session.user.email;
  const isAdmin = userEmail === ADMIN_EMAIL;
  const user = await db.collection('users').findOne({ email: userEmail });
  const userRole = isAdmin ? 'Admin' : (user?.role || 'User');
  const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });
  return { db, session, userEmail, isAdmin, userRole, dashboardAccess,
           authorName: session.user.name || userEmail };
}

export default async function handler(req, res) {
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  const { db, userEmail, userRole, isAdmin, dashboardAccess, authorName } = ctx;
  const accessUser = { isAdmin, dashboardAccess };

  // GET — stream for a channel (+ pinned announcements)
  if (req.method === 'GET') {
    try {
      const { channel, after } = req.query;
      if (!channel) return res.status(400).json({ error: 'channel is required' });
      if (!canAccessChannel(accessUser, channel)) return res.status(403).json({ error: 'No access to this channel' });

      const baseQuery = { channelKey: channel, deleted: { $ne: true } };
      let messages;
      if (after) {
        messages = await db.collection('chat_messages')
          .find({ ...baseQuery, createdAt: { $gt: new Date(after) } })
          .sort({ createdAt: 1 }).limit(200).toArray();
      } else {
        // Latest PAGE_SIZE, returned oldest->newest for display.
        const latest = await db.collection('chat_messages')
          .find(baseQuery).sort({ createdAt: -1 }).limit(PAGE_SIZE).toArray();
        messages = latest.reverse();
      }

      const pinned = await db.collection('chat_messages')
        .find({ channelKey: channel, pinned: true, deleted: { $ne: true } })
        .sort({ createdAt: -1 }).toArray();

      const ser = m => ({ ...m, _id: m._id.toString() });
      return res.status(200).json({ messages: messages.map(ser), pinned: pinned.map(ser) });
    } catch (error) {
      console.error('Error loading messages:', error);
      return res.status(500).json({ error: 'Failed to load messages' });
    }
  }

  // POST — send a message
  if (req.method === 'POST') {
    try {
      const { channel, body, isAnnouncement = false, priority = 'normal' } = req.body;
      if (!channel || !body || !body.trim()) return res.status(400).json({ error: 'channel and body are required' });
      if (!canAccessChannel(accessUser, channel)) return res.status(403).json({ error: 'No access to this channel' });
      if (isAnnouncement && !canPostAnnouncements(userRole)) {
        return res.status(403).json({ error: 'Only Admin and FOM can post announcements' });
      }

      const doc = {
        channelKey: channel,
        body: body.trim(),
        authorEmail: userEmail,
        authorName,
        authorRole: userRole,
        createdAt: new Date(),
        editedAt: null,
        isAnnouncement: !!isAnnouncement,
        priority: isAnnouncement ? priority : 'normal',
        pinned: !!isAnnouncement,
        reactions: {},
        deleted: false,
      };
      const result = await db.collection('chat_messages').insertOne(doc);
      return res.status(201).json({ message: { ...doc, _id: result.insertedId.toString() } });
    } catch (error) {
      console.error('Error sending message:', error);
      return res.status(500).json({ error: 'Failed to send message' });
    }
  }

  // PUT — edit body (author only, or Admin/FOM)
  if (req.method === 'PUT') {
    try {
      const { messageId, body } = req.body;
      if (!messageId || !body || !body.trim()) return res.status(400).json({ error: 'messageId and body are required' });
      const msg = await db.collection('chat_messages').findOne({ _id: new ObjectId(messageId) });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const canModerate = canPostAnnouncements(userRole);
      if (!canModerate && msg.authorEmail !== userEmail) {
        return res.status(403).json({ error: 'You can only edit your own messages' });
      }
      await db.collection('chat_messages').updateOne(
        { _id: new ObjectId(messageId) },
        { $set: { body: body.trim(), editedAt: new Date() } }
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error editing message:', error);
      return res.status(500).json({ error: 'Failed to edit message' });
    }
  }

  // DELETE — soft delete (author only, or Admin/FOM)
  if (req.method === 'DELETE') {
    try {
      const { messageId } = req.query;
      if (!messageId) return res.status(400).json({ error: 'messageId is required' });
      const msg = await db.collection('chat_messages').findOne({ _id: new ObjectId(messageId) });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const canModerate = canPostAnnouncements(userRole);
      if (!canModerate && msg.authorEmail !== userEmail) {
        return res.status(403).json({ error: 'You can only delete your own messages' });
      }
      await db.collection('chat_messages').updateOne(
        { _id: new ObjectId(messageId) },
        { $set: { deleted: true, pinned: false, body: '', reactions: {} } }
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      return res.status(500).json({ error: 'Failed to delete message' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/chat/messages.js
git commit -m "feat(chat): /api/chat/messages stream/send/edit/soft-delete with access checks"
```

---

## Task 7: `POST /api/chat/read` — update last-read pointer

**Files:**
- Create: `pages/api/chat/read.js`

- [ ] **Step 1: Write the route**

```js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { canAccessChannel } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: 'channel is required' });

    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;
    const isAdmin = userEmail === ADMIN_EMAIL;
    const user = await db.collection('users').findOne({ email: userEmail });
    const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });

    if (!canAccessChannel({ isAdmin, dashboardAccess }, channel)) {
      return res.status(403).json({ error: 'No access to this channel' });
    }

    await db.collection('chat_reads').updateOne(
      { userEmail, channelKey: channel },
      { $set: { userEmail, channelKey: channel, lastReadAt: new Date() } },
      { upsert: true }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking channel read:', error);
    return res.status(500).json({ error: 'Failed to mark read' });
  }
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/chat/read.js
git commit -m "feat(chat): POST /api/chat/read updates the channel last-read pointer"
```

---

## Task 8: `POST /api/chat/react` — toggle emoji reaction

**Files:**
- Create: `pages/api/chat/react.js`

- [ ] **Step 1: Write the route**

```js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messageId, emoji } = req.body;
    if (!messageId || !emoji) return res.status(400).json({ error: 'messageId and emoji are required' });

    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;

    const msg = await db.collection('chat_messages').findOne({ _id: new ObjectId(messageId) });
    if (!msg || msg.deleted) return res.status(404).json({ error: 'Message not found' });

    const reactions = msg.reactions || {};
    const users = reactions[emoji] || [];
    if (users.includes(userEmail)) {
      reactions[emoji] = users.filter(e => e !== userEmail);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, userEmail];
    }

    await db.collection('chat_messages').updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { reactions } }
    );
    return res.status(200).json({ reactions });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    return res.status(500).json({ error: 'Failed to toggle reaction' });
  }
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/chat/react.js
git commit -m "feat(chat): POST /api/chat/react toggles an emoji reaction"
```

---

## Task 9: Move permissions endpoint to `/api/chat/permissions`

**Files:**
- Create: `pages/api/chat/permissions.js`
- Modify: `components/MessagingPermissions.js`

- [ ] **Step 1: Create `pages/api/chat/permissions.js`**

Copy the existing `pages/api/messages/permissions.js` verbatim, with one change: in the DELETE branch, replace the `message_reads` cleanup line with `chat_reads`:

```js
// (in the DELETE branch, after deleting the user)
await db.collection('chat_reads').deleteMany({ userEmail: user.email });
```

Everything else (GET list users, PUT update role) stays identical to the original file.

- [ ] **Step 2: Point the component at the new endpoint**

In `components/MessagingPermissions.js`, change all three fetch URLs from `/api/messages/permissions` to `/api/chat/permissions`:
- `loadUsers`: `fetch('/api/chat/permissions')`
- `updateRole`: `fetch('/api/chat/permissions', { method: 'PUT', ... })`
- `deleteUser`: `fetch(\`/api/chat/permissions?userId=${userId}\`, { method: 'DELETE' })`

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 4: Commit**

```bash
git add pages/api/chat/permissions.js components/MessagingPermissions.js
git commit -m "feat(chat): move role-permissions endpoint to /api/chat/permissions"
```

---

## Task 10: `components/chat/MessageItem.js`

**Files:**
- Create: `components/chat/MessageItem.js`

- [ ] **Step 1: Write the component**

```jsx
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

export default function MessageItem({ message, userEmail, canModerate, onReact, onEdit, onDelete }) {
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
        <p className="text-sm text-slate-200 whitespace-pre-wrap mt-0.5 break-words">{message.body}</p>
      )}

      {/* Reactions + actions */}
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
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/MessageItem.js
git commit -m "feat(chat): MessageItem component (body, reactions, edit/delete, announcement style)"
```

---

## Task 11: `components/chat/Composer.js`

**Files:**
- Create: `components/chat/Composer.js`

- [ ] **Step 1: Write the component**

```jsx
import { useState } from 'react';
import { Send, Megaphone } from 'lucide-react';

export default function Composer({ channelName, canAnnounce, onSend }) {
  const [body, setBody] = useState('');
  const [announce, setAnnounce] = useState(false);
  const [priority, setPriority] = useState('important');

  const submit = () => {
    if (!body.trim()) return;
    onSend({ body: body.trim(), isAnnouncement: announce, priority: announce ? priority : 'normal' });
    setBody('');
    setAnnounce(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  };

  return (
    <div className="border-t border-slate-700 p-3">
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
      <div className="flex items-end gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${channelName}…`}
          rows={1}
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-600 max-h-32"
        />
        <button onClick={submit} disabled={!body.trim()} className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white rounded-lg" title="Send (Enter)">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/Composer.js
git commit -m "feat(chat): Composer with Enter-to-send and announcement toggle"
```

---

## Task 12: `components/chat/MessageStream.js`

**Files:**
- Create: `components/chat/MessageStream.js`

- [ ] **Step 1: Write the component**

```jsx
import { useEffect, useRef } from 'react';
import { MessageSquare, Pin } from 'lucide-react';
import MessageItem from './MessageItem';

export default function MessageStream({ messages, pinned, userEmail, canModerate, onReact, onEdit, onDelete }) {
  const bottomRef = useRef(null);
  const containerRef = useRef(null);
  const nearBottomRef = useRef(true);

  // Track whether the user is near the bottom (so we don't yank them while reading history).
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
              <MessageItem key={m._id} message={m} userEmail={userEmail} canModerate={canModerate} onReact={onReact} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/MessageStream.js
git commit -m "feat(chat): MessageStream with pinned banner and smart auto-scroll"
```

---

## Task 13: `components/chat/ChannelSidebar.js`

**Files:**
- Create: `components/chat/ChannelSidebar.js`

- [ ] **Step 1: Write the component**

```jsx
import { Building2, Map, Store } from 'lucide-react';

const SECTIONS = [
  { type: 'company', label: 'Company', Icon: Building2 },
  { type: 'market', label: 'Markets', Icon: Map },
  { type: 'location', label: 'Locations', Icon: Store },
];

function ChannelRow({ channel, active, onSelect }) {
  return (
    <button
      onClick={() => onSelect(channel.key)}
      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-sm transition-colors ${active ? 'bg-blue-600/20 text-white' : 'text-slate-300 hover:bg-slate-700/50'}`}
    >
      <span className="truncate"># {channel.name}</span>
      {channel.unread > 0 && (
        <span className="ml-2 px-1.5 py-px text-[10px] font-bold bg-red-600 text-white rounded-full flex-shrink-0">
          {channel.unread > 99 ? '99+' : channel.unread}
        </span>
      )}
    </button>
  );
}

export default function ChannelSidebar({ channels, activeKey, onSelect }) {
  return (
    <div className="flex flex-col gap-3 p-2 overflow-y-auto">
      {SECTIONS.map(({ type, label, Icon }) => {
        const group = channels.filter(c => c.type === type);
        if (group.length === 0) return null;
        return (
          <div key={type}>
            <div className="flex items-center gap-1.5 px-2 mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <Icon size={11} /> {label}
            </div>
            <div className="space-y-0.5">
              {group.map(c => (
                <ChannelRow key={c.key} channel={c} active={c.key === activeKey} onSelect={onSelect} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 3: Commit**

```bash
git add components/chat/ChannelSidebar.js
git commit -m "feat(chat): ChannelSidebar grouped by company/market/location with unread badges"
```

---

## Task 14: `pages/messages.js` — full-page route + polling

**Files:**
- Create: `pages/messages.js`

This page ties everything together: auth gate, channel load, channel selection, message polling (~3s), channel-list/unread polling (~10s), send/edit/delete/react, mark-read, and a responsive sidebar/stream layout.

- [ ] **Step 1: Write the route**

```jsx
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
  // Role is reflected on each message; for composer announce-permission we read it from channels endpoint indirectly.
  const [userRole, setUserRole] = useState('User');
  const canModerate = userRole === 'Admin' || userRole === 'FOM';

  const lastTsRef = useRef(null);

  useEffect(() => {
    if (status === 'unauthenticated') signIn('google');
  }, [status]);

  // Fetch the viewer's role once (for composer announce toggle + moderation).
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

  // Poll channel list / unread counts.
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

  // Initial load of a channel's messages when it changes.
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

  // Poll for new messages in the active channel.
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
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 flex-shrink-0">
        <button onClick={() => router.push('/')} className="p-1.5 text-slate-400 hover:text-white" title="Back to dashboard"><ArrowLeft size={18} /></button>
        <MessageSquare size={18} className="text-blue-400" />
        <h1 className="font-bold">Messages</h1>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Sidebar — always visible on md+, toggled on mobile */}
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

        {/* Stream */}
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
```

Note: this references `/api/check-access` for the viewer's role. If that endpoint does not return a `role`, the composer simply won't show the announce toggle for non-admins — verify in Step 3 and, if needed, switch the role source to whatever endpoint `pages/index.js` uses (`grep -n "check-access\|setUserRole" pages/index.js`).

- [ ] **Step 2: Confirm the role-source endpoint**

Run: `grep -n "userRole\|role\|check-access\|/api/" pages/index.js | grep -i role`
Expected: Identify how `index.js` sets `userRole`. If it differs from `/api/check-access`, update the role-fetch in `pages/messages.js` to match before continuing.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors.

- [ ] **Step 4: Commit**

```bash
git add pages/messages.js
git commit -m "feat(chat): full-page /messages route with polling, optimistic send, mobile layout"
```

---

## Task 15: Wire the dashboard header to `/messages`; remove old panel

**Files:**
- Modify: `pages/index.js`

- [ ] **Step 1: Repoint the header buttons and badge**

In `pages/index.js`:

1. Both 💬 buttons (desktop ~line 1454 and mobile ~line 1497): change `onClick={() => setShowMessagesPanel(true)}` to `onClick={() => router.push('/messages')}`. (Confirm `router` is already in scope — `index.js` uses `router.push('/admin')`, so it is.)

2. Add badge polling. Find where `unreadMessagesCount` state is declared (`grep -n "unreadMessagesCount" pages/index.js`). Replace its feed: add an effect that polls the channels endpoint:

```jsx
useEffect(() => {
  if (status !== 'authenticated') return;
  let active = true;
  const load = async () => {
    try {
      const res = await fetch('/api/chat/channels');
      const data = await res.json();
      if (active && res.ok) setUnreadMessagesCount(data.totalUnread || 0);
    } catch (_) {}
  };
  load();
  const id = setInterval(() => { if (!document.hidden) load(); }, 15000);
  return () => { active = false; clearInterval(id); };
}, [status]);
```

3. Remove the now-unused panel wiring:
   - Delete the import lines `import MessagesPanel from '../components/MessagesPanel';` and `import MessagingPermissions from '../components/MessagingPermissions';` **only if** `MessagingPermissions` is not used elsewhere. Check: `grep -n "MessagingPermissions\|showPermissionsModal\|MessagesPanel\|showMessagesPanel" pages/index.js`.
   - Remove the `<MessagesPanel ... />` block (~lines 1763-1770) and the `{showMessagesPanel && ...}`/`setShowMessagesPanel` state.
   - The `<MessagingPermissions ... />` modal (role admin) is still useful — keep it, but it's now reachable from the admin area rather than the messages panel. If it was only opened via the old panel's `onOpenPermissions`, move its trigger to the existing Admin button area or leave the modal wired to `showPermissionsModal` with an admin-only button. Keep `MessagingPermissions` import if retained.

Make the minimal edits needed so the file compiles with no references to `MessagesPanel`.

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: Build completes, no errors, no "MessagesPanel is not defined".

- [ ] **Step 3: Commit**

```bash
git add pages/index.js
git commit -m "feat(chat): header opens /messages; badge polls chat unread; drop old panel wiring"
```

---

## Task 16: Delete the old messaging system

**Files:**
- Delete: `components/MessagesPanel.js`, `pages/api/messages/index.js`, `pages/api/messages/reply.js`, `pages/api/messages/react.js`, `pages/api/messages/read.js`, `pages/api/messages/permissions.js`

- [ ] **Step 1: Confirm nothing still imports the old files**

Run: `grep -rn "MessagesPanel\|api/messages" pages/ components/`
Expected: No results (permissions now lives at `/api/chat/permissions`; component repointed in Task 9).

- [ ] **Step 2: Delete the files**

```bash
git rm components/MessagesPanel.js pages/api/messages/index.js pages/api/messages/reply.js pages/api/messages/react.js pages/api/messages/read.js pages/api/messages/permissions.js
```

- [ ] **Step 3: Verify build + tests**

Run: `npm run build && npm test`
Expected: Build completes; all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(chat): remove the unused announcement-board system"
```

---

## Task 17: End-to-end verification on the Vercel preview

**Files:** none (verification only)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin messaging-v2
```

Expected: Vercel auto-creates a preview deployment. Note the preview URL.

- [ ] **Step 2: Manual smoke test on the preview URL**

Verify each, signed in as admin:
- The header 💬 button opens `/messages`; channels grouped Company / Markets / Locations.
- Posting a message shows it instantly (optimistic) and it persists on reload.
- A second browser/session in the same channel sees the message appear within ~3s.
- Posting "as announcement" pins it to the banner with the right priority color.
- Reactions toggle; edit and delete (soft) work; deleted messages disappear.
- Switching channels clears the unread badge for that channel; header badge reflects total unread.
- Mobile width: channel list → tap channel → stream with back arrow.
- As a non-admin manager (or simulate via a test user with `dashboardAccess.type: 'specific'`): only their company/market/location channels appear; the announce toggle is hidden; they cannot load a channel outside their access (verify a direct `/api/chat/messages?channel=market:<other>` returns 403).

- [ ] **Step 3: Report results**

Summarize what passed/failed on the preview. Do **not** merge to `main` until the user approves the preview.

---

## Self-Review

- **Spec coverage:** Channels (3 tiers, derived) → Tasks 1-2, 5. No DMs → not built. Polling → Task 14. Announcements pinned/badged → Tasks 6, 10-12. Full-page sidebar UI → Tasks 11-14. In-app unread only → Tasks 5, 14-15. Roles/permissions reused → Tasks 6, 9. Delete old system → Tasks 15-16. Staging on branch → Task 17. ✅
- **Placeholders:** none — every step has concrete code/commands.
- **Type/name consistency:** `deriveChannelsForUser`, `canAccessChannel`, `canPostAnnouncements`, `unreadCount`, channel object shape `{ key, type, name, market?, unread? }`, message shape, and the `chat_messages`/`chat_reads` collection names are consistent across tasks.
- **Known follow-ups (out of scope):** DMs, @mentions + email, email-on-announcement, true push, attachments, message pagination/infinite scroll.
