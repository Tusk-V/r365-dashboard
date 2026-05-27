// Integration tests for buildPredictionForDate — the core prediction call.
//
// These exercise the prediction surface end-to-end with fixtures, covering
// every method path (pw / blend / pw+holiday / holiday / avg / insufficient)
// and the outlier-rejection logic added in 9a4734e.
//
// Return shape (16 elements):
//   [0] targetKey      [8]  tempDiff
//   [1] location       [9]  condChange
//   [2] predicted      [10] method
//   [3-5] empty        [11] dowConfidence
//   [6] baseline       [12] versionLabel
//   [7] weatherAdjPct  [13] generatedAt
//                      [14] holiday
//                      [15] predictedNoMom

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppsScriptFiles } = require('./helpers/loadAppsScript');

const m = loadAppsScriptFiles('Modelforecast.js');

// Field-name indices for readability.
const IDX = {
  targetKey: 0, location: 1, predicted: 2, baseline: 6,
  weatherAdjPct: 7, tempDiff: 8, condChange: 9, method: 10,
  dowConfidence: 11, versionLabel: 12, holiday: 14, predictedNoMom: 15
};

// Build a fixture sales map keyed as `${location}|${M/D/YYYY}`. Each entry
// has the shape buildPredictionForDate expects: { sales, temp, conditions }.
function fixture(location, entries) {
  const out = {};
  for (const e of entries) {
    const key = location + '|' + m.normalizeDateForModel(e.date);
    out[key] = { sales: e.sales, temp: e.temp ?? null, conditions: e.conditions ?? '' };
  }
  return out;
}

// Default arguments — buildPredictionForDate takes 8 args.
function defaultCoefs() { return m.buildDefaultCoefficientStructure(); }
function noMultipliers() { return {}; }
function noDOW() { return {}; }

// ---------------------------------------------------------------------------
// Path: pw — PW sales exist and within tolerance, same weather as target
//
// Note: even at identical temperatures the model applies a baseline
// `temp_similar` coefficient (default 0.040) — small upward drift built into
// the bucket. So same-temp same-conditions → +4% adjustment, not 0%.
// ---------------------------------------------------------------------------
test('predicts using PW sales when prior week matches and weather is similar', () => {
  const target = new Date(2026, 4, 27); // Wed May 27 2026
  const pw = new Date(2026, 4, 20);     // Wed May 20 2026
  // Build 8+ weeks of similar prior same-DOW samples so outlier check has data.
  const entries = [{ date: pw, sales: 5000, temp: 75, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pw);
    d.setDate(d.getDate() - 7 * (w - 1));
    entries.push({ date: d, sales: 5000 + (w * 10), temp: 75, conditions: 'Sunny' });
  }
  // Target day weather: same as PW.
  entries.push({ date: target, sales: 0, temp: 75, conditions: 'Sunny' });
  const sales = fixture('Bixby', entries);

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), noMultipliers(), noDOW(), null, null
  );

  assert.equal(out[IDX.location], 'Bixby');
  assert.equal(out[IDX.targetKey], '5/27/2026');
  assert.equal(out[IDX.method], 'pw');
  assert.equal(out[IDX.baseline], 5000);
  assert.equal(out[IDX.tempDiff], 0);
  // temp_similar default = 0.040 → +4% baseline lift
  assert.equal(out[IDX.weatherAdjPct], 4);
  assert.equal(out[IDX.predicted], 5200); // 5000 * 1.04
  assert.equal(out[IDX.holiday], '');
});

// ---------------------------------------------------------------------------
// Path: pw — warmer target day applies positive temp coefficient
// ---------------------------------------------------------------------------
test('applies positive temp coefficient when target is warmer than PW', () => {
  const target = new Date(2026, 4, 27);
  const pw = new Date(2026, 4, 20);
  const entries = [{ date: pw, sales: 5000, temp: 70, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pw);
    d.setDate(d.getDate() - 7 * (w - 1));
    entries.push({ date: d, sales: 5000, temp: 70, conditions: 'Sunny' });
  }
  // Target 7° warmer → temp_5to10 bucket → default coef = 0.024.
  entries.push({ date: target, sales: 0, temp: 77, conditions: 'Sunny' });
  const sales = fixture('Bixby', entries);

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), noMultipliers(), noDOW(), null, null
  );

  assert.equal(out[IDX.method], 'pw');
  assert.equal(out[IDX.tempDiff], 7);
  assert.equal(out[IDX.weatherAdjPct], 2); // 0.024 → rounded to 2%
  // 5000 * 1.024 = 5120
  assert.equal(out[IDX.predicted], 5120);
});

// ---------------------------------------------------------------------------
// Path: pw — rain-new transition (dry PW → rainy target) subtracts coef
// ---------------------------------------------------------------------------
test('applies rain_new penalty on dry→rain transition', () => {
  const target = new Date(2026, 4, 27);
  const pw = new Date(2026, 4, 20);
  const entries = [{ date: pw, sales: 5000, temp: 75, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pw);
    d.setDate(d.getDate() - 7 * (w - 1));
    entries.push({ date: d, sales: 5000, temp: 75, conditions: 'Sunny' });
  }
  entries.push({ date: target, sales: 0, temp: 75, conditions: 'Heavy rain' });
  const sales = fixture('Bixby', entries);

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), noMultipliers(), noDOW(), null, null
  );

  assert.equal(out[IDX.method], 'pw');
  assert.equal(out[IDX.condChange], 'Dry→Rain');
  // temp_similar (0.040) + rain_new (-0.133) = -0.093, rounded to -9%
  assert.equal(out[IDX.weatherAdjPct], -9);
  // 5000 * (1 - 0.093) = 4535
  assert.equal(out[IDX.predicted], 4535);
});

// ---------------------------------------------------------------------------
// Path: blend — PW outlier triggers blend with median of past 8 weeks
// ---------------------------------------------------------------------------
test('blends PW with median when PW deviates by > outlier_threshold', () => {
  const target = new Date(2026, 4, 27);
  const pw = new Date(2026, 4, 20);
  // PW spike: 10000 vs typical 5000 → 100% deviation, well above 0.30 threshold.
  const entries = [{ date: pw, sales: 10000, temp: 75, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pw);
    d.setDate(d.getDate() - 7 * (w - 1));
    entries.push({ date: d, sales: 5000, temp: 75, conditions: 'Sunny' });
  }
  entries.push({ date: target, sales: 0, temp: 75, conditions: 'Sunny' });
  const sales = fixture('Bixby', entries);

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), noMultipliers(), noDOW(), null, null
  );

  assert.equal(out[IDX.method], 'blend');
  // Default outlier_pw_weight = 0.60 → 10000*0.60 + 5000*0.40 = 8000 baseline.
  // Then temp_similar applies (+4%): 8000 * 1.04 = 8320.
  assert.equal(out[IDX.baseline], 8000);
  assert.equal(out[IDX.predicted], 8320);
});

// ---------------------------------------------------------------------------
// Path: holiday — uses median × multiplier instead of PW when avgCount >= 2
// ---------------------------------------------------------------------------
test('uses holiday multiplier path when target is a known holiday', () => {
  // July 4 2026 is a Saturday. Use Sat history.
  const target = new Date(2026, 6, 4);
  // 8 prior Saturdays (none of which are holidays). May 23, May 30, etc.
  const pw = new Date(2026, 5, 27); // Sat
  const entries = [{ date: pw, sales: 7000, temp: 85, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pw);
    d.setDate(d.getDate() - 7 * (w - 1));
    entries.push({ date: d, sales: 7000, temp: 85, conditions: 'Sunny' });
  }
  entries.push({ date: target, sales: 0, temp: 85, conditions: 'Sunny' });
  const sales = fixture('Bixby', entries);

  // getHolidayMultiplier expects a scoped structure: location | market | global.
  // Location-level requires samples >= MIN_LOCATION_SAMPLES (3).
  const multipliers = {
    location: { Bixby: { 'July 4th': { multiplier: 1.4, samples: 5 } } },
    market: {},
    global: {}
  };

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), multipliers, noDOW(), null, null
  );

  assert.equal(out[IDX.method], 'holiday');
  assert.equal(out[IDX.holiday], 'July 4th');
  // Holiday path: predicted = median * hMult (NO temp adj applied on this branch).
  // 7000 * 1.4 = 9800
  assert.equal(out[IDX.predicted], 9800);
});

test('holiday multiplier falls back to market scope when location samples are thin', () => {
  const target = new Date(2026, 6, 4);
  const pw = new Date(2026, 5, 27);
  const entries = [{ date: pw, sales: 7000, temp: 85, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pw);
    d.setDate(d.getDate() - 7 * (w - 1));
    entries.push({ date: d, sales: 7000, temp: 85, conditions: 'Sunny' });
  }
  entries.push({ date: target, sales: 0, temp: 85, conditions: 'Sunny' });
  const sales = fixture('Bixby', entries);

  // Location-level has only 2 samples (below MIN_LOCATION_SAMPLES=3) → falls
  // back to market-level multiplier.
  const multipliers = {
    location: { Bixby: { 'July 4th': { multiplier: 1.4, samples: 2 } } },
    market: { Tulsa: { 'July 4th': { multiplier: 1.25 } } },
    global: {}
  };

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), multipliers, noDOW(), null, null
  );

  assert.equal(out[IDX.method], 'holiday');
  // 7000 * 1.25 = 8750 (market-level multiplier used)
  assert.equal(out[IDX.predicted], 8750);
});

// ---------------------------------------------------------------------------
// Path: holiday with no learned multiplier — falls through (no special path)
// ---------------------------------------------------------------------------
test('holiday with multiplier=1.0 keeps the PW prediction unchanged', () => {
  const target = new Date(2026, 6, 4); // July 4
  const pw = new Date(2026, 5, 27);
  const entries = [{ date: pw, sales: 7000, temp: 85, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pw);
    d.setDate(d.getDate() - 7 * (w - 1));
    entries.push({ date: d, sales: 7000, temp: 85, conditions: 'Sunny' });
  }
  entries.push({ date: target, sales: 0, temp: 85, conditions: 'Sunny' });
  const sales = fixture('Bixby', entries);

  // No multiplier learned → getHolidayMultiplier returns 1.0 default.
  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), {}, noDOW(), null, null
  );

  // Multiplier 1.0 path: stays as 'pw' method with the holiday tag set.
  // Temp_similar baseline still applies: 7000 * 1.04 = 7280.
  assert.equal(out[IDX.method], 'pw');
  assert.equal(out[IDX.holiday], 'July 4th');
  assert.equal(out[IDX.predicted], 7280);
});

// ---------------------------------------------------------------------------
// Path: avg — no PW, but past samples exist → uses median fallback
// ---------------------------------------------------------------------------
test('falls back to median when PW is missing but history exists', () => {
  const target = new Date(2026, 4, 27);
  // Skip pw (May 20) — no entry → triggers avg path.
  const entries = [];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(target);
    d.setDate(d.getDate() - 7 * w);
    entries.push({ date: d, sales: 5000, temp: 70, conditions: 'Sunny' });
  }
  // Target day: 75°F sunny.
  entries.push({ date: target, sales: 0, temp: 75, conditions: 'Sunny' });
  const sales = fixture('Bixby', entries);

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), noMultipliers(), noDOW(), null, null
  );

  assert.equal(out[IDX.method], 'avg');
  assert.equal(out[IDX.baseline], 5000); // median of 7 identical samples
  // Avg path uses a simple weather rule (diff=0 against ideal 75 → +4%).
  // 5000 * 1.04 = 5200
  assert.equal(out[IDX.predicted], 5200);
});

// ---------------------------------------------------------------------------
// Path: insufficient — no PW, no past samples
// ---------------------------------------------------------------------------
test('returns insufficient when there is no usable history', () => {
  const target = new Date(2026, 4, 27);
  const sales = {}; // nothing

  const out = m.buildPredictionForDate(
    'Bixby', target, sales, defaultCoefs(), noMultipliers(), noDOW(), null, null
  );

  assert.equal(out[IDX.method], 'insufficient');
  assert.equal(out[IDX.predicted], 0);
  assert.equal(out[IDX.baseline], 0);
  assert.equal(out[IDX.dowConfidence], 'low');
});

// ---------------------------------------------------------------------------
// Holiday-clean baselines (9a4734e): past holiday samples MUST be excluded
// from the 8-week median used for outlier detection.
// ---------------------------------------------------------------------------
test('outlier median excludes past holiday samples', () => {
  // Target: Mon May 25 2026 = Memorial Day. But we want a non-holiday target
  // to keep this test focused on the outlier-median path.
  // Use Sat May 23 2026 with one of the lookback weeks falling on a holiday.
  const target = new Date(2026, 4, 23); // Sat May 23
  const pw = new Date(2026, 4, 16);     // Sat May 16
  // Holiday Sat: Dec 25, 2025 was Thu — but Sat July 4 2026 is in FUTURE.
  // Use the 7th lookback (April 4) — fine, but we need a Sat that hits a
  // holiday. Pick: target = Sat Jan 3 2026, PW = Dec 27 2025. Then w=2 lookback
  // is Dec 20, w=3 is Dec 13... actually Christmas 12/25 falls on Thu, so the
  // Sat lookbacks won't hit it.
  //
  // Simpler: insert a fake "holiday" sample by placing target on a date whose
  // lookbacks include New Year's Day. Target = Fri Jan 8 2026. PW = Fri Jan 1
  // 2026 = New Year's Day (holiday). That actually tests the PW=holiday case,
  // not what we want.
  //
  // What we want: PW is normal but one of the FURTHER lookback weeks (w>=2)
  // is a holiday and must be excluded.
  // Target = Wed Jan 7 2026. PW = Wed Dec 31 2025 = New Year's Eve (HOLIDAY!).
  // Lookbacks: w=2 → Dec 24 = Christmas Eve (HOLIDAY!), w=3 → Dec 17 normal...
  //
  // Cleanest: target = Wed Dec 30 2026. PW = Wed Dec 23 2026 = normal.
  // Lookbacks: w=2 → Dec 16 normal, w=3 → Dec 9, w=4 → Dec 2, w=5 → Nov 25
  // = day before Thanksgiving (just normal — Thanksgiving is Thu Nov 26).
  // No holidays in lookback. Not useful.
  //
  // Use target = Fri Jan 9 2026 (normal). PW = Fri Jan 2 2026 (normal).
  // Lookback w=2 → Dec 26 2025 normal, w=3 → Dec 19 normal, w=4 → Dec 12 normal,
  // w=5 → Dec 5, w=6 → Nov 28 (day after Thanksgiving), w=7 → Nov 21, w=8 → Nov 14.
  // None hit a fixed holiday — let me check Christmas itself: Dec 25 2025 = Thu, so
  // for Friday target, the same-DOW lookbacks don't land on Dec 25.
  //
  // Best move: target = Sat Dec 26 2026. PW = Sat Dec 19 2026 (normal).
  // Lookback w=2 → Dec 12, w=3 → Dec 5, w=4 → Nov 28 (day after Thanksgiving — NOT
  // a holiday per the model), w=5 → Nov 21 ... no fixed holiday hits.
  //
  // Easiest of all: target = Wed Jan 7 2026, place PW outlier high (10000)
  // and the prior 7 lookbacks at 5000. Verify blend triggers. THEN run a
  // second scenario where one of those lookbacks is a holiday with sales=50000.
  // If holiday-clean works, the median is unchanged. If broken, median jumps.
  //
  // Target: Wed Mar 18 2026. PW: Wed Mar 11 2026 (inside spring break halo →
  // halo days flagged as holiday; let's avoid). Use Wed Apr 1 2026.
  // PW = Wed Mar 25 2026. Lookback w=2 = Wed Mar 18 (NOT spring break - SB
  // is Mon 3/9 - Fri 3/13 plus halos 3/6 and 3/16). w=2 = 3/18 = normal.
  // w=3 = 3/11 = SPRING BREAK (holiday for our model).
  //
  // Insert a huge sales spike at the holiday lookback. If excluded, median = 5000.
  // If included, median shifts.

  const targetT = new Date(2026, 3, 1); // Wed Apr 1 2026
  const pwT = new Date(2026, 2, 25);    // Wed Mar 25 2026
  // PW high (outlier candidate)
  const entriesT = [{ date: pwT, sales: 10000, temp: 75, conditions: 'Sunny' }];
  for (let w = 2; w <= 8; w++) {
    const d = new Date(pwT);
    d.setDate(d.getDate() - 7 * (w - 1));
    // w=3 (Wed Mar 11) lands inside spring break.
    const isSpringBreak = m.getModelHoliday(d) !== null;
    entriesT.push({
      date: d,
      sales: isSpringBreak ? 50000 : 5000, // inject huge holiday spike
      temp: 75,
      conditions: 'Sunny'
    });
  }
  entriesT.push({ date: targetT, sales: 0, temp: 75, conditions: 'Sunny' });

  // Sanity: confirm w=3 lookback is actually a holiday in our fixture.
  const w3 = new Date(pwT);
  w3.setDate(w3.getDate() - 14); // = Mar 11
  assert.equal(m.getModelHoliday(w3), 'Spring Break',
    'fixture assumption broken: Mar 11 2026 should be Spring Break');

  const salesT = fixture('Bixby', entriesT);
  const out = m.buildPredictionForDate(
    'Bixby', targetT, salesT, defaultCoefs(), noMultipliers(), noDOW(), null, null
  );

  // If holiday-clean works: median = 5000, PW deviation = 100% > 35% → blend
  // PW*0.60 + median*0.40 = 10000*0.60 + 5000*0.40 = 8000.
  // If holiday-clean broken: 50k contaminates median, PW no longer flagged
  // as outlier, result would be 10000.
  assert.equal(out[IDX.method], 'blend',
    'PW outlier blending should still fire — the holiday spike must be excluded');
  assert.equal(out[IDX.baseline], 8000,
    'median should be holiday-clean (5000), blended with PW (10000) at 60/40');
});

// ---------------------------------------------------------------------------
// versionLabel reflects market+season
// ---------------------------------------------------------------------------
test('versionLabel encodes market and season', () => {
  const target = new Date(2026, 6, 15); // Q3, Bixby = Tulsa
  const out = m.buildPredictionForDate(
    'Bixby', target, {}, defaultCoefs(), {}, {}, null, null
  );
  assert.match(out[IDX.versionLabel], /:Tulsa\/Q3$/);
});
