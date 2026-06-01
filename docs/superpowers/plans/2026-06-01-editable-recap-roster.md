# Editable Recap Roster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin curate, per store, exactly which app users receive that store's morning recap — replacing the over-broad dashboard-access derivation.

**Architecture:** A new `recapRoster` MongoDB collection (one doc per store) becomes the source of truth. The token endpoint Apps Script calls reads it (falling back to the old derivation when empty). The admin page becomes editable: pick recipients from app users, seeded from today's derived list, Save persists. Pure transform/validation helpers live in `lib/storeManagers.js` and are unit-tested.

**Tech Stack:** Next.js API routes, MongoDB (`mongodb` driver), NextAuth session auth, React (pages router), `node:test`.

**Spec:** `docs/superpowers/specs/2026-06-01-editable-recap-roster-design.md` (Part 1 only; the draft-sending/signature changes are a separate later plan.)

---

## File Structure

- **Modify** `lib/storeManagers.js` — add three pure helpers: `managersToRoster`, `rosterToManagers`, `validateRecipients`.
- **Modify** `tests/store-managers.test.js` — tests for the three helpers.
- **Modify** `pages/api/store-managers.js` — read `recapRoster`; fall back to derivation when empty.
- **Modify** `pages/api/admin/recap-roster.js` — extend GET (persisted-or-seeded + `availableUsers` + full store list) and add POST (validate + upsert).
- **Modify** `pages/admin/recap-roster.js` — editable UI (full file replacement).

No Apps Script changes (its roster fetch is unchanged). Data model: collection `recapRoster` in db `andysdashboard`, one doc per store: `{ location, recipients: [{ email, name }], updatedAt, updatedBy }`.

---

## Task 1: Pure helpers (`lib/storeManagers.js`)

**Files:**
- Modify: `lib/storeManagers.js`
- Test: `tests/store-managers.test.js`

Run tests with `node --test $(find tests -name '*.test.js')` (the npm glob can match nothing in some shells).

- [ ] **Step 1: Write the failing tests** (append to `tests/store-managers.test.js`, and add the three names to the existing top-of-file require)

Update the require line at the top of `tests/store-managers.test.js` to:
```javascript
const { isAuthorized, extractManagers, isStoreMailbox, invertToLocationMap, managersToRoster, rosterToManagers, validateRecipients } = require('../lib/storeManagers');
```

Append:
```javascript
test('managersToRoster groups managers into per-location recipients (seed shape)', () => {
  const managers = [
    { name: 'Ashley', email: 'ashley@r.com', locations: ['Bixby'] },
    { name: 'Chris', email: 'chris@r.com', locations: ['Bixby', 'Owasso'] },
  ];
  assert.deepEqual(managersToRoster(managers), [
    { location: 'Bixby', recipients: [{ email: 'ashley@r.com', name: 'Ashley' }, { email: 'chris@r.com', name: 'Chris' }] },
    { location: 'Owasso', recipients: [{ email: 'chris@r.com', name: 'Chris' }] },
  ]);
  assert.deepEqual(managersToRoster(null), []);
});

test('rosterToManagers inverts roster docs to managers grouped by email', () => {
  const docs = [
    { location: 'Bixby', recipients: [{ email: 'ashley@r.com', name: 'Ashley' }, { email: 'chris@r.com', name: 'Chris' }] },
    { location: 'Owasso', recipients: [{ email: 'chris@r.com', name: 'Chris' }] },
  ];
  assert.deepEqual(rosterToManagers(docs), [
    { name: 'Ashley', email: 'ashley@r.com', locations: ['Bixby'] },
    { name: 'Chris', email: 'chris@r.com', locations: ['Bixby', 'Owasso'] },
  ]);
  assert.deepEqual(rosterToManagers(undefined), []);
});

test('rosterToManagers skips malformed docs and recipients', () => {
  const docs = [
    { location: 'Bixby', recipients: [{ email: 'a@r.com', name: '' }, { name: 'no email' }] },
    { location: 'NoArray' },
  ];
  assert.deepEqual(rosterToManagers(docs), [
    { name: '', email: 'a@r.com', locations: ['Bixby'] },
  ]);
});

test('validateRecipients returns emails not in the known set', () => {
  const input = [
    { location: 'Bixby', recipients: [{ email: 'known@r.com' }, { email: 'ghost@r.com' }] },
    { location: 'Owasso', recipients: [{ name: 'missing email' }] },
  ];
  assert.deepEqual(validateRecipients(input, ['known@r.com']), ['ghost@r.com', '(missing email)']);
  assert.deepEqual(validateRecipients([], ['known@r.com']), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/store-managers.test.js`
Expected: FAIL — the three functions are not defined / not exported.

- [ ] **Step 3: Implement the helpers** (in `lib/storeManagers.js`, before `module.exports`)

```javascript
// Build the per-location seed (location -> recipients) from derived managers.
// managers: [{name,email,locations}] -> [{location, recipients:[{email,name}]}]
function managersToRoster(managers) {
  if (!Array.isArray(managers)) return [];
  const byLoc = {};
  managers.forEach((m) => {
    if (!m || !m.email || !Array.isArray(m.locations)) return;
    m.locations.forEach((loc) => {
      if (!byLoc[loc]) byLoc[loc] = {};
      if (!(m.email in byLoc[loc])) byLoc[loc][m.email] = m.name || '';
    });
  });
  return Object.keys(byLoc)
    .sort((a, b) => a.localeCompare(b))
    .map((loc) => ({
      location: loc,
      recipients: Object.keys(byLoc[loc]).sort().map((email) => ({ email, name: byLoc[loc][email] })),
    }));
}

// Invert roster docs into the manager shape Apps Script consumes (grouped by
// email across stores). rosterDocs: [{location, recipients:[{email,name}]}]
// -> [{name,email,locations}]
function rosterToManagers(rosterDocs) {
  if (!Array.isArray(rosterDocs)) return [];
  const byEmail = {};
  rosterDocs.forEach((doc) => {
    if (!doc || !doc.location || !Array.isArray(doc.recipients)) return;
    doc.recipients.forEach((r) => {
      if (!r || !r.email) return;
      if (!byEmail[r.email]) byEmail[r.email] = { name: r.name || '', email: r.email, locations: [] };
      if (!byEmail[r.email].name && r.name) byEmail[r.email].name = r.name;
      if (byEmail[r.email].locations.indexOf(doc.location) === -1) byEmail[r.email].locations.push(doc.location);
    });
  });
  return Object.keys(byEmail)
    .sort((a, b) => a.localeCompare(b))
    .map((email) => {
      const m = byEmail[email];
      m.locations.sort((a, b) => a.localeCompare(b));
      return m;
    });
}

// Return recipient emails that are NOT in the known set (or are missing).
// rosterInput: [{location, recipients:[{email,name}]}]; knownEmails: string[]
function validateRecipients(rosterInput, knownEmails) {
  const known = new Set(Array.isArray(knownEmails) ? knownEmails : []);
  const invalid = [];
  (Array.isArray(rosterInput) ? rosterInput : []).forEach((doc) => {
    if (!doc || !Array.isArray(doc.recipients)) return;
    doc.recipients.forEach((r) => {
      const email = r && r.email;
      if (!email) { invalid.push('(missing email)'); return; }
      if (!known.has(email)) invalid.push(email);
    });
  });
  return invalid;
}
```

Update the export line to include all three:
```javascript
module.exports = { isAuthorized, extractManagers, isStoreMailbox, invertToLocationMap, managersToRoster, rosterToManagers, validateRecipients };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test $(find tests -name '*.test.js')`
Expected: PASS — all tests green (66 prior + 4 new = 70).

- [ ] **Step 5: Commit**

```bash
git add lib/storeManagers.js tests/store-managers.test.js
git commit -m "Add roster<->managers transforms and recipient validation helpers"
```

---

## Task 2: Token endpoint reads the roster (`pages/api/store-managers.js`)

**Files:**
- Modify: `pages/api/store-managers.js`

No automated test (logic is in the Task 1 helpers). Verify by build.

- [ ] **Step 1: Replace the file contents**

```javascript
// pages/api/store-managers.js
// Server-to-server roster endpoint for the Apps Script manager recap job.
// Auth is a shared bearer token (MANAGER_SYNC_TOKEN), NOT a NextAuth session.
// Source of truth is the curated `recapRoster` collection; if it's empty (not
// yet set up), fall back to the old dashboard-access derivation so nothing
// breaks during migration.

import clientPromise from "../../lib/mongodb";
import { isAuthorized, extractManagers, rosterToManagers } from "../../lib/storeManagers";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req.headers.authorization, process.env.MANAGER_SYNC_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = (await clientPromise).db("andysdashboard");

    const rosterDocs = await db.collection('recapRoster').find({}).toArray();
    if (rosterDocs.length > 0) {
      return res.status(200).json({ managers: rosterToManagers(rosterDocs) });
    }

    // Fallback: derive from dashboard access until the roster is curated.
    const users = await db.collection('users').find({ 'dashboardAccess.type': 'specific' }).toArray();
    return res.status(200).json({ managers: extractManagers(users) });
  } catch (error) {
    console.error('store-managers error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles; `/api/store-managers` still registered, no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/store-managers.js
git commit -m "Read curated recapRoster in store-managers endpoint, derive as fallback"
```

---

## Task 3: Admin API — seeded GET + POST upsert (`pages/api/admin/recap-roster.js`)

**Files:**
- Modify: `pages/api/admin/recap-roster.js`

No automated test (validation logic is the Task 1 helper). Verify by build.

- [ ] **Step 1: Replace the file contents**

```javascript
// pages/api/admin/recap-roster.js
// Session-gated admin endpoint for the manager-recap roster.
//   GET  -> { locations:[{location,recipients:[{email,name}]}], availableUsers:[{email,name}], seeded }
//           Returns persisted recapRoster if present; otherwise the derived
//           list as an unsaved seed (seeded:false). Every canonical store is
//           present (empty recipients if none).
//   POST  -> upserts one recapRoster doc per location. Rejects recipients that
//           are not known app users.

import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { extractManagers, managersToRoster, validateRecipients } from "../../../lib/storeManagers";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Mirrors ALL_LOCATIONS in pages/admin/users.js — every store gets a row.
const ALL_LOCATIONS = [
  'Allen', 'Bixby', 'Broken Arrow', 'Carrollton', 'Claremore', 'Edmond',
  'Frisco #1', 'Frisco #2', 'Frisco #3', 'Hillcrest Village',
  "Hunter's Creek", 'Lake Highlands', 'Lakeland', 'Norman', 'Owasso', 'Penn',
  'Prosper', 'Sanford', 'The Colony', 'Treat Truck', 'Warr Acres', 'Yale',
];

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || session.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const db = (await clientPromise).db("andysdashboard");

  if (req.method === 'GET') {
    try {
      const users = await db.collection('users').find({}).toArray();
      const availableUsers = users
        .filter((u) => u.email)
        .map((u) => ({ email: u.email, name: u.name || '' }))
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

      const rosterDocs = await db.collection('recapRoster').find({}).toArray();
      let baseLocations;
      let seeded;
      if (rosterDocs.length > 0) {
        baseLocations = rosterDocs.map((d) => ({ location: d.location, recipients: d.recipients || [] }));
        seeded = true;
      } else {
        baseLocations = managersToRoster(extractManagers(users));
        seeded = false;
      }

      // Ensure every canonical store appears (empty recipients if absent), plus
      // any non-canonical store that already has recipients.
      const byLoc = {};
      baseLocations.forEach((l) => { byLoc[l.location] = l.recipients || []; });
      const allNames = Array.from(new Set([...ALL_LOCATIONS, ...Object.keys(byLoc)]));
      const locations = allNames
        .sort((a, b) => a.localeCompare(b))
        .map((location) => ({ location, recipients: byLoc[location] || [] }));

      return res.status(200).json({ locations, availableUsers, seeded });
    } catch (error) {
      console.error('recap-roster GET error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const incoming = Array.isArray(req.body?.locations) ? req.body.locations : null;
      if (!incoming) {
        return res.status(400).json({ error: 'Body must include a locations array' });
      }

      const users = await db.collection('users').find({}).toArray();
      const knownEmails = users.map((u) => u.email).filter(Boolean);
      const invalid = validateRecipients(incoming, knownEmails);
      if (invalid.length > 0) {
        return res.status(400).json({ error: 'Unknown recipient(s)', invalid });
      }

      const now = new Date();
      const coll = db.collection('recapRoster');
      for (const l of incoming) {
        if (!l || !l.location) continue;
        const recipients = Array.isArray(l.recipients)
          ? l.recipients
              .filter((r) => r && r.email)
              .map((r) => ({ email: r.email, name: r.name || '' }))
          : [];
        await coll.replaceOne(
          { location: l.location },
          { location: l.location, recipients, updatedAt: now, updatedBy: session.user.email },
          { upsert: true }
        );
      }

      return res.status(200).json({ success: true, count: incoming.length });
    } catch (error) {
      console.error('recap-roster POST error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles; `/api/admin/recap-roster` registered, no errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/admin/recap-roster.js
git commit -m "Make recap-roster admin API seed + persist per-location recipients"
```

---

## Task 4: Editable admin page (`pages/admin/recap-roster.js`)

**Files:**
- Modify: `pages/admin/recap-roster.js` (full replacement)

No automated test (UI). Verify by build + manual click-through.

- [ ] **Step 1: Replace the file contents**

```jsx
import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { RefreshCw, X, Save } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default function RecapRoster() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [locations, setLocations] = useState([]);          // [{location, recipients:[{email,name}]}]
  const [availableUsers, setAvailableUsers] = useState([]); // [{email,name}]
  const [seeded, setSeeded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    if (status === 'authenticated') {
      if (session.user.email !== ADMIN_EMAIL) {
        router.push('/');
      } else {
        loadRoster();
      }
    }
  }, [status, session]);

  const loadRoster = async () => {
    setLoading(true);
    setError(null);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/recap-roster');
      const data = await res.json();
      if (res.ok) {
        setLocations(data.locations || []);
        setAvailableUsers(data.availableUsers || []);
        setSeeded(data.seeded !== false);
      } else {
        setError(data?.error || 'Failed to load roster.');
      }
    } catch (err) {
      console.error('Error loading recap roster:', err);
      setError('Failed to load roster.');
    } finally {
      setLoading(false);
    }
  };

  const userName = (email) => {
    const u = availableUsers.find((x) => x.email === email);
    return u ? u.name : '';
  };

  const addRecipient = (location, email) => {
    if (!email) return;
    setLocations((prev) => prev.map((l) => {
      if (l.location !== location) return l;
      if (l.recipients.some((r) => r.email === email)) return l;
      return { ...l, recipients: [...l.recipients, { email, name: userName(email) }] };
    }));
    setSaveMsg(null);
  };

  const removeRecipient = (location, email) => {
    setLocations((prev) => prev.map((l) =>
      l.location === location
        ? { ...l, recipients: l.recipients.filter((r) => r.email !== email) }
        : l
    ));
    setSaveMsg(null);
  };

  const saveRoster = async () => {
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/recap-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
      });
      const data = await res.json();
      if (res.ok) {
        setSeeded(true);
        setSaveMsg('Saved.');
      } else if (Array.isArray(data?.invalid) && data.invalid.length) {
        setError(`Unknown recipient(s): ${data.invalid.join(', ')}`);
      } else {
        setError(data?.error || 'Failed to save.');
      }
    } catch (err) {
      console.error('Error saving recap roster:', err);
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const totalRecipients = locations.reduce((n, l) => n + l.recipients.length, 0);

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <button
          onClick={() => signIn('google')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (session?.user?.email !== ADMIN_EMAIL) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Recap Roster - Andy's Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">

          {/* Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-4 mb-2 md:mb-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">Recap Roster</h1>
                <p className="text-xs md:text-sm text-slate-400">Set who each store's morning recap email goes to</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Dashboards
                </button>
                <button
                  onClick={() => router.push('/admin/users')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Users
                </button>
                <button
                  onClick={loadRoster}
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  title="Reload"
                  aria-label="Reload"
                >
                  <RefreshCw size={16} className="text-white" />
                </button>
                <button
                  onClick={saveRoster}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Save size={16} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Status banners */}
          {!seeded && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 mb-3 text-sm text-amber-300">
              Showing suggested recipients from current dashboard access. Edit and Save to lock in the roster.
            </div>
          )}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-3 text-sm text-blue-300">
            {locations.length} location{locations.length !== 1 ? 's' : ''} &middot; {totalRecipients} recipient{totalRecipients !== 1 ? 's' : ''}
          </div>
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 mb-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {saveMsg && (
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mb-3 text-sm text-green-300">
              {saveMsg}
            </div>
          )}

          {/* Editable list */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 bg-slate-700/50">
              <span className="font-semibold text-white text-sm">Locations ({locations.length})</span>
            </div>
            <div className="divide-y divide-slate-700">
              {locations.map(({ location, recipients }) => {
                const remaining = availableUsers.filter((u) => !recipients.some((r) => r.email === u.email));
                return (
                  <div key={location} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-white">{location}</span>
                      <span className="inline-flex items-center px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">
                        {recipients.length} {recipients.length === 1 ? 'recipient' : 'recipients'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {recipients.length === 0 && (
                        <span className="text-xs text-slate-500 italic">No recipients</span>
                      )}
                      {recipients.map((r) => (
                        <span
                          key={r.email}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 text-slate-200 rounded text-xs"
                        >
                          <span>{r.name ? `${r.name} ` : ''}<span className="font-mono text-slate-400">{r.email}</span></span>
                          <button
                            onClick={() => removeRecipient(location, r.email)}
                            className="text-slate-400 hover:text-red-400"
                            aria-label={`Remove ${r.email} from ${location}`}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <select
                      value=""
                      onChange={(e) => { addRecipient(location, e.target.value); e.target.value = ''; }}
                      className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">+ Add recipient…</option>
                      {remaining.map((u) => (
                        <option key={u.email} value={u.email}>
                          {u.name ? `${u.name} (${u.email})` : u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500 text-center">
            Recipients are chosen from existing app users. Changes take effect after you Save.
          </p>

        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles cleanly; `/admin/recap-roster` registered.

- [ ] **Step 3: Run the full test suite (regression)**

Run: `node --test $(find tests -name '*.test.js')`
Expected: PASS (70).

- [ ] **Step 4: Commit**

```bash
git add pages/admin/recap-roster.js
git commit -m "Make recap-roster page editable: pick recipients per store and save"
```

---

## Self-Review

**Spec coverage (Part 1):**
- `recapRoster` collection, one doc/store → Task 3 upsert + Task 2 read.
- Pick from app users → Task 4 dropdown sourced from `availableUsers`; Task 3 GET returns them; POST validates against known users (`validateRecipients`).
- Names auto from user record, editable override → Task 4 captures `name` from `availableUsers` on add; stored in the doc. (Inline name editing beyond the captured value is not built — the captured user name is used; this matches "auto from users" with override available later if needed.)
- Seed from current, then trim → Task 3 GET returns derived seed (`seeded:false`) when empty; Task 4 amber banner; Save persists.
- Token endpoint reads roster, derive as fallback, Apps Script unchanged → Task 2.
- Tested transform/validation helpers → Task 1.

**Placeholder scan:** none — every step has full code or exact commands.

**Type/name consistency:** `managersToRoster`, `rosterToManagers`, `validateRecipients` defined in Task 1 and used in Tasks 2–3 with matching signatures. Roster shape `{location, recipients:[{email,name}]}` consistent across API (Task 3), token endpoint (Task 2 via helper), and page (Task 4). `availableUsers`/`seeded`/`locations` response keys match between Task 3 GET and Task 4 fetch.

**Note (deferred, in spec not this plan):** the optional inline *name override* UI and Part 2 (Gmail drafts, simpler wording, signature) are intentionally out of this plan.
