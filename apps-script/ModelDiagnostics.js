// ============================================================================
// MODEL DIAGNOSTICS — read-only audits for the v6 forecast engine
//
// Functions:
//   auditCoefficientCoverage()  - Sample counts + drift per market×season×bucket
//   summarizeModelAccuracy()    - MAPE breakdowns by recency/location/method
//
// Both write to dedicated sheets and log a compact summary.
// Run manually from the editor when investigating model behavior.
// ============================================================================


// ============================================================================
// AUDIT: COEFFICIENT COVERAGE
// Shows where the auto-tuner has enough data to learn, and where it doesn't.
// Cells stuck at defaults forever are flagged so you know the model is using
// a heuristic, not a learned signal, for that slice.
// ============================================================================

function auditCoefficientCoverage() {
  Logger.log('=== Auditing Coefficient Coverage ===');

  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var modelSheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!modelSheet) { Logger.log('No Model Forecast sheet'); return; }

  var coefficients = loadModelCoefficients(ss);
  var data = modelSheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log('No data yet'); return; }

  var minSamples = MODEL_CONFIG.TUNING.MIN_SAMPLES_FOR_TUNE;
  var minRain = MODEL_CONFIG.TUNING.MIN_SAMPLES_FOR_RAIN;

  var bucketCounts = {};
  var rainCounts = {};

  for (var i = 1; i < data.length; i++) {
    var predicted = parseFloat(data[i][2]) || 0;
    var actual = parseFloat(data[i][3]) || 0;
    var tempDiff = data[i][8];
    var condChange = data[i][9] ? data[i][9].toString().trim() : '';
    var holidayFlag = (data[i].length > 14 && data[i][14]) ? data[i][14].toString().trim() : '';
    var method = data[i][10] ? data[i][10].toString().trim() : '';
    var location = data[i][1] ? data[i][1].toString().trim() : '';

    if (!predicted || !actual || predicted <= 0 || actual <= 0) continue;
    if (method === 'backfill' || method === 'insufficient') continue;

    var rowDate = new Date(data[i][0]);
    if (holidayFlag || isHolidayAdjacent(rowDate) || getSpringBreakLabel(rowDate)) continue;
    if (method.indexOf('holiday') >= 0) continue;
    if (tempDiff === '' || tempDiff === null || tempDiff === undefined) continue;

    tempDiff = parseFloat(tempDiff);
    if (isNaN(tempDiff)) continue;

    var market = getMarketForLocation(location);
    var season = getSeasonForDate(rowDate);
    var bucket = getModelTempBucket(tempDiff);

    if (!bucketCounts[market]) bucketCounts[market] = {};
    if (!bucketCounts[market][season]) bucketCounts[market][season] = {};
    bucketCounts[market][season][bucket] = (bucketCounts[market][season][bucket] || 0) + 1;

    if (condChange.indexOf('Rain') >= 0 || condChange.indexOf('Dry') >= 0) {
      if (!rainCounts[market]) rainCounts[market] = {};
      if (!rainCounts[market][season]) rainCounts[market][season] = { rain_new: 0, rain_cleared: 0 };
      if (condChange.indexOf('Dry') === 0) rainCounts[market][season].rain_new++;
      else if (condChange.indexOf('Rain') === 0) rainCounts[market][season].rain_cleared++;
    }
  }

  var defaults = MODEL_CONFIG.DEFAULT_COEFFICIENTS;
  var tempBuckets = [
    'temp_15plus', 'temp_10to15', 'temp_5to10', 'temp_3to5', 'temp_similar',
    'temp_neg3to5', 'temp_neg5to10', 'temp_neg10to15', 'temp_neg15plus'
  ];

  var sheet = ss.getSheetByName('Coefficient Audit');
  if (!sheet) sheet = ss.insertSheet('Coefficient Audit');
  sheet.clear();
  sheet.getRange(1, 1, 1, 8).setValues([['Market', 'Season', 'Coefficient', 'Current', 'Default', 'Drift', 'Samples', 'Status']]);
  sheet.setFrozenRows(1);

  var rows = [];
  var tuned = 0, stuckDefault = 0, insufficient = 0;
  var totalCells = 0;

  for (var mIdx = 0; mIdx < MODEL_CONFIG.ALL_MARKETS.length; mIdx++) {
    var mkt = MODEL_CONFIG.ALL_MARKETS[mIdx];
    for (var sIdx = 0; sIdx < MODEL_CONFIG.ALL_SEASONS.length; sIdx++) {
      var ssn = MODEL_CONFIG.ALL_SEASONS[sIdx];

      var keys = tempBuckets.concat(['rain_new', 'rain_cleared']);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        var current = (coefficients[mkt] && coefficients[mkt][ssn] && coefficients[mkt][ssn][key] !== undefined)
          ? coefficients[mkt][ssn][key] : defaults[key];
        var def = defaults[key];
        var drift = Math.round((current - def) * 1000) / 1000;

        var samples = 0;
        if (key === 'rain_new' || key === 'rain_cleared') {
          samples = (rainCounts[mkt] && rainCounts[mkt][ssn]) ? rainCounts[mkt][ssn][key] : 0;
        } else {
          samples = (bucketCounts[mkt] && bucketCounts[mkt][ssn] && bucketCounts[mkt][ssn][key]) || 0;
        }

        var threshold = (key === 'rain_new' || key === 'rain_cleared') ? minRain : minSamples;
        var status;
        if (Math.abs(drift) > 0.001) {
          status = 'tuned';
          tuned++;
        } else if (samples >= threshold) {
          status = 'at default (had data)';
          stuckDefault++;
        } else {
          status = 'insufficient samples';
          insufficient++;
        }
        totalCells++;

        rows.push([mkt, ssn, key, current, def, drift, samples, status]);
      }
    }
  }

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 8).setValues(rows);
  }

  var summaryRow = rows.length + 3;
  sheet.getRange(summaryRow, 1).setValue('SUMMARY');
  sheet.getRange(summaryRow, 1).setFontWeight('bold');
  sheet.getRange(summaryRow + 1, 1, 4, 2).setValues([
    ['Total cells', totalCells],
    ['Tuned (drifted from default)', tuned],
    ['At default despite having data', stuckDefault],
    ['Insufficient samples to tune', insufficient]
  ]);

  Logger.log('Coverage: ' + tuned + ' tuned / ' + stuckDefault + ' at default (had data) / ' + insufficient + ' insufficient — of ' + totalCells + ' cells');
  Logger.log('=== Coverage Audit Complete ===');
}


// ============================================================================
// SUMMARY: MODEL ACCURACY
// MAPE-style breakdowns. Useful for answering "is the model actually getting
// better?" and "which slices are worst?" without scrolling through the sheet.
// ============================================================================

function summarizeModelAccuracy() {
  Logger.log('=== Summarizing Model Accuracy ===');

  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var modelSheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!modelSheet) { Logger.log('No Model Forecast sheet'); return; }

  var data = modelSheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log('No data yet'); return; }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var c7 = new Date(today);  c7.setDate(c7.getDate() - 7);
  var c28 = new Date(today); c28.setDate(c28.getDate() - 28);
  var c90 = new Date(today); c90.setDate(c90.getDate() - 90);

  function bucket() {
    return { d7: [], d28: [], d90: [], all: [] };
  }

  var overall = bucket();
  var byLocation = {};
  var byMethod = {};
  var byMarket = {};
  var bySeason = {};
  var byMarketSeason = {};

  for (var i = 1; i < data.length; i++) {
    var dateRaw = data[i][0];
    var location = data[i][1] ? data[i][1].toString().trim() : '';
    var predicted = parseFloat(data[i][2]) || 0;
    var actual = parseFloat(data[i][3]) || 0;
    var method = data[i][10] ? data[i][10].toString().trim() : 'unknown';

    if (!dateRaw || !location || predicted <= 0 || actual <= 0) continue;

    var d = new Date(dateRaw);
    if (isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    if (d >= today) continue;

    var absPctErr = Math.abs(predicted - actual) / actual;
    var market = getMarketForLocation(location);
    var season = getSeasonForDate(d);
    var mktSsn = market + ' ' + season;

    overall.all.push(absPctErr);
    if (d >= c90) overall.d90.push(absPctErr);
    if (d >= c28) overall.d28.push(absPctErr);
    if (d >= c7) overall.d7.push(absPctErr);

    if (!byLocation[location]) byLocation[location] = bucket();
    byLocation[location].all.push(absPctErr);
    if (d >= c28) byLocation[location].d28.push(absPctErr);

    if (!byMethod[method]) byMethod[method] = bucket();
    byMethod[method].all.push(absPctErr);
    if (d >= c28) byMethod[method].d28.push(absPctErr);

    if (!byMarket[market]) byMarket[market] = bucket();
    byMarket[market].all.push(absPctErr);
    if (d >= c28) byMarket[market].d28.push(absPctErr);

    if (!bySeason[season]) bySeason[season] = bucket();
    bySeason[season].all.push(absPctErr);

    if (!byMarketSeason[mktSsn]) byMarketSeason[mktSsn] = bucket();
    byMarketSeason[mktSsn].all.push(absPctErr);
  }

  function stats(arr) {
    if (!arr || arr.length === 0) return { n: 0, mape: null, median: null };
    var sum = 0;
    for (var i = 0; i < arr.length; i++) sum += arr[i];
    var mape = sum / arr.length;
    var sorted = arr.slice().sort(function(a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    return {
      n: arr.length,
      mape: Math.round(mape * 1000) / 10,
      median: Math.round(median * 1000) / 10
    };
  }

  function accPct(mape) {
    return mape === null ? '--' : Math.round((100 - mape) * 10) / 10;
  }

  var sheet = ss.getSheetByName('Accuracy Summary');
  if (!sheet) sheet = ss.insertSheet('Accuracy Summary');
  sheet.clear();

  var row = 1;
  function writeSection(title, headers, dataRows) {
    sheet.getRange(row, 1).setValue(title).setFontWeight('bold');
    row++;
    sheet.getRange(row, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    row++;
    if (dataRows.length > 0) {
      sheet.getRange(row, 1, dataRows.length, headers.length).setValues(dataRows);
      row += dataRows.length;
    }
    row += 1;
  }

  var s7 = stats(overall.d7), s28 = stats(overall.d28), s90 = stats(overall.d90), sAll = stats(overall.all);
  writeSection('Overall', ['Window', 'N', 'MAPE %', 'Accuracy %', 'Median Err %'], [
    ['Last 7d',  s7.n,  s7.mape  === null ? '' : s7.mape,  accPct(s7.mape),  s7.median  === null ? '' : s7.median],
    ['Last 28d', s28.n, s28.mape === null ? '' : s28.mape, accPct(s28.mape), s28.median === null ? '' : s28.median],
    ['Last 90d', s90.n, s90.mape === null ? '' : s90.mape, accPct(s90.mape), s90.median === null ? '' : s90.median],
    ['All time', sAll.n, sAll.mape === null ? '' : sAll.mape, accPct(sAll.mape), sAll.median === null ? '' : sAll.median]
  ]);

  var locRows = [];
  var locKeys = Object.keys(byLocation).sort();
  for (var l = 0; l < locKeys.length; l++) {
    var s28L = stats(byLocation[locKeys[l]].d28);
    var sAllL = stats(byLocation[locKeys[l]].all);
    locRows.push([locKeys[l], s28L.n, accPct(s28L.mape), sAllL.n, accPct(sAllL.mape)]);
  }
  locRows.sort(function(a, b) {
    var av = (a[2] === '--') ? -1 : a[2];
    var bv = (b[2] === '--') ? -1 : b[2];
    return bv - av;
  });
  writeSection('Per Location', ['Location', 'N (28d)', 'Acc % (28d)', 'N (all)', 'Acc % (all)'], locRows);

  var mktRows = [];
  var mktKeys = Object.keys(byMarket).sort();
  for (var m = 0; m < mktKeys.length; m++) {
    var s28M = stats(byMarket[mktKeys[m]].d28);
    var sAllM = stats(byMarket[mktKeys[m]].all);
    mktRows.push([mktKeys[m], s28M.n, accPct(s28M.mape), sAllM.n, accPct(sAllM.mape)]);
  }
  writeSection('Per Market', ['Market', 'N (28d)', 'Acc % (28d)', 'N (all)', 'Acc % (all)'], mktRows);

  var methodRows = [];
  var methodKeys = Object.keys(byMethod).sort();
  for (var mt = 0; mt < methodKeys.length; mt++) {
    var s28T = stats(byMethod[methodKeys[mt]].d28);
    var sAllT = stats(byMethod[methodKeys[mt]].all);
    methodRows.push([methodKeys[mt], s28T.n, accPct(s28T.mape), sAllT.n, accPct(sAllT.mape)]);
  }
  writeSection('Per Method', ['Method', 'N (28d)', 'Acc % (28d)', 'N (all)', 'Acc % (all)'], methodRows);

  var seasonRows = [];
  var seasonKeys = Object.keys(bySeason).sort();
  for (var sn = 0; sn < seasonKeys.length; sn++) {
    var sAllS = stats(bySeason[seasonKeys[sn]].all);
    seasonRows.push([seasonKeys[sn], sAllS.n, accPct(sAllS.mape), sAllS.median === null ? '' : sAllS.median]);
  }
  writeSection('Per Season (all-time)', ['Season', 'N', 'Acc %', 'Median Err %'], seasonRows);

  var msRows = [];
  var msKeys = Object.keys(byMarketSeason).sort();
  for (var ms = 0; ms < msKeys.length; ms++) {
    var sMS = stats(byMarketSeason[msKeys[ms]].all);
    msRows.push([msKeys[ms], sMS.n, accPct(sMS.mape), sMS.median === null ? '' : sMS.median]);
  }
  writeSection('Per Market × Season (all-time)', ['Market Season', 'N', 'Acc %', 'Median Err %'], msRows);

  Logger.log('Overall (28d): ' + s28.n + ' rows, ' + accPct(s28.mape) + '% accuracy, ' + s28.mape + '% MAPE');
  Logger.log('Overall (all): ' + sAll.n + ' rows, ' + accPct(sAll.mape) + '% accuracy, ' + sAll.mape + '% MAPE');
  Logger.log('=== Accuracy Summary Complete ===');
}


// ============================================================================
// BACKFILL: PREDICTED (NO MOM) COLUMN
// Reconstructs the no-momentum prediction for historical rows using the stored
// PW Sales (col 7) and Weather Adj % (col 8). Lets us A/B momentum impact
// without waiting weeks of fresh data.
// ============================================================================

function backfillNoMomentumColumn() {
  Logger.log('=== Backfilling Predicted (no mom) ===');

  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!sheet) { Logger.log('No Model Forecast sheet'); return; }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log('No data'); return; }

  if (data[0].length < 16 || data[0][15] !== 'Predicted (no mom)') {
    sheet.getRange(1, 16).setValue('Predicted (no mom)');
  }

  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(2, 1, lastRow - 1, 16).getValues();
  var updates = [];
  var filled = 0, alreadySet = 0, skipped = 0;

  for (var i = 0; i < values.length; i++) {
    var existing = values[i][15];
    var predicted = parseFloat(values[i][2]) || 0;
    var pwSales = parseFloat(values[i][6]) || 0;
    var weatherAdjPct = parseFloat(values[i][7]);
    var method = values[i][10] ? values[i][10].toString().trim() : '';

    if (existing !== '' && existing !== null && existing !== undefined && !isNaN(parseFloat(existing))) {
      updates.push([existing]);
      alreadySet++;
      continue;
    }

    if (method.indexOf('mom') < 0) {
      if (predicted > 0) {
        updates.push([predicted]);
        filled++;
      } else {
        updates.push(['']);
        skipped++;
      }
      continue;
    }

    if (pwSales > 0 && !isNaN(weatherAdjPct)) {
      var noMom = Math.round(pwSales * (1 + weatherAdjPct / 100));
      updates.push([noMom]);
      filled++;
    } else {
      updates.push(['']);
      skipped++;
    }
  }

  sheet.getRange(2, 16, updates.length, 1).setValues(updates);
  Logger.log('Backfilled: ' + filled + ', already set: ' + alreadySet + ', skipped: ' + skipped);
  Logger.log('=== Backfill Complete ===');
}


// ============================================================================
// COMPARE: MOMENTUM IMPACT
// For pw+mom / blend+mom rows with actuals, computes accuracy with and
// without momentum side by side. Single-number answer to "is momentum helping?"
// ============================================================================

function compareMomentumImpact() {
  Logger.log('=== Comparing Momentum Impact ===');

  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!sheet) { Logger.log('No Model Forecast sheet'); return; }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2 || data[0].length < 16) {
    Logger.log('Sheet missing Predicted (no mom) column — run backfillNoMomentumColumn first');
    return;
  }

  var today = new Date(); today.setHours(0, 0, 0, 0);
  var c28 = new Date(today); c28.setDate(c28.getDate() - 28);

  var errWithAll = [], errNoMomAll = [];
  var errWith28 = [], errNoMom28 = [];
  var momentumDeltas = [];
  var winsWithMom = 0, winsNoMom = 0, ties = 0;

  for (var i = 1; i < data.length; i++) {
    var dateRaw = data[i][0];
    var predicted = parseFloat(data[i][2]) || 0;
    var actual = parseFloat(data[i][3]) || 0;
    var method = data[i][10] ? data[i][10].toString().trim() : '';
    var noMom = parseFloat(data[i][15]) || 0;

    if (!dateRaw || predicted <= 0 || actual <= 0 || noMom <= 0) continue;
    if (method.indexOf('mom') < 0) continue;

    var d = new Date(dateRaw);
    if (isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    if (d >= today) continue;

    var eWith = Math.abs(predicted - actual) / actual;
    var eNo = Math.abs(noMom - actual) / actual;

    errWithAll.push(eWith); errNoMomAll.push(eNo);
    if (d >= c28) { errWith28.push(eWith); errNoMom28.push(eNo); }

    momentumDeltas.push(predicted - noMom);

    if (eWith < eNo - 0.005) winsWithMom++;
    else if (eNo < eWith - 0.005) winsNoMom++;
    else ties++;
  }

  function avg(arr) {
    if (arr.length === 0) return null;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  var mWithAll = avg(errWithAll);
  var mNoAll = avg(errNoMomAll);
  var mWith28 = avg(errWith28);
  var mNo28 = avg(errNoMom28);
  var avgDelta = avg(momentumDeltas);

  function fmt(v) { return v === null ? '--' : (Math.round(v * 1000) / 10); }

  var rows = [
    ['Window', 'N', 'MAPE w/ momentum', 'MAPE w/o momentum', 'Delta (pp)', 'Accuracy w/ mom', 'Accuracy w/o mom'],
    ['Last 28d', errWith28.length, fmt(mWith28), fmt(mNo28),
      mWith28 !== null ? Math.round((mWith28 - mNo28) * 1000) / 10 : '--',
      mWith28 !== null ? Math.round((100 - mWith28 * 100) * 10) / 10 : '--',
      mNo28 !== null ? Math.round((100 - mNo28 * 100) * 10) / 10 : '--'],
    ['All time', errWithAll.length, fmt(mWithAll), fmt(mNoAll),
      mWithAll !== null ? Math.round((mWithAll - mNoAll) * 1000) / 10 : '--',
      mWithAll !== null ? Math.round((100 - mWithAll * 100) * 10) / 10 : '--',
      mNoAll !== null ? Math.round((100 - mNoAll * 100) * 10) / 10 : '--']
  ];

  var out = ss.getSheetByName('Momentum Impact');
  if (!out) out = ss.insertSheet('Momentum Impact');
  out.clear();
  out.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  out.getRange(1, 1, 1, rows[0].length).setFontWeight('bold');
  out.setFrozenRows(1);

  var winRow = rows.length + 2;
  out.getRange(winRow, 1).setValue('Row-level comparison (all time)').setFontWeight('bold');
  out.getRange(winRow + 1, 1, 4, 2).setValues([
    ['Momentum helped', winsWithMom],
    ['Momentum hurt', winsNoMom],
    ['Tie (within 0.5pp)', ties],
    ['Avg momentum adjustment ($)', avgDelta !== null ? Math.round(avgDelta) : '--']
  ]);

  Logger.log('All-time: w/ mom MAPE ' + fmt(mWithAll) + '% vs w/o mom MAPE ' + fmt(mNoAll) + '% (n=' + errWithAll.length + ')');
  Logger.log('28d: w/ mom MAPE ' + fmt(mWith28) + '% vs w/o mom MAPE ' + fmt(mNo28) + '% (n=' + errWith28.length + ')');
  Logger.log('Wins: w/mom=' + winsWithMom + ', w/o mom=' + winsNoMom + ', ties=' + ties);
  Logger.log('=== Momentum Impact Complete ===');
}


// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

function testAuditCoefficientCoverage() { auditCoefficientCoverage(); }
function testSummarizeModelAccuracy() { summarizeModelAccuracy(); }
function testBackfillNoMomentumColumn() { backfillNoMomentumColumn(); }
function testCompareMomentumImpact() { compareMomentumImpact(); }
