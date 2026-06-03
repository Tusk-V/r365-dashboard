# Employee Chat Access — Design

**Date:** 2026-06-03
**Branch:** `messaging-v2` (layered on the channel-based chat)
**Status:** Design approved, pending spec review

## Goal

Let **all employees** — not just general managers — use the chat/communication
portal, **without ever exposing the operations dashboard**. GMs have
`@rancherscustard.com` Google accounts; hourly/line employees do not. So this
adds a second, lower-privilege way into `/messages` only.

## Decisions (from brainstorming)

- **Employee auth:** Email **magic link** (NextAuth `EmailProvider`, already
  configured). No passwords, no new dependency/cost. Any email may authenticate
  but receives **no access** until approved.
- **Two separate access tracks** on the user record: existing `dashboardAccess`
  (gates the dashboard, GMs/admin only) and new **`chatAccess`** (gates the chat
  only). An employee never gets dashboard access.
- **Onboarding:** Employee signs in → **picks the store they work at** → status
  `pending` → that store's GM approves → status `approved`.
- **Approver:** Any user with **dashboard access to that store** (the store's
  GM/FOM) or admin. Self-service so the admin isn't the bottleneck.
- **Employee channels:** Once approved — **Company-Wide + their market + their
  store** location channel. Can post normal messages; announcements stay
  Admin/FOM only.

## Authentication changes (`pages/api/auth/[...nextauth].js`)

Current `signIn` callback rejects any non-`@rancherscustard.com` email for ALL
providers. New logic, keyed on `account.provider`:

- **`google`** → still require `@rancherscustard.com` (unchanged). Keeps random
  Google accounts out entirely.
- **`email`** (magic link) → allow **any** email through authentication. These
  are employee candidates.
- **User auto-create:**
  - Google company user → as today (`dashboardAccess: { type:'none' }` default).
  - Email user → create with `dashboardAccess: { type:'none' }` **and**
    `chatAccess: { status:'none', store:null }`.
- No one is blocked at sign-in by domain anymore except non-company Google
  sign-ins. **Access is enforced downstream**, not by the email domain.

`session` callback also exposes `session.user.chatAccess` so the client can
route onboarding/pending/approved states. (Admin `dalton@` stays always-admin.)

## Data model (`users` collection)

Add one field (no migration needed; absence = `none`):

```
chatAccess: {
  status: 'none' | 'pending' | 'approved',
  store: <locationName> | null,     // one of lib/channels LOCATIONS
  requestedAt: Date | null,
  approvedBy: <email> | null,
  approvedAt: Date | null
}
```

`dashboardAccess` is untouched. A user normally has one track or the other;
if somehow both, channel sets are unioned.

## Channel derivation (`lib/channels.js`)

Extend `deriveChannelsForUser` and `canAccessChannel` to accept `chatAccess`:

`deriveChannelsForUser({ isAdmin, dashboardAccess, chatAccess })`:
- Existing behavior from `dashboardAccess` (admin → all; specific → company +
  spanned markets + their locations) is unchanged.
- **Plus**, if `chatAccess.status === 'approved'` and `chatAccess.store` is set:
  add `company-wide` + the market channel for that store + that store's location
  channel.
- Union and dedupe by `key`, keep the existing ordering (company → markets →
  locations).

So an approved employee with no dashboard access sees exactly:
`company-wide`, `market:<their market>`, `loc:<their store>`.

All existing `lib/channels` unit tests stay; new tests cover the chatAccess
paths.

## API changes

All `/api/chat/*` routes must load `chatAccess` alongside `dashboardAccess` and
pass both into `deriveChannelsForUser` / `canAccessChannel`. A user is a valid
chat participant iff they have **≥1 derived channel** (from either track).

- **`channels.js`, `messages.js`, `read.js`, `react.js`** — augment the
  `loadContext`/access derivation to include `chatAccess`. No other logic change;
  per-channel `canAccessChannel` already enforces correctness.

New endpoints:

- **`POST /api/chat/onboard`** `{ store }` — the signed-in user sets the store
  they work at. Validates `store ∈ LOCATIONS`. Sets
  `chatAccess = { status:'pending', store, requestedAt:new Date() }`. Only allowed
  when the caller currently has no dashboard access and is not already approved
  (employees only). Idempotent re-submit allowed while `pending`/`none`.

- **`GET /api/chat/members`** — returns pending chat requests for the stores the
  caller manages. Manageable stores: admin → all; otherwise the caller's
  `dashboardAccess.locations`. Returns `[{ email, name, store, requestedAt }]`
  filtered to `chatAccess.status === 'pending'` and `store ∈ manageable`.

- **`POST /api/chat/members`** `{ email, action: 'approve'|'deny' }` — caller must
  manage that user's `chatAccess.store` (or be admin). `approve` →
  `status:'approved', approvedBy, approvedAt`. `deny` → `status:'none', store:null`
  (employee can re-onboard). Rejects if caller doesn't manage the store.

## UI / UX

### Onboarding + pending (employees) — `components/chat/Onboarding.js`

`/messages` gates rendering on the viewer's access:
- Has any chat channels (dashboard or approved chat) → render the chat (existing).
- Else if `chatAccess.status` is `none`/missing → render **store picker**:
  "Which Andy's location do you work at?" (dropdown of `LOCATIONS`) → submit →
  `POST /api/chat/onboard`.
- Else if `chatAccess.status === 'pending'` → render **"Waiting for approval"**:
  "Your request to join {store} is with your manager."

Branded, mobile-first, same slate theme + Andy's header.

### GM approval — `components/chat/PendingApprovals.js`

For viewers who can manage at least one store (admin or GM with
`dashboardAccess.locations`), `/messages` shows a **"Pending approvals (N)"**
entry (a button in the header / top of the sidebar). Opens a list of pending
employees for their stores with **Approve / Deny** buttons, calling
`/api/chat/members`. Mobile-friendly. Badge count refreshes with the channel
poll.

### Route separation

- `/messages` + `/api/chat/*` → open to approved chat users AND dashboard users.
- `/` and all other dashboard pages/APIs → **unchanged**, gated by
  `dashboardAccess`. An employee (dashboard `none`) who lands on `/`:
  - if `chatAccess.status === 'approved'` → redirect to `/messages`;
  - else → the onboarding/pending experience (redirect to `/messages`, which
    shows the right state).

### Sign-in page (`pages/auth/signin.js`)

Surface BOTH paths clearly: "Sign in with Google" (managers) and an **email
field** ("Employees — enter your email to get a sign-in link"). Magic-link email
sends through the existing nodemailer config (`EMAIL_SERVER_*`).

## Security

- Magic link authenticates anyone, but **grants nothing** until a managing GM
  approves — dashboard APIs remain `dashboardAccess`-gated, so employees can
  never read dashboard data.
- Approval is **scoped**: a GM may only approve employees for stores in their
  own `dashboardAccess.locations`; admin may approve any. Enforced server-side.
- Employees cannot self-approve or change to a store they aren't approved for;
  channel access is always re-derived server-side from the stored `chatAccess`.
- Google sign-in stays company-domain-restricted.

## Testing

- **Unit (`lib/channels`):** approved employee → exactly company+market+store;
  `none`/`pending` employee → `[]`; GM unchanged; dual-track union; `canAccessChannel`
  denies an employee any other store/market.
- **API:** employee can't read/post in a non-assigned channel (403); employee
  can't reach a dashboard API; `members` approve/deny scoped to the caller's
  stores; `onboard` validates store and employee-only.
- **Manual (preview):** email magic-link sign-in → store picker → pending screen;
  GM sees + approves; employee then sees company+market+store and can post;
  employee hitting `/` is redirected; GM/admin dashboard unaffected.

## Out of scope (future)

- Employees assigned to multiple stores (v1 = one store).
- Self-service "change my store" after approval (deny + re-onboard for now).
- Email/push notifications for new pending requests (GMs check in-app).
- Phone/SMS auth.
