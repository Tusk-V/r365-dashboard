# Role/Capability Decouple + Cleanups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Owner a standalone top tier (super-admin powers, can grant Owners) instead of a flag that secretly sets `fom: true`, then finish the legacy `role` migration, single-source the onboarding store list, and add a role/approval audit log.

**Architecture:** Separate *role* (tier flags on the user doc) from *capability* (derived helpers in `lib/channels.js`). Thread a first-class `owner` field through every actor object so "sees/moderates everything" no longer requires borrowing `fom`. Two idempotent DB migrations run via a super-admin-gated endpoint. UI badges collapse the top tier to a single "Owner" label.

**Tech Stack:** Next.js (pages router), MongoDB (`andysdashboard` DB, `users`/`chat_audit` collections), NextAuth, `node:test` for unit tests, Tailwind.

**Branch:** `role-capability-decouple` (already created; the spec is committed there).

---

## Background facts (read before starting)

- Tests run with `npm test` (`node --test`), live in `tests/`, use `node:test` + `node:assert/strict`, and `require('../lib/channels')` (CommonJS).
- `lib/channels.js` is CommonJS (`module.exports`); `lib/*` consumed by the Next app via import interop.
- `ADMIN_EMAIL = 'dalton@rancherscustard.com'` is the hardcoded super-admin everywhere.
- Today granting Owner writes `{ owner: true, fom: true }` ([roles.js:59](pages/api/chat/roles.js)). Most chat routes build an actor with `fom` but **no** `owner`, so owners only work because of that coupling. Decoupling = threading `owner` everywhere + stopping the auto-`fom`.
- `deriveChannelsForUser` ([lib/channels.js:147](lib/channels.js)) already reads `user.owner` correctly — no change needed there.
- The Vercel preview and production share one MongoDB cluster (`MONGODB_URI`), so migrations run from a preview deploy affect live data. Both migrations are idempotent and safe.

## File map

| File | Responsibility | Change |
|------|----------------|--------|
| `lib/channels.js` | capability source of truth | Thread `owner`; add `canSeeAllChannels`, `canManageRoles`, `canGrantOwner`, `tierOf`; `canPostAnnouncements` accepts `'Owner'` |
| `tests/channels.test.js` | unit tests | Add owner/capability tests |
| `lib/dashboardAccess.js` | dashboard data gate | Read + honor `owner` |
| `lib/audit.js` | audit-log writer | **Create** |
| `pages/api/admin/migrate-roles.js` | one-off migrations | **Create**, run, then delete |
| `pages/api/chat/roles.js` | role assignment | Owner≠fom; owners grant Owner; audit |
| `pages/api/chat/messages.js` | messages + actor | Thread `owner`; `authorRole: 'Owner'` |
| `pages/api/chat/channels.js` | channel list | Thread `owner` |
| `pages/api/chat/channel-admin.js` | per-channel admin | Thread `owner`; audit |
| `pages/api/chat/directory.js` | people directory | `owner`/`fom` can view |
| `pages/api/chat/members.js` | member list | `owner`/`fom` can view |
| `pages/api/chat/mute.js` `read.js` `react.js` | per-user actions | Thread `owner` into access actor |
| `pages/api/check-access.js` | session scope | Drop `role` shim; admin branch returns `owner` |
| `components/chat/RolesPanel.js` | roles UI | "Owner" label; owners see Owner toggle |
| `components/chat/MessageItem.js` | message badge | `Owner` badge (+ legacy `Admin` alias) |
| `pages/messages.js` | board page | `tierOf`→`'Owner'`; badge maps |
| `components/chat/Onboarding.js` | store picker | Import `LOCATIONS` |

---

## Task 1: Capability helpers in `lib/channels.js`

**Files:**
- Modify: `lib/channels.js`
- Test: `tests/channels.test.js`

- [ ] **Step 1: Write failing tests** — append to `tests/channels.test.js`:

```javascript
// Owner tier: capability without fom
const { canSeeAllChannels, canManageRoles, canGrantOwner, tierOf } = require('../lib/channels');

test('owner sees and moderates everything without fom', () => {
  const owner = { isAdmin: false, owner: true, fom: false };
  const keys = deriveChannelsForUser(owner).map(c => c.key);
  for (const k of allChannels().map(c => c.key)) assert.ok(keys.includes(k));
  assert.ok(keys.includes('managers'));
  assert.equal(canManageChannel(owner, 'company-wide'), true);
  assert.equal(canManageChannel(owner, 'managers'), true);
  assert.equal(isDashboardUser(owner), true);
  assert.equal(canManageStore(owner, 'Allen'), true);
});

test('canSeeAllChannels: superadmin/owner/fom only', () => {
  assert.equal(canSeeAllChannels({ isAdmin: true }), true);
  assert.equal(canSeeAllChannels({ owner: true }), true);
  assert.equal(canSeeAllChannels({ fom: true }), true);
  assert.equal(canSeeAllChannels({ managedMarkets: ['Dallas'] }), false);
  assert.equal(canSeeAllChannels({ dashboardAccess: { type: 'specific', locations: ['Bixby'] } }), false);
});

test('canManageRoles / canGrantOwner: superadmin or owner', () => {
  assert.equal(canManageRoles({ isAdmin: true }), true);
  assert.equal(canManageRoles({ owner: true }), true);
  assert.equal(canManageRoles({ fom: true }), false);
  assert.equal(canGrantOwner({ owner: true }), true);
  assert.equal(canGrantOwner({ isAdmin: true }), true);
  assert.equal(canGrantOwner({ fom: true }), false);
});

test('tierOf returns Owner for superadmin and owner, then FOM/Market/Manager/Associate', () => {
  assert.equal(tierOf({ isAdmin: true }), 'Owner');
  assert.equal(tierOf({ owner: true }), 'Owner');
  assert.equal(tierOf({ fom: true }), 'FOM');
  assert.equal(tierOf({ managedMarkets: ['Dallas'] }), 'Market');
  assert.equal(tierOf({ manager: true }), 'Manager');
  assert.equal(tierOf({ chatAccess: { status: 'approved', stores: ['Bixby'] } }), 'Associate');
  assert.equal(tierOf({}), null);
});

test('canPostAnnouncements accepts Owner', () => {
  assert.equal(canPostAnnouncements('Owner'), true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL — `canSeeAllChannels is not a function` (and the owner/tierOf assertions).

- [ ] **Step 3: Thread `owner` into the existing helpers.** In `lib/channels.js`, change each guard to include `actor.owner`:

`managedStores` (currently `if (actor.isAdmin || actor.fom) return [...LOCATIONS];`):
```javascript
  if (actor.isAdmin || actor.owner || actor.fom) return [...LOCATIONS];
```
`canManageStore` (currently `if (actor.isAdmin || actor.fom) return true;`):
```javascript
  if (actor.isAdmin || actor.owner || actor.fom) return true;
```
`canManageChannel` (currently `if (actor.isAdmin || actor.fom) return true;`):
```javascript
  if (actor.isAdmin || actor.owner || actor.fom) return true;
```
`isDashboardUser` (currently `if (actor.isAdmin || actor.fom) return true;`):
```javascript
  if (actor.isAdmin || actor.owner || actor.fom) return true;
```
`canViewChannelMembers` (currently `if (actor.isAdmin || actor.fom) return true;`):
```javascript
  if (actor.isAdmin || actor.owner || actor.fom) return true;
```

- [ ] **Step 4: Add the new helpers** before the `module.exports` block:

```javascript
// Capability predicates — single source of truth. `actor` carries the tier
// flags { isAdmin, owner, fom, managedMarkets, manager, dashboardAccess, chatAccess }.
function canSeeAllChannels(actor) {
  return !!(actor && (actor.isAdmin || actor.owner || actor.fom));
}

// Role/Owner administration is for the super admin and Owners only.
function canManageRoles(actor) {
  return !!(actor && (actor.isAdmin || actor.owner));
}
function canGrantOwner(actor) {
  return !!(actor && (actor.isAdmin || actor.owner));
}

// Display tier. Owner (incl. super admin) collapses to 'Owner'.
function tierOf(actor) {
  if (!actor) return null;
  if (actor.isAdmin || actor.owner) return 'Owner';
  if (actor.fom) return 'FOM';
  if ((actor.managedMarkets || []).length) return 'Market';
  if (actor.manager) return 'Manager';
  if (actor.chatAccess && actor.chatAccess.status === 'approved') return 'Associate';
  return null;
}
```

- [ ] **Step 5: Update `canPostAnnouncements`** (currently `return role === 'Admin' || role === 'FOM';`):

```javascript
function canPostAnnouncements(role) {
  return role === 'Owner' || role === 'Admin' || role === 'FOM';
}
```

- [ ] **Step 6: Export the new helpers.** Add to the `module.exports = { ... }` object:

```javascript
  canSeeAllChannels,
  canManageRoles,
  canGrantOwner,
  tierOf,
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: PASS (all `tests/channels.test.js`, including the new owner/capability tests).

- [ ] **Step 8: Commit**

```bash
git add lib/channels.js tests/channels.test.js
git commit -m "feat(chat): owner-aware capability helpers in lib/channels"
```

---

## Task 2: Honor `owner` in the dashboard data gate

**Files:**
- Modify: `lib/dashboardAccess.js`

- [ ] **Step 1: Add `owner` to the projection and the actor.** Replace the body of `hasDashboardAccess` after the admin check:

```javascript
  const db = (await clientPromise).db("andysdashboard");
  const user = await db.collection('users').findOne(
    { email },
    { projection: { dashboardAccess: 1, owner: 1, fom: 1, managedMarkets: 1 } }
  );
  // Owners and FOMs are dashboard users; market/store managers are too.
  // Associates (chat-only) are not.
  return isDashboardUser({
    isAdmin: false,
    owner: user?.owner,
    fom: user?.fom,
    managedMarkets: user?.managedMarkets,
    dashboardAccess: user?.dashboardAccess,
  });
```

- [ ] **Step 2: Sanity-check with a node one-liner** (pure logic, no DB):

Run: `node -e "const {isDashboardUser}=require('./lib/channels'); console.log(isDashboardUser({isAdmin:false,owner:true,fom:false}), isDashboardUser({isAdmin:false,dashboardAccess:{type:'none'}}))"`
Expected: `true false`

- [ ] **Step 3: Commit**

```bash
git add lib/dashboardAccess.js
git commit -m "fix(security): owner passes the dashboard data gate on its own"
```

---

## Task 3: Migration endpoint (`role`→`fom`, `owner`⇒`fom:false`)

**Files:**
- Create: `pages/api/admin/migrate-roles.js`

- [ ] **Step 1: Create the endpoint** — super-admin only, POST only, idempotent:

```javascript
// pages/api/admin/migrate-roles.js
// One-off, idempotent role migrations. Super-admin only. DELETE THIS FILE after
// running once against the live database (see plan Task 8).
//   POST -> { legacyRoleToFom, ownerFomCleared }
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (session.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Super admin only' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = (await clientPromise).db("andysdashboard");

  // 1) Legacy `role: 'FOM'` -> fom:true, then drop the field for everyone.
  const legacy = await db.collection('users').updateMany(
    { role: 'FOM' }, { $set: { fom: true } }
  );
  await db.collection('users').updateMany({ role: { $exists: true } }, { $unset: { role: '' } });

  // 2) Undo the old owner⇒fom coupling: owners stand alone.
  const owners = await db.collection('users').updateMany(
    { owner: true }, { $set: { fom: false } }
  );

  return res.status(200).json({
    legacyRoleToFom: legacy.modifiedCount,
    ownerFomCleared: owners.modifiedCount,
  });
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build completes with no type/import errors (the new route compiles).

- [ ] **Step 3: Commit**

```bash
git add pages/api/admin/migrate-roles.js
git commit -m "chore(chat): one-off role migration endpoint (super-admin)"
```

> **Run note (do at deploy time, not now):** After this branch is on a Vercel preview, signed in as the super admin, `POST /api/admin/migrate-roles` once (e.g. `fetch('/api/admin/migrate-roles',{method:'POST'}).then(r=>r.json()).then(console.log)` in the browser console). Re-running is safe (idempotent). The endpoint is deleted in Task 8.

---

## Task 4: Decouple Owner from FOM in `roles.js` + audit

**Files:**
- Create: `lib/audit.js`
- Modify: `pages/api/chat/roles.js`

- [ ] **Step 0: Create the audit helper first** (it is imported here and in Task 6). Create `lib/audit.js`:

```javascript
// lib/audit.js
// Append-only audit trail for role and chat-membership changes.
// Fire-and-forget: a logging failure must never block the user's action.
export async function logAudit(db, { actorEmail, action, targetEmail = null, detail = null }) {
  try {
    await db.collection('chat_audit').insertOne({
      actorEmail, action, targetEmail, detail, at: new Date(),
    });
  } catch (err) {
    console.error('audit log failed:', action, err);
  }
}
```

- [ ] **Step 1: Stop auto-setting `fom` on Owner grants and let Owners grant Owner.** Replace the `if (action === 'owner') { ... }` block:

```javascript
      if (action === 'owner') {
        if (!isSuperAdmin && !me?.owner) return res.status(403).json({ error: 'Only the super admin or an Owner can set Owners' });
        // Owner is a standalone top tier — no implicit fom. Granting clears the
        // lower tiers; revoking just drops owner.
        const set = value
          ? { owner: true, fom: false, manager: false, managedMarkets: [] }
          : { owner: false };
        await db.collection('users').updateOne({ email: targetEmail }, { $set: set, $unset: { role: '' } });
        await logAudit(db, { actorEmail: email, action: value ? 'grant-owner' : 'revoke-owner', targetEmail });
        return res.status(200).json({ success: true });
      }
```

- [ ] **Step 2: Add audit calls to the other actions.** After each successful `updateOne` in the `fom`, `manager`, `markets`, and `name` branches, add a matching `logAudit` line, e.g. for `fom`:

```javascript
        await db.collection('users').updateOne({ email: targetEmail }, { $set: set, $unset: { role: '' } });
        await logAudit(db, { actorEmail: email, action: 'set-fom', targetEmail, detail: { value: !!value } });
        return res.status(200).json({ success: true });
```
Use `action: 'set-manager'` (detail `{ value }`), `action: 'set-markets'` (detail `{ markets: valid }`), `action: 'rename'` (detail `{ name }`) for the others.

- [ ] **Step 3: Expose `canGrantOwner` in GET** so the UI can show the Owner toggle. In the GET response, add the field:

```javascript
      return res.status(200).json({ isSuperAdmin, canGrantOwner: isSuperAdmin || !!me?.owner, users: list });
```

- [ ] **Step 4: Import the audit helper** at the top (helper created in Task 6; add the import now):

```javascript
import { logAudit } from "../../../lib/audit";
```

- [ ] **Step 5: Commit**

```bash
git add lib/audit.js pages/api/chat/roles.js
git commit -m "feat(chat): Owner is standalone (no auto-FOM); Owners can grant Owner"
```

---

## Task 5: Thread `owner` through every chat actor

**Files:**
- Modify: `pages/api/chat/messages.js`, `channels.js`, `channel-admin.js`, `directory.js`, `members.js`, `mute.js`, `read.js`, `react.js`

- [ ] **Step 1: `messages.js` `loadContext`.** It already computes `const owner = !!user?.owner;`. Add `owner` to the returned ctx object and change `authorRole`:

```javascript
  const authorRole = (isAdmin || owner) ? 'Owner'
    : fom ? 'FOM'
    : managedMarkets.length ? 'Market'
    : manager ? 'Manager'
    : null;
  return { db, session, userEmail, isAdmin, owner, fom, managedMarkets, dashboardAccess, chatAccess, channelInclusions, channelExclusions, authorRole,
           authorName: session.user.name || userEmail,
           authorImage: session.user.image || null };
```

- [ ] **Step 2: `messages.js` handler.** Destructure `owner` and add it to `accessUser`:

```javascript
  const { db, userEmail, isAdmin, owner, fom, managedMarkets, dashboardAccess, chatAccess, channelInclusions, channelExclusions, authorName, authorImage, authorRole } = ctx;
  const accessUser = { isAdmin, owner, fom, managedMarkets, dashboardAccess, chatAccess, channelInclusions, channelExclusions };
```

- [ ] **Step 3: `channels.js`.** Read `owner` and pass it into the derive actor:

```javascript
    const owner = isAdmin || !!user?.owner;
    const fom = isAdmin || !!(user?.fom || user?.role === 'FOM');
    ...
    const channels = deriveChannelsForUser({ isAdmin, owner, fom, managedMarkets, dashboardAccess, chatAccess, channelInclusions: user?.channelInclusions || [], channelExclusions: user?.channelExclusions || [] });
```
(The `|| user?.role === 'FOM'` shim is removed in Task 8.)

- [ ] **Step 4: `channel-admin.js` `actorFrom`.** Add `owner`:

```javascript
  return {
    email,
    isAdmin,
    owner: isAdmin || !!user?.owner,
    fom: isAdmin || isFom(user),
    managedMarkets: user?.managedMarkets || [],
    dashboardAccess: isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' }),
  };
```

- [ ] **Step 5: `directory.js` and `members.js`.** Both compute `canManageAny` from `dashboardAccess` only; an Owner with `fom:false` and no dashboardAccess would be wrongly excluded. In **both** files, add `owner: isAdmin || !!me?.owner` (resp. `!!user?.owner`) to the actor and include owner/fom in the gate. In `directory.js`:

```javascript
    owner: isAdmin || !!me?.owner,
    ...
  const canManageAny = actor.isAdmin || actor.owner || actor.fom ||
    actor.dashboardAccess.type === 'all' ||
    (actor.dashboardAccess.type === 'specific' && (actor.dashboardAccess.locations || []).length > 0);
```
In `members.js` apply the same two edits (add `owner` to the actor object, add `actor.owner || actor.fom ||` to `canManageAny`).

- [ ] **Step 6: `mute.js`, `read.js`, `react.js`.** Each builds an inline access actor for `canAccessChannel`. Add `owner` to each. Pattern (mute.js shown; do the same in read.js and react.js):

```javascript
    const owner = isAdmin || !!user?.owner;
    ...
    if (!canAccessChannel({ isAdmin, owner, fom, managedMarkets: user?.managedMarkets || [], dashboardAccess, chatAccess }, channel)) return res.status(403).json({ error: 'No access to this channel' });
```

- [ ] **Step 7: Build to confirm no broken references**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add pages/api/chat/messages.js pages/api/chat/channels.js pages/api/chat/channel-admin.js pages/api/chat/directory.js pages/api/chat/members.js pages/api/chat/mute.js pages/api/chat/read.js pages/api/chat/react.js
git commit -m "fix(chat): thread owner through all access actors (decouple from fom)"
```

---

## Task 6: Wire the audit log into channel-admin

**Files:**
- Modify: `pages/api/chat/channel-admin.js`

(`lib/audit.js` was created in Task 4.)

- [ ] **Step 1: Wire it into `channel-admin.js`.** Import at top:

```javascript
import { logAudit } from "../../../lib/audit";
```
Then add a `logAudit` call after each successful mutation in the POST handler:
- approve: `await logAudit(db, { actorEmail: actor.email, action: 'approve-chat', targetEmail: email, detail: { stores: manageable } });`
- deny: `await logAudit(db, { actorEmail: actor.email, action: 'deny-chat', targetEmail: email });`
- remove/add: `await logAudit(db, { actorEmail: actor.email, action: action === 'remove' ? 'remove-from-channel' : 'add-to-channel', targetEmail: email, detail: { channel } });`
- fom: `await logAudit(db, { actorEmail: actor.email, action: 'set-fom', targetEmail: email, detail: { value: !!value } });`
- markets: `await logAudit(db, { actorEmail: actor.email, action: 'set-markets', targetEmail: email, detail: { managedMarkets: valid } });`

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add pages/api/chat/channel-admin.js
git commit -m "feat(chat): audit log for role and membership changes"
```

---

## Task 7: Owner badges in the UI

**Files:**
- Modify: `components/chat/RolesPanel.js`, `components/chat/MessageItem.js`, `pages/messages.js`

- [ ] **Step 1: `RolesPanel.js` — relabel the top badge.** Change the badge line (currently `{u.isSuperAdmin ? 'Super Admin' : 'Admin'}`):

```javascript
                    {isAdminRow && <span className="px-1 py-px text-[9px] font-semibold bg-red-600 text-white rounded leading-none flex-shrink-0">{u.isSuperAdmin ? 'Super Admin' : 'Owner'}</span>}
```

- [ ] **Step 2: `RolesPanel.js` — show the Owner toggle to Owners, not just the super admin.** Replace the `{isSuperAdmin && (` Owner button guard with `data?.canGrantOwner` and relabel it:

```javascript
                      {data?.canGrantOwner && (
                        <button disabled={busy === u.email} onClick={() => post({ targetEmail: u.email, action: 'owner', value: !u.owner })} className={chipClass(u.owner)} title="Owner — full access; Owners can grant Owner">Owner</button>
                      )}
```

- [ ] **Step 3: `RolesPanel.js` — update the help text** (currently the `Admin = full access …` paragraph):

```javascript
          <p className="text-[11px] text-slate-500 mt-1.5 px-1">
            Owner = full access (all channels, moderation, role management). FOM = all channels. MM = a market. Manager = badge.
          </p>
```

- [ ] **Step 4: `MessageItem.js` — Owner badge with legacy alias.** Replace the `ROLE_BADGE` map:

```javascript
const ROLE_BADGE = {
  Owner: { cls: 'bg-red-600', label: 'Owner' },
  Admin: { cls: 'bg-red-600', label: 'Owner' }, // legacy authorRole on old messages
  FOM: { cls: 'bg-blue-600', label: 'FOM' },
  Market: { cls: 'bg-purple-600', label: 'MM' },
  Manager: { cls: 'bg-green-600', label: 'Manager' },
};
```

- [ ] **Step 5: `pages/messages.js` — `tierOf` and badge maps.** Change `tierOf` (currently `if (isAdmin || owner) return 'Admin';`):

```javascript
function tierOf({ isAdmin, owner, fom, managedMarkets, manager }) {
  if (isAdmin || owner) return 'Owner';
  if (fom) return 'FOM';
  if ((managedMarkets || []).length) return 'Market';
  if (manager) return 'Manager';
  return null;
}
```
And update the two badge maps to include `Owner` (keep `Admin` as a legacy alias):

```javascript
const ROLE_BADGE_CLASS = { Owner: 'bg-red-600', Admin: 'bg-red-600', FOM: 'bg-blue-600', Market: 'bg-purple-600', Manager: 'bg-green-600' };
const ROLE_LABEL = { Owner: 'Owner', Admin: 'Owner', FOM: 'FOM', Market: 'MM', Manager: 'Manager' };
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/chat/RolesPanel.js components/chat/MessageItem.js pages/messages.js
git commit -m "feat(chat): single Owner badge for super-admin and owners"
```

---

## Task 8: Remove legacy `role` shims + delete migration endpoint

> **Order:** Only do this task AFTER the migration (Task 3) has been run against the live database, since these shims are what keep legacy `role: 'FOM'` users working until then.

**Files:**
- Modify: `pages/api/chat/messages.js`, `channels.js`, `channel-members.js`, `channel-admin.js`, `check-access.js`
- Delete: `pages/api/admin/migrate-roles.js`

- [ ] **Step 1: Remove `|| user?.role === 'FOM'` / `|| user.role === 'FOM'` / `|| user?.role === 'FOM'` reads.** Edit each so `fom` derives from the flag only:
  - `messages.js`: `const fom = isAdmin ? true : !!user?.fom;`
  - `channels.js`: `const fom = isAdmin || !!user?.fom;`
  - `channel-members.js` `fomOf`: `return !!u?.fom;`
  - `channel-admin.js` `isFom`: `return !!u?.fom;`
  - `check-access.js`: `fom: !!user.fom,` (drop the `|| user.role === 'FOM'`).

- [ ] **Step 2: Remove `$unset: { role: '' }` writes** in `roles.js` (all branches) and `channel-admin.js` (fom/markets branches) — the field no longer exists post-migration. Change each `{ $set: set, $unset: { role: '' } }` to `{ $set: set }`.

- [ ] **Step 3: `check-access.js` admin branch returns `owner`.** In the `if (isAdmin)` response object add `owner: true,` (keeps the super admin consistent with the new field).

- [ ] **Step 4: Delete the migration endpoint**

```bash
git rm pages/api/admin/migrate-roles.js
```

- [ ] **Step 5: Confirm no `role` references remain in chat code**

Run: `npx grep -rn "role === 'FOM'" pages/ lib/ components/` (or use the editor search)
Expected: no matches.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(chat): drop legacy role shims and one-off migration endpoint"
```

---

## Task 9: Single source for the onboarding store list

**Files:**
- Modify: `components/chat/Onboarding.js`

- [ ] **Step 1: Replace the hardcoded list with the shared source.** Remove the literal `const LOCATIONS = [...]` array and import it:

```javascript
import { useState } from 'react';
import { Store, Check, Clock } from 'lucide-react';
import { LOCATIONS } from '../../lib/channels';
```
`LOCATIONS` from `lib/channels` is already alphabetically sorted, so the existing `.sort(...)` is no longer needed; use `LOCATIONS` directly in the `.map`.

- [ ] **Step 2: Build (Next can import the CommonJS lib)**

Run: `npm run build`
Expected: succeeds; onboarding picker still renders all 21 stores.

- [ ] **Step 3: Commit**

```bash
git add components/chat/Onboarding.js
git commit -m "refactor(chat): onboarding picker uses shared LOCATIONS list"
```

---

## Task 10: Full verification

- [ ] **Step 1: Unit tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: succeeds, no warnings about the changed files.

- [ ] **Step 3: Manual checklist on the Vercel preview** (after the Task 3 migration has been run):
  - Sign in as super admin → Roles screen shows your badge as **Super Admin**, others who are owners as **Owner**.
  - Grant a test user **Owner** → they get all channels, can open Roles, can grant another Owner, and their FOM/Manager/Market chips clear. Their message badge reads **Owner**.
  - That Owner has `fom:false` in the DB but still passes the dashboard gate (loads `/` data, no 403 from `/api/sheets-proxy`).
  - An **FOM** sees all channels and moderates a non-home channel but the Roles item is hidden / `POST /api/chat/roles` returns 403.
  - An **associate** still gets 403 from `/api/sheets-proxy`, `/api/get-pl`, `/api/get-bonus`.
  - `chat_audit` collection has documents for the grant/approve actions taken above.

- [ ] **Step 4: Finalize** — push the branch and open a PR for Dalton's review (per stage-before-merge):

```bash
git push -u origin role-capability-decouple
gh pr create --fill --base main
```

---

## Spec coverage check

- Owner standalone tier (no auto-fom) → Task 4. ✔
- `owner` threaded through actors → Tasks 1, 5. ✔
- Dashboard gate honors owner → Task 2. ✔
- Owners can grant Owner → Task 4 + Task 7 UI. ✔
- Owner badge (super-admin + owners) → Task 7. ✔
- `owner`⇒`fom:false` migration → Task 3. ✔
- Finish legacy `role` migration + remove shims → Tasks 3, 8. ✔
- Single store list → Task 9. ✔
- Audit log → Tasks 6, 4, 5. ✔
- Self-onboarding unchanged → no task (intentional). ✔
- Morning metrics card → out of scope (separate spec). ✔
