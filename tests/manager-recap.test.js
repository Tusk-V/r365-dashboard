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

test('buildManagerPrompt includes name + recap invite always, escalation only when flagged', () => {
  const flagged = m.buildManagerPrompt('Jane', [{ store: 'Bixby', missedForecastAndOverScheduled: true, isNewStore: false }]);
  assert.ok(flagged.includes('Jane'));
  assert.ok(flagged.includes('quick reply recapping'));
  assert.ok(flagged.includes('help me understand the day'));

  const clean = m.buildManagerPrompt('Jane', [{ store: 'Bixby', missedForecastAndOverScheduled: false, isNewStore: false }]);
  assert.ok(clean.includes('quick reply recapping'));
  assert.ok(!clean.includes('help me understand the day'));
});
