# Messaging System (v2) — Channel-Based Chat

**Date:** 2026-06-03
**Branch:** `messaging-v2`
**Status:** Design approved, pending spec review

## Goal

Replace the existing one-to-many announcement board with a Slack/Discord-style
channel-based chat that managers will actually use day to day, while preserving
a way to push announcements that stand out from normal chatter.

The current system (`components/MessagesPanel.js`, `pages/api/messages/*`) is an
announcement board — titled posts with priority, audience targeting, threaded
replies, reactions, and per-message read tracking. Nobody uses it. We are
starting fresh, not migrating.

## Decisions (from brainstorming)

- **Model:** Channels for everyday conversation **plus** announcements that stand
  out, unified into one system.
- **Channel structure:** Three tiers — `#company-wide`, per-market, per-location
  (~25 channels). Membership is auto-derived from each user's location access +
  role. No hand-created channels.
- **DMs:** Out of scope for this build.
- **Real-time:** Polling (~3s while a channel is open). No third-party realtime
  service — reuses MongoDB, zero new infra/cost. Appropriate for ~20-30 users.
- **Announcements:** Just messages flagged `isAnnouncement` with a priority,
  pinned to the top of a channel. Only Admin/FOM can post them.
- **UI:** Dedicated full-page `/messages` route with a persistent left channel
  sidebar on web; stacked list→conversation on mobile.
- **Notifications:** In-app unread badges only. No emails, no @mentions.
- **Staging:** Built on the `messaging-v2` branch → Vercel preview URL for
  testing with real data → merge to `main` (production) only after approval.
- **Approach:** Reshape into a chat model, reuse valuable plumbing (reactions,
  role permissions, MongoDB, unread concept), delete the old board after cutover.

## Architecture

### Source of truth: `lib/locations.js`

A new shared module exports the canonical markets, locations, and the
location→market mapping. `pages/index.js` and `pages/admin/users.js` are
refactored to read from it so the lists stop drifting. Channels are **derived**
from this config, so adding a location here automatically creates its channel and
market mapping — no extra file in the location-add pattern.

### Channel derivation: `lib/channels.js`

Channels are computed, not stored as documents:

- `company-wide` — visible to everyone with any dashboard access.
- `market:<market>` — one per market (tulsa, okc, dallas, orlando).
- `loc:<location-slug>` — one per location.

`deriveChannelsForUser(user)`:

- **Admin** → all channels.
- **Everyone else** → `company-wide`, plus the market channel for every market
  their accessible locations span, plus a location channel per accessible
  location.
  - Example: a manager with access to *Frisco #3* + *Allen* sees
    `#company-wide`, `#dallas`, `#frisco-3`, `#allen`.
  - An FOM with access to all Dallas locations sees `#dallas` + every Dallas
    location channel automatically.

### Posting permissions

- Members can post normal messages in any channel they can see.
- **Announcements** (pinned + priority) — Admin/FOM only, reusing the existing
  `canPin`/`canDelete` role rule (`role === 'Admin' || role === 'FOM'`).

## Data model (MongoDB, all new, `chat_` prefixed)

Old `messages` / `message_reads` collections are left dormant (not dropped).

### `chat_messages`

One document per message:

```
{
  channelKey: string,        // e.g. "company-wide", "market:dallas", "loc:frisco-3"
  body: string,              // no title — flat conversational message
  authorEmail: string,
  authorName: string,
  authorRole: string,        // Admin | FOM | Manager | User (snapshot at post time)
  createdAt: Date,
  editedAt: Date | null,
  isAnnouncement: boolean,   // true => pinned + badged
  priority: string,          // "normal" | "important" | "urgent" (announcements only)
  pinned: boolean,
  reactions: { [emoji]: string[] },  // emoji -> array of user emails
  deleted: boolean
}
```

Flat stream — replies just flow as new messages (no nested threading).
Indexed on `{ channelKey: 1, createdAt: 1 }` for cheap "messages after X" polling.

### `chat_reads`

Slack-style last-read pointer, one doc per user-per-channel:

```
{ channelKey: string, userEmail: string, lastReadAt: Date }
```

Unread count for a channel = count of `chat_messages` in that channel with
`createdAt > lastReadAt` and `authorEmail !== userEmail`. Total header badge =
sum across the channels the user can see.

### `users` (reused, unchanged)

Roles (`Admin`/`FOM`/`Manager`/`User`) and `dashboardAccess.locations` drive
access derivation. No schema change. `components/MessagingPermissions.js`
(role admin UI) is reused as-is.

## UI / UX

### New route: `pages/messages.js`

The header 💬 button does `router.push('/messages')` (replaces the old drawer).
The 💬 badge shows total unread across all the user's channels.

### Web (desktop) — two panes

- **Left sidebar (~260px):** channel list grouped into collapsible sections —
  **Company** (`#company-wide`), **Markets**, **Locations** (alphabetical). Each
  row shows the channel name + unread badge; active channel highlighted. Sidebar
  is persistent across channel switches.
- **Right pane:** channel header (name + scope) → pinned announcements banner
  (colored by priority, collapsible) → message stream (oldest→newest,
  auto-scroll to bottom on new) → composer pinned at bottom.

### Message item

Avatar/initials, author name + role badge (reuse existing `RoleBadge` styling),
relative timestamp, body, hover actions (react / edit-own / delete per role), and
a reaction row. Announcements get a left accent bar + priority badge, pinned
above the stream.

### Composer

Text box + Send. Enter sends, Shift+Enter newline. Admin/FOM see a
"Post as announcement" toggle that reveals the priority picker
(important/urgent).

### Mobile

Single pane: channel list is the default view; tapping a channel slides into the
conversation with a back arrow. Same dark-slate design system.

## Real-time (polling) & error handling

- **Open channel:** poll `GET /api/chat/messages?channel=…&after=<lastTime>`
  every ~3s, appending only new messages. Auto-scroll only when already near the
  bottom (don't yank the user reading history).
- **Sidebar/header unread:** lighter `GET /api/chat/unread` every ~10s.
- **Polling pauses** when the tab is hidden (`visibilitychange`), resumes on
  focus.
- **Sending:** optimistic — message appears instantly; on POST failure it's
  marked "failed" with a retry, never silently lost.
- **Network blips:** polling failures retry silently; sustained outage shows a
  subtle "reconnecting…" note.
- **Read marking:** write `lastReadAt` when a channel is opened/focused.

## File structure

New files (kept small, single-purpose):

- `lib/locations.js` — shared markets/locations/market-map (new source of truth)
- `lib/channels.js` — `deriveChannelsForUser(user)`, key/name helpers, unread math
- `pages/messages.js` — route shell, layout, polling orchestration, auth/role gate
- `components/chat/ChannelSidebar.js`
- `components/chat/MessageStream.js`
- `components/chat/MessageItem.js`
- `components/chat/Composer.js`
- `pages/api/chat/channels.js` — list channels for user + unread counts
- `pages/api/chat/messages.js` — GET stream / POST send / PUT edit / DELETE
- `pages/api/chat/read.js` — POST update `lastReadAt`
- `pages/api/chat/react.js` — toggle emoji reaction

Reused: `components/MessagingPermissions.js`, the `users` collection.

Refactored: `pages/index.js` and `pages/admin/users.js` read from
`lib/locations.js`; the header 💬 button navigates to `/messages`.

Deleted after cutover: `components/MessagesPanel.js`, `pages/api/messages/*`.
Old `messages` / `message_reads` collections left dormant (not dropped).

## Testing

- **Unit:** `deriveChannelsForUser` across Admin/FOM/Manager/limited-access;
  unread counting vs. `lastReadAt`.
- **API:** access control — can't read/post in a channel outside your access;
  can't post an announcement as a Manager.
- **Manual (on preview URL):** post & see it poll in within ~3s; pinned
  announcement banner; optimistic send + failure retry; mobile drawer; unread
  badges clearing on open.

## Staging & rollout

1. All work on `messaging-v2` branch.
2. Push branch → Vercel preview URL → test with real data.
3. Merge to `main` (production) only after explicit approval.

## Out of scope (possible follow-ups)

- Direct messages (1-on-1).
- @mentions + email-on-mention.
- Email-on-announcement.
- True push (Pusher/Ably) if polling ever proves insufficient.
- File/image attachments.
