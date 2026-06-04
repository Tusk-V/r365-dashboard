# Chat Push Notifications — Design

**Date:** 2026-06-04
**Branch:** `messaging-v2`
**Status:** Design, pending review

## Goal

Deliver push notifications (and, where supported, app-icon badge updates) for chat
**even when the app is closed**, so staff actually notice messages. Web-standard
**Web Push (VAPID)** through the service worker we already ship — no new vendor.

**Triggers:** announcements always; normal messages in a user's channels; with a
**per-channel mute** so busy channels can be quieted.

**Hard platform rule (set expectations):** on iPhone, web push only works if the
user has **Add to Home Screen**-installed the PWA (iOS 16.4+) and granted
notification permission. Android/desktop Chrome work once permission is granted.
Where push isn't available/permitted, the in-app unread badge still works.

## Architecture

### VAPID keys (env)
Generate one keypair (via `web-push`). Add env vars (Production + Preview + local):
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — public key, used by the browser to subscribe.
- `VAPID_PRIVATE_KEY` — secret, server-side signing.
- `VAPID_SUBJECT` — e.g. `mailto:dalton@rancherscustard.com`.

Add dependency: **`web-push`**.

### Subscription flow
- The service worker is already registered (`public/sw.js`, `_app.js`).
- In `/messages`, show a one-time **"Turn on notifications"** prompt (a dismissible
  banner/button) when `Notification.permission === 'default'` and push is supported.
  On accept: `Notification.requestPermission()` → if granted,
  `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
  → POST the subscription JSON to `/api/chat/push/subscribe`.
- Store in a new **`push_subscriptions`** collection:
  `{ userEmail, endpoint, keys: { p256dh, auth }, createdAt, userAgent }`,
  unique on `endpoint` (a user can have several devices). On `subscribe`, upsert by
  endpoint. Add `/api/chat/push/unsubscribe` (called if the browser reports the sub
  is gone) and prune subscriptions that return 404/410 when we send.

### Service worker (`public/sw.js`)
Add:
- `push` handler → `self.registration.showNotification(title, { body, data:{ url, channelKey }, icon:'/icon-192x192.png', badge:'/icon-192x192.png', tag: channelKey })`; if a numeric `badge` is in the payload, `navigator.setAppBadge(n)`.
- `notificationclick` handler → focus an existing client or `clients.openWindow(url)` to `/messages?channel=<channelKey>` and close the notification.

### Sending (on message POST)
In `/api/chat/messages` POST, after inserting the message, send pushes
(fire-and-forget within the handler, `Promise.allSettled`, time-bounded):
1. **Recipients:** scan `users` (small set), compute `deriveChannelsForUser` for each,
   keep those whose channels include `channelKey`. Exclude the author. Exclude users
   whose `mutedChannels` includes `channelKey` (announcements still notify even if
   muted — they're high-signal; configurable later).
2. Load those users' `push_subscriptions`; send via `web-push.sendNotification` with
   payload `{ title, body, url, channelKey }`:
   - Announcement → title `📣 <author> in <channelName>`, body = first ~120 chars.
   - Normal → title `<author> in <channelName>`, body = first ~120 chars.
3. On `410`/`404` from a subscription, delete it (stale device).

Recipient scan is O(users) per message — fine at ~20-50 users; revisit (precomputed
channel membership) only if the user base grows a lot.

### Mute
- Store `mutedChannels: [channelKey]` on the user doc.
- `POST /api/chat/mute` `{ channel, muted }` — validates the caller can access the
  channel (`canAccessChannel`), adds/removes from `mutedChannels`.
- Client: the channels endpoint includes each channel's `muted` flag; the
  conversation header (and/or sidebar row) gets a bell/bell-off toggle.

## Files

**Create:**
- `lib/push.js` — `web-push` configured from env; `sendToUser(emails, payload)` helper; recipient helper `usersForChannel(db, channelKey, { excludeEmail })`.
- `pages/api/chat/push/subscribe.js`, `pages/api/chat/push/unsubscribe.js`.
- `pages/api/chat/mute.js`.
- `components/chat/EnablePush.js` — the opt-in prompt/button.
- `scripts/gen-vapid.js` (dev-only) — prints a VAPID keypair (run once).

**Modify:**
- `public/sw.js` — add `push` + `notificationclick`.
- `pages/api/chat/messages.js` — after POST insert, call the push send.
- `pages/api/chat/channels.js` — include `muted` per channel (read `mutedChannels`).
- `pages/messages.js` — render `EnablePush`; add the per-channel mute toggle.
- `package.json` — add `web-push`.

## Security / privacy
- Push is only sent to users who can access the channel (server-derived), so
  notifications never leak content to people outside the channel.
- VAPID private key stays server-side; only the public key reaches the client.
- Subscriptions are per-user; deleting a user (permissions endpoint) should also
  delete their `push_subscriptions` (add to that cleanup).

## Testing
- **Unit:** `usersForChannel` (access filtering, author/mute exclusion) with a mock
  user set — pure logic extracted into `lib/push.js` and tested via `node --test`.
- **Manual (preview, installed PWA):** grant permission → post from a second account
  → notification arrives on the first device; tap opens the right channel; muting a
  channel stops its pushes (announcements still arrive); stale-subscription cleanup
  on 410.

## Out of scope (follow-ups)
- Numeric app-badge driven entirely by push (v1 sets it if payload carries a count;
  otherwise the in-app poll keeps the badge fresh).
- @mention / DM-specific pushes (no DMs yet).
- Quiet hours / digest batching.
