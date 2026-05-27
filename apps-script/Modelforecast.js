// ============================================================================
// MODEL FORECAST - Self-Learning Forecast Engine (v6 — Smart Forecaster)
//
// Functions:
//   generateModelForecasts()        - Run DAILY (via processAllR365Reports)
//   tuneCoefficients()              - Run DAILY (auto-adjusts coefficients)
//   learnHolidayMultipliers()       - Run WEEKLY (refresh holiday lifts)
//   computeDayOfWeekConfidence()    - Run WEEKLY (refresh DOW volatility)
//   migrateCoefficientsToV6()       - One-time: migrate flat → market+season
//   backfillMissingPredictions()    - Fills gaps in Model Forecast sheet
//   testModelForecast()             - Quick test
//   resetCoefficientsToDefaults()   - Reset to backtested defaults (v6 schema)
//   backfillHolidayFlags()          - Tag rows with holiday/spring break names
//
// Sheets:
//   "Model Forecast"        - Predictions + actuals + accuracy
//   "Model Coefficients"    - Long format: market | season | key | value
//   "Holiday Multipliers"   - Per-location, per-holiday lift multipliers
//   "DOW Confidence"        - Per-location, per-day-of-week volatility
//
// ============================================================================
// v6 — SMART FORECASTER (5 enhancements)
//   1. Holiday lift multipliers learned from full history
//   2. Market-level coefficients (Tulsa / OKC / Dallas / Orlando)
//   3. Seasonal overlay (Q1 / Q2 / Q3 / Q4) — 16 coefficient sets total
//   4. Trailing momentum signal (last 7d vs prior 7d, capped ±8%)
//   5. Per-location, per-DOW confidence based on coefficient of variation
//
//   Sanity check thresholds relaxed slightly to accommodate finer-grained
//   tuning: max single move 0.10, sign flips allowed if 30+ samples agree.
//   Fallback hierarchy when sample counts are thin:
//     market+season → market only → global default
//
// v5 — Spring break + sanity checks + backfill
// v4 — Future predictions regenerated daily
// v3 — Holiday awareness
// ============================================================================

var MODEL_CONFIG = {
  SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  FORECAST_DATA_SHEET: 'Forecast Data',
  MODEL_FORECAST_SHEET: 'Model Forecast',
  COEFFICIENTS_SHEET: 'Model Coefficients',
  HOLIDAY_MULTIPLIERS_SHEET: 'Holiday Multipliers',
  DOW_CONFIDENCE_SHEET: 'DOW Confidence',
  
  LOCATIONS: [
    'Allen', 'Bixby', 'Broken Arrow', 'Carrollton', 'Claremore', 'Edmond',
    'Frisco #1', 'Frisco #2', 'Frisco #3', 'Hillcrest Village',
    'Lake Highlands', 'Lakeland', "Hunter's Creek", 'Norman', 'Owasso', 'Penn',
    'Prosper', 'Sanford', 'The Colony', 'Warr Acres', 'Yale'
  ],
  
  MARKETS: {
    'Bixby': 'Tulsa', 'Yale': 'Tulsa', 'Broken Arrow': 'Tulsa',
    'Owasso': 'Tulsa', 'Claremore': 'Tulsa',
    'Warr Acres': 'OKC', 'Penn': 'OKC', 'Edmond': 'OKC', 'Norman': 'OKC',
    'Carrollton': 'Dallas', 'Frisco #1': 'Dallas', 'Frisco #2': 'Dallas',
    'Frisco #3': 'Dallas', 'The Colony': 'Dallas', 'Hillcrest Village': 'Dallas',
    'Lake Highlands': 'Dallas', 'Allen': 'Dallas', 'Prosper': 'Dallas',
    'Sanford': 'Orlando', 'Lakeland': 'Orlando', "Hunter's Creek": 'Orlando'
  },
  
  ALL_MARKETS: ['Tulsa', 'OKC', 'Dallas', 'Orlando'],
  ALL_SEASONS: ['Q1', 'Q2', 'Q3', 'Q4'],
  
  FIXED_HOLIDAYS: {
    '1/1': 'New Years Day',
    '2/14': "Valentine's Day",
    '3/17': "St Patrick's Day",
    '7/4': 'July 4th',
    '10/31': 'Halloween',
    '12/24': 'Christmas Eve',
    '12/25': 'Christmas Day',
    '12/31': 'New Years Eve'
  },
  
  SPRING_BREAK_RANGES: {
    2026: { start: '3/9', end: '3/13' }
  },
  
  TUNING: {
    MAX_SINGLE_MOVE: 0.10,
    SIGN_FLIP_MIN_SAMPLES: 30,
    MIN_SAMPLES_FOR_TUNE: 10,
    MIN_SAMPLES_FOR_RAIN: 5,
    OUTLIER_REJECT_THRESHOLD: 0.35
  },
  
  MOMENTUM: {
    WINDOW_DAYS: 7,
    CAP: 0
  },
  
  HOLIDAY_MULTIPLIERS: {
    MIN_LOCATION_SAMPLES: 3,
    BASELINE_WINDOW_DAYS: 28
  },
  
  DEFAULT_COEFFICIENTS: {
    temp_15plus:    0.199,
    temp_10to15:    0.087,
    temp_5to10:     0.024,
    temp_3to5:      0.007,
    temp_similar:   0.040,
    temp_neg3to5:  -0.020,
    temp_neg5to10: -0.043,
    temp_neg10to15:-0.059,
    temp_neg15plus:-0.151,
    rain_new:      -0.133,
    rain_cleared:   0.133,
    outlier_threshold: 0.30,
    outlier_pw_weight: 0.60
  }
};


// ============================================================================
// HOLIDAY + SPRING BREAK DETECTION
// ============================================================================

function getModelHoliday(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  
  var m = date.getMonth() + 1;
  var d = date.getDate();
  var y = date.getFullYear();
  var dow = date.getDay();
  var key = m + '/' + d;
  
  var sb = getSpringBreakLabel(date);
  if (sb) return sb;
  
  if (MODEL_CONFIG.FIXED_HOLIDAYS[key]) return MODEL_CONFIG.FIXED_HOLIDAYS[key];
  
  if (m === 5 && dow === 0) {
    var firstOfMay = new Date(y, 4, 1);
    var firstSunday = (7 - firstOfMay.getDay()) % 7 + 1;
    var secondSunday = firstSunday + 7;
    if (d === secondSunday) return "Mother's Day";
  }
  
  if (m === 6 && dow === 0) {
    var firstOfJune = new Date(y, 5, 1);
    var firstSun = (7 - firstOfJune.getDay()) % 7 + 1;
    var thirdSunday = firstSun + 14;
    if (d === thirdSunday) return "Father's Day";
  }
  
  if (m === 5 && dow === 1 && d > 24) return 'Memorial Day';
  if (m === 9 && dow === 1 && d <= 7) return 'Labor Day';
  
  if (m === 11 && dow === 4) {
    var firstOfNov = new Date(y, 10, 1);
    var firstThu = ((11 - firstOfNov.getDay()) % 7) + 1;
    var fourthThu = firstThu + 21;
    if (d === fourthThu) return 'Thanksgiving';
  }
  
  var easter = computeEaster(y);
  if (m === (easter.getMonth() + 1) && d === easter.getDate()) return 'Easter';
  
  return null;
}

function getSpringBreakLabel(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;
  
  var y = date.getFullYear();
  var range = MODEL_CONFIG.SPRING_BREAK_RANGES[y];
  if (!range) return null;
  
  try {
    var startParts = range.start.split('/');
    var endParts = range.end.split('/');
    var startDate = new Date(y, parseInt(startParts[0]) - 1, parseInt(startParts[1]));
    var endDate = new Date(y, parseInt(endParts[0]) - 1, parseInt(endParts[1]));
    
    var halo = [];
    var fridayBefore = new Date(startDate);
    fridayBefore.setDate(fridayBefore.getDate() - 1);
    while (fridayBefore.getDay() !== 5) fridayBefore.setDate(fridayBefore.getDate() - 1);
    halo.push(new Date(fridayBefore));
    
    var mondayAfter = new Date(endDate);
    mondayAfter.setDate(mondayAfter.getDate() + 1);
    while (mondayAfter.getDay() !== 1) mondayAfter.setDate(mondayAfter.getDate() + 1);
    halo.push(new Date(mondayAfter));
    
    var d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    var s0 = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    var e0 = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    
    if (d0 >= s0 && d0 <= e0) return 'Spring Break';
    
    for (var i = 0; i < halo.length; i++) {
      var h = halo[i];
      var h0 = new Date(h.getFullYear(), h.getMonth(), h.getDate());
      if (d0.getTime() === h0.getTime()) return 'Spring Break (halo)';
    }
  } catch (e) {
    Logger.log('Spring break detection error: ' + e.toString());
    return null;
  }
  
  return null;
}

function isHolidayAdjacent(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;
  if (getModelHoliday(date)) return true;
  
  var dayBefore = new Date(date);
  dayBefore.setDate(dayBefore.getDate() - 1);
  if (getModelHoliday(dayBefore)) return true;
  
  var dayAfter = new Date(date);
  dayAfter.setDate(dayAfter.getDate() + 1);
  if (getModelHoliday(dayAfter)) return true;
  
  return false;
}

function computeEaster(year) {
  var a = year % 19;
  var b = Math.floor(year / 100);
  var c = year % 100;
  var d = Math.floor(b / 4);
  var e = b % 4;
  var f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4);
  var k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  var day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}


// ============================================================================
// MARKET + SEASON HELPERS (v6)
// ============================================================================

function getMarketForLocation(location) {
  return MODEL_CONFIG.MARKETS[location] || 'Unknown';
}

function getSeasonForDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return 'Q1';
  var m = date.getMonth() + 1;
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}


// ============================================================================
// COEFFICIENTS — LONG FORMAT WITH FALLBACK HIERARCHY (v6)
// ============================================================================

function loadModelCoefficients(ss) {
  var sheet = ss.getSheetByName(MODEL_CONFIG.COEFFICIENTS_SHEET);
  if (!sheet) {
    return buildDefaultCoefficientStructure();
  }
  
  try {
    var data = sheet.getDataRange().getValues();
    var coefficients = { _meta: {} };
    
    if (data.length < 2) return buildDefaultCoefficientStructure();
    
    for (var i = 1; i < data.length; i++) {
      var market = data[i][0] ? data[i][0].toString().trim() : '';
      var season = data[i][1] ? data[i][1].toString().trim() : '';
      var key = data[i][2] ? data[i][2].toString().trim() : '';
      var val = data[i][3];
      
      if (!market || !key) continue;
      
      if (key === 'version' || key === 'last_tuned') {
        if (!coefficients._meta[market]) coefficients._meta[market] = {};
        if (!coefficients._meta[market][season || '_all']) coefficients._meta[market][season || '_all'] = {};
        coefficients._meta[market][season || '_all'][key] = (typeof val === 'number') ? val : (val ? val.toString() : '');
        continue;
      }
      
      if (!season) continue;
      
      if (!coefficients[market]) coefficients[market] = {};
      if (!coefficients[market][season]) coefficients[market][season] = {};
      coefficients[market][season][key] = (typeof val === 'number') ? val : parseFloat(val) || 0;
    }
    
    var defaults = MODEL_CONFIG.DEFAULT_COEFFICIENTS;
    var defaultKeys = Object.keys(defaults);
    for (var mIdx = 0; mIdx < MODEL_CONFIG.ALL_MARKETS.length; mIdx++) {
      var mkt = MODEL_CONFIG.ALL_MARKETS[mIdx];
      if (!coefficients[mkt]) coefficients[mkt] = {};
      for (var sIdx = 0; sIdx < MODEL_CONFIG.ALL_SEASONS.length; sIdx++) {
        var ssn = MODEL_CONFIG.ALL_SEASONS[sIdx];
        if (!coefficients[mkt][ssn]) coefficients[mkt][ssn] = {};
        for (var k = 0; k < defaultKeys.length; k++) {
          if (coefficients[mkt][ssn][defaultKeys[k]] === undefined) {
            coefficients[mkt][ssn][defaultKeys[k]] = defaults[defaultKeys[k]];
          }
        }
      }
    }
    
    return coefficients;
  } catch (e) {
    Logger.log('Error loading coefficients: ' + e.toString());
    return buildDefaultCoefficientStructure();
  }
}

function buildDefaultCoefficientStructure() {
  var defaults = MODEL_CONFIG.DEFAULT_COEFFICIENTS;
  var coefficients = { _meta: {} };
  for (var mIdx = 0; mIdx < MODEL_CONFIG.ALL_MARKETS.length; mIdx++) {
    var mkt = MODEL_CONFIG.ALL_MARKETS[mIdx];
    coefficients[mkt] = {};
    coefficients._meta[mkt] = {};
    for (var sIdx = 0; sIdx < MODEL_CONFIG.ALL_SEASONS.length; sIdx++) {
      var ssn = MODEL_CONFIG.ALL_SEASONS[sIdx];
      coefficients[mkt][ssn] = JSON.parse(JSON.stringify(defaults));
      coefficients._meta[mkt][ssn] = { version: 1, last_tuned: '' };
    }
  }
  return coefficients;
}

function getCoefficient(coefficients, market, season, key) {
  if (coefficients[market] && coefficients[market][season] && coefficients[market][season][key] !== undefined) {
    return coefficients[market][season][key];
  }
  if (coefficients[market]) {
    var sum = 0, count = 0;
    var seasons = Object.keys(coefficients[market]);
    for (var s = 0; s < seasons.length; s++) {
      var v = coefficients[market][seasons[s]][key];
      if (typeof v === 'number') { sum += v; count++; }
    }
    if (count > 0) return sum / count;
  }
  return MODEL_CONFIG.DEFAULT_COEFFICIENTS[key] || 0;
}

function saveModelCoefficients(ss, coefficients) {
  var sheet = ss.getSheetByName(MODEL_CONFIG.COEFFICIENTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MODEL_CONFIG.COEFFICIENTS_SHEET);
  }
  
  sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([['Market', 'Season', 'Key', 'Value', 'Description']]);
  sheet.setFrozenRows(1);
  
  var descriptions = {
    'temp_15plus': '15°+ warmer than PW',
    'temp_10to15': '10-15° warmer',
    'temp_5to10': '5-10° warmer',
    'temp_3to5': '3-5° warmer',
    'temp_similar': '\u00b13° similar',
    'temp_neg3to5': '3-5° cooler',
    'temp_neg5to10': '5-10° cooler',
    'temp_neg10to15': '10-15° cooler',
    'temp_neg15plus': '15°+ cooler',
    'rain_new': 'Dry\u2192Rain adjustment',
    'rain_cleared': 'Rain\u2192Dry adjustment',
    'outlier_threshold': 'PW deviation % to flag as outlier',
    'outlier_pw_weight': 'PW weight in outlier blend',
    'version': 'Coefficient version (per market+season)',
    'last_tuned': 'Date of last auto-tune'
  };
  
  var rows = [];
  
  for (var mIdx = 0; mIdx < MODEL_CONFIG.ALL_MARKETS.length; mIdx++) {
    var mkt = MODEL_CONFIG.ALL_MARKETS[mIdx];
    for (var sIdx = 0; sIdx < MODEL_CONFIG.ALL_SEASONS.length; sIdx++) {
      var ssn = MODEL_CONFIG.ALL_SEASONS[sIdx];
      if (!coefficients[mkt] || !coefficients[mkt][ssn]) continue;
      var keys = Object.keys(coefficients[mkt][ssn]);
      for (var k = 0; k < keys.length; k++) {
        rows.push([mkt, ssn, keys[k], coefficients[mkt][ssn][keys[k]], descriptions[keys[k]] || '']);
      }
    }
  }
  
  if (coefficients._meta) {
    var mktKeys = Object.keys(coefficients._meta);
    for (var mk = 0; mk < mktKeys.length; mk++) {
      var ssnKeys = Object.keys(coefficients._meta[mktKeys[mk]]);
      for (var sk = 0; sk < ssnKeys.length; sk++) {
        var meta = coefficients._meta[mktKeys[mk]][ssnKeys[sk]];
        var metaSeason = (ssnKeys[sk] === '_all') ? '' : ssnKeys[sk];
        if (meta.version !== undefined) {
          rows.push([mktKeys[mk], metaSeason, 'version', meta.version, descriptions.version]);
        }
        if (meta.last_tuned !== undefined) {
          rows.push([mktKeys[mk], metaSeason, 'last_tuned', meta.last_tuned, descriptions.last_tuned]);
        }
      }
    }
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  
  buildCoefficientsPivotView(ss, coefficients);
  
  Logger.log('Saved ' + rows.length + ' coefficient rows (long format)');
}

function buildCoefficientsPivotView(ss, coefficients) {
  var pivotName = MODEL_CONFIG.COEFFICIENTS_SHEET + ' (Pivot)';
  var pivot = ss.getSheetByName(pivotName);
  if (!pivot) {
    pivot = ss.insertSheet(pivotName);
  }
  pivot.clear();
  
  var headers = ['Key'];
  var columnMap = [];
  for (var mIdx = 0; mIdx < MODEL_CONFIG.ALL_MARKETS.length; mIdx++) {
    var mkt = MODEL_CONFIG.ALL_MARKETS[mIdx];
    for (var sIdx = 0; sIdx < MODEL_CONFIG.ALL_SEASONS.length; sIdx++) {
      var ssn = MODEL_CONFIG.ALL_SEASONS[sIdx];
      headers.push(mkt + ' ' + ssn);
      columnMap.push({ market: mkt, season: ssn });
    }
  }
  pivot.getRange(1, 1, 1, headers.length).setValues([headers]);
  pivot.setFrozenRows(1);
  pivot.setFrozenColumns(1);
  
  var defaultKeys = Object.keys(MODEL_CONFIG.DEFAULT_COEFFICIENTS);
  var rows = [];
  for (var k = 0; k < defaultKeys.length; k++) {
    var row = [defaultKeys[k]];
    for (var c = 0; c < columnMap.length; c++) {
      var cm = columnMap[c];
      var val = (coefficients[cm.market] && coefficients[cm.market][cm.season] && coefficients[cm.market][cm.season][defaultKeys[k]] !== undefined)
        ? coefficients[cm.market][cm.season][defaultKeys[k]]
        : '';
      row.push(val);
    }
    rows.push(row);
  }
  
  if (rows.length > 0) {
    pivot.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  
  var noteRow = rows.length + 3;
  pivot.getRange(noteRow, 1).setValue('READ-ONLY VIEW. Edit values in the "Model Coefficients" sheet, not here.');
  pivot.getRange(noteRow, 1).setFontStyle('italic').setFontColor('#888888');
}


// ============================================================================
// HOLIDAY MULTIPLIERS (v6 — feature 1)
// ============================================================================

function learnHolidayMultipliers() {
  Logger.log('=== Learning Holiday Multipliers ===');
  
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var forecastDataSheet = ss.getSheetByName(MODEL_CONFIG.FORECAST_DATA_SHEET);
  if (!forecastDataSheet) {
    Logger.log('ERROR: Forecast Data sheet not found');
    return;
  }
  
  var allData = forecastDataSheet.getDataRange().getValues();
  
  var salesByLoc = {};
  for (var i = 1; i < allData.length; i++) {
    var dateRaw = allData[i][0];
    var location = allData[i][1] ? allData[i][1].toString().trim() : '';
    var sales = parseFloat(allData[i][2]) || 0;
    if (!dateRaw || !location || sales <= 0) continue;
    
    var dateObj = (dateRaw instanceof Date) ? new Date(dateRaw) : new Date(dateRaw.toString());
    if (isNaN(dateObj.getTime())) continue;
    dateObj.setHours(0, 0, 0, 0);
    
    if (!salesByLoc[location]) salesByLoc[location] = [];
    salesByLoc[location].push({ date: dateObj, sales: sales });
  }
  
  var locKeys = Object.keys(salesByLoc);
  for (var l = 0; l < locKeys.length; l++) {
    salesByLoc[locKeys[l]].sort(function(a, b) { return a.date - b.date; });
  }
  Logger.log('Indexed sales data for ' + locKeys.length + ' locations');
  
  var multipliersByLocHoliday = {};
  var globalByHoliday = {};
  var baselineWindow = MODEL_CONFIG.HOLIDAY_MULTIPLIERS.BASELINE_WINDOW_DAYS;
  
  for (var lIdx = 0; lIdx < locKeys.length; lIdx++) {
    var loc = locKeys[lIdx];
    var locSales = salesByLoc[loc];
    
    for (var sIdx = 0; sIdx < locSales.length; sIdx++) {
      var entry = locSales[sIdx];
      var holiday = getModelHoliday(entry.date);
      if (!holiday) continue;
      
      var targetDOW = entry.date.getDay();
      var windowStart = new Date(entry.date);
      windowStart.setDate(windowStart.getDate() - baselineWindow);
      var windowEnd = new Date(entry.date);
      windowEnd.setDate(windowEnd.getDate() + baselineWindow);
      
      var baselineSamples = [];
      for (var bIdx = 0; bIdx < locSales.length; bIdx++) {
        var b = locSales[bIdx];
        if (b.date.getTime() === entry.date.getTime()) continue;
        if (b.date < windowStart || b.date > windowEnd) continue;
        if (b.date.getDay() !== targetDOW) continue;
        if (getModelHoliday(b.date)) continue;
        baselineSamples.push(b.sales);
      }
      
      if (baselineSamples.length < 2) continue;
      
      baselineSamples.sort(function(a, b) { return a - b; });
      var baseline = baselineSamples[Math.floor(baselineSamples.length / 2)];
      if (baseline <= 0) continue;
      
      var multiplier = entry.sales / baseline;
      if (multiplier < 0.3 || multiplier > 4.0) continue;
      
      if (!multipliersByLocHoliday[loc]) multipliersByLocHoliday[loc] = {};
      if (!multipliersByLocHoliday[loc][holiday]) multipliersByLocHoliday[loc][holiday] = [];
      multipliersByLocHoliday[loc][holiday].push(multiplier);
      
      if (!globalByHoliday[holiday]) globalByHoliday[holiday] = [];
      globalByHoliday[holiday].push(multiplier);
    }
  }
  
  var marketByHoliday = {};
  var locKeys2 = Object.keys(multipliersByLocHoliday);
  for (var lk = 0; lk < locKeys2.length; lk++) {
    var locName = locKeys2[lk];
    var market = getMarketForLocation(locName);
    var holidays = Object.keys(multipliersByLocHoliday[locName]);
    for (var hk = 0; hk < holidays.length; hk++) {
      var hName = holidays[hk];
      if (!marketByHoliday[market]) marketByHoliday[market] = {};
      if (!marketByHoliday[market][hName]) marketByHoliday[market][hName] = [];
      var samples = multipliersByLocHoliday[locName][hName];
      for (var s = 0; s < samples.length; s++) {
        marketByHoliday[market][hName].push(samples[s]);
      }
    }
  }
  
  var sheet = ss.getSheetByName(MODEL_CONFIG.HOLIDAY_MULTIPLIERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MODEL_CONFIG.HOLIDAY_MULTIPLIERS_SHEET);
  }
  sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([['Scope', 'Name', 'Holiday', 'Multiplier', 'Sample Count']]);
  sheet.setFrozenRows(1);
  
  var rows = [];
  
  var lk2 = Object.keys(multipliersByLocHoliday);
  for (var i2 = 0; i2 < lk2.length; i2++) {
    var locN = lk2[i2];
    var hKeys = Object.keys(multipliersByLocHoliday[locN]);
    for (var hi = 0; hi < hKeys.length; hi++) {
      var samples = multipliersByLocHoliday[locN][hKeys[hi]];
      samples.sort(function(a, b) { return a - b; });
      var med = samples[Math.floor(samples.length / 2)];
      rows.push(['location', locN, hKeys[hi], Math.round(med * 1000) / 1000, samples.length]);
    }
  }
  
  var mk2 = Object.keys(marketByHoliday);
  for (var mi = 0; mi < mk2.length; mi++) {
    var hKeys2 = Object.keys(marketByHoliday[mk2[mi]]);
    for (var hi2 = 0; hi2 < hKeys2.length; hi2++) {
      var mSamples = marketByHoliday[mk2[mi]][hKeys2[hi2]];
      mSamples.sort(function(a, b) { return a - b; });
      var mMed = mSamples[Math.floor(mSamples.length / 2)];
      rows.push(['market', mk2[mi], hKeys2[hi2], Math.round(mMed * 1000) / 1000, mSamples.length]);
    }
  }
  
  var gKeys = Object.keys(globalByHoliday);
  for (var gi = 0; gi < gKeys.length; gi++) {
    var gSamples = globalByHoliday[gKeys[gi]];
    gSamples.sort(function(a, b) { return a - b; });
    var gMed = gSamples[Math.floor(gSamples.length / 2)];
    rows.push(['global', 'all', gKeys[gi], Math.round(gMed * 1000) / 1000, gSamples.length]);
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  
  Logger.log('Wrote ' + rows.length + ' holiday multiplier rows');
  Logger.log('=== Holiday Multipliers Learning Complete ===');
}

function getHolidayMultiplier(multipliers, location, holiday) {
  if (!holiday || !multipliers) return 1.0;
  var market = getMarketForLocation(location);
  var minLoc = MODEL_CONFIG.HOLIDAY_MULTIPLIERS.MIN_LOCATION_SAMPLES;
  
  if (multipliers.location && multipliers.location[location] && multipliers.location[location][holiday]) {
    var entry = multipliers.location[location][holiday];
    if (entry.samples >= minLoc) return entry.multiplier;
  }
  
  if (multipliers.market && multipliers.market[market] && multipliers.market[market][holiday]) {
    return multipliers.market[market][holiday].multiplier;
  }
  
  if (multipliers.global && multipliers.global[holiday]) {
    return multipliers.global[holiday].multiplier;
  }
  
  return 1.0;
}

function loadHolidayMultipliers(ss) {
  var sheet = ss.getSheetByName(MODEL_CONFIG.HOLIDAY_MULTIPLIERS_SHEET);
  if (!sheet) return { location: {}, market: {}, global: {} };
  
  var multipliers = { location: {}, market: {}, global: {} };
  try {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var scope = data[i][0] ? data[i][0].toString().trim() : '';
      var name = data[i][1] ? data[i][1].toString().trim() : '';
      var holiday = data[i][2] ? data[i][2].toString().trim() : '';
      var mult = parseFloat(data[i][3]) || 1.0;
      var samples = parseInt(data[i][4]) || 0;
      
      if (!scope || !holiday) continue;
      
      if (scope === 'location') {
        if (!multipliers.location[name]) multipliers.location[name] = {};
        multipliers.location[name][holiday] = { multiplier: mult, samples: samples };
      } else if (scope === 'market') {
        if (!multipliers.market[name]) multipliers.market[name] = {};
        multipliers.market[name][holiday] = { multiplier: mult, samples: samples };
      } else if (scope === 'global') {
        multipliers.global[holiday] = { multiplier: mult, samples: samples };
      }
    }
  } catch (e) {
    Logger.log('Error loading holiday multipliers: ' + e.toString());
  }
  return multipliers;
}


// ============================================================================
// MOMENTUM SIGNAL (v6 — feature 4)
// ============================================================================

function computeMomentum(location, asOfDate, salesByLocDate) {
  var window = MODEL_CONFIG.MOMENTUM.WINDOW_DAYS;
  var cap = MODEL_CONFIG.MOMENTUM.CAP;
  
  var recentSum = 0, recentCount = 0;
  var priorSum = 0, priorCount = 0;
  
  for (var i = 1; i <= window; i++) {
    var rDate = new Date(asOfDate);
    rDate.setDate(rDate.getDate() - i);
    var rKey = location + '|' + normalizeDateForModel(rDate);
    if (salesByLocDate[rKey] && salesByLocDate[rKey].sales > 0 && !getModelHoliday(rDate)) {
      recentSum += salesByLocDate[rKey].sales;
      recentCount++;
    }
    
    var pDate = new Date(asOfDate);
    pDate.setDate(pDate.getDate() - i - window);
    var pKey = location + '|' + normalizeDateForModel(pDate);
    if (salesByLocDate[pKey] && salesByLocDate[pKey].sales > 0 && !getModelHoliday(pDate)) {
      priorSum += salesByLocDate[pKey].sales;
      priorCount++;
    }
  }
  
  if (recentCount < 4 || priorCount < 4) return 0;
  
  var recentAvg = recentSum / recentCount;
  var priorAvg = priorSum / priorCount;
  if (priorAvg <= 0) return 0;
  
  var momentum = (recentAvg / priorAvg) - 1;
  return Math.max(-cap, Math.min(cap, momentum));
}


// ============================================================================
// PER-DOW CONFIDENCE (v6 — feature 5)
// ============================================================================

function computeDayOfWeekConfidence() {
  Logger.log('=== Computing Day-of-Week Confidence ===');
  
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var forecastDataSheet = ss.getSheetByName(MODEL_CONFIG.FORECAST_DATA_SHEET);
  if (!forecastDataSheet) { Logger.log('ERROR: Forecast Data sheet not found'); return; }
  
  var allData = forecastDataSheet.getDataRange().getValues();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  cutoff.setHours(0, 0, 0, 0);
  
  var samples = {};
  
  for (var i = 1; i < allData.length; i++) {
    var dateRaw = allData[i][0];
    var location = allData[i][1] ? allData[i][1].toString().trim() : '';
    var sales = parseFloat(allData[i][2]) || 0;
    if (!dateRaw || !location || sales <= 0) continue;
    
    var dateObj = (dateRaw instanceof Date) ? new Date(dateRaw) : new Date(dateRaw.toString());
    if (isNaN(dateObj.getTime())) continue;
    dateObj.setHours(0, 0, 0, 0);
    if (dateObj < cutoff) continue;
    if (getModelHoliday(dateObj)) continue;
    
    var dow = dateObj.getDay();
    if (!samples[location]) samples[location] = {};
    if (!samples[location][dow]) samples[location][dow] = [];
    samples[location][dow].push(sales);
  }
  
  var sheet = ss.getSheetByName(MODEL_CONFIG.DOW_CONFIDENCE_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MODEL_CONFIG.DOW_CONFIDENCE_SHEET);
  }
  sheet.clear();
  sheet.getRange(1, 1, 1, 6).setValues([['Location', 'Day of Week', 'Mean Sales', 'Std Dev', 'CV', 'Confidence']]);
  sheet.setFrozenRows(1);
  
  var dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var rows = [];
  var locKeys = Object.keys(samples);
  for (var lk = 0; lk < locKeys.length; lk++) {
    var loc = locKeys[lk];
    for (var dow = 0; dow < 7; dow++) {
      var arr = samples[loc][dow];
      if (!arr || arr.length < 4) continue;
      
      var sum = 0;
      for (var s = 0; s < arr.length; s++) sum += arr[s];
      var mean = sum / arr.length;
      
      var sqDiff = 0;
      for (var s2 = 0; s2 < arr.length; s2++) {
        sqDiff += Math.pow(arr[s2] - mean, 2);
      }
      var stdDev = Math.sqrt(sqDiff / arr.length);
      var cv = (mean > 0) ? stdDev / mean : 1;
      
      var conf = (cv < 0.10) ? 'high' : (cv < 0.18) ? 'med' : 'low';
      
      rows.push([loc, dowNames[dow], Math.round(mean), Math.round(stdDev), Math.round(cv * 1000) / 1000, conf]);
    }
  }
  
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }
  
  Logger.log('Wrote ' + rows.length + ' DOW confidence rows');
}

function loadDOWConfidence(ss) {
  var sheet = ss.getSheetByName(MODEL_CONFIG.DOW_CONFIDENCE_SHEET);
  if (!sheet) return {};
  
  var lookup = {};
  var dowNameToNum = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  
  try {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var loc = data[i][0] ? data[i][0].toString().trim() : '';
      var dowName = data[i][1] ? data[i][1].toString().trim() : '';
      var conf = data[i][5] ? data[i][5].toString().trim() : '';
      if (!loc || !dowName || !conf) continue;
      var dowNum = dowNameToNum[dowName];
      if (dowNum === undefined) continue;
      if (!lookup[loc]) lookup[loc] = {};
      lookup[loc][dowNum] = conf;
    }
  } catch (e) {
    Logger.log('Error loading DOW confidence: ' + e.toString());
  }
  return lookup;
}


// ============================================================================
// MAIN: GENERATE FORECASTS (run daily) — v6
// ============================================================================

function generateModelForecasts() {
  Logger.log('=== Generating Model Forecasts (v6) ===');
  
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  
  var modelSheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!modelSheet) {
    modelSheet = ss.insertSheet(MODEL_CONFIG.MODEL_FORECAST_SHEET);
    var headers = [
      'Date', 'Location', 'Predicted Sales', 'Actual Sales', 'Variance',
      'Accuracy %', 'PW Sales Used', 'Weather Adj %', 'Temp Diff',
      'Conditions Change', 'Forecast Method', 'Confidence',
      'Coefficients Version', 'Generated At', 'Holiday', 'Predicted (no mom)'
    ];
    modelSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    modelSheet.setFrozenRows(1);
  }

  var headerRow = modelSheet.getRange(1, 1, 1, modelSheet.getLastColumn()).getValues()[0];
  if (headerRow.length < 15 || headerRow[14] !== 'Holiday') {
    modelSheet.getRange(1, 15).setValue('Holiday');
  }
  if (headerRow.length < 16 || headerRow[15] !== 'Predicted (no mom)') {
    modelSheet.getRange(1, 16).setValue('Predicted (no mom)');
  }
  
  var forecastDataSheet = ss.getSheetByName(MODEL_CONFIG.FORECAST_DATA_SHEET);
  if (!forecastDataSheet) { Logger.log('ERROR: Forecast Data sheet not found'); return; }
  
  var allData = forecastDataSheet.getDataRange().getValues();
  var salesByLocDate = {};
  
  for (var i = 1; i < allData.length; i++) {
    var dateRaw = allData[i][0];
    var location = allData[i][1] ? allData[i][1].toString().trim() : '';
    var sales = parseFloat(allData[i][2]) || 0;
    var temp = parseFloat(allData[i][3]) || null;
    var conditions = allData[i][4] ? allData[i][4].toString().trim() : '';
    
    if (!dateRaw || !location) continue;
    var dateKey = normalizeDateForModel(dateRaw);
    var key = location + '|' + dateKey;
    salesByLocDate[key] = { sales: sales, temp: temp, conditions: conditions };
  }
  Logger.log('Loaded ' + Object.keys(salesByLocDate).length + ' historical data points');
  
  var coefficients = loadModelCoefficients(ss);
  var multipliers = loadHolidayMultipliers(ss);
  var dowConfidence = loadDOWConfidence(ss);
  var sportsEvents = (typeof loadSportsEvents === 'function') ? loadSportsEvents(ss) : {};
  var sportsMultipliers = (typeof loadSportsMultipliers === 'function') ? loadSportsMultipliers(ss) : { location: {}, market: {}, global: {} };
  
  var modelData = modelSheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  
  var rowsToDelete = [];
  var existingRows = {};
  
  for (var i = 1; i < modelData.length; i++) {
    var rowDateRaw = modelData[i][0];
    var rowLoc = modelData[i][1] ? modelData[i][1].toString().trim() : '';
    var rowActual = modelData[i][3];
    
    if (!rowDateRaw || !rowLoc) continue;
    
    var rowDate = new Date(rowDateRaw);
    if (isNaN(rowDate.getTime())) continue;
    rowDate.setHours(0, 0, 0, 0);
    
    var dk = normalizeDateForModel(rowDateRaw);
    var lookupKey = rowLoc + '|' + dk;
    
    var hasActual = (rowActual !== '' && rowActual !== null && rowActual !== undefined && !isNaN(parseFloat(rowActual)) && parseFloat(rowActual) > 0);
    var isFuture = rowDate > today;
    
    if (isFuture && !hasActual) {
      rowsToDelete.push(i + 1);
    } else {
      existingRows[lookupKey] = true;
    }
  }
  
  if (rowsToDelete.length > 0) {
    Logger.log('Removing ' + rowsToDelete.length + ' future predictions for regeneration');
    rowsToDelete.sort(function(a, b) { return a - b; });

    var ranges = [];
    var rangeStart = rowsToDelete[0];
    var rangeEnd = rowsToDelete[0];
    for (var d = 1; d < rowsToDelete.length; d++) {
      if (rowsToDelete[d] === rangeEnd + 1) {
        rangeEnd = rowsToDelete[d];
      } else {
        ranges.push({ start: rangeStart, count: rangeEnd - rangeStart + 1 });
        rangeStart = rowsToDelete[d];
        rangeEnd = rowsToDelete[d];
      }
    }
    ranges.push({ start: rangeStart, count: rangeEnd - rangeStart + 1 });

    for (var r = ranges.length - 1; r >= 0; r--) {
      modelSheet.deleteRows(ranges[r].start, ranges[r].count);
    }
  }
  
  modelData = modelSheet.getDataRange().getValues();
  var actualsUpdated = 0;
  
  for (var i = 1; i < modelData.length; i++) {
    var dateRaw2 = modelData[i][0];
    var loc2 = modelData[i][1] ? modelData[i][1].toString().trim() : '';
    var predicted2 = parseFloat(modelData[i][2]) || 0;
    var existingActual = modelData[i][3];
    
    if (!dateRaw2 || !loc2 || !predicted2) continue;
    
    var alreadyHasActual = (existingActual !== '' && existingActual !== null && existingActual !== undefined && !isNaN(parseFloat(existingActual)) && parseFloat(existingActual) > 0);
    if (alreadyHasActual) continue;
    
    var dk2 = normalizeDateForModel(dateRaw2);
    var lookupKey2 = loc2 + '|' + dk2;
    var actualData = salesByLocDate[lookupKey2];
    
    if (actualData && actualData.sales > 0) {
      var actualSales = actualData.sales;
      var variance = actualSales - predicted2;
      var accuracy = predicted2 > 0 ? (1 - Math.abs(variance) / actualSales) * 100 : 0;
      accuracy = Math.round(accuracy * 10) / 10;
      modelSheet.getRange(i + 1, 4, 1, 3).setValues([[actualSales, variance, accuracy]]);
      actualsUpdated++;
    }
  }
  if (actualsUpdated > 0) Logger.log('Updated ' + actualsUpdated + ' rows with actual sales');
  
  var newRows = [];
  
  for (var dayOffset = 0; dayOffset <= 14; dayOffset++) {
    var targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + dayOffset);
    var targetKey = normalizeDateForModel(targetDate);
    
    for (var locIdx = 0; locIdx < MODEL_CONFIG.LOCATIONS.length; locIdx++) {
      var location = MODEL_CONFIG.LOCATIONS[locIdx];
      var existKey = location + '|' + targetKey;
      if (existingRows[existKey]) continue;
      
      var prediction = buildPredictionForDate(location, targetDate, salesByLocDate, coefficients, multipliers, dowConfidence, sportsEvents, sportsMultipliers);
      if (prediction) newRows.push(prediction);
    }
  }
  
  if (newRows.length > 0) {
    modelSheet.getRange(modelSheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
    Logger.log('Generated ' + newRows.length + ' new predictions');
  }
  
  Logger.log('=== Model Forecast Generation Complete ===');
}


// ============================================================================
// PREDICTION BUILDER (v6 — uses all 5 features)
// ============================================================================

function buildPredictionForDate(location, targetDate, salesByLocDate, coefficients, multipliers, dowConfidence, sportsEvents, sportsMultipliers) {
  var targetKey = normalizeDateForModel(targetDate);
  var market = getMarketForLocation(location);
  var season = getSeasonForDate(targetDate);
  var dow = targetDate.getDay();

  var pwDate = new Date(targetDate);
  pwDate.setDate(pwDate.getDate() - 7);
  var pwKey = location + '|' + normalizeDateForModel(pwDate);
  var pwData = salesByLocDate[pwKey];

  var holiday = getModelHoliday(targetDate) || '';

  var sportsTeams = (sportsEvents && typeof getSportsTeamsForLocation === 'function')
    ? getSportsTeamsForLocation(sportsEvents, location, targetDate) : [];
  var sportsActive = !holiday && sportsTeams.length > 0;
  var sportsMult = 1.0;
  if (sportsActive && sportsMultipliers && typeof getSportsMultiplier === 'function') {
    var mults = [];
    for (var st = 0; st < sportsTeams.length; st++) {
      mults.push(getSportsMultiplier(sportsMultipliers, location, sportsTeams[st]));
    }
    sportsMult = (typeof combineSportsMultipliers === 'function') ? combineSportsMultipliers(mults) : mults[0];
    if (sportsMult === 1.0) sportsActive = false;
  }
  var generatedAt = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy HH:mm');
  
  var versionLabel = '';
  if (coefficients._meta && coefficients._meta[market] && coefficients._meta[market][season]) {
    versionLabel = (coefficients._meta[market][season].version || 1) + ':' + market + '/' + season;
  } else {
    versionLabel = '1:' + market + '/' + season;
  }
  
  var dowConf = (dowConfidence[location] && dowConfidence[location][dow]) || 'med';
  
  if (pwData && pwData.sales && pwData.sales > 0) {
    var pwSales = pwData.sales;
    var method = 'pw';
    
    var outlierThreshold = getCoefficient(coefficients, market, season, 'outlier_threshold');
    var outlierWeight = getCoefficient(coefficients, market, season, 'outlier_pw_weight');
    var avgSamples = [];
    for (var w = 1; w <= 8; w++) {
      var pastDate = new Date(targetDate);
      pastDate.setDate(pastDate.getDate() - (7 * w));
      if (getModelHoliday(pastDate)) continue;
      var pastKey = location + '|' + normalizeDateForModel(pastDate);
      var pastData = salesByLocDate[pastKey];
      if (pastData && pastData.sales > 0) {
        avgSamples.push(pastData.sales);
      }
    }

    var avgCount = avgSamples.length;
    var avg = 0;
    if (avgCount >= 2) {
      var sorted = avgSamples.slice().sort(function(a, b) { return a - b; });
      avg = sorted[Math.floor(sorted.length / 2)];
      var deviation = Math.abs(pwSales - avg) / avg;
      if (deviation > outlierThreshold) {
        pwSales = pwSales * outlierWeight + avg * (1 - outlierWeight);
        method = 'blend';
      }
    }
    
    var targetData = salesByLocDate[location + '|' + targetKey];
    var weatherAdj = 0;
    var tempDiff = null;
    var condChange = '';
    
    var targetTemp = targetData ? targetData.temp : null;
    var targetCond = targetData ? targetData.conditions : '';
    var pwTemp = pwData.temp;
    var pwCond = pwData.conditions;
    
    if (targetTemp !== null && pwTemp !== null) {
      tempDiff = targetTemp - pwTemp;
      var bucket = getModelTempBucket(tempDiff);
      weatherAdj = getCoefficient(coefficients, market, season, bucket);
      
      var targetIsRain = isModelRainy(targetCond);
      var pwIsRain = isModelRainy(pwCond);
      
      if (targetIsRain && !pwIsRain) {
        weatherAdj += getCoefficient(coefficients, market, season, 'rain_new');
        condChange = 'Dry\u2192Rain';
      } else if (!targetIsRain && pwIsRain) {
        weatherAdj += getCoefficient(coefficients, market, season, 'rain_cleared');
        condChange = 'Rain\u2192Dry';
      }
      
      weatherAdj = Math.max(-0.30, Math.min(0.30, weatherAdj));
    } else {
      dowConf = 'low';
    }
    
    var predicted = pwSales * (1 + weatherAdj);
    
    if (holiday) {
      var hMult = getHolidayMultiplier(multipliers, location, holiday);
      if (hMult !== 1.0) {
        if (avgCount >= 2) {
          predicted = avg * hMult;
          method = 'holiday';
        } else {
          predicted = predicted * hMult;
          method = 'pw+holiday';
        }
      }
    }
    
    if (sportsActive && sportsMult !== 1.0) {
      predicted = predicted * sportsMult;
      if (method === 'pw') method = 'pw+sports';
      else if (method === 'blend') method = 'blend+sports';
    }

    var predictedNoMom = predicted;

    if (!holiday && !sportsActive) {
      var momentum = computeMomentum(location, targetDate, salesByLocDate);
      if (momentum !== 0) {
        var combinedAdj = Math.max(-0.30, Math.min(0.30, weatherAdj + momentum));
        predicted = pwSales * (1 + combinedAdj);
        if (method === 'pw') method = 'pw+mom';
        else if (method === 'blend') method = 'blend+mom';
      }
    }

    predicted = Math.round(predicted);
    predictedNoMom = Math.round(predictedNoMom);
    var weatherAdjPct = Math.round(weatherAdj * 100);

    return [
      targetKey, location, predicted, '', '', '',
      Math.round(pwSales), weatherAdjPct, tempDiff,
      condChange, method, dowConf,
      versionLabel, generatedAt, holiday, predictedNoMom
    ];
  }
  
  var avgSamplesF = [];
  for (var w2 = 1; w2 <= 8; w2++) {
    var pastDateF = new Date(targetDate);
    pastDateF.setDate(pastDateF.getDate() - (7 * w2));
    if (getModelHoliday(pastDateF)) continue;
    var pastKeyF = location + '|' + normalizeDateForModel(pastDateF);
    var pastDataF = salesByLocDate[pastKeyF];
    if (pastDataF && pastDataF.sales > 0) {
      avgSamplesF.push(pastDataF.sales);
    }
  }

  if (avgSamplesF.length > 0) {
    var sortedF = avgSamplesF.slice().sort(function(a, b) { return a - b; });
    var avgSales = sortedF[Math.floor(sortedF.length / 2)];
    var targetDataAvg = salesByLocDate[location + '|' + targetKey];
    var weatherAdjAvg = 0;
    var tempDiffAvg = null;
    
    if (targetDataAvg && targetDataAvg.temp !== null) {
      var idealTemp = 75;
      var diff = targetDataAvg.temp - idealTemp;
      if (diff < -20) weatherAdjAvg = -0.12;
      else if (diff < -10) weatherAdjAvg = -0.06;
      else if (diff < 0) weatherAdjAvg = -0.02;
      else if (diff <= 10) weatherAdjAvg = 0.04;
      else weatherAdjAvg = 0.02;
      if (isModelRainy(targetDataAvg.conditions)) weatherAdjAvg -= 0.08;
      tempDiffAvg = Math.round(diff);
    }
    
    var predictedAvg = avgSales * (1 + weatherAdjAvg);
    var methodAvg = 'avg';
    
    if (holiday) {
      var hMultAvg = getHolidayMultiplier(multipliers, location, holiday);
      if (hMultAvg !== 1.0) {
        predictedAvg = avgSales * hMultAvg;
        methodAvg = 'holiday';
      }
    } else if (sportsActive && sportsMult !== 1.0) {
      predictedAvg = predictedAvg * sportsMult;
      methodAvg = 'avg+sports';
    }

    return [
      targetKey, location, Math.round(predictedAvg), '', '', '',
      Math.round(avgSales), Math.round(weatherAdjAvg * 100), tempDiffAvg,
      '', methodAvg, 'low',
      versionLabel, generatedAt, holiday, Math.round(predictedAvg)
    ];
  }

  return [
    targetKey, location, 0, '', '', '',
    0, 0, null,
    '', 'insufficient', 'low',
    versionLabel, generatedAt, holiday, 0
  ];
}


// ============================================================================
// BACKFILL MISSING PREDICTIONS
// ============================================================================

function backfillMissingPredictions() {
  Logger.log('=== Backfilling Missing Predictions ===');
  
  var BACKFILL_START = new Date(2026, 1, 20);
  
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var modelSheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!modelSheet) { Logger.log('ERROR: Model Forecast sheet not found'); return; }
  
  var forecastDataSheet = ss.getSheetByName(MODEL_CONFIG.FORECAST_DATA_SHEET);
  if (!forecastDataSheet) { Logger.log('ERROR: Forecast Data sheet not found'); return; }
  
  var allData = forecastDataSheet.getDataRange().getValues();
  var salesByLocDate = {};
  for (var i = 1; i < allData.length; i++) {
    var dateRaw = allData[i][0];
    var location = allData[i][1] ? allData[i][1].toString().trim() : '';
    var sales = parseFloat(allData[i][2]) || 0;
    var temp = parseFloat(allData[i][3]) || null;
    var conditions = allData[i][4] ? allData[i][4].toString().trim() : '';
    if (!dateRaw || !location) continue;
    var dateKey = normalizeDateForModel(dateRaw);
    salesByLocDate[location + '|' + dateKey] = { sales: sales, temp: temp, conditions: conditions };
  }
  
  var modelData = modelSheet.getDataRange().getValues();
  var existing = {};
  for (var j = 1; j < modelData.length; j++) {
    var dr = modelData[j][0];
    var lc = modelData[j][1] ? modelData[j][1].toString().trim() : '';
    if (!dr || !lc) continue;
    existing[lc + '|' + normalizeDateForModel(dr)] = true;
  }
  
  var coefficients = loadModelCoefficients(ss);
  var multipliers = loadHolidayMultipliers(ss);
  var dowConfidence = loadDOWConfidence(ss);
  var sportsEvents = (typeof loadSportsEvents === 'function') ? loadSportsEvents(ss) : {};
  var sportsMultipliers = (typeof loadSportsMultipliers === 'function') ? loadSportsMultipliers(ss) : { location: {}, market: {}, global: {} };
  
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  
  var newRows = [];
  var cursor = new Date(BACKFILL_START);
  cursor.setHours(0, 0, 0, 0);
  
  while (cursor < today) {
    var cursorKey = normalizeDateForModel(cursor);
    
    for (var locIdx = 0; locIdx < MODEL_CONFIG.LOCATIONS.length; locIdx++) {
      var location = MODEL_CONFIG.LOCATIONS[locIdx];
      var existKey = location + '|' + cursorKey;
      if (existing[existKey]) continue;
      
      var prediction = buildPredictionForDate(location, cursor, salesByLocDate, coefficients, multipliers, dowConfidence, sportsEvents, sportsMultipliers);
      if (!prediction) continue;
      
      prediction[10] = 'backfill';
      
      var actualLookup = salesByLocDate[existKey];
      if (actualLookup && actualLookup.sales > 0) {
        var predictedVal = prediction[2];
        var actualVal = actualLookup.sales;
        var variance = actualVal - predictedVal;
        var accuracy = predictedVal > 0 ? (1 - Math.abs(variance) / actualVal) * 100 : 0;
        prediction[3] = actualVal;
        prediction[4] = variance;
        prediction[5] = Math.round(accuracy * 10) / 10;
      }
      
      newRows.push(prediction);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  
  if (newRows.length > 0) {
    var startRow = modelSheet.getLastRow() + 1;
    var chunkSize = 500;
    for (var c = 0; c < newRows.length; c += chunkSize) {
      var chunk = newRows.slice(c, c + chunkSize);
      modelSheet.getRange(startRow + c, 1, chunk.length, chunk[0].length).setValues(chunk);
    }
    Logger.log('Backfilled ' + newRows.length + ' rows');
  }
  
  Logger.log('=== Backfill Complete ===');
}


// ============================================================================
// COEFFICIENT AUTO-TUNING (v6 — per market × season)
// ============================================================================

function tuneCoefficients() {
  Logger.log('=== Auto-Tuning Coefficients (v6) ===');
  
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var modelSheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!modelSheet) { Logger.log('No Model Forecast sheet.'); return; }
  
  var coefficients = loadModelCoefficients(ss);
  var sportsEvents = (typeof loadSportsEvents === 'function') ? loadSportsEvents(ss) : {};
  var r365Signals = (typeof loadR365Signals === 'function') ? loadR365Signals(ss) : { byKey: {}, medianHours: {} };
  var data = modelSheet.getDataRange().getValues();
  if (data.length < 2) { Logger.log('No data yet.'); return; }

  var bucketErrors = {};
  var rainErrors = {};
  var totalRows = 0, usableRows = 0, holidaySkipped = 0, backfillSkipped = 0, outlierSkipped = 0, sportsSkipped = 0;
  var promoSkipped = 0, capacitySkipped = 0, voidSkipped = 0;
  var outlierThresh = MODEL_CONFIG.TUNING.OUTLIER_REJECT_THRESHOLD;

  for (var i = 1; i < data.length; i++) {
    var predicted = parseFloat(data[i][2]) || 0;
    var actual = parseFloat(data[i][3]) || 0;
    var tempDiff = data[i][8];
    var condChange = data[i][9] ? data[i][9].toString().trim() : '';
    var holidayFlag = (data[i].length > 14 && data[i][14]) ? data[i][14].toString().trim() : '';
    var method = data[i][10] ? data[i][10].toString().trim() : '';
    var location = data[i][1] ? data[i][1].toString().trim() : '';

    if (!predicted || !actual || predicted <= 0 || actual <= 0) continue;
    totalRows++;

    if (method === 'backfill' || method === 'insufficient') { backfillSkipped++; continue; }

    var rowDate = new Date(data[i][0]);
    if (holidayFlag || isHolidayAdjacent(rowDate) || getSpringBreakLabel(rowDate)) {
      holidaySkipped++; continue;
    }

    if (method.indexOf('holiday') >= 0) continue;

    if (method.indexOf('sports') >= 0) { sportsSkipped++; continue; }
    var rowSportsTeams = (typeof getSportsTeamsForLocation === 'function')
      ? getSportsTeamsForLocation(sportsEvents, location, rowDate) : [];
    if (rowSportsTeams.length > 0) { sportsSkipped++; continue; }

    if (r365Signals && r365Signals.byKey && typeof isAbnormalDay === 'function') {
      var sigKey = location + '|' + normalizeDateForModel(rowDate);
      var sig = r365Signals.byKey[sigKey];
      if (sig) {
        var medHours = r365Signals.medianHours[location];
        var reason = isAbnormalDay(sig, medHours);
        if (reason === 'promo') { promoSkipped++; continue; }
        if (reason === 'capacity') { capacitySkipped++; continue; }
        if (reason === 'voids') { voidSkipped++; continue; }
      }
    }

    if (Math.abs(actual - predicted) / actual > outlierThresh) {
      outlierSkipped++; continue;
    }

    usableRows++;
    
    if (tempDiff === '' || tempDiff === null || tempDiff === undefined) continue;
    tempDiff = parseFloat(tempDiff);
    if (isNaN(tempDiff)) continue;
    
    var pwSales = parseFloat(data[i][6]) || 0;
    if (pwSales <= 0) continue;
    
    var idealCoeff = (actual / pwSales) - 1;
    var bucket = getModelTempBucket(tempDiff);
    var market = getMarketForLocation(location);
    var season = getSeasonForDate(rowDate);
    
    if (!bucketErrors[market]) bucketErrors[market] = {};
    if (!bucketErrors[market][season]) bucketErrors[market][season] = {};
    if (!bucketErrors[market][season][bucket]) bucketErrors[market][season][bucket] = [];
    bucketErrors[market][season][bucket].push(idealCoeff);
    
    if (condChange.indexOf('Rain') >= 0 || condChange.indexOf('Dry') >= 0) {
      if (!rainErrors[market]) rainErrors[market] = {};
      if (!rainErrors[market][season]) rainErrors[market][season] = { rain_new: [], rain_cleared: [] };
      if (condChange.indexOf('Dry') === 0) rainErrors[market][season].rain_new.push(idealCoeff);
      else if (condChange.indexOf('Rain') === 0) rainErrors[market][season].rain_cleared.push(idealCoeff);
    }
  }
  
  Logger.log('Rows with actuals: ' + totalRows + ', usable: ' + usableRows + ', holiday-skipped: ' + holidaySkipped + ', sports-skipped: ' + sportsSkipped + ', promo-skipped: ' + promoSkipped + ', capacity-skipped: ' + capacitySkipped + ', void-skipped: ' + voidSkipped + ', backfill-skipped: ' + backfillSkipped + ', outlier-skipped: ' + outlierSkipped);
  
  var maxMove = MODEL_CONFIG.TUNING.MAX_SINGLE_MOVE;
  var minSamples = MODEL_CONFIG.TUNING.MIN_SAMPLES_FOR_TUNE;
  var minRain = MODEL_CONFIG.TUNING.MIN_SAMPLES_FOR_RAIN;
  var signFlipMin = MODEL_CONFIG.TUNING.SIGN_FLIP_MIN_SAMPLES;
  
  for (var mIdx = 0; mIdx < MODEL_CONFIG.ALL_MARKETS.length; mIdx++) {
    var mkt = MODEL_CONFIG.ALL_MARKETS[mIdx];
    if (!bucketErrors[mkt]) continue;
    
    for (var sIdx = 0; sIdx < MODEL_CONFIG.ALL_SEASONS.length; sIdx++) {
      var ssn = MODEL_CONFIG.ALL_SEASONS[sIdx];
      if (!bucketErrors[mkt][ssn]) continue;
      
      var localChanged = false;
      
      var bucketNames = Object.keys(bucketErrors[mkt][ssn]);
      for (var b = 0; b < bucketNames.length; b++) {
        var bName = bucketNames[b];
        var samples = bucketErrors[mkt][ssn][bName];
        if (samples.length < minSamples) continue;
        
        samples.sort(function(a, b) { return a - b; });
        var median = samples[Math.floor(samples.length / 2)];
        
        var currentVal = coefficients[mkt][ssn][bName];
        var proposed = currentVal * 0.7 + median * 0.3;
        proposed = Math.max(-0.30, Math.min(0.30, proposed));
        proposed = Math.round(proposed * 1000) / 1000;
        
        var moveSize = Math.abs(proposed - currentVal);
        var signFlip = (currentVal !== 0) && (Math.sign(proposed) !== Math.sign(currentVal));
        
        if (moveSize > maxMove) {
          Logger.log(mkt + '/' + ssn + ' SKIPPED ' + bName + ': move ' + moveSize.toFixed(3) + ' > max ' + maxMove);
          continue;
        }
        if (signFlip && samples.length < signFlipMin) {
          Logger.log(mkt + '/' + ssn + ' SKIPPED ' + bName + ': sign flip needs ' + signFlipMin + '+ samples');
          continue;
        }
        if (Math.abs(proposed - currentVal) > 0.001) {
          Logger.log(mkt + '/' + ssn + ' ' + bName + ': ' + currentVal + ' -> ' + proposed + ' (' + samples.length + ' samples)');
          coefficients[mkt][ssn][bName] = proposed;
          localChanged = true;
        }
      }
      
      if (rainErrors[mkt] && rainErrors[mkt][ssn]) {
        var rainKeys = ['rain_new', 'rain_cleared'];
        for (var r = 0; r < rainKeys.length; r++) {
          var rName = rainKeys[r];
          var rSamples = rainErrors[mkt][ssn][rName];
          if (rSamples.length < minRain) continue;
          
          rSamples.sort(function(a, b) { return a - b; });
          var rMedian = rSamples[Math.floor(rSamples.length / 2)];
          var rCurrent = coefficients[mkt][ssn][rName];
          var rProposed = rCurrent + rMedian * 0.3;
          rProposed = Math.max(-0.25, Math.min(0.25, rProposed));
          rProposed = Math.round(rProposed * 1000) / 1000;
          
          var rMoveSize = Math.abs(rProposed - rCurrent);
          var rSignFlip = (rCurrent !== 0) && (Math.sign(rProposed) !== Math.sign(rCurrent));
          
          if (rMoveSize > maxMove) continue;
          if (rSignFlip && rSamples.length < signFlipMin) continue;
          if (Math.abs(rProposed - rCurrent) > 0.001) {
            Logger.log(mkt + '/' + ssn + ' ' + rName + ': ' + rCurrent + ' -> ' + rProposed);
            coefficients[mkt][ssn][rName] = rProposed;
            localChanged = true;
          }
        }
      }
      
      if (localChanged) {
        if (!coefficients._meta[mkt]) coefficients._meta[mkt] = {};
        if (!coefficients._meta[mkt][ssn]) coefficients._meta[mkt][ssn] = { version: 1 };
        coefficients._meta[mkt][ssn].version = (parseInt(coefficients._meta[mkt][ssn].version) || 0) + 1;
        coefficients._meta[mkt][ssn].last_tuned = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy');
      }
    }
  }
  
  saveModelCoefficients(ss, coefficients);
  Logger.log('=== Auto-Tuning Complete ===');
}


// ============================================================================
// TEMPERATURE BUCKET MAPPING
// ============================================================================

function getModelTempBucket(tempDiff) {
  if (tempDiff >= 15) return 'temp_15plus';
  if (tempDiff >= 10) return 'temp_10to15';
  if (tempDiff >= 5) return 'temp_5to10';
  if (tempDiff >= 3) return 'temp_3to5';
  if (tempDiff <= -15) return 'temp_neg15plus';
  if (tempDiff <= -10) return 'temp_neg10to15';
  if (tempDiff <= -5) return 'temp_neg5to10';
  if (tempDiff <= -3) return 'temp_neg3to5';
  return 'temp_similar';
}

function isModelRainy(conditions) {
  if (!conditions) return false;
  var c = conditions.toString().toLowerCase();
  return c.indexOf('rain') !== -1 || c.indexOf('storm') !== -1 || 
         c.indexOf('shower') !== -1 || c.indexOf('drizzle') !== -1 ||
         c.indexOf('freezing') !== -1;
}


// ============================================================================
// MIGRATION FROM V5 → V6 (one-time, run once after deploy)
// ============================================================================

function migrateCoefficientsToV6() {
  Logger.log('=== Migrating Coefficients to V6 (Market × Season) ===');
  
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MODEL_CONFIG.COEFFICIENTS_SHEET);
  
  var flatCoeffs = {};
  if (sheet) {
    try {
      var data = sheet.getDataRange().getValues();
      if (data.length > 0 && data[0].length <= 3) {
        Logger.log('Detected v5 flat schema, migrating...');
        for (var i = 1; i < data.length; i++) {
          var k = data[i][0] ? data[i][0].toString().trim() : '';
          var v = data[i][1];
          if (!k) continue;
          if (k === 'version' || k === 'last_tuned') continue;
          flatCoeffs[k] = (typeof v === 'number') ? v : parseFloat(v) || 0;
        }
      } else {
        Logger.log('Sheet already has v6 schema or is empty. Migration not needed.');
        var freshCoeffs = buildDefaultCoefficientStructure();
        saveModelCoefficients(ss, freshCoeffs);
        return;
      }
    } catch (e) {
      Logger.log('Error reading existing coefficients: ' + e.toString());
    }
  }
  
  var defaults = MODEL_CONFIG.DEFAULT_COEFFICIENTS;
  var seedValues = {};
  var keys = Object.keys(defaults);
  for (var k = 0; k < keys.length; k++) {
    seedValues[keys[k]] = (flatCoeffs[keys[k]] !== undefined) ? flatCoeffs[keys[k]] : defaults[keys[k]];
  }
  
  Logger.log('Seed values: ' + JSON.stringify(seedValues));
  
  var coefficients = { _meta: {} };
  for (var mIdx = 0; mIdx < MODEL_CONFIG.ALL_MARKETS.length; mIdx++) {
    var mkt = MODEL_CONFIG.ALL_MARKETS[mIdx];
    coefficients[mkt] = {};
    coefficients._meta[mkt] = {};
    for (var sIdx = 0; sIdx < MODEL_CONFIG.ALL_SEASONS.length; sIdx++) {
      var ssn = MODEL_CONFIG.ALL_SEASONS[sIdx];
      coefficients[mkt][ssn] = JSON.parse(JSON.stringify(seedValues));
      coefficients._meta[mkt][ssn] = { version: 1, last_tuned: '' };
    }
  }
  
  if (sheet) sheet.clear();
  saveModelCoefficients(ss, coefficients);
  
  Logger.log('=== Migration to V6 Complete ===');
}


// ============================================================================
// HELPERS + UTILITIES
// ============================================================================

function normalizeDateForModel(dateVal) {
  if (!dateVal) return '';
  if (dateVal instanceof Date) {
    return (dateVal.getMonth() + 1) + '/' + dateVal.getDate() + '/' + dateVal.getFullYear();
  }
  var str = dateVal.toString().trim();
  var parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return (parsed.getMonth() + 1) + '/' + parsed.getDate() + '/' + parsed.getFullYear();
  }
  return str;
}

function resetCoefficientsToDefaults() {
  Logger.log('=== Resetting Coefficients to V6 Defaults ===');
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var fresh = buildDefaultCoefficientStructure();
  saveModelCoefficients(ss, fresh);
  Logger.log('=== Reset Complete ===');
}

function backfillHolidayFlags() {
  Logger.log('=== Backfilling Holiday Flags ===');
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!sheet) { Logger.log('No Model Forecast sheet'); return; }
  
  var data = sheet.getDataRange().getValues();
  var updated = 0;
  for (var i = 1; i < data.length; i++) {
    var dateRaw = data[i][0];
    if (!dateRaw) continue;
    var d = new Date(dateRaw);
    if (isNaN(d.getTime())) continue;
    var existing = (data[i].length > 14 && data[i][14]) ? data[i][14].toString().trim() : '';
    var holiday = getModelHoliday(d) || '';
    if (holiday && !existing) {
      sheet.getRange(i + 1, 15).setValue(holiday);
      updated++;
    }
  }
  Logger.log('Backfilled ' + updated + ' holiday flags');
}

function cleanOldModelForecasts() {
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MODEL_CONFIG.MODEL_FORECAST_SHEET);
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  for (var i = data.length - 1; i >= 1; i--) {
    var rowDate = new Date(data[i][0]);
    if (!isNaN(rowDate.getTime()) && rowDate < cutoff) sheet.deleteRow(i + 1);
  }
  Logger.log('Cleaned old forecasts (>90 days)');
}

function testModelForecast() { generateModelForecasts(); }
function testTuneCoefficients() { tuneCoefficients(); }
function testLearnHolidayMultipliers() { learnHolidayMultipliers(); }
function testComputeDOWConfidence() { computeDayOfWeekConfidence(); }

function resetModelForecast() {
  Logger.log('=== Resetting All Model Sheets ===');
  var ss = SpreadsheetApp.openById(MODEL_CONFIG.SPREADSHEET_ID);
  var sheets = [
    MODEL_CONFIG.MODEL_FORECAST_SHEET,
    MODEL_CONFIG.COEFFICIENTS_SHEET,
    MODEL_CONFIG.COEFFICIENTS_SHEET + ' (Pivot)',
    MODEL_CONFIG.HOLIDAY_MULTIPLIERS_SHEET,
    MODEL_CONFIG.DOW_CONFIDENCE_SHEET
  ];
  for (var i = 0; i < sheets.length; i++) {
    var s = ss.getSheetByName(sheets[i]);
    if (s) ss.deleteSheet(s);
  }
  Logger.log('=== Reset Complete ===');
}