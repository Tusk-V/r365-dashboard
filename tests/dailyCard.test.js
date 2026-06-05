const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDailyCards } = require('../lib/dailyCard');

// Minimal sheet rows: [date, location, sales, paySales, salesVar, forecastVar, guests]
const rows = [
  ['6/4/2026', 'Bixby', '5209', '', '', '409', '435'],   // forecast 4800 -> +8.5%
  ['6/4/2026', 'Allen', '3521', '', '', '-879', '323'],  // forecast 4400 -> -19.98%
  ['6/4/2026', "Hunter's Creek", '2226', '', '', '-574', '189'], // ramp-up, big miss
  ['5/28/2026', 'Bixby', '5000', '', '', '0', '400'],    // prior Thursday (history)
  ['6/4/2026', 'Nowhere', '100', '', '', '0', '10'],     // unknown store -> ignored
];

test('builds one card per KNOWN store with data on the date', () => {
  const cards = buildDailyCards(rows, '6/4/2026');
  const stores = cards.map(c => c.store).sort();
  assert.deepEqual(stores, ['Allen', 'Bixby', "Hunter's Creek"]);
});

test('maps stores to their loc: channel keys', () => {
  const byStore = Object.fromEntries(buildDailyCards(rows, '6/4/2026').map(c => [c.store, c.channelKey]));
  assert.equal(byStore['Bixby'], 'loc:bixby');
  assert.equal(byStore['Allen'], 'loc:allen');
  assert.equal(byStore["Hunter's Creek"], 'loc:hunters-creek');
});

test('forecast = sales - forecastVariance; delta sign + wording', () => {
  const bixby = buildDailyCards(rows, '6/4/2026').find(c => c.store === 'Bixby');
  assert.equal(Math.round(bixby.forecast), 4800);
  assert.ok(bixby.deltaPct > 8 && bixby.deltaPct < 9);
  assert.match(bixby.body, /over forecast ✅/);
  assert.match(bixby.body, /📈 \+8\.5% over forecast/);

  const allen = buildDailyCards(rows, '6/4/2026').find(c => c.store === 'Allen');
  assert.ok(allen.deltaPct < 0);
  assert.match(allen.body, /under forecast/);
  assert.match(allen.body, /📉 −/); // unicode minus, no green check
  assert.doesNotMatch(allen.body, /✅/);
});

test('ramp-up store gets encouraging copy even on a big miss', () => {
  const hc = buildDailyCards(rows, '6/4/2026').find(c => c.store === "Hunter's Creek");
  assert.ok(hc.deltaPct < -15);
  assert.match(hc.body, /🌱/); // softened ramp-up nudge, not a harsh line
});

test('guest comparison appears when same-weekday history exists, omitted otherwise', () => {
  const bixby = buildDailyCards(rows, '6/4/2026').find(c => c.store === 'Bixby');
  assert.match(bixby.body, /👥 435 guests \(/); // has (+/-N%) vs prior Thursday
  const allen = buildDailyCards(rows, '6/4/2026').find(c => c.store === 'Allen');
  assert.match(allen.body, /👥 323 guests$/m); // no history -> no comparison
});

test('a date with no rows yields no cards', () => {
  assert.deepEqual(buildDailyCards(rows, '1/1/2026'), []);
});
