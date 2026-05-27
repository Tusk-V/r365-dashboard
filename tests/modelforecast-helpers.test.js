// Unit tests for the pure helpers in apps-script/Modelforecast.js.
//
// These pin down the recent forecast-hygiene work (holiday-clean baselines,
// market+season coefficient fallback hierarchy, robust median sampling,
// temp-bucket boundaries) so future tuning has a regression net.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAppsScriptFiles } = require('./helpers/loadAppsScript');

const m = loadAppsScriptFiles('Modelforecast.js');

// ---------------------------------------------------------------------------
// computeEaster — pure Anonymous Gregorian algorithm
// ---------------------------------------------------------------------------
test('computeEaster returns known Easter dates', () => {
  // Verified against external sources (US Naval Observatory).
  const e2024 = m.computeEaster(2024);
  assert.equal(e2024.getMonth() + 1, 3);
  assert.equal(e2024.getDate(), 31);

  const e2025 = m.computeEaster(2025);
  assert.equal(e2025.getMonth() + 1, 4);
  assert.equal(e2025.getDate(), 20);

  const e2026 = m.computeEaster(2026);
  assert.equal(e2026.getMonth() + 1, 4);
  assert.equal(e2026.getDate(), 5);
});

// ---------------------------------------------------------------------------
// getModelHoliday — fixed + computed holidays
// ---------------------------------------------------------------------------
test('getModelHoliday returns fixed holidays', () => {
  assert.equal(m.getModelHoliday(new Date(2026, 6, 4)), 'July 4th');
  assert.equal(m.getModelHoliday(new Date(2026, 11, 25)), 'Christmas Day');
  assert.equal(m.getModelHoliday(new Date(2026, 9, 31)), 'Halloween');
  assert.equal(m.getModelHoliday(new Date(2026, 1, 14)), "Valentine's Day");
});

test('getModelHoliday returns null for ordinary days', () => {
  assert.equal(m.getModelHoliday(new Date(2026, 2, 4)), null);
  assert.equal(m.getModelHoliday(new Date(2026, 7, 15)), null);
});

test('getModelHoliday detects Thanksgiving (4th Thursday of Nov)', () => {
  // 2026: Nov 26
  assert.equal(m.getModelHoliday(new Date(2026, 10, 26)), 'Thanksgiving');
  // 2024: Nov 28
  assert.equal(m.getModelHoliday(new Date(2024, 10, 28)), 'Thanksgiving');
});

test('getModelHoliday detects Memorial Day (last Mon of May)', () => {
  // 2026: May 25 (Monday)
  assert.equal(m.getModelHoliday(new Date(2026, 4, 25)), 'Memorial Day');
});

test('getModelHoliday detects Labor Day (1st Mon of Sep)', () => {
  // 2026: Sep 7
  assert.equal(m.getModelHoliday(new Date(2026, 8, 7)), 'Labor Day');
});

test("getModelHoliday detects Mother's Day and Father's Day", () => {
  // 2026 Mother's Day: May 10. Father's Day: Jun 21.
  assert.equal(m.getModelHoliday(new Date(2026, 4, 10)), "Mother's Day");
  assert.equal(m.getModelHoliday(new Date(2026, 5, 21)), "Father's Day");
});

test('getModelHoliday returns Easter on the computed date', () => {
  // Easter 2026 = April 5.
  assert.equal(m.getModelHoliday(new Date(2026, 3, 5)), 'Easter');
});

test('getModelHoliday rejects invalid input', () => {
  assert.equal(m.getModelHoliday(null), null);
  assert.equal(m.getModelHoliday(new Date('not a date')), null);
  assert.equal(m.getModelHoliday('2026-07-04'), null);
});

// ---------------------------------------------------------------------------
// Spring break — config-driven, halo-aware
// ---------------------------------------------------------------------------
test('getSpringBreakLabel handles configured range', () => {
  // Config: 2026 spring break = 3/9–3/13 (Mon-Fri).
  assert.equal(m.getSpringBreakLabel(new Date(2026, 2, 9)), 'Spring Break');
  assert.equal(m.getSpringBreakLabel(new Date(2026, 2, 11)), 'Spring Break');
  assert.equal(m.getSpringBreakLabel(new Date(2026, 2, 13)), 'Spring Break');
  // Halo days: Friday before (3/6) and Monday after (3/16).
  assert.equal(m.getSpringBreakLabel(new Date(2026, 2, 6)), 'Spring Break (halo)');
  assert.equal(m.getSpringBreakLabel(new Date(2026, 2, 16)), 'Spring Break (halo)');
  // Outside window
  assert.equal(m.getSpringBreakLabel(new Date(2026, 2, 5)), null);
  assert.equal(m.getSpringBreakLabel(new Date(2026, 2, 17)), null);
  // Unconfigured year
  assert.equal(m.getSpringBreakLabel(new Date(2024, 2, 11)), null);
});

// ---------------------------------------------------------------------------
// isHolidayAdjacent — halo day detection for tuning exclusion
// ---------------------------------------------------------------------------
test('isHolidayAdjacent flags day-before and day-after holidays', () => {
  // July 4 2026 (Sat). Day before (Jul 3 Fri) and day after (Jul 5 Sun) both true.
  assert.equal(m.isHolidayAdjacent(new Date(2026, 6, 3)), true);
  assert.equal(m.isHolidayAdjacent(new Date(2026, 6, 4)), true);
  assert.equal(m.isHolidayAdjacent(new Date(2026, 6, 5)), true);
  // Two days out: not adjacent.
  assert.equal(m.isHolidayAdjacent(new Date(2026, 6, 6)), false);
  assert.equal(m.isHolidayAdjacent(new Date(2026, 6, 2)), false);
});

// ---------------------------------------------------------------------------
// Market + season lookups
// ---------------------------------------------------------------------------
test('getMarketForLocation maps known locations', () => {
  assert.equal(m.getMarketForLocation('Bixby'), 'Tulsa');
  assert.equal(m.getMarketForLocation('Frisco #2'), 'Dallas');
  assert.equal(m.getMarketForLocation('Norman'), 'OKC');
  assert.equal(m.getMarketForLocation("Hunter's Creek"), 'Orlando');
});

test('getMarketForLocation returns Unknown for unmapped locations', () => {
  assert.equal(m.getMarketForLocation('Atlantis'), 'Unknown');
  assert.equal(m.getMarketForLocation(''), 'Unknown');
});

test('getSeasonForDate maps quarters correctly', () => {
  assert.equal(m.getSeasonForDate(new Date(2026, 0, 15)), 'Q1');
  assert.equal(m.getSeasonForDate(new Date(2026, 2, 31)), 'Q1');
  assert.equal(m.getSeasonForDate(new Date(2026, 3, 1)), 'Q2');
  assert.equal(m.getSeasonForDate(new Date(2026, 5, 30)), 'Q2');
  assert.equal(m.getSeasonForDate(new Date(2026, 6, 1)), 'Q3');
  assert.equal(m.getSeasonForDate(new Date(2026, 8, 30)), 'Q3');
  assert.equal(m.getSeasonForDate(new Date(2026, 9, 1)), 'Q4');
  assert.equal(m.getSeasonForDate(new Date(2026, 11, 31)), 'Q4');
});

test('getSeasonForDate defaults to Q1 for invalid input', () => {
  assert.equal(m.getSeasonForDate(null), 'Q1');
  assert.equal(m.getSeasonForDate(new Date('garbage')), 'Q1');
});

// ---------------------------------------------------------------------------
// Coefficient fallback hierarchy — market+season → market avg → global default
// ---------------------------------------------------------------------------
test('getCoefficient returns market+season value when present', () => {
  const coefs = {
    Tulsa: { Q2: { temp_5to10: 0.12 } }
  };
  assert.equal(m.getCoefficient(coefs, 'Tulsa', 'Q2', 'temp_5to10'), 0.12);
});

test('getCoefficient averages across seasons when target season is missing', () => {
  const coefs = {
    Tulsa: {
      Q1: { rain_new: -0.10 },
      Q2: { rain_new: -0.20 },
      Q3: { /* missing */ },
      Q4: { rain_new: -0.30 }
    }
  };
  // Q3 has no rain_new — should average Q1+Q2+Q4 = (-0.10 + -0.20 + -0.30)/3 = -0.20
  const got = m.getCoefficient(coefs, 'Tulsa', 'Q3', 'rain_new');
  assert.equal(Math.round(got * 100) / 100, -0.20);
});

test('getCoefficient falls back to global default when market is missing', () => {
  // Default for rain_new is -0.133 per MODEL_CONFIG.
  const got = m.getCoefficient({}, 'Atlantis', 'Q2', 'rain_new');
  assert.equal(got, -0.133);
});

test('getCoefficient returns 0 for unknown keys with no default', () => {
  assert.equal(m.getCoefficient({}, 'Tulsa', 'Q2', 'made_up_key'), 0);
});

// ---------------------------------------------------------------------------
// Temperature bucketing — boundaries matter (these are the keys used to look
// up coefficients during prediction)
// ---------------------------------------------------------------------------
test('getModelTempBucket honors bucket boundaries', () => {
  assert.equal(m.getModelTempBucket(20), 'temp_15plus');
  assert.equal(m.getModelTempBucket(15), 'temp_15plus');
  assert.equal(m.getModelTempBucket(14.99), 'temp_10to15');
  assert.equal(m.getModelTempBucket(10), 'temp_10to15');
  assert.equal(m.getModelTempBucket(9.99), 'temp_5to10');
  assert.equal(m.getModelTempBucket(5), 'temp_5to10');
  assert.equal(m.getModelTempBucket(4.99), 'temp_3to5');
  assert.equal(m.getModelTempBucket(3), 'temp_3to5');
  assert.equal(m.getModelTempBucket(2.99), 'temp_similar');
  assert.equal(m.getModelTempBucket(0), 'temp_similar');
  assert.equal(m.getModelTempBucket(-2.99), 'temp_similar');
  assert.equal(m.getModelTempBucket(-3), 'temp_neg3to5');
  assert.equal(m.getModelTempBucket(-4.99), 'temp_neg3to5');
  assert.equal(m.getModelTempBucket(-5), 'temp_neg5to10');
  assert.equal(m.getModelTempBucket(-9.99), 'temp_neg5to10');
  assert.equal(m.getModelTempBucket(-10), 'temp_neg10to15');
  assert.equal(m.getModelTempBucket(-14.99), 'temp_neg10to15');
  assert.equal(m.getModelTempBucket(-15), 'temp_neg15plus');
  assert.equal(m.getModelTempBucket(-25), 'temp_neg15plus');
});

// ---------------------------------------------------------------------------
// isModelRainy — substring match across keywords
// ---------------------------------------------------------------------------
test('isModelRainy detects rain-related conditions', () => {
  assert.equal(m.isModelRainy('Light rain'), true);
  assert.equal(m.isModelRainy('Heavy thunderstorm'), true);
  assert.equal(m.isModelRainy('Scattered showers'), true);
  assert.equal(m.isModelRainy('Drizzle'), true);
  assert.equal(m.isModelRainy('Freezing rain'), true);
  assert.equal(m.isModelRainy('FREEZING DRIZZLE'), true);
});

test('isModelRainy returns false for non-rain conditions', () => {
  assert.equal(m.isModelRainy('Sunny'), false);
  assert.equal(m.isModelRainy('Partly cloudy'), false);
  assert.equal(m.isModelRainy('Clear'), false);
  assert.equal(m.isModelRainy(''), false);
  assert.equal(m.isModelRainy(null), false);
  assert.equal(m.isModelRainy(undefined), false);
});

// ---------------------------------------------------------------------------
// normalizeDateForModel — keys used to look up sales data
// ---------------------------------------------------------------------------
test('normalizeDateForModel formats Date as M/D/YYYY', () => {
  assert.equal(m.normalizeDateForModel(new Date(2026, 4, 27)), '5/27/2026');
  assert.equal(m.normalizeDateForModel(new Date(2026, 0, 1)), '1/1/2026');
  assert.equal(m.normalizeDateForModel(new Date(2026, 11, 31)), '12/31/2026');
});

test('normalizeDateForModel parses common date strings', () => {
  assert.equal(m.normalizeDateForModel('2026-05-27T12:00:00'), '5/27/2026');
  assert.equal(m.normalizeDateForModel('5/27/2026'), '5/27/2026');
});

test('normalizeDateForModel returns empty string for empty input', () => {
  assert.equal(m.normalizeDateForModel(''), '');
  assert.equal(m.normalizeDateForModel(null), '');
  assert.equal(m.normalizeDateForModel(undefined), '');
});

// ---------------------------------------------------------------------------
// buildDefaultCoefficientStructure — the fallback structure
// ---------------------------------------------------------------------------
test('buildDefaultCoefficientStructure seeds every market+season with defaults', () => {
  const c = m.buildDefaultCoefficientStructure();
  for (const market of ['Tulsa', 'OKC', 'Dallas', 'Orlando']) {
    for (const season of ['Q1', 'Q2', 'Q3', 'Q4']) {
      assert.ok(c[market], `missing market ${market}`);
      assert.ok(c[market][season], `missing ${market}.${season}`);
      // All default keys present
      assert.equal(c[market][season].temp_15plus, 0.199);
      assert.equal(c[market][season].rain_new, -0.133);
      assert.equal(c[market][season].outlier_threshold, 0.30);
      // Per-cell meta exists
      assert.ok(c._meta[market][season]);
      assert.equal(c._meta[market][season].version, 1);
    }
  }
});

// ---------------------------------------------------------------------------
// MODEL_CONFIG sanity — these constants drive the whole hygiene story.
// If anyone changes them without a corresponding test update, that's a flag.
// ---------------------------------------------------------------------------
test('MODEL_CONFIG holiday + tuning thresholds match the hygiene contract', () => {
  // Locked in by 9a4734e, d79a40b, aba4e13. If you change one of these and
  // tests still pass, this test fails to remind you to update them deliberately.
  assert.equal(m.MODEL_CONFIG.HOLIDAY_MULTIPLIERS.MIN_LOCATION_SAMPLES, 3);
  assert.equal(m.MODEL_CONFIG.HOLIDAY_MULTIPLIERS.BASELINE_WINDOW_DAYS, 28);
  assert.equal(m.MODEL_CONFIG.TUNING.OUTLIER_REJECT_THRESHOLD, 0.35);
  assert.equal(m.MODEL_CONFIG.TUNING.MAX_SINGLE_MOVE, 0.10);
  assert.equal(m.MODEL_CONFIG.TUNING.MIN_SAMPLES_FOR_TUNE, 10);
  assert.equal(m.MODEL_CONFIG.MOMENTUM.CAP, 0); // momentum disabled per 62327dc
});

// ---------------------------------------------------------------------------
// computeMomentum — disabled (CAP=0) but the math should still be zero
// regardless of inputs. This locks in the disable.
// ---------------------------------------------------------------------------
test('computeMomentum returns 0 when CAP=0 (momentum disabled)', () => {
  const asOfDate = new Date(2026, 4, 27);
  // Build a salesByLocDate map with strongly positive recent momentum.
  const salesByLocDate = {};
  for (let i = 1; i <= 14; i++) {
    const d = new Date(asOfDate);
    d.setDate(d.getDate() - i);
    const key = 'Bixby|' + m.normalizeDateForModel(d);
    // Recent 7 days much higher than prior 7
    salesByLocDate[key] = { sales: i <= 7 ? 10000 : 5000 };
  }
  const got = m.computeMomentum('Bixby', asOfDate, salesByLocDate);
  assert.equal(got, 0);
});

test('computeMomentum returns 0 when insufficient samples', () => {
  const asOfDate = new Date(2026, 4, 27);
  const got = m.computeMomentum('Bixby', asOfDate, {});
  assert.equal(got, 0);
});
