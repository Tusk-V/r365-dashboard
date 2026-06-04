# Role/Capability Decouple + Cleanups — Design

**Date:** 2026-06-04
**Status:** Proposed (awaiting Dalton review)

## Goal

Make **Owner** a real, standalone tier instead of a flag that secretly sets
`fom: true`. Today granting Owner writes `{ owner: true, fom: true }` because the
codebase uses `fom` to mean both "is a Field Operations Manager" **and** "can see
and moderate everything." That overload is the bug: an Owner (a company
principal) is not an FOM (a field-ops job), and they should never share a flag.

Fix the root cause — separate **role** (title/tier) from **capability** (what you
can see/do) — then bundle three tidy-ups: finish the legacy `role` migration,
single-source the onboarding store list, and add an audit log for role/approval
changes.

Self-onboarding stays **open** (unchanged) — approval remains the gate.

## The core split: role vs capability

`fom` stops being the "sees everything" flag. Capability is derived from whatever
tier flags a user carries, with `owner` threaded through as a first-class input.

Tier flags on the user doc (unchanged shape, new independence):
- **Super-admin** = `email === dalton@rancherscustard.com` (hardcoded bootstrap).
- **Owner** = `owner: true`.
- **FOM** = `fom: true`.
- **Market manager** = `managedMarkets: string[]`.
- **Manager** = `manager: true` (badge; store scope still comes from `dashboardAccess`).
- **Associate** = no dashboard access, `chatAccess.status === 'approved'`.

Capability helpers live in `lib/channels.js` (extending the existing ones). Every
actor object gains an `owner` field:

| Helper | True when |
|--------|-----------|
| `canSeeAllChannels(actor)` | superAdmin \|\| owner \|\| fom |
| `isDashboardUser(actor)` | superAdmin \|\| owner \|\| fom \|\| managedMarkets.length \|\| dashboardAccess ∈ {all, specific} |
| `canManageChannel(actor, key)` | superAdmin \|\| owner \|\| fom → any; else market/store scope as today |
| `canManageRoles(actor)` | superAdmin \|\| owner |
| `canGrantOwner(actor)` | superAdmin \|\| owner |
| `tierOf(actor)` | `'Owner'` (superAdmin or owner) \| `'FOM'` \| `'Market'` \| `'Manager'` \| `'Associate'` |

## Tiers & capabilities

| Tier | Dashboard data | Sees channels | Moderate | Manage roles | Grant Owner |
|------|----------------|---------------|----------|--------------|-------------|
| **Super-admin** (dalton@) | all | all | all | yes | yes (un-removable) |
| **Owner** | all | all | all | yes | yes |
| **FOM** | all | all | all | **no** | no |
| **Market manager** | their markets | all | their markets' channels | no | no |
| **Manager** | their stores | their stores | their store channels | no | no |
| **Associate** | none (403) | their stores | none | no | no |

## Behavior changes

1. **`pages/api/chat/roles.js`**
   - Granting Owner sets `{ owner: true, fom: false, manager: false, managedMarkets: [] }`
     — Owner stands alone; no more implicit `fom: true`. Revoking sets `{ owner: false }`.
   - `canGrantOwner` gate (super-admin **or** any Owner) replaces the
     super-admin-only check, so Owners can create/revoke other Owners.
   - The super-admin (dalton@) remains un-modifiable by anyone (existing guard kept).

2. **`lib/dashboardAccess.js`**
   - Add `owner` to the projection and pass it into `isDashboardUser`, so an Owner
     passes the dashboard data gate on its own merit, not via a borrowed `fom`.

3. **Thread `owner` through every actor object.** These endpoints currently build
   an actor with `fom` but no `owner`, and only work for Owners today because of
   the coupling — each must include `owner`:
   `messages.js` (loadContext + `accessUser`), `channels.js`, `channel-admin.js`
   (`actorFrom`), `directory.js`, `members.js`, `mute.js`, `read.js`, `react.js`.
   (`channel-members.js` already carries `owner`.)

4. **Badges.** Single **Owner** badge (its own color) for super-admin and all
   Owners — drop the separate "Admin" label. `tierOf` and the stored
   `authorRole` use `'Owner'`; the badge renderer maps any legacy `authorRole:
   'Admin'` → Owner so old messages still render correctly.

5. **Migration: `owner` ⇒ `fom: false`.** One-time pass: every user with
   `owner: true` gets `fom: false` (undo the old coupling). Idempotent.

## Cleanups

6. **Finish the legacy `role` migration.** One-time migration converts any
   remaining `role: 'FOM'` → `fom: true`, then delete every transition shim
   (`|| user.role === 'FOM'`) and the `$unset: { role: '' }` writes across:
   `messages.js`, `channels.js`, `channel-members.js`, `channel-admin.js`,
   `check-access.js`, `roles.js`. Code reads clean with no `role` references.

7. **Single source for the store list.** `components/chat/Onboarding.js` imports
   `LOCATIONS` from `lib/channels` instead of its hardcoded 21-store copy, so the
   6-file location-add pattern can't silently miss the onboarding picker.

8. **Audit log.** New `chat_audit` collection; append-only docs
   `{ actorEmail, action, targetEmail, detail, at }`. Write on: role changes
   (`roles.js`, `channel-admin.js` scope actions) and chat membership changes
   (approve / deny / remove / add). No viewer UI this pass — capture only.

## Out of scope (separate spec next)

- **Morning key-metrics card** — pinned associate-safe card (sales vs forecast,
  guests, weather) auto-posted to each store channel after the morning pipeline.
  Its own design: data source, poster/auth, timing vs the 6:30/7:00 triggers,
  and an associate-safety pass. Tracked separately.
- Self-onboarding lockdown — explicitly **not** doing; open request stays.

## Sequencing

1. Migrations (`role` → `fom`; `owner` ⇒ `fom: false`) — safe, idempotent.
2. Capability helpers in `lib/channels.js` (`canSeeAllChannels`, `canManageRoles`,
   `canGrantOwner`, `tierOf`; owner-aware `canManageChannel`, `isDashboardUser`).
3. Thread `owner` through every actor; fix `lib/dashboardAccess.js`.
4. `roles.js` — owner no longer sets fom; owners can grant Owner.
5. Badges (Owner label + legacy map).
6. Cleanups: delete `role` shims, single store list, audit log.

## Testing

- `lib/channels.js`: capability tests — Owner sees/moderates all without `fom`;
  FOM cannot manage roles; `tierOf` returns `'Owner'` for owner and super-admin.
- `lib/dashboardAccess.js`: an `owner: true, fom: false` user passes the gate; an
  associate still gets 403.
- `roles.js`: granting Owner clears fom/manager/markets; an Owner can grant
  another Owner; nobody can modify the super-admin.
- Migration: idempotent; existing owners end with `fom: false`; no `role` left.
- Manual: an Owner with `fom: false` sees every channel, moderates a non-home
  channel, opens the Roles screen, and pulls dashboard data — all working.
