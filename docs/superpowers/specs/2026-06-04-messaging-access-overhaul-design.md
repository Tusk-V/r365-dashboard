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
| **Admin** (dalton@) | all | all | all channels incl. company | all stores |
| **FOM** (flag) | their markets/stores | all | **all channels incl. company** | all stores |
| **Market manager** (markets[]) | their markets' stores | all | their **markets'** channels (market + its stores); **not** company | stores in their markets |
| **Store manager** | their locations | **all** | their own store channels only | their own stores |
| **Associate** | **none (403)** | their stores | none | none |

Definitions (derived — no role enum):
- **Admin** = `email === dalton@rancherscustard.com`.
- **FOM** = boolean `fom: true`.
- **Market manager** = `managedMarkets: string[]` (subset of MARKETS = Tulsa,
  Oklahoma City, Dallas, Orlando). May cover **multiple** markets. Auto-includes
  new stores opened in those markets.
- **Store manager** = `dashboardAccess.type === 'specific'` with `locations`.
- **Associate** = no dashboard access, `chatAccess.status === 'approved'`.
- **Is a dashboard user** (the security boundary + "sees all channels") =
  `admin || fom || managedMarkets.length > 0 || dashboardAccess.type !== 'none'`.

Capability helpers (in `lib/channels.js`):
- `managedStores(actor)` = admin/fom → all LOCATIONS; else union of (stores in
  `managedMarkets`) and (`dashboardAccess.locations` if `specific`).
- `canManageStore(actor, store)` = admin || fom || store ∈ `managedStores(actor)`.
- `canManageChannel(actor, channelKey)`:
  - **company** → admin || fom.
  - **market** → admin || fom || `managedMarkets` includes that market.
  - **location** → admin || fom || `managedMarkets` includes its market ||
    `dashboardAccess.locations` includes the store.
- Normal posting allowed in any visible channel; **announce + delete/pin** use
  `canManageChannel`; **approve/remove associates** uses `canManageStore`.

## Roles removal

- The 4-value `role` (Admin/FOM/Manager/User) is replaced by scope fields on the
  user doc: boolean **`fom`** and array **`managedMarkets`**. Admin stays
  email-derived; store managers keep using `dashboardAccess.locations`.
- One-time migration: `role` of `Admin`/`FOM` → `fom: true`; everyone else →
  `fom: false`, `managedMarkets: []`. During transition, reads treat
  `fom === true || role === 'FOM' || role === 'Admin'` as FOM. Market managers
  are assigned fresh (no legacy equivalent).
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
- **Board-side admin:** `ChannelMembersPanel` gets an admin-only **scope control**
  per member — **FOM** toggle and **market-manager market picker** (multi-select
  of the four markets; writes `fom` / `managedMarkets`). Board management lives
  entirely in the board.
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
