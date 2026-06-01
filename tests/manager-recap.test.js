// tests/manager-recap.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppsScriptFiles } = require('./helpers/loadAppsScript');

// Debrief first: RanchersManagerRecap.js reads DAILY_CONFIG at load time.
const m = loadAppsScriptFiles('RanchersDailyDebrief.js', 'RanchersManagerRecap.js');

test('parseRecapCcList trims, drops blanks, handles empty', () => {
  // Array.from() normalises cross-realm VM arrays for deepStrictEqual on Node 24
  assert.deepEqual(Array.from(m.parseRecapCcList('a@x.com, b@y.com ,')), ['a@x.com', 'b@y.com']);
  assert.deepEqual(Array.from(m.parseRecapCcList('')), []);
  assert.deepEqual(Array.from(m.parseRecapCcList(null)), []);
});

test('recapFirstName takes the first token, empty when no name', () => {
  assert.equal(m.recapFirstName('Jane Doe'), 'Jane');
  assert.equal(m.recapFirstName('  Bob  '), 'Bob');
  assert.equal(m.recapFirstName(''), '');
  assert.equal(m.recapFirstName(null), '');
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
  assert.deepEqual(Array.from(groups[0].stores.map((s) => s.location)), ['Bixby', 'Owasso']);
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

test('buildManagerStoreFacts formats a beat-forecast day with a + prefix', () => {
  const facts = m.buildManagerStoreFacts({
    location: 'Yale', sales: 1000, pySales: 1100, forecastVariance: 100,
    actHrs: 90, schHrs: 100, missedFcAndOverSch: false, isNewStore: false,
  });
  assert.equal(facts.vsForecast, '+11.1%');           // 100/(1000-100)=+11.1%
  assert.equal(facts.vsPriorYear, '-9.1%');           // (1000-1100)/1100=-9.1%
  assert.equal(facts.hrsVsScheduled, '-10.0 hrs vs scheduled');
  assert.equal(facts.missedForecastAndOverScheduled, false);
});

test('buildManagerPrompt: professional tone, name greeting, asks about over-labor, closes with thanks', () => {
  const p = m.buildManagerPrompt('Jane', [{ store: 'Bixby' }]);
  assert.ok(p.includes('Jane,'));
  assert.ok(p.toLowerCase().includes('labor'));
  assert.ok(p.includes('Thanks,'));
  assert.ok(!p.includes('Good morning'));
});

test('buildManagerPrompt: neutral greeting when no name', () => {
  const p = m.buildManagerPrompt('', [{ store: 'Bixby' }]);
  assert.ok(p.includes('Hi,'));
  assert.ok(!p.includes('Hi ,'));
});

test('buildLocationRecipientMap inverts roster, dedupes, sorts, and flags unassigned data locations', () => {
  const managers = [
    { name: 'Jane Doe', email: 'jane@r.com', locations: ['Bixby', 'Owasso'] },
    { name: 'Bob Roe', email: 'bob@r.com', locations: ['Bixby'] },        // shares Bixby with Jane
    { name: 'Dup', email: 'jane@r.com', locations: ['Owasso'] },          // duplicate email on Owasso
  ];
  // Bixby, Owasso, Edmond have data; Edmond has no manager -> unassigned.
  const result = m.buildLocationRecipientMap(managers, ['Edmond', 'Bixby', 'Owasso']);

  // map is sorted by location and emails are deduped + sorted
  assert.deepEqual(Array.from(result.map.map((e) => e.location)), ['Bixby', 'Edmond', 'Owasso']);
  assert.deepEqual(Array.from(result.map[0].emails), ['bob@r.com', 'jane@r.com']); // Bixby
  assert.deepEqual(Array.from(result.map[1].emails), []);                          // Edmond
  assert.deepEqual(Array.from(result.map[2].emails), ['jane@r.com']);              // Owasso (deduped)

  // Edmond had data but no recipient -> flagged; Bixby/Owasso are covered
  assert.deepEqual(Array.from(result.unassigned), ['Edmond']);
});

test('buildLocationRecipientMap handles empty/missing inputs', () => {
  const empty = m.buildLocationRecipientMap(null, null);
  assert.deepEqual(Array.from(empty.map), []);
  assert.deepEqual(Array.from(empty.unassigned), []);
});

test('qualifiesForRecap: under forecast >3% AND over scheduled >=5%, no clockouts, not new', () => {
  const loc = { sales: 950, forecastVariance: -50, schHrs: 100, actHrs: 106, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), true);
});

test('qualifiesForRecap: trivial forecast miss (<=3%) does not qualify', () => {
  const loc = { sales: 980, forecastVariance: -20, schHrs: 100, actHrs: 110, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), false);
});

test('qualifiesForRecap: hours under threshold does not qualify', () => {
  const loc = { sales: 900, forecastVariance: -100, schHrs: 100, actHrs: 104, isNewStore: false };
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

test('qualifiesForRecap: exactly 5% over scheduled qualifies (miss >3%)', () => {
  // forecast 1000, sales 950 (-5% miss); scheduled 100, actual 105 (exactly +5%)
  const loc = { sales: 950, forecastVariance: -50, schHrs: 100, actHrs: 105, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), true);
});

test('qualifiesForRecap: exactly 3% under forecast does NOT qualify', () => {
  // forecast 1000, sales 970 (exactly -3%); scheduled 100, actual 110 (+10%)
  const loc = { sales: 970, forecastVariance: -30, schHrs: 100, actHrs: 110, isNewStore: false };
  assert.equal(m.qualifiesForRecap(loc, 0, 0.03, 0.05), false);
});
