# Messaging Access & Roles Overhaul — Design

**Date:** 2026-06-04
**Status:** Approved (Dalton)

## Goal

Collapse the access model to two clear tiers and make the security boundary real.
Today "associates can't see the dashboard" is only a client-side redirect — the
dashboard data APIs gate on company-domain only, so an associate can pull
dashboard data directly. That hard line must be enforced server-side.

## Tiers & capabilities

| Tier | Dashboard data | Sees channels | Moderate / announce | Approve / remove associates |
|------|----------------|---------------|---------------------|------------------------------|
| **Admin** (dalton@) | all | all | all channels | all stores |
| **FOM** (flag) | their locations | all | **all channels** | all stores |
| **Dashboard user** | their locations | **all** | their own channels only | their own stores |
| **Associate** | **none (403)** | their stores | none | none |

Definitions (derived — no new tier enum):
- **Admin** = `email === dalton@rancherscustard.com`.
- **FOM** = boolean `fom: true` on the user doc.
- **Dashboard user** = `dashboardAccess.type` is `all` or `specific`.
- **Associate** = no dashboard access, `chatAccess.status === 'approved'`.

Notes:
- Normal posting is allowed in any channel the user can see. Only **announcements**
  and **delete/pin** are scoped: own channels for a plain dashboard user, all
  channels for FOM/admin (`canManageStore` semantics, FOM forces "all").
- "Their own channels/stores" = `canManageStore(actor, store)` — admin/all/FOM →
  any; specific → their `dashboardAccess.locations`.

## Roles removal

- The 4-value `role` (Admin/FOM/Manager/User) is replaced by a single boolean
  **`fom`** on the user doc. Admin remains email-derived.
- One-time migration: users with `role` of `Admin` or `FOM` → `fom: true`;
  everyone else → `fom: false` (or absent). During transition, reads treat
  `fom === true || role === 'FOM' || role === 'Admin'` as FOM.
- Delete: `components/MessagingPermissions.js`, `pages/api/chat/permissions.js`,
  the Shield "User Roles" button in `pages/index.js`, and `role` usage in
  `lib/channels.js` (`canPostAnnouncements`), `check-access.js`, message
  components (role badges → optional FOM badge only).

## Channel visibility

`deriveChannelsForUser`: any dashboard user (incl. `specific`) gets **all**
channels (`allChannels()`); associates stay store-scoped (`chatChannelsFor`).
This flips existing `channels.test.js` expectations for `specific` users — those
tests are updated to assert all-channels.

## Security enforcement (the hard line)

New helper `lib/requireDashboard.js` (or in an existing auth lib):
`requireDashboard(session, db) -> { ok, user, isAdmin }` returning 403 unless
`isAdmin || dashboardAccess.type !== 'none'`.

Apply to every dashboard data endpoint:
`sheets-proxy`, `get-pl`, `get-pl-summary`, `delete-pl`, `upload-pl`,
`get-bonus`, `save-bonus-config`, `store-managers`, `sync-users`, and any other
sales/P&L/bonus reader. (Audit `pages/api/*` for domain-only gates.)
The `pages/index.js` redirect stays as UX; the API guard is the real boundary.

## UI changes

- **Messages nav button → large labeled "Message Board" button** on the
  dashboard header (replaces the small icon).
- **Remove** the Shield "User Roles" button + modal.
- **Board-side admin:** `ChannelMembersPanel` gets an admin-only **FOM toggle**
  per member (writes `fom`). FOM/member management lives entirely in the board.
- **Admin → Users ("Dashboard Users"):** add **add-by-email (pre-provision) +
  location scope**. `/api/admin/update-pl-access` already upserts by email and
  sets `dashboardAccess`; this is mostly a UI affordance + clear labeling.

## Sequencing

1. **Security guard** (`requireDashboard` on data APIs) — closes the live hole.
2. Role → `fom` migration + capability rewiring + channel-derivation change.
3. UI: Message Board button, remove Shield, board FOM toggle, add-by-email.

## Testing

- `lib/channels.js`: update derivation tests; add capability/scoping tests
  (moderate/announce scope, FOM = all).
- Guard: a non-dashboard (associate) session gets 403 from the data APIs;
  dashboard user / admin get 200.
- Manual: associate cannot reach dashboard data; dashboard user sees all
  channels; FOM moderates a non-home channel; plain dashboard user cannot.
