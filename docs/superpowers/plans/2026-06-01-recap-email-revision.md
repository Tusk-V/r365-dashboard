# Recap Email Revision + Free-Form Recipients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the roster accept free-form (non-app-user) recipients, and revise the recap email to be a simpler, signed Gmail **draft** that Dalton reviews and sends.

**Architecture:** Two parts. (A) Web app: relax recipient validation to email-format (not app-user membership) and add a free-form email + optional name input to the roster page. (B) Apps Script: shorter Claude prompt, plain email layout with an image+text signature, and switch from auto-send to `GmailApp.createDraft` so each recap is a draft in Dalton's account.

**Tech Stack:** Next.js API + React (pages router), MongoDB, Google Apps Script (clasp), Claude API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-06-01-editable-recap-roster-design.md` (Part 2 + the free-form-recipients addition).

---

## File Structure

**Part A (web):**
- `lib/storeManagers.js` — `validateRecipients` becomes an email-*format* check (drops the known-user requirement).
- `tests/store-managers.test.js` — update `validateRecipients` tests.
- `pages/api/admin/recap-roster.js` — POST validates format only (no `knownEmails`).
- `pages/admin/recap-roster.js` — add free-form email + optional name input per store.

**Part B (Apps Script — `apps-script/RanchersManagerRecap.js`):**
- `RECAP_CONFIG` — add `SIGNATURE_IMG_URL`, `SIGNATURE_TEXT`.
- `recapFirstName` — return `''` (not `'there'`) when no name.
- `buildManagerPrompt` — shorter; greeting handles empty name.
- `tests/manager-recap.test.js` — update `recapFirstName` + `buildManagerPrompt` tests.
- `buildManagerRecapHtml` — plain layout + signature.
- `managerFallback` — shorter; empty-name greeting.
- `sendManagerRecaps` → `createManagerRecapDrafts` (GmailApp drafts); `setupManagerRecapTrigger` + `testManagerRecaps` updated.

Run tests with `node --test $(find tests -name '*.test.js')` (npm glob can match nothing in some shells; currently 72 pass).

---

## Task 1: Validation = email format (`lib/storeManagers.js`)

**Files:** Modify `lib/storeManagers.js`; Test `tests/store-managers.test.js`.

- [ ] **Step 1: Replace the two `validateRecipients` tests** in `tests/store-managers.test.js`.

Find and DELETE these two existing tests:
```javascript
test('validateRecipients returns emails not in the known set', () => {
  const input = [
    { location: 'Bixby', recipients: [{ email: 'known@r.com' }, { email: 'ghost@r.com' }] },
    { location: 'Owasso', recipients: [{ name: 'missing email' }] },
  ];
  assert.deepEqual(validateRecipients(input, ['known@r.com']), ['ghost@r.com', '(missing email)']);
  assert.deepEqual(validateRecipients([], ['known@r.com']), []);
});

test('validateRecipients dedupes and tolerates non-array input', () => {
  const input = [
    { location: 'Bixby', recipients: [{ email: 'ghost@r.com' }] },
    { location: 'Owasso', recipients: [{ email: 'ghost@r.com' }] },
  ];
  assert.deepEqual(validateRecipients(input, ['known@r.com']), ['ghost@r.com']);
  assert.deepEqual(validateRecipients(null, ['known@r.com']), []);
});
```

Replace with:
```javascript
test('validateRecipients flags only malformed/missing emails (any valid address allowed)', () => {
  const input = [
    { location: 'Bixby', recipients: [{ email: 'anyone@example.com' }, { email: 'not-an-email' }] },
    { location: 'Owasso', recipients: [{ name: 'no email' }] },
  ];
  assert.deepEqual(validateRecipients(input), ['not-an-email', '(missing email)']);
  assert.deepEqual(validateRecipients([]), []);
});

test('validateRecipients dedupes and tolerates non-array input', () => {
  const input = [
    { location: 'Bixby', recipients: [{ email: 'bad' }] },
    { location: 'Owasso', recipients: [{ email: 'bad' }] },
  ];
  assert.deepEqual(validateRecipients(input), ['bad']);
  assert.deepEqual(validateRecipients(null), []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/store-managers.test.js`
Expected: FAIL — current `validateRecipients` still does membership checks / expects a second arg.

- [ ] **Step 3: Replace `validateRecipients` in `lib/storeManagers.js`** with:

```javascript
// Return recipient emails that are missing or not a valid email format.
// Any well-formed address is allowed (recipients need NOT be app users).
// rosterInput: [{location, recipients:[{email,name}]}]
function validateRecipients(rosterInput) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalid = [];
  const seen = new Set();
  (Array.isArray(rosterInput) ? rosterInput : []).forEach((doc) => {
    if (!doc || !Array.isArray(doc.recipients)) return;
    doc.recipients.forEach((r) => {
      const email = r && r.email;
      const key = email || '(missing email)';
      if (email && re.test(email)) return;
      if (seen.has(key)) return;
      seen.add(key);
      invalid.push(key);
    });
  });
  return invalid;
}
```

(The `module.exports` line is unchanged — `validateRecipients` is already exported.)

- [ ] **Step 4: Run full suite to verify pass**

Run: `node --test $(find tests -name '*.test.js')`
Expected: PASS (72).

- [ ] **Step 5: Commit**

```bash
git add lib/storeManagers.js tests/store-managers.test.js
git commit -m "Validate recipient email format instead of app-user membership"
```

---

## Task 2: Admin POST allows free-form emails (`pages/api/admin/recap-roster.js`)

**Files:** Modify `pages/api/admin/recap-roster.js`. Verify by build.

- [ ] **Step 1: Update the POST validation block.** Find:

```javascript
      const users = await db.collection('users').find({}).toArray();
      const knownEmails = users.map((u) => u.email).filter(Boolean);
      const invalid = validateRecipients(incoming, knownEmails);
      if (invalid.length > 0) {
        return res.status(400).json({ error: 'Unknown recipient(s)', invalid });
      }
```

Replace with:
```javascript
      const invalid = validateRecipients(incoming);
      if (invalid.length > 0) {
        return res.status(400).json({ error: 'Invalid email(s)', invalid });
      }
```

(The GET branch still queries users for `availableUsers` — leave it. Only the POST validation changes.)

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: compiles; `/api/admin/recap-roster` registered.

- [ ] **Step 3: Commit**

```bash
git add pages/api/admin/recap-roster.js
git commit -m "Accept free-form recipient emails in recap-roster POST"
```

---

## Task 3: Free-form input on the page (`pages/admin/recap-roster.js`)

**Files:** Modify `pages/admin/recap-roster.js`. Verify by build.

- [ ] **Step 1: Add a free-form add handler.** After the existing `addRecipient` function, add:

```javascript
  const addFreeRecipient = (location, email, name) => {
    const e = (email || '').trim();
    if (!e) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(e)) { setError(`"${e}" is not a valid email.`); return false; }
    let added = true;
    setLocations((prev) => prev.map((l) => {
      if (l.location !== location) return l;
      if (l.recipients.some((r) => r.email === e)) { added = false; return l; }
      return { ...l, recipients: [...l.recipients, { email: e, name: (name || '').trim() }] };
    }));
    setSaveMsg(null);
    return added;
  };
```

- [ ] **Step 2: Add per-row local input state.** Replace the row's opening of the `.map(...)` so each row tracks its own typed email/name. Find:

```javascript
              {locations.map(({ location, recipients }) => {
                const remaining = availableUsers.filter((u) => !recipients.some((r) => r.email === u.email));
                return (
```

Replace with:
```javascript
              {locations.map(({ location, recipients }) => {
                const remaining = availableUsers.filter((u) => !recipients.some((r) => r.email === u.email));
                return (
                  <RosterRow
                    key={location}
                    location={location}
                    recipients={recipients}
                    remaining={remaining}
                    onAddUser={addRecipient}
                    onAddFree={addFreeRecipient}
                    onRemove={removeRecipient}
                  />
                );
              })}
```

Then DELETE the old inline row JSX that followed (everything from the old `<div key={location} className="px-4 py-3">` through its closing `</div>` and the `);` that closed the map callback) — it is replaced by the `<RosterRow>` component below.

- [ ] **Step 3: Add the `RosterRow` component** at the bottom of the file, after the `export default function RecapRoster()` closing brace:

```jsx
function RosterRow({ location, recipients, remaining, onAddUser, onAddFree, onRemove }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const submitFree = () => {
    if (onAddFree(location, email, name)) { setEmail(''); setName(''); }
  };

  return (
    <div className="px-4 py-3">
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
              onClick={() => onRemove(location, r.email)}
              className="text-slate-400 hover:text-red-400"
              aria-label={`Remove ${r.email} from ${location}`}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={(e) => { onAddUser(location, e.target.value); }}
          className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="">+ Add app user…</option>
          {remaining.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name ? `${u.name} (${u.email})` : u.email}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">or</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitFree(); }}
          placeholder="email@address.com"
          className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitFree(); }}
          placeholder="name (optional)"
          className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={submitFree}
          className="px-2.5 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
```

(The top import `import { useState, useEffect } from 'react';` already provides `useState` for the new component.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: compiles cleanly; `/admin/recap-roster` registered.

- [ ] **Step 5: Commit**

```bash
git add pages/admin/recap-roster.js
git commit -m "Add free-form email + optional name recipient entry to roster page"
```

---

## Task 4: Shorter prompt + name-optional greeting (`apps-script/RanchersManagerRecap.js`)

**Files:** Modify `apps-script/RanchersManagerRecap.js`; Test `tests/manager-recap.test.js`.

- [ ] **Step 1: Update the affected tests** in `tests/manager-recap.test.js`.

Find and replace the `recapFirstName` test:
```javascript
test('recapFirstName takes the first token, falls back to "there"', () => {
  assert.equal(m.recapFirstName('Jane Doe'), 'Jane');
  assert.equal(m.recapFirstName('  Bob  '), 'Bob');
  assert.equal(m.recapFirstName(''), 'there');
  assert.equal(m.recapFirstName(null), 'there');
});
```
with:
```javascript
test('recapFirstName takes the first token, empty when no name', () => {
  assert.equal(m.recapFirstName('Jane Doe'), 'Jane');
  assert.equal(m.recapFirstName('  Bob  '), 'Bob');
  assert.equal(m.recapFirstName(''), '');
  assert.equal(m.recapFirstName(null), '');
});
```

Find and replace the `buildManagerPrompt` test:
```javascript
test('buildManagerPrompt includes name + recap invite always, escalation only when flagged', () => {
  const flagged = m.buildManagerPrompt('Jane', [{ store: 'Bixby', missedForecastAndOverScheduled: true, isNewStore: false }]);
  assert.ok(flagged.includes('Jane'));
  assert.ok(flagged.includes('quick reply recapping'));
  assert.ok(flagged.includes('help me understand the day'));

  const clean = m.buildManagerPrompt('Jane', [{ store: 'Bixby', missedForecastAndOverScheduled: false, isNewStore: false }]);
  assert.ok(clean.includes('quick reply recapping'));
  assert.ok(!clean.includes('help me understand the day'));
});
```
with:
```javascript
test('buildManagerPrompt: greeting uses name when present, escalation only when flagged', () => {
  const flagged = m.buildManagerPrompt('Jane', [{ store: 'Bixby', missedForecastAndOverScheduled: true, isNewStore: false }]);
  assert.ok(flagged.includes('Good morning Jane,'));
  assert.ok(flagged.includes('quick reply'));
  assert.ok(flagged.includes('gently ask what happened'));

  const clean = m.buildManagerPrompt('Jane', [{ store: 'Bixby', missedForecastAndOverScheduled: false, isNewStore: false }]);
  assert.ok(clean.includes('quick reply'));
  assert.ok(!clean.includes('gently ask what happened'));
});

test('buildManagerPrompt: greeting omits name when empty', () => {
  const p = m.buildManagerPrompt('', [{ store: 'Bixby', missedForecastAndOverScheduled: false, isNewStore: false }]);
  assert.ok(p.includes('Good morning,'));
  assert.ok(!p.includes('Good morning ,'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/manager-recap.test.js`
Expected: FAIL (old wording / `recapFirstName` returns 'there').

- [ ] **Step 3: Edit `apps-script/RanchersManagerRecap.js`.**

(3a) In `RECAP_CONFIG`, add two fields (after `LOG_SHEET`):
```javascript
  LOG_SHEET:       'Manager Recap Log',
  SIGNATURE_IMG_URL: 'https://ci3.googleusercontent.com/mail-sig/AIorK4zYQoLW7nhXQU1EvNY5LJL02mU8weD5RJN3G9VpcHFfHabY6AFsa5h87yz5x7OVU4q4DJu2LFw',
  SIGNATURE_TEXT:  'Dalton Owens\nOwner/Operator\nRanchers Custard Company, LLC\nAndy\'s Frozen Custard Franchisee'
```
(Make sure the line before — `LOG_SHEET: 'Manager Recap Log'` — ends with a comma.)

(3b) Replace `recapFirstName`:
```javascript
function recapFirstName(name) {
  if (!name) return '';
  var token = String(name).trim().split(/\s+/)[0];
  return token || '';
}
```

(3c) Replace `buildManagerPrompt` with a shorter version whose greeting handles an empty name:
```javascript
function buildManagerPrompt(firstName, storeFactsList) {
  var anyEscalation = storeFactsList.some(function(s) { return s.missedForecastAndOverScheduled; });
  var greeting = 'Good morning' + (firstName ? ' ' + firstName : '') + ',';

  var prompt =
    'Write a short, personal good-morning email about how this manager\'s store(s) did YESTERDAY. '
    + 'Sound like a real person who glanced at the numbers — not a report.\n\n'
    + 'RULES:\n'
    + '- Start with exactly: "' + greeting + '"\n'
    + '- Keep it short: one or two sentences per store. No filler.\n'
    + '- Work the key numbers into the sentence naturally; never list stats or use a table.\n'
    + '- Use only numbers from the data; never invent figures.\n'
    + '- Vary the wording; never sound templated.\n'
    + '- One short paragraph per store. With multiple stores, start each paragraph with the store name in **double asterisks**.\n'
    + '- Close each store by asking for a quick reply on how it went.\n'
    + '- No grades, no labor rates, no internal flag names.\n'
    + (anyEscalation
        ? '- For a store flagged "missedForecastAndOverScheduled": it missed forecast AND ran over scheduled hours — gently ask what happened, never critical.\n'
        : '')
    + '- For a store flagged "isNewStore": still ramping up; be encouraging, not critical.\n'
    + '- No subject line, title, or signature.\n\n'
    + 'Data:\n' + JSON.stringify({ stores: storeFactsList }, null, 2);

  return prompt;
}
```

- [ ] **Step 4: Run full suite to verify pass**

Run: `node --test $(find tests -name '*.test.js')`
Expected: PASS (74).

- [ ] **Step 5: Commit**

```bash
git add apps-script/RanchersManagerRecap.js tests/manager-recap.test.js
git commit -m "Shorten recap prompt and make greeting name-optional"
```

---

## Task 5: Plain layout + signature + shorter fallback (`apps-script/RanchersManagerRecap.js`)

**Files:** Modify `apps-script/RanchersManagerRecap.js`. Verify by `node --check` + regression tests (these are GAS-rendering functions; not unit-tested).

- [ ] **Step 1: Replace `buildManagerRecapHtml`** with a plain personal layout (no branded header/footer) plus the signature:

```javascript
function buildManagerRecapHtml(bodyText, dateStr) {
  var paras = bodyText.split('\n')
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; });

  var body = paras.map(function(p) {
    return '<p style="margin:0 0 12px;line-height:1.5;color:#222;font-size:14px;">'
      + p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
  }).join('');

  var sigText = String(RECAP_CONFIG.SIGNATURE_TEXT || '').split('\n')
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; })
    .join('<br>');

  var signature =
    '<div style="margin-top:18px;">'
    + (RECAP_CONFIG.SIGNATURE_IMG_URL
        ? '<img src="' + RECAP_CONFIG.SIGNATURE_IMG_URL + '" alt="" style="max-width:320px;height:auto;display:block;margin-bottom:6px;">'
        : '')
    + (sigText ? '<div style="color:#444;font-size:13px;line-height:1.4;">' + sigText + '</div>' : '')
    + '</div>';

  return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;color:#222;font-size:14px;">'
    + body + signature
    + '</div>';
}
```

- [ ] **Step 2: Replace `managerFallback`** with a shorter version that handles an empty name:

```javascript
function managerFallback(firstName, storeFactsList) {
  var greeting = 'Good morning' + (firstName ? ' ' + firstName : '') + ',';
  var parts = [greeting, ''];
  storeFactsList.forEach(function(s) {
    var bits = [];
    if (s.sales)          bits.push(s.sales);
    if (s.vsForecast)     bits.push(s.vsForecast + ' vs forecast');
    if (s.hrsVsScheduled) bits.push(s.hrsVsScheduled);
    var line = '**' + s.store + '** — ' + (bits.length ? bits.join(', ') + '.' : 'numbers coming in.');
    if (s.missedForecastAndOverScheduled) {
      line += ' Missed forecast and ran over scheduled hours — what happened? Quick recap when you can.';
    } else if (s.isNewStore) {
      line += ' Still finding its rhythm — how did it feel? Quick recap appreciated.';
    } else {
      line += ' How did it go? Quick recap when you can.';
    }
    parts.push(line, '');
  });
  return parts.join('\n').trim();
}
```

- [ ] **Step 3: Syntax check + regression tests**

Run: `node --check apps-script/RanchersManagerRecap.js` → no output (valid).
Run: `node --test $(find tests -name '*.test.js')` → PASS (74).

- [ ] **Step 4: Commit**

```bash
git add apps-script/RanchersManagerRecap.js
git commit -m "Plain personal recap layout with signature; shorter fallback"
```

---

## Task 6: Gmail drafts instead of auto-send (`apps-script/RanchersManagerRecap.js`)

**Files:** Modify `apps-script/RanchersManagerRecap.js`. Verify by `node --check` + regression tests.

- [ ] **Step 1: Replace `sendManagerRecaps` with `createManagerRecapDrafts`** (creates a draft per recipient; drops `replyTo`; keeps CC; logs `Drafted`):

```javascript
function createManagerRecapDrafts() {
  try {
    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();

    var locations = buildDailyLocationData(ss, yesterday);
    if (locations.length === 0) { Logger.log('No data for ' + yesterday + ' — skipping recap drafts.'); return; }

    var roster = fetchManagerRoster();
    if (!roster) { Logger.log('Roster unavailable — aborting (created nothing).'); return; }

    var groups = buildRecipientGroups(roster, locations);
    if (groups.length === 0) { Logger.log('No recipients have data — nothing to draft.'); return; }

    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
    ).join(',');

    groups.forEach(function(g) {
      var facts  = g.stores.map(buildManagerStoreFacts);
      var body   = writeManagerNarrative(g.firstName, facts);
      var html   = buildManagerRecapHtml(body, yesterday);
      var status = 'Drafted';
      try {
        var opts = { htmlBody: html };
        if (ccStr) opts.cc = ccStr;
        GmailApp.createDraft(g.email, 'Quick recap — ' + fmtDisplayDate(yesterday), '', opts);
      } catch (e) {
        status = 'Failed: ' + e.toString();
        Logger.log('Draft failed for ' + g.email + ': ' + e.toString());
      }
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: g.stores.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: status,
        body:   body
      });
    });

    Logger.log('Manager recap drafts created: ' + groups.length + ' recipient(s).');
  } catch (e) {
    Logger.log('Error in createManagerRecapDrafts: ' + e.toString());
  }
}
```

- [ ] **Step 2: Update `setupManagerRecapTrigger`** to target the new handler and clear both old and new handler triggers:

```javascript
function setupManagerRecapTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'createManagerRecapDrafts' || fn === 'sendManagerRecaps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('createManagerRecapDrafts')
    .timeBased().atHour(RECAP_CONFIG.SEND_HOUR).nearMinute(RECAP_CONFIG.SEND_MINUTE).everyDays(1)
    .inTimezone('America/Chicago').create();
  Logger.log('Manager recap trigger set: ~' + RECAP_CONFIG.SEND_HOUR + ':' + ('0' + RECAP_CONFIG.SEND_MINUTE).slice(-2) + ' Central daily (drafts).');
}
```

- [ ] **Step 3: Replace `testManagerRecaps`** to create preview drafts addressed to Dalton (so a stray send can't reach a manager), tagged with the intended recipient, logged `Preview`:

```javascript
function testManagerRecaps() {
  try {
    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();

    var locations = buildDailyLocationData(ss, yesterday);
    if (locations.length === 0) { Logger.log('No data.'); return; }

    var roster = fetchManagerRoster();
    if (!roster) { Logger.log('Roster fetch failed.'); return; }

    var groups = buildRecipientGroups(roster, locations);
    Logger.log('Preview drafts: ' + groups.length);

    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
    ).join(',');

    groups.forEach(function(g) {
      var facts = g.stores.map(buildManagerStoreFacts);
      var body  = writeManagerNarrative(g.firstName, facts);
      var html  = buildManagerRecapHtml(body, yesterday);
      GmailApp.createDraft(
        'dalton@rancherscustard.com',
        '[TEST → ' + g.email + '] Quick recap — ' + fmtDisplayDate(yesterday),
        '',
        { htmlBody: html }
      );
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: g.stores.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: 'Preview',
        body:   body
      });
    });

    Logger.log('Preview drafts created in dalton\'s account.');
  } catch (e) {
    Logger.log('Error in testManagerRecaps: ' + e.toString());
  }
}
```

- [ ] **Step 4: Syntax check + regression tests**

Run: `node --check apps-script/RanchersManagerRecap.js` → valid.
Run: `node --test $(find tests -name '*.test.js')` → PASS (74).
Also confirm no leftover reference to the removed function: `grep -n "sendManagerRecaps" apps-script/RanchersManagerRecap.js` should return nothing.

- [ ] **Step 5: Commit**

```bash
git add apps-script/RanchersManagerRecap.js
git commit -m "Create Gmail drafts for recaps instead of auto-sending"
```

---

## Deploy (manual, after merge)

- Web (Parts A): `git push` → Vercel deploys the roster page + API.
- Apps Script (Part B): from `apps-script/`, `clasp pull` then `clasp push`. Re-run `setupManagerRecapTrigger()` once (handler changed to `createManagerRecapDrafts`). Run `testManagerRecaps()` → preview drafts appear in Dalton's Drafts.

---

## Self-Review

**Spec coverage:**
- Free-form recipients + optional name → Task 1 (format validation), Task 2 (API), Task 3 (page inputs).
- Simpler/shorter wording → Task 4 (prompt), Task 5 (fallback).
- Plain layout + image+text signature → Task 5 (`buildManagerRecapHtml`, `RECAP_CONFIG` sig fields in Task 4 step 3a).
- Gmail drafts, CC kept, reply-to dropped → Task 6.
- Greeting handles non-user (no name) → Task 4 (`recapFirstName` → '', greeting), Task 5 (fallback).
- Log status `Drafted`/`Preview`/`Failed` → Task 6.

**Placeholder scan:** none — every step has full code or exact commands.

**Type/name consistency:** `validateRecipients(rosterInput)` single-arg used in Task 1 def and Task 2 call. `RECAP_CONFIG.SIGNATURE_IMG_URL`/`SIGNATURE_TEXT` defined in Task 4 (3a), consumed in Task 5. `createManagerRecapDrafts` defined in Task 6, referenced by `setupManagerRecapTrigger` in the same task; old `sendManagerRecaps` fully removed (Step 4 grep). `recapFirstName` returning `''` (Task 4) is consumed by `buildRecipientGroups` (unchanged) and the greeting logic in `buildManagerPrompt`/`managerFallback`. Page `RosterRow` props (`onAddUser`, `onAddFree`, `onRemove`) match the handlers passed in Task 3 Step 2.

**Note:** Task 3 restructures the page row into a `RosterRow` component so the free-form inputs can hold local state without re-rendering the whole list per keystroke. Implementer must fully delete the old inline row JSX (Step 2) to avoid duplicate markup.
