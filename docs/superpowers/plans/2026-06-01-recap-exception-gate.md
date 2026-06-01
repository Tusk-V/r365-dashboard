# Recap Exception Gate + Direct Tone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the manager recap into an exception alert — draft an email about a store ONLY when it missed forecast by more than 3% AND ran 5%+ over scheduled hours AND had no auto-clockouts AND isn't a new store — and rewrite the email in a direct owner-to-manager tone.

**Architecture:** Add two thresholds to `RECAP_CONFIG` and a pure `qualifiesForRecap` gate to `apps-script/RanchersManagerRecap.js`. The draft builder fetches the day's auto-clockout counts (reusing `getClockoutCounts` from the sibling debrief file) and only drafts for a manager's stores that pass the gate; a manager with no qualifying stores gets no draft. The Claude prompt and fallback are rewritten to be direct and professional (no pleasantries), asking why labor ran over when sales were soft.

**Tech Stack:** Google Apps Script (clasp), Claude API, `node:test`.

**Decisions (locked via brainstorming):**
- Under forecast by **> 3%** (`FORECAST_MISS_PCT = 0.03`), measured against forecast.
- Actual hours **≥ 5%** over scheduled (`OVER_SCHEDULED_PCT = 0.05`).
- **Skip** any store that had auto-clockouts that day (reported hours can be overstated).
- **Exclude** new/ramp-up stores.
- Email covers only qualifying store(s); no qualifying store → no email.
- Tone: direct, owner-to-manager; ask why they were over on hours when they should have been cutting. No "good morning", no praise, not harsh.
- Send model unchanged: Gmail drafts in Dalton's account (manual send).

---

## File Structure

All changes in `apps-script/RanchersManagerRecap.js` (+ its test `tests/manager-recap.test.js`). The gate (`qualifiesForRecap`) is a pure, unit-tested helper; the wiring into `createManagerRecapDrafts`/`testManagerRecaps` and the prompt/fallback tone are GAS/string changes verified by `node --check` + manual preview. `getClockoutCounts(ss, dateStr)` already exists in `apps-script/RanchersDailyDebrief.js` (same Apps Script project) and returns a `{ locationName: count }` map.

Run tests with `node --test $(find tests -name '*.test.js')` (npm glob can match nothing in some shells; currently 73 pass).

---

## Task 1: Thresholds + `qualifiesForRecap` gate

**Files:** Modify `apps-script/RanchersManagerRecap.js`; Test `tests/manager-recap.test.js`.

- [ ] **Step 1: Add the failing tests** to `tests/manager-recap.test.js` (append):

```javascript
test('qualifiesForRecap: under forecast >3% AND over scheduled >=5%, no clockouts, not new', () => {
  // forecast 1000, sales 950 (-5%), scheduled 100, actual 106 (+6%)
  const loc = { sales: 950, forecastVariance: -50, schHrs: 100, actHrs: 106, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), true);
});

test('qualifiesForRecap: trivial forecast miss (<=3%) does not qualify', () => {
  const loc = { sales: 980, forecastVariance: -20, schHrs: 100, actHrs: 110, isNewStore: false }; // -2%
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), false);
});

test('qualifiesForRecap: hours under threshold does not qualify', () => {
  const loc = { sales: 900, forecastVariance: -100, schHrs: 100, actHrs: 104, isNewStore: false }; // -10% but +4% hrs
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), false);
});

test('qualifiesForRecap: auto-clockouts skip the store', () => {
  const loc = { sales: 950, forecastVariance: -50, schHrs: 100, actHrs: 106, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 2, 0.03, 0.05), false);
});

test('qualifiesForRecap: new store never qualifies', () => {
  const loc = { sales: 950, forecastVariance: -50, schHrs: 100, actHrs: 106, isNewStore: true };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), false);
});

test('qualifiesForRecap: beating forecast does not qualify', () => {
  const loc = { sales: 1050, forecastVariance: 50, schHrs: 100, actHrs: 110, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), false);
});

test('qualifiesForRecap: missing labor data does not qualify', () => {
  const loc = { sales: 950, forecastVariance: -50, schHrs: null, actHrs: null, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/manager-recap.test.js`
Expected: FAIL — `qualifiesForRecap` is not a function.

- [ ] **Step 3: Implement.** In `apps-script/RanchersManagerRecap.js`:

(3a) In `RECAP_CONFIG`, add the two thresholds (after `SIGNATURE_TEXT`; make sure the line before gets a trailing comma):
```javascript
  SIGNATURE_TEXT:  'Dalton Owens\nOwner/Operator\nRanchers Custard Company, LLC\nAndy\'s Frozen Custard Franchisee',
  FORECAST_MISS_PCT:   0.03,  // must be MORE than 3% under forecast to flag
  OVER_SCHEDULED_PCT:  0.05   // AND 5%+ actual hours over scheduled
```
(Confirm `RECAP_CONFIG` still closes with `};`.)

(3b) Add the pure gate (place it just above the `// --- orchestration` divider, among the other pure helpers):
```javascript
// True only when a store warrants an exception email: under forecast by more
// than forecastMissPct, actual hours at least overSchedPct above scheduled, no
// auto-clockouts that day, and not a ramp-up store.
function qualifiesForRecap(loc, autoClockouts, forecastMissPct, overSchedPct) {
  if (!loc || loc.isNewStore) return false;
  if (autoClockouts && autoClockouts > 0) return false;
  if (loc.schHrs == null || loc.schHrs <= 0 || loc.actHrs == null) return false;
  if (loc.forecastVariance == null || loc.sales == null) return false;
  var forecast = loc.sales - loc.forecastVariance;          // forecast = actual - variance
  if (forecast <= 0) return false;
  var missPct = (-loc.forecastVariance) / forecast;          // > 0 when under forecast
  if (missPct <= forecastMissPct) return false;
  var overPct = (loc.actHrs - loc.schHrs) / loc.schHrs;
  if (overPct < overSchedPct) return false;
  return true;
}
```

- [ ] **Step 4: Run full suite to verify pass**

Run: `node --test $(find tests -name '*.test.js')`
Expected: PASS (80). Also `node --check apps-script/RanchersManagerRecap.js` → valid.

- [ ] **Step 5: Commit**

```bash
git add apps-script/RanchersManagerRecap.js tests/manager-recap.test.js
git commit -m "Add exception-gate thresholds and qualifiesForRecap helper"
```

---

## Task 2: Direct owner-to-manager tone

**Files:** Modify `apps-script/RanchersManagerRecap.js`; Test `tests/manager-recap.test.js`.

- [ ] **Step 1: Replace the two `buildManagerPrompt` tests** in `tests/manager-recap.test.js`.

Find and DELETE:
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
Replace with:
```javascript
test('buildManagerPrompt: direct owner tone, name greeting, asks about over-labor', () => {
  const p = m.buildManagerPrompt('Jane', [{ store: 'Bixby' }]);
  assert.ok(p.includes('Jane,'));
  assert.ok(p.toLowerCase().includes('cutting'));
  assert.ok(!p.includes('Good morning'));
});

test('buildManagerPrompt: neutral greeting when no name', () => {
  const p = m.buildManagerPrompt('', [{ store: 'Bixby' }]);
  assert.ok(p.includes('Hi,'));
  assert.ok(!p.includes('Hi ,'));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/manager-recap.test.js`
Expected: FAIL (old wording).

- [ ] **Step 3: Replace `buildManagerPrompt`** in `apps-script/RanchersManagerRecap.js` with:

```javascript
function buildManagerPrompt(firstName, storeFactsList) {
  var greeting = (firstName ? firstName : 'Hi') + ',';

  var prompt =
    'Write a short, direct email from the owner to a store manager about YESTERDAY. '
    + 'Every store listed came in under its sales forecast AND ran over its scheduled labor hours. '
    + 'The point is to ask, plainly and professionally, why labor was over when sales were soft and they should have been cutting.\n\n'
    + 'RULES:\n'
    + '- Start with exactly: "' + greeting + '"\n'
    + '- Tone: straightforward and professional — owner to employee. Not chummy, not harsh. No "good morning", no small talk, no praise.\n'
    + '- For each store: state the sales-vs-forecast and the hours over scheduled in one sentence, then directly ask why they ran over when they should have been cutting labor.\n'
    + '- Keep it tight: two or three sentences per store, maximum.\n'
    + '- Use only the numbers in the data; never invent figures.\n'
    + '- One short paragraph per store. With multiple stores, start each paragraph with the store name in **double asterisks**.\n'
    + '- No grades, no labor rates, no internal flag names. No subject line, title, or signature.\n\n'
    + 'Data:\n' + JSON.stringify({ stores: storeFactsList }, null, 2);

  return prompt;
}
```

- [ ] **Step 4: Replace `managerFallback`** with a matching direct tone:

```javascript
function managerFallback(firstName, storeFactsList) {
  var greeting = (firstName ? firstName : 'Hi') + ',';
  var parts = [greeting, ''];
  storeFactsList.forEach(function(s) {
    var bits = [];
    if (s.sales)          bits.push(s.sales);
    if (s.vsForecast)     bits.push(s.vsForecast + ' vs forecast');
    if (s.hrsVsScheduled) bits.push(s.hrsVsScheduled);
    var stats = bits.length ? ' (' + bits.join(', ') + ')' : '';
    var line = '**' + s.store + '**' + stats
      + ' — sales came in under forecast and hours ran over schedule. Why weren\'t we cutting labor as the day came in soft?';
    parts.push(line, '');
  });
  return parts.join('\n').trim();
}
```

- [ ] **Step 5: Run full suite + syntax check**

Run: `node --test $(find tests -name '*.test.js')` → PASS (80).
Run: `node --check apps-script/RanchersManagerRecap.js` → valid.

- [ ] **Step 6: Commit**

```bash
git add apps-script/RanchersManagerRecap.js tests/manager-recap.test.js
git commit -m "Rewrite recap prompt and fallback in a direct owner-to-manager tone"
```

---

## Task 3: Gate the drafts on qualifying stores

**Files:** Modify `apps-script/RanchersManagerRecap.js`. Verify by `node --check` + regression tests + the no-orphan grep.

- [ ] **Step 1: Replace `createManagerRecapDrafts`** so it fetches auto-clockout counts and only drafts qualifying stores:

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

    var clockoutCounts = getClockoutCounts(ss, yesterday);
    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
    ).join(',');

    var drafted = 0;
    groups.forEach(function(g) {
      var qualifying = g.stores.filter(function(loc) {
        return qualifiesForRecap(loc, clockoutCounts[loc.location] || 0,
          RECAP_CONFIG.FORECAST_MISS_PCT, RECAP_CONFIG.OVER_SCHEDULED_PCT);
      });
      if (qualifying.length === 0) return;  // nothing to flag for this manager

      var facts  = qualifying.map(buildManagerStoreFacts);
      var body   = writeManagerNarrative(g.firstName, facts);
      var html   = buildManagerRecapHtml(body, yesterday);
      var status = 'Drafted';
      try {
        var opts = { htmlBody: html };
        if (ccStr) opts.cc = ccStr;
        GmailApp.createDraft(g.email, 'Yesterday — labor over schedule', '', opts);
      } catch (e) {
        status = 'Failed: ' + e.toString();
        Logger.log('Draft failed for ' + g.email + ': ' + e.toString());
      }
      drafted++;
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: qualifying.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: status,
        body:   body
      });
    });

    Logger.log('Manager recap drafts created: ' + drafted + ' of ' + groups.length + ' recipient(s) had a flagged store.');
  } catch (e) {
    Logger.log('Error in createManagerRecapDrafts: ' + e.toString());
  }
}
```

(Note the subject changed from "Quick recap — <date>" to "Yesterday — labor over schedule" to match the direct, exception nature.)

- [ ] **Step 2: Replace `testManagerRecaps`** to use the same gate (preview drafts to Dalton; only flagged stores; status 'Preview'):

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
    var clockoutCounts = getClockoutCounts(ss, yesterday);
    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
    ).join(',');

    var previewed = 0;
    groups.forEach(function(g) {
      var qualifying = g.stores.filter(function(loc) {
        return qualifiesForRecap(loc, clockoutCounts[loc.location] || 0,
          RECAP_CONFIG.FORECAST_MISS_PCT, RECAP_CONFIG.OVER_SCHEDULED_PCT);
      });
      if (qualifying.length === 0) return;

      var facts = qualifying.map(buildManagerStoreFacts);
      var body  = writeManagerNarrative(g.firstName, facts);
      var html  = buildManagerRecapHtml(body, yesterday);
      GmailApp.createDraft(
        'dalton@rancherscustard.com',
        '[TEST -> ' + g.email + '] Yesterday — labor over schedule',
        '',
        { htmlBody: html }
      );
      previewed++;
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: qualifying.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: 'Preview',
        body:   body
      });
    });

    Logger.log('Preview drafts created: ' + previewed + ' recipient(s) with a flagged store.');
  } catch (e) {
    Logger.log('Error in testManagerRecaps: ' + e.toString());
  }
}
```

- [ ] **Step 3: Verify**

Run: `node --check apps-script/RanchersManagerRecap.js` → valid.
Run: `node --test $(find tests -name '*.test.js')` → PASS (80).
Run: `grep -n "Quick recap" apps-script/RanchersManagerRecap.js` → nothing (subject updated in both functions).

- [ ] **Step 4: Commit**

```bash
git add apps-script/RanchersManagerRecap.js
git commit -m "Draft recaps only for stores that miss forecast and run over scheduled"
```

---

## Deploy (manual, after merge)

From `apps-script/`: `clasp pull` (reconcile — restore `RanchersManagerRecap.js` to HEAD if pull reverts it), then `clasp push`. The trigger handler name is unchanged (`createManagerRecapDrafts`), so re-running `setupManagerRecapTrigger()` is optional. Run `testManagerRecaps()` → preview drafts appear in Dalton's Drafts only for stores that tripped the gate (likely few or none on a given day — that's expected).

---

## Self-Review

**Coverage of locked decisions:**
- >3% under forecast + ≥5% over scheduled → Task 1 `qualifiesForRecap` (thresholds from `RECAP_CONFIG`).
- Skip auto-clockout days → Task 1 (`autoClockouts > 0` guard) + Task 3 (passes `getClockoutCounts`).
- Exclude new stores → Task 1 (`loc.isNewStore`).
- Only qualifying stores; no qualifier → no email → Task 3 (`qualifying.length === 0` returns; `drafted` counter).
- Direct owner tone, ask why over when should've cut → Task 2 (prompt + fallback).
- Drafts unchanged (manual send) → Task 3 keeps `GmailApp.createDraft`.

**Placeholder scan:** none — full code/commands throughout.

**Type/name consistency:** `qualifiesForRecap(loc, autoClockouts, forecastMissPct, overSchedPct)` defined in Task 1 and called identically in Task 3. `RECAP_CONFIG.FORECAST_MISS_PCT`/`OVER_SCHEDULED_PCT` defined in Task 1, consumed in Task 3. `getClockoutCounts` is an existing global in `RanchersDailyDebrief.js` returning `{location: count}` — accessed as `clockoutCounts[loc.location]`. `buildManagerStoreFacts`, `writeManagerNarrative`, `buildManagerRecapHtml`, `logManagerRecap`, `buildRecipientGroups` are unchanged and called as before.

**Note:** `buildManagerStoreFacts` still returns the `missedForecastAndOverScheduled`/`isNewStore` keys; harmless now (the prompt no longer branches on them, and the gate happens before facts are built). Left as-is to avoid touching tested code unnecessarily.
