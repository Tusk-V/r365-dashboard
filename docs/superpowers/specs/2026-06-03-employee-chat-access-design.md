# Chat Access, Roles & Admin — Design

**Date:** 2026-06-03
**Branch:** `messaging-v2` (layered on the channel-based chat)
**Status:** Design approved (model), pending spec review

## Goal

Let **all employees** use the chat portal — not just dashboard GMs — **without
ever exposing the operations dashboard**, with a **role/scope hierarchy** so
managers and owners can admit people and (for owners) manage everything from a
central chat admin page. GMs have `@rancherscustard.com` Google accounts; line
employees do not.

## Decisions (from brainstorming)

- **Employee auth:** Email **magic link** (NextAuth `EmailProvider`, already
  configured). Any email may authenticate but gets **no access** until approved.
  ("Anyone can request; nobody gets in without approval.")
- **Two access tracks:** existing `dashboardAccess` (dashboard, GMs/admin only)
  and new **`chatAccess`** (chat only). Chat access never grants the dashboard.
- **Five chat levels** (multiple people can hold any level):

  | Level | Channels (always incl. Company-Wide) | Can admit | Full admin page |
  |---|---|---|---|
  | `employee` | their store(s) + those stores' markets | no | no |
  | `gm` | their store(s) + those markets | their store(s) | no |
  | `market_manager` | their market(s) + every store in them | any store in their market(s) | no |
  | `ops_manager` | all stores + all markets | anyone, anywhere | no |
  | `admin` | everything | anyone | **yes** |

- **Multi-store / multi-market:** `employee`/`gm` carry a **list of stores**;
  `market_manager` carries a **list of markets**; `ops_manager`/`admin` are
  global (no scope list).
- **Admin/Owner is a level** held by several people (owners + optionally FOM),
  assigned by an existing admin. `dalton@rancherscustard.com` is the permanent
  bootstrap admin (immutable).
- **Onboarding:** employees self-signup (pick store(s) → `pending` → a manager
  in scope approves). Managers/owners are **assigned directly** by an admin
  (status `approved` immediately, no pending).
- **Admin page:** only `admin`-level users get the full control page
  (`/messages/admin`): assign levels, set each person's stores/markets, view
  per-store rosters, approve/deny/remove. Lower manager levels get only the
  **scoped pending-approvals** view.

## Authentication changes (`pages/api/auth/[...nextauth].js`)

Keyed on `account.provider`:
- **`google`** → still require `@rancherscustard.com` (unchanged).
- **`email`** (magic link) → allow any email to authenticate.
- **Auto-create:** Google company user → `dashboardAccess:{type:'none'}` as today.
  Email user → also `chatAccess:{ level:'employee', status:'none', stores:[],
  markets:[] }`.
- Access is enforced downstream, not by email domain.

`session` callback exposes `session.user.chatAccess` for client routing.
Bootstrap: `dalton@` is treated as `chatAccess.level='admin'` regardless of
stored value.

## Data model (`users` collection)

New field (absence = no chat access):

```
chatAccess: {
  level: 'employee' | 'gm' | 'market_manager' | 'ops_manager' | 'admin',
  status: 'none' | 'pending' | 'approved',
  stores:  [ <locationName>, ... ],   // employee/gm scope
  markets: [ <marketName>,  ... ],     // market_manager scope
  requestedAt: Date | null,
  approvedBy:  <email> | null,
  approvedAt:  Date | null
}
```

`dashboardAccess` untouched. A user with both tracks gets the union of channels.

## Channel derivation (`lib/channels.js`)

`deriveChannelsForUser({ isAdmin, dashboardAccess, chatAccess })` adds chat
channels when `chatAccess.status === 'approved'` (or level is a manager/admin
assigned directly), by level:
- `employee` / `gm` → company + markets-of(`stores`) + each store's location channel.
- `market_manager` → company + each market in `markets` + every location channel in those markets.
- `ops_manager` / `admin` → all channels (same as dashboard admin).
Union + dedupe with any `dashboardAccess`-derived channels; existing ordering
(company → markets → locations) preserved.

New helpers (unit-tested):
- `chatChannelsFor(chatAccess)` — the per-level channel set above.
- `canManageStore(actor, store)` — true if actor is `admin`/`ops_manager`, or
  `market_manager` whose `markets` includes the store's market, or `gm` whose
  `stores` includes the store. Drives approval scoping.
- `canManageChatPermissions(actor)` — true only for `admin`.

## API changes

All `/api/chat/*` routes load `chatAccess` with `dashboardAccess` and pass both
into `deriveChannelsForUser`/`canAccessChannel`. A valid chat participant has ≥1
derived channel.

- **`channels.js`, `messages.js`, `read.js`, `react.js`** — augment context to
  include `chatAccess`. Per-channel `canAccessChannel` already enforces specifics.

New endpoints:
- **`POST /api/chat/onboard`** `{ stores: [...] }` — signed-in employee-candidate
  sets the store(s) they work at (validated ⊆ `LOCATIONS`). Sets
  `chatAccess:{ level:'employee', status:'pending', stores, requestedAt }`.
  Employees only (no dashboard access, not already approved). Re-submittable while
  `none`/`pending`.
- **`GET /api/chat/members`** — pending requests visible to the caller:
  pending users where every (or any) requested store is manageable by the caller
  via `canManageStore`. Returns `{ email, name, stores, requestedAt }`.
- **`POST /api/chat/members`** `{ email, action:'approve'|'deny' }` — caller must
  `canManageStore` for the user's requested store(s) (admin/ops always can).
  `approve` → `status:'approved'` (grants the stores the approver is authorized
  for; any out-of-scope stores stay pending for another manager/admin). `deny` →
  back to `status:'none', stores:[]`.
- **`GET/POST /api/chat/admin/users`** — **admin-level only**
  (`canManageChatPermissions`). GET lists all chat users with level/scope/status.
  POST `{ email, level, stores, markets, status }` upserts a person's chat
  role/scope (direct assignment; managers/owners created here are `approved`
  immediately). Cannot demote/remove the bootstrap admin.

## UI / UX (mobile-first, branded header — consistent with the chat)

- **`components/chat/Onboarding.js`** — `/messages` renders this when the viewer
  has no chat channels: store **multi-select** picker → `POST /api/chat/onboard`;
  then a "waiting for approval" state for `pending`.
- **`components/chat/PendingApprovals.js`** — for any manager level (`gm`+), a
  "Pending approvals (N)" entry in `/messages` listing in-scope pending employees
  with Approve/Deny (`/api/chat/members`).
- **`pages/messages/admin.js`** — **admin-only** control page: table of all chat
  users (name, email, level, stores/markets, status); edit level + scope; per-store
  roster view ("who's in each store"); approve/deny/remove. Reachable from a gear
  in the `/messages` header shown only to `admin` level.
- **Route separation:** `/messages` + `/api/chat/*` open to approved chat users
  and dashboard users. `/` and other dashboard pages/APIs stay `dashboardAccess`-
  gated. An employee landing on `/` is redirected to `/messages`.
- **`pages/auth/signin.js`** — surface the email magic-link box ("Employees —
  enter your email") alongside the Google button.

## Security

- Magic link authenticates anyone but grants nothing until approved/assigned;
  dashboard APIs stay `dashboardAccess`-gated, so chat users can't read dashboard
  data.
- **Approval & management are scope-enforced server-side**: `canManageStore`
  gates `/api/chat/members`; `canManageChatPermissions` (admin only) gates
  `/api/chat/admin/*`.
- Channel access is always re-derived server-side from stored `chatAccess`;
  clients can't self-elevate.
- Bootstrap admin `dalton@` is immutable (can't be demoted/removed).
- Google sign-in stays company-domain restricted.

## Testing

- **Unit (`lib/channels`):** `chatChannelsFor` per level (employee multi-store,
  gm, market_manager multi-market, ops/admin all); `canManageStore` matrix;
  `canManageChatPermissions` admin-only; dual-track union; non-approved → `[]`.
- **API:** employee can't read/post outside assigned channels; can't reach a
  dashboard API; `members` approve/deny scoped to caller; `admin/users` rejects
  non-admin; `onboard` validates stores and is employee-only; bootstrap admin
  protected.
- **Manual (preview):** email sign-in → multi-store pick → pending → manager
  approves → sees company+markets+stores and can post; admin page assigns a
  Market Manager and an Operations Manager and verifies their scopes; employee
  on `/` is redirected; dashboard unaffected for GMs/admin.

## Out of scope (future)

- Email/push notification to managers on a new pending request (they check in-app).
- Bulk CSV import of employees/levels.
- Phone/SMS auth.
- Per-channel mute / notification preferences.
