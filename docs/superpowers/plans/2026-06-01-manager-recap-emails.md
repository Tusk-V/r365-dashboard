# Manager Morning Recap Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send each store manager a brief, personal, Claude-written morning email about their own store's prior day — inviting a recap reply, escalating the tone (constructively) when a store missed forecast AND ran over scheduled hours, with leadership CC'd and a full audit log.

**Architecture:** Apps Script–centric. A new Apps Script file (`RanchersManagerRecap.js`) reuses the existing `RanchersDailyDebrief.js` data/Claude/email machinery and runs on its own ~7:15 AM trigger. The only data it lacks — who manages which store — is supplied by a new token-secured Next.js API route (`/api/store-managers`) that reads the MongoDB `users` collection. Manager-to-store assignment is managed entirely through the existing admin/users screen; the leadership copy list lives in an editable Apps Script Property.

**Tech Stack:** Google Apps Script (clasp), Next.js API route, MongoDB (`mongodb` driver), Claude Messages API, `node:test` + `node:assert/strict` for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-01-manager-recap-emails-design.md`

---

## File Structure

**New files:**
- `lib/storeManagers.js` — pure, framework-free helpers for the API route (auth check + roster shaping). CommonJS so both Next (via `import` interop) and `node --test` can consume it.
- `pages/api/store-managers.js` — thin Next.js handler: token auth → query Mongo → shape with `extractManagers`.
- `apps-script/RanchersManagerRecap.js` — the manager recap feature (config, pure helpers, orchestration, logging, trigger, test fn). Same Apps Script project as the other backend files, so it calls existing globals directly.
- `tests/store-managers.test.js` — unit tests for `lib/storeManagers.js`.
- `tests/manager-recap.test.js` — unit tests for the pure helpers in `RanchersManagerRecap.js`.

**Reused (not modified)** from `apps-script/RanchersDailyDebrief.js`: `buildDailyLocationData`, `getMarket`, `getYesterdayStr`, `fmtDisplayDate`, `NEW_STORES`, `DAILY_CONFIG`, `pn`, `normDate`. The `loc.missedFcAndOverSch` flag (incl. watch-list escalation) is already computed inside `buildDailyLocationData` — the recap reuses it as-is.

**No existing files are modified.** The leadership debrief is untouched.

---

## Task 1: API roster helpers (`lib/storeManagers.js`)

**Files:**
- Create: `lib/storeManagers.js`
- Test: `tests/store-managers.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/store-managers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorized, extractManagers } = require('../lib/storeManagers');

test('isAuthorized: correct bearer token passes', () => {
  assert.equal(isAuthorized('Bearer secret123', 'secret123'), true);
});

test('isAuthorized: wrong / missing / empty-config all fail', () => {
  assert.equal(isAuthorized('Bearer nope', 'secret123'), false);
  assert.equal(isAuthorized(undefined, 'secret123'), false);
  assert.equal(isAuthorized('Bearer ', ''), false);   // unset env must never authorize
  assert.equal(isAuthorized('Bearer secret123', ''), false);
});

test('extractManagers: keeps only specific-access users with locations', () => {
  const users = [
    { name: 'Jane Doe', email: 'jane@r.com', dashboardAccess: { type: 'specific', locations: ['Bixby'] } },
    { name: 'All Access', email: 'all@r.com', dashboardAccess: { type: 'all', locations: [] } },
    { name: 'No Loc', email: 'noloc@r.com', dashboardAccess: { type: 'specific', locations: [] } },
    { name: 'No Access', email: 'na@r.com', dashboardAccess: { type: 'none', locations: [] } },
    { name: 'Missing Field', email: 'mf@r.com' },
  ];
  assert.deepEqual(extractManagers(users), [
    { name: 'Jane Doe', email: 'jane@r.com', locations: ['Bixby'] },
  ]);
});

test('extractManagers: non-array input returns empty array', () => {
  assert.deepEqual(extractManagers(undefined), []);
  assert.deepEqual(extractManagers(null), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/storeManagers'`.

- [ ] **Step 3: Write the implementation**

```javascript
// lib/storeManagers.js
// Pure helpers for the /api/store-managers route. No framework or DB imports
// here so they can be unit-tested directly under `node --test`. CommonJS so the
// Next.js route (via import interop) and the test runner can both consume it.

function isAuthorized(authHeader, expectedToken) {
  if (!expectedToken) return false;      // unset env var must never authorize
  if (!authHeader) return false;
  return authHeader === 'Bearer ' + expectedToken;
}

// Shape raw `users` docs into the roster the recap needs. A "manager" is any
// user scoped to specific dashboard locations.
function extractManagers(users) {
  if (!Array.isArray(users)) return [];
  return users
    .filter((u) =>
      u &&
      u.email &&
      u.dashboardAccess &&
      u.dashboardAccess.type === 'specific' &&
      Array.isArray(u.dashboardAccess.locations) &&
      u.dashboardAccess.locations.length > 0
    )
    .map((u) => ({
      name: u.name || '',
      email: u.email,
      locations: u.dashboardAccess.locations,
    }));
}

module.exports = { isAuthorized, extractManagers };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all `store-managers` tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/storeManagers.js tests/store-managers.test.js
git commit -m "Add store-manager roster helpers with tests"
```

---

## Task 2: API route (`pages/api/store-managers.js`)

**Files:**
- Create: `pages/api/store-managers.js`

This route has no automated test (the repo has no HTTP/Mongo test harness; all logic worth testing was extracted into Task 1). It is verified manually in Task 3 after deploy.

- [ ] **Step 1: Write the route**

```javascript
// pages/api/store-managers.js
// Server-to-server roster endpoint for the Apps Script manager recap job.
// Auth is a shared bearer token (MANAGER_SYNC_TOKEN), NOT a NextAuth session,
// because the caller is a script with no browser login.

import clientPromise from "../../lib/mongodb";
import { isAuthorized, extractManagers } from "../../lib/storeManagers";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req.headers.authorization, process.env.MANAGER_SYNC_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const users = await db
      .collection('users')
      .find({ 'dashboardAccess.type': 'specific' })
      .toArray();

    return res.status(200).json({ managers: extractManagers(users) });
  } catch (error) {
    console.error('store-managers error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build completes; `/api/store-managers` appears in the route list with no compile errors.

- [ ] **Step 3: Commit**

```bash
git add pages/api/store-managers.js
git commit -m "Add /api/store-managers roster endpoint"
```

---

## Task 3: Provision token + deploy the API (manual)

**Files:** none (deployment + secrets).

- [ ] **Step 1: Generate a token**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Copy the output — this is `MANAGER_SYNC_TOKEN`.

- [ ] **Step 2: Add the env var on Vercel**

In the Vercel dashboard (team `daltons-projects-c3po2d5p`, project `r365-dashboard`) → Settings → Environment Variables, add `MANAGER_SYNC_TOKEN` = the generated value, for Production (and Preview if you test there). Redeploy so it takes effect.

- [ ] **Step 3: Verify the deployed endpoint**

```bash
# Expect HTTP 200 + {"managers":[...]} with the correct token:
curl -s -H "Authorization: Bearer THE_TOKEN" https://andysdashboard.com/api/store-managers

# Expect HTTP 401 with a bad/missing token:
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer wrong" https://andysdashboard.com/api/store-managers
```
Expected: first returns a `managers` array of `{name,email,locations}`; second prints `401`. Confirm the array only contains location-scoped users (no admin/all-access accounts).

---

## Task 4: Apps Script pure helpers + config (`RanchersManagerRecap.js`)

**Files:**
- Create: `apps-script/RanchersManagerRecap.js` (config block + pure helpers only in this task)
- Test: `tests/manager-recap.test.js`

> Note: `tests/manager-recap.test.js` loads BOTH `RanchersDailyDebrief.js` and `RanchersManagerRecap.js` because `RECAP_CONFIG.REPLY_TO` references `DAILY_CONFIG`. Load order matters — debrief first.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/manager-recap.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppsScriptFiles } = require('./helpers/loadAppsScript');

// Debrief first: RanchersManagerRecap.js reads DAILY_CONFIG at load time.
const m = loadAppsScriptFiles('RanchersDailyDebrief.js', 'RanchersManagerRecap.js');

test('parseRecapCcList trims, drops blanks, handles empty', () => {
  assert.deepEqual(m.parseRecapCcList('a@x.com, b@y.com ,'), ['a@x.com', 'b@y.com']);
  assert.deepEqual(m.parseRecapCcList(''), []);
  assert.deepEqual(m.parseRecapCcList(null), []);
});

test('recapFirstName takes the first token, falls back to "there"', () => {
  assert.equal(m.recapFirstName('Jane Doe'), 'Jane');
  assert.equal(m.recapFirstName('  Bob  '), 'Bob');
  assert.equal(m.recapFirstName(''), 'there');
  assert.equal(m.recapFirstName(null), 'there');
});

test('buildRecipientGroups keeps only stores with data, sorts, sets firstName', () => {
  const locations = [{ location: 'Bixby' }, { location: 'Owasso' }];
  const managers = [
    { name: 'Jane Doe', email: 'jane@r.com', locations: ['Owasso', 'Bixby', 'Nowhere'] },
    { name: 'Bob Roe', email: 'bob@r.com', locations: ['Nowhere'] },
  ];
  const groups = m.buildRecipientGroups(managers, locations);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].email, 'jane@r.com');
  assert.equal(groups[0].firstName, 'Jane');
  assert.deepEqual(groups[0].stores.map((s) => s.location), ['Bixby', 'Owasso']);
});

test('buildManagerStoreFacts computes signed percentages and scheduled-hours delta', () => {
  const facts = m.buildManagerStoreFacts({
    location: 'Bixby', sales: 1000, pySales: 900, forecastVariance: -50,
    actHrs: 120, schHrs: 100, missedFcAndOverSch: true, isNewStore: false,
  });
  assert.equal(facts.store, 'Bixby');
  assert.equal(facts.sales, '$1,000');
  assert.equal(facts.vsForecast, '-4.8%');
  assert.equal(facts.vsPriorYear, '+11.1%');
  assert.equal(facts.hrsVsScheduled, '+20.0 hrs vs scheduled');
  assert.equal(facts.missedForecastAndOverScheduled, true);
});

test('buildManagerStoreFacts never escalates a new store', () => {
  const facts = m.buildManagerStoreFacts({
    location: 'Claremore', sales: 500, pySales: null, forecastVariance: -100,
    actHrs: 80, schHrs: 60, missedFcAndOverSch: true, isNewStore: true,
  });
  assert.equal(facts.missedForecastAndOverScheduled, false);
  assert.equal(facts.isNewStore, true);
});

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

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `RanchersManagerRecap.js` does not exist yet (read error from `loadAppsScriptFiles`).

- [ ] **Step 3: Write the config block + pure helpers**

```javascript
// apps-script/RanchersManagerRecap.js
// ============================================================================
// RANCHERS MANAGER RECAP
// ~7:15 AM personal good-morning email to each store manager about THEIR store's
// prior day, inviting a recap reply. Separate from the 7:00 AM leadership debrief.
//
// - Recipients are derived from the app's admin/users list (dashboardAccess) via
//   the /api/store-managers endpoint — manage who gets emails there.
// - Multi-store managers get ONE combined email, one paragraph per store.
// - Claude writes each note fresh; falls back to plain prose if the API is down.
// - "Missed forecast AND over scheduled hours" escalates the ASK (constructively).
// - Leadership (MANAGER_RECAP_CC Script Property) is visibly CC'd on every email.
// - Every send is logged to the 'Manager Recap Log' tab, full body included.
//
// SETUP:
//   1. Script Properties → MANAGER_SYNC_TOKEN = (same value as Vercel env)
//   2. Script Properties → MANAGER_RECAP_CC   = josh@...,eric@...,kandace@...
//   3. (ANTHROPIC_API_KEY already set for the debrief — reused here)
//   4. Run setupManagerRecapTrigger() ONCE
//   5. Run testManagerRecaps() to preview to dalton only
// ============================================================================

var RECAP_CONFIG = {
  MANAGER_API_URL: 'https://andysdashboard.com/api/store-managers',
  REPLY_TO:        DAILY_CONFIG.RECIPIENTS, // recaps land with leadership
  SEND_HOUR:       7,
  SEND_MINUTE:     15,
  LOG_SHEET:       'Manager Recap Log'
};

// --- pure helpers (unit-tested) --------------------------------------------

function parseRecapCcList(raw) {
  if (!raw) return [];
  return String(raw).split(',')
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s.length > 0; });
}

function recapFirstName(name) {
  if (!name) return 'there';
  var token = String(name).trim().split(/\s+/)[0];
  return token || 'there';
}

// managers: [{name, email, locations:[...]}]; locations: buildDailyLocationData output.
// Returns recipients that have >=1 store with data yesterday, stores sorted by name.
function buildRecipientGroups(managers, locations) {
  var byName = {};
  locations.forEach(function(loc) { byName[loc.location] = loc; });

  var groups = [];
  (managers || []).forEach(function(mgr) {
    if (!mgr || !mgr.email || !mgr.locations) return;
    var stores = [];
    mgr.locations.forEach(function(locName) {
      if (byName[locName]) stores.push(byName[locName]);
    });
    if (stores.length === 0) return;
    stores.sort(function(a, b) { return a.location.localeCompare(b.location); });
    groups.push({
      name:      mgr.name || '',
      email:     mgr.email,
      firstName: recapFirstName(mgr.name),
      stores:    stores
    });
  });
  return groups;
}

// Compress one location row into the light facts the prose is grounded in.
function buildManagerStoreFacts(loc) {
  var fcPct = null;
  if (loc.forecastVariance !== null && loc.sales && loc.sales > 0) {
    var fc = loc.sales - loc.forecastVariance;
    if (fc > 0) fcPct = ((loc.forecastVariance / fc) * 100).toFixed(1);
  }
  var pyPct = (loc.sales && loc.pySales && loc.pySales > 0)
    ? (((loc.sales - loc.pySales) / loc.pySales) * 100).toFixed(1) : null;
  var hrsVsSch = (loc.actHrs !== null && loc.actHrs !== undefined &&
                  loc.schHrs !== null && loc.schHrs !== undefined)
    ? (loc.actHrs - loc.schHrs).toFixed(1) : null;

  return {
    store:          loc.location,
    sales:          loc.sales ? '$' + Math.round(loc.sales).toLocaleString() : null,
    vsForecast:     fcPct !== null ? (fcPct > 0 ? '+' : '') + fcPct + '%' : null,
    vsPriorYear:    pyPct !== null ? (pyPct > 0 ? '+' : '') + pyPct + '%' : null,
    hrsVsScheduled: hrsVsSch !== null ? (hrsVsSch > 0 ? '+' : '') + hrsVsSch + ' hrs vs scheduled' : null,
    missedForecastAndOverScheduled: !!(loc.missedFcAndOverSch && !loc.isNewStore),
    isNewStore:     !!loc.isNewStore
  };
}

// Build the Claude prompt for one recipient.
function buildManagerPrompt(firstName, storeFactsList) {
  var anyEscalation = storeFactsList.some(function(s) { return s.missedForecastAndOverScheduled; });

  var prompt =
    'You are writing a brief, warm, personal good-morning email to ' + firstName + ', a store manager '
    + 'at Ranchers Custard Company (Andy\'s Frozen Custard), about how their store(s) did YESTERDAY. '
    + 'It must read like a real note from a person who actually looked at the numbers — never a template.\n\n'
    + 'TONE & RULES:\n'
    + '- Open by greeting ' + firstName + ' by first name.\n'
    + '- Conversational and constructive. Never harsh, never blaming.\n'
    + '- Weave the numbers naturally into the prose. Do NOT print a table or a stat line.\n'
    + '- Every number you state must come from the data provided. Never invent or estimate figures.\n'
    + '- Write each store\'s paragraph fresh. Never reuse phrasing or sentence structure across stores or days.\n'
    + '- End each store\'s paragraph by inviting a quick reply recapping how yesterday went.\n'
    + '- One paragraph per store. With multiple stores, start each paragraph with the store name in **double asterisks**.\n'
    + '- Never mention grades, hourly labor rates, or any internal flag names.\n'
    + (anyEscalation
        ? '- For any store flagged "missedForecastAndOverScheduled": yesterday came in under the sales forecast AND ran over the scheduled hours that were committed to. Gently and specifically ask what drove the softer sales and how the staffing/hours call played out — framed as "worth looking into" / "help me understand the day," never as criticism.\n'
        : '')
    + '- For any store flagged "isNewStore": it is still ramping up. Be encouraging and context-first; do not critique it.\n\n'
    + 'Do not include a subject line, title, or signature.\n\n'
    + 'Data:\n' + JSON.stringify({ manager: firstName, stores: storeFactsList }, null, 2);

  return prompt;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — all `manager-recap` and `store-managers` tests green.

- [ ] **Step 5: Commit**

```bash
git add apps-script/RanchersManagerRecap.js tests/manager-recap.test.js
git commit -m "Add manager recap config + pure helpers with tests"
```

---

## Task 5: Apps Script orchestration, HTML, logging, trigger, test fn

**Files:**
- Modify: `apps-script/RanchersManagerRecap.js` (append the orchestration functions below the pure helpers)

These functions call Google Apps Script globals (`UrlFetchApp`, `MailApp`, `SpreadsheetApp`, `ScriptApp`, `PropertiesService`) so they are not unit-tested in Node — they are verified live in Task 6. Add them all in one edit.

- [ ] **Step 1: Append the roster fetch + Claude narrative + fallback**

```javascript
// --- orchestration (runs in Apps Script only) ------------------------------

function fetchManagerRoster() {
  var token = PropertiesService.getScriptProperties().getProperty('MANAGER_SYNC_TOKEN');
  if (!token) { Logger.log('MANAGER_SYNC_TOKEN not set — cannot fetch roster.'); return null; }
  try {
    var resp = UrlFetchApp.fetch(RECAP_CONFIG.MANAGER_API_URL, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Roster fetch HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
      return null;
    }
    var data = JSON.parse(resp.getContentText());
    return data.managers || [];
  } catch (e) {
    Logger.log('Roster fetch error: ' + e.toString());
    return null;
  }
}

function writeManagerNarrative(firstName, storeFactsList) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return managerFallback(firstName, storeFactsList);

  var prompt = buildManagerPrompt(firstName, storeFactsList);
  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model:      'claude-opus-4-7',
        max_tokens: 900,
        messages:   [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });
    var result = JSON.parse(resp.getContentText());
    if (result.content && result.content[0] && result.content[0].text) {
      return result.content[0].text.trim();
    }
    Logger.log('Unexpected API response (manager recap): ' + resp.getContentText());
  } catch (e) {
    Logger.log('Claude API error (manager recap): ' + e.toString());
  }
  return managerFallback(firstName, storeFactsList);
}

function managerFallback(firstName, storeFactsList) {
  var parts = ['Good morning ' + firstName + ',', ''];
  storeFactsList.forEach(function(s) {
    var bits = [];
    if (s.sales)          bits.push('came in at ' + s.sales);
    if (s.vsForecast)     bits.push(s.vsForecast + ' vs forecast');
    if (s.vsPriorYear)    bits.push(s.vsPriorYear + ' vs last year');
    if (s.hrsVsScheduled) bits.push(s.hrsVsScheduled);
    var line = '**' + s.store + '** — Yesterday '
      + (bits.length ? bits.join(', ') : 'numbers are still coming in') + '.';
    if (s.missedForecastAndOverScheduled) {
      line += ' Sales were under forecast while hours ran over what was scheduled — worth a look at how the day played out. When you get a sec, send me a quick recap.';
    } else if (s.isNewStore) {
      line += ' Still early days as the store finds its rhythm — how did it feel on the ground? A quick recap would be great.';
    } else {
      line += ' How did yesterday go? Send a quick recap when you can.';
    }
    parts.push(line, '');
  });
  return parts.join('\n').trim();
}
```

- [ ] **Step 2: Append the HTML builder + log writer**

```javascript
function buildManagerRecapHtml(bodyText, dateStr) {
  var paras = bodyText.split('\n')
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; });

  var body = paras.map(function(p) {
    return '<p style="margin:0 0 14px;line-height:1.75;color:#1a1a1a;font-size:15px;">'
      + p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
  }).join('');

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;">'
    + '<div style="max-width:620px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<div style="background:#1a2e4a;padding:24px 32px;">'
    + '<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 4px;">Good Morning</h1>'
    + '<p style="color:#a0b8d0;font-size:13px;margin:0;">' + fmtDisplayDate(dateStr) + '</p>'
    + '</div>'
    + '<div style="padding:28px 32px;border-bottom:3px solid #1a2e4a;">' + body + '</div>'
    + '<div style="padding:14px 32px;text-align:center;background:#f8f9fa;">'
    + '<p style="color:#888;font-size:12px;margin:0;">Andy\'s Dashboard &nbsp;&middot;&nbsp; <a href="https://andysdashboard.com" style="color:#1a2e4a;text-decoration:none;">andysdashboard.com</a></p>'
    + '</div></div></body></html>';
}

// Append one row per recipient to the 'Manager Recap Log' tab (auto-created).
// Columns: Timestamp | Date | Recipient Name | Recipient Email | Stores | CC | Status | Email Body
function logManagerRecap(ss, row) {
  try {
    var sheet = ss.getSheetByName(RECAP_CONFIG.LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(RECAP_CONFIG.LOG_SHEET);
      sheet.appendRow(['Timestamp', 'Date', 'Recipient Name', 'Recipient Email', 'Stores', 'CC', 'Status', 'Email Body']);
      sheet.setFrozenRows(1);
      sheet.getRange('A1:H1').setFontWeight('bold');
      sheet.setColumnWidth(5, 200);
      sheet.setColumnWidth(8, 600);
    }
    var ts = Utilities.formatDate(new Date(), 'America/Chicago', 'M/d/yyyy HH:mm');
    sheet.appendRow([ts, row.date, row.name, row.email, row.stores, row.cc, row.status, row.body]);
  } catch (e) {
    Logger.log('logManagerRecap error: ' + e.toString());
  }
}
```

- [ ] **Step 3: Append the main send function, trigger setup, and test fn**

```javascript
function sendManagerRecaps() {
  try {
    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();

    var locations = buildDailyLocationData(ss, yesterday);
    if (locations.length === 0) { Logger.log('No data for ' + yesterday + ' — skipping manager recaps.'); return; }

    var roster = fetchManagerRoster();
    if (!roster) { Logger.log('Roster unavailable — aborting (sent nothing).'); return; }

    var groups = buildRecipientGroups(roster, locations);
    if (groups.length === 0) { Logger.log('No recipients have data — nothing to send.'); return; }

    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
    ).join(',');

    groups.forEach(function(g) {
      var facts  = g.stores.map(buildManagerStoreFacts);
      var body   = writeManagerNarrative(g.firstName, facts);
      var html   = buildManagerRecapHtml(body, yesterday);
      var status = 'Sent';
      try {
        var opts = {
          to:       g.email,
          subject:  'Quick recap — ' + fmtDisplayDate(yesterday),
          htmlBody: html,
          replyTo:  RECAP_CONFIG.REPLY_TO
        };
        if (ccStr) opts.cc = ccStr;
        MailApp.sendEmail(opts);
      } catch (e) {
        status = 'Failed: ' + e.toString();
        Logger.log('Send failed for ' + g.email + ': ' + e.toString());
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

    Logger.log('Manager recaps complete: ' + groups.length + ' recipient(s).');
  } catch (e) {
    Logger.log('Error in sendManagerRecaps: ' + e.toString());
  }
}

function setupManagerRecapTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendManagerRecaps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendManagerRecaps')
    .timeBased().atHour(RECAP_CONFIG.SEND_HOUR).nearMinute(RECAP_CONFIG.SEND_MINUTE).everyDays(1)
    .inTimezone('America/Chicago').create();
  Logger.log('Manager recap trigger set: ~' + RECAP_CONFIG.SEND_HOUR + ':' + RECAP_CONFIG.SEND_MINUTE + ' Central daily.');
}

// Preview the entire batch to dalton only — no real manager is emailed.
// Each preview email is subject-tagged with its intended recipient; log rows
// are marked 'Preview'.
function testManagerRecaps() {
  var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
  var yesterday = getYesterdayStr();

  var locations = buildDailyLocationData(ss, yesterday);
  if (locations.length === 0) { Logger.log('No data.'); return; }

  var roster = fetchManagerRoster();
  if (!roster) { Logger.log('Roster fetch failed.'); return; }

  var groups = buildRecipientGroups(roster, locations);
  Logger.log('Preview recipients: ' + groups.length);

  var ccStr = parseRecapCcList(
    PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
  ).join(',');

  groups.forEach(function(g) {
    var facts = g.stores.map(buildManagerStoreFacts);
    var body  = writeManagerNarrative(g.firstName, facts);
    var html  = buildManagerRecapHtml(body, yesterday);
    MailApp.sendEmail({
      to:       'dalton@rancherscustard.com',
      subject:  '[TEST → ' + g.email + '] Quick recap — ' + fmtDisplayDate(yesterday),
      htmlBody: html
    });
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

  Logger.log('Preview sent to dalton only.');
}
```

- [ ] **Step 4: Re-run the unit tests (regression — pure helpers still load)**

Run: `npm test`
Expected: PASS — appending GAS functions must not break loading or the pure-helper tests. (`loadAppsScriptFiles` only *defines* these functions; their GAS-global bodies never execute during tests.)

- [ ] **Step 5: Commit**

```bash
git add apps-script/RanchersManagerRecap.js
git commit -m "Add manager recap orchestration, HTML, logging, trigger, and preview"
```

---

## Task 6: Deploy Apps Script + go live (manual)

**Files:** none in repo (live Apps Script project + Script Properties).

> Per CLAUDE.md: committing to Git does NOT deploy. `clasp push` is what makes it live.

- [ ] **Step 1: Reconcile then push**

```bash
clasp pull            # reconcile local with whatever the morning triggers/editor changed
# (resolve any diffs, re-commit if clasp pull changed tracked files)
clasp push            # deploy RanchersManagerRecap.js to the live project
```
Expected: `clasp push` lists `RanchersManagerRecap.js` (as `.gs`) among pushed files with no errors.

- [ ] **Step 2: Set Script Properties**

In the Apps Script editor → Project Settings → Script Properties, add:
- `MANAGER_SYNC_TOKEN` = the exact value set on Vercel in Task 3.
- `MANAGER_RECAP_CC` = `josh@rancherscustard.com,eric@rancherscustard.com,kandacegiles@rancherscustard.com`

(`ANTHROPIC_API_KEY` is already present from the debrief.)

- [ ] **Step 3: Preview run**

In the editor, run `testManagerRecaps()`. Grant scopes if prompted.
Expected: one `[TEST → manager@…]` email per recipient arrives in dalton's inbox; the `Manager Recap Log` tab is created with the header and one `Preview` row per recipient (full body in the last column). Verify: a multi-store manager's email merges their stores into one message; a store that missed forecast AND ran over scheduled reads with the constructive "help me understand the day" ask; Claremore (new store) is encouraging, not escalated.

- [ ] **Step 4: Install the trigger**

In the editor, run `setupManagerRecapTrigger()` once.
Expected: log line confirms the ~7:15 AM Central daily trigger; it appears under Triggers for `sendManagerRecaps`.

- [ ] **Step 5: First live morning check**

The morning after install, confirm: managers received their individual emails; Josh/Eric/Kandace are a visible CC on each; replies are addressed to the leadership distro; the `Manager Recap Log` tab has `Sent` rows for the day.

---

## Self-Review

**Spec coverage:**
- Manager email source / identification (`dashboardAccess.type === 'specific'`) → Task 1 `extractManagers`, Task 2 query.
- One combined email per multi-store recipient → Task 4 `buildRecipientGroups` + Task 5 `sendManagerRecaps`.
- Claude-personalized, light prose → Task 4 `buildManagerPrompt` (no table; numbers woven), Task 5 `writeManagerNarrative`.
- Separate ~7:15 trigger → Task 5 `setupManagerRecapTrigger`.
- Reply-To = leadership distro → Task 5 `RECAP_CONFIG.REPLY_TO` on send.
- Visible CC via editable `MANAGER_RECAP_CC` Script Property → Task 4 `parseRecapCcList`, Task 5 `cc` option, Task 6 Step 2.
- Escalation only on missed-forecast-AND-over-scheduled, never for new stores → Task 4 `buildManagerStoreFacts` (`!isNewStore`) + `buildManagerPrompt` conditional; tested.
- Recipient management via admin/users → no code; documented in spec, relied on by Task 1 filter.
- `Manager Recap Log` tab with full body, `Preview`/`Failed` statuses → Task 5 `logManagerRecap` + `sendManagerRecaps`/`testManagerRecaps`.
- Error handling (abort on roster failure, omit no-data stores, skip empty recipients, Claude fallback, per-recipient try/catch) → Task 4/5.
- Token security (401 on bad/unset) → Task 1 `isAuthorized` (tested), Task 2 handler.

**Placeholder scan:** none — every step has runnable code or exact commands.

**Type/name consistency:** helper names used in Task 5/6 (`buildRecipientGroups`, `buildManagerStoreFacts`, `buildManagerPrompt`, `parseRecapCcList`, `recapFirstName`) match their Task 4 definitions; `writeManagerNarrative`/`managerFallback`/`fetchManagerRoster`/`buildManagerRecapHtml`/`logManagerRecap` are defined and referenced consistently within Task 5; `RECAP_CONFIG` fields (`MANAGER_API_URL`, `REPLY_TO`, `SEND_HOUR`, `SEND_MINUTE`, `LOG_SHEET`) are used exactly as defined. API helper names (`isAuthorized`, `extractManagers`) match between Task 1 and Task 2.
