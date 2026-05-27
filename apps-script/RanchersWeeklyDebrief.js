// ============================================================================
// RANCHERS WEEKLY DEBRIEF
// Sends Monday 8:00 AM plain-English summary of the prior week's performance.
//
// - No grades surfaced in email — used internally only to drive content
// - Market-level rollups (Tulsa, OKC, Dallas, Orlando)
// - Week-over-week labor trend direction
// - Forecast miss streaks across the week
// - Flags stores that consistently missed forecast AND went over scheduled hours
// - Flags stores buying sales with excess labor
// - Flags stores potentially understaffed (15%+ under optimal)
// - Optimal is a target — within 5% over / 15% under is reasonable
// - Auto-clockout = reported hours OVERSTATED (actual hours worked were LESS)
// - Weekly excess cost only counts hours beyond 5% buffer over optimal
// - Constructive tone — direct but not harsh. Frame problems as areas to improve.
// - Claremore is a new store — give grace period on metrics.
//
// SETUP:
//   1. Add as new script file "RanchersWeeklyDebrief" in your Apps Script project
//   2. Same ANTHROPIC_API_KEY Script Property as daily debrief
//   3. Run setupWeeklyDebriefTrigger() ONCE
//   4. Run testWeeklyDebrief() to preview
// ============================================================================

var WEEKLY_CONFIG = {
  SPREADSHEET_ID:      '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  SALES_SHEET:         'Flash - Daily Sales',
  LABOR_SHEET:         'Flash - Daily Labor',
  CLOCKOUT_SHEET:      'Auto-Clockouts',
  RECIPIENTS:          'dalton@rancherscustard.com,josh@rancherscustard.com,eric@rancherscustard.com,kandacegiles@rancherscustard.com,steve@rancherscustard.com',
  SEND_HOUR:           7,
  STREAK_THRESHOLD:    3,
  LABOR_COST_PER_HR:   17,
  OPT_OVER_BUFFER_PCT: 5,
  OPT_UNDER_PCT:       15,
  BUYING_SALES_PCT:    0.20  // flag if excess scheduled labor cost > 20% of sales gain
};

// Auto-clockout escalation thresholds (distinct days in the week)
var WAC_CHRONIC = 3; // 3+ days = chronic discipline problem
var WAC_PATTERN = 2; // 2 days = becoming a pattern

// Stores on the watch list get flagged in Problems even if they don't hit
// the standard isProblem threshold — same list as the daily debrief.
var WEEKLY_WATCH_LIST = ['Allen', 'Frisco #3'];

// New stores in ramp-up period — mention context in debrief, don't critique harshly.
// Remove a store from this list once it's been open ~2 months and is stabilized.
var WEEKLY_NEW_STORES = ['Claremore'];

var WEEKLY_MARKETS = {
  'Tulsa':   ['Bixby', 'Yale', 'Broken Arrow', 'Owasso', 'Claremore'],
  'OKC':     ['Warr Acres', 'Penn', 'Edmond', 'Norman'],
  'Dallas':  ['Carrollton', 'Frisco #1', 'Frisco #2', 'Frisco #3', 'The Colony', 'Hillcrest Village', 'Lake Highlands', 'Allen', 'Prosper'],
  'Orlando': ['Sanford', 'Lakeland', 'Hunter\'s Creek']
};

// ============================================================================
// MAIN
// ============================================================================

function sendWeeklyDebrief() {
  try {
    var ss        = SpreadsheetApp.openById(WEEKLY_CONFIG.SPREADSHEET_ID);
    var weekDates = getWeekDates(0, 7);
    var priorDates = getWeekDates(7, 14);
    var weekEnd   = weekDates[0];
    var weekStart = weekDates[weekDates.length - 1];

    Logger.log('Ranchers Weekly Debrief — ' + weekStart + ' through ' + weekEnd);

    var locations = buildWeeklyLocationData(ss, weekDates);
    if (locations.length === 0) {
      Logger.log('No data for the past week — skipping.');
      return;
    }

    var priorLocations    = buildWeeklyLocationData(ss, priorDates);
    var clockoutsByLoc    = getWeeklyClockoutCounts(ss, weekDates);
    var marketSummaries   = buildMarketSummaries(locations);
    var priorMarketTotals = buildPriorMarketTotals(priorLocations);

    locations.forEach(function(loc) {
      loc.autoClockouts = clockoutsByLoc[loc.location] || 0;
    });

    var narrative = writeWeeklyNarrative(locations, marketSummaries, priorMarketTotals, weekStart, weekEnd);
    var html      = buildWeeklyHtml(narrative, weekEnd);

    MailApp.sendEmail({
      to:       WEEKLY_CONFIG.RECIPIENTS,
      subject:  'Ranchers Weekly Debrief — Week Ending ' + fmtDisplayDateW(weekEnd),
      htmlBody: html
    });
    Logger.log('Weekly Debrief sent.');

  } catch (e) {
    Logger.log('Error in sendWeeklyDebrief: ' + e.toString());
  }
}

// ============================================================================
// DATA
// ============================================================================

function getWeekDates(daysStart, daysEnd) {
  var dates = [];
  for (var d = daysStart; d < daysEnd; d++) {
    var dt = new Date(); dt.setDate(dt.getDate() - 1 - d);
    dates.push(Utilities.formatDate(dt, 'America/Chicago', 'M/d/yyyy'));
  }
  return dates;
}

function getWeeklyMarket(locName) {
  var keys = Object.keys(WEEKLY_MARKETS);
  for (var i = 0; i < keys.length; i++) {
    if (WEEKLY_MARKETS[keys[i]].indexOf(locName) !== -1) return keys[i];
  }
  return 'Other';
}

function buildWeeklyLocationData(ss, weekDates) {
  var dateSet = {};
  weekDates.forEach(function(d) { dateSet[d] = true; });

  var salesMap = {};
  var salesSheet = ss.getSheetByName(WEEKLY_CONFIG.SALES_SHEET);
  if (salesSheet) {
    var sData = salesSheet.getDataRange().getValues();
    for (var i = 1; i < sData.length; i++) {
      var r = sData[i];
      if (!dateSet[normDateW(r[0])]) continue;
      var loc = String(r[1] || '').trim();
      if (!loc) continue;
      if (!salesMap[loc]) salesMap[loc] = { sales: 0, pySales: 0, fcVar: 0, fcMissDays: 0, fcDays: 0 };
      var sv = pnW(r[2]), pv = pnW(r[3]), fv = pnW(r[5]);
      if (sv) salesMap[loc].sales   += sv;
      if (pv) salesMap[loc].pySales += pv;
      if (fv) {
        salesMap[loc].fcVar += fv;
        salesMap[loc].fcDays++;
        if (fv < 0) salesMap[loc].fcMissDays++;
      }
    }
  }

  var laborMap = {};
  var laborSheet = ss.getSheetByName(WEEKLY_CONFIG.LABOR_SHEET);
  if (laborSheet) {
    var lData = laborSheet.getDataRange().getValues();
    for (var j = 1; j < lData.length; j++) {
      var lr   = lData[j];
      if (!dateSet[normDateW(lr[0])]) continue;
      var lloc = String(lr[1] || '').trim();
      if (!lloc) continue;
      if (!laborMap[lloc]) laborMap[lloc] = {
        actHrs: 0, schHrs: 0, optHrs: 0, laborDays: 0,
        dailyGrades: [], excessHrsBeyondBuffer: 0,
        missedFcOverSchDays: 0
      };
      var lm  = laborMap[lloc];
      var act = pnW(lr[3]) || 0;
      var opt = pnW(lr[4]) || 0;  // Col E = Optimal Hours
      var sch = pnW(lr[5]) || 0;  // Col F = Scheduled Hours
      lm.actHrs += act; lm.schHrs += sch; lm.optHrs += opt;
      lm.laborDays++;

      if (opt > 0) {
        var threshold = opt * (1 + WEEKLY_CONFIG.OPT_OVER_BUFFER_PCT / 100);
        if (act > threshold) lm.excessHrsBeyondBuffer += act - threshold;
      }

      var dayObj = {
        actHrs: act, schHrs: sch, optHrs: opt,
        laborPctVar: pnW(lr[8]), sales: pnW(lr[2]), forecastVariance: null
      };
      var g = calcGradeW(dayObj);
      lm.dailyGrades.push(g ? g.letter : null);

      // Track missed fc + over sch days
      var daySales = pnW(lr[2]);
      var dayFcVar = salesMap[lloc] ? null : null; // handled via salesMap below
      if (sch > 0 && act > sch * 1.02) lm.missedFcOverSchDays++;
    }
  }

  var allLocs = {};
  Object.keys(salesMap).forEach(function(loc) { allLocs[loc] = true; });
  Object.keys(laborMap).forEach(function(loc) { allLocs[loc] = true; });

  var locations = Object.keys(allLocs).map(function(loc) {
    var sm = salesMap[loc] || {};
    var lm = laborMap[loc] || {};

    var grades   = lm.dailyGrades || [];
    var badDays  = grades.filter(function(g) { return g === 'D' || g === 'F'; }).length;
    var goodDays = grades.filter(function(g) { return g === 'A' || g === 'B'; }).length;

    var isNewStore = WEEKLY_NEW_STORES.indexOf(loc) !== -1;

    // Buying sales with excess scheduled labor for the week
    var salesGain   = sm.fcVar || 0;
    var schOverHrs  = (lm.actHrs || 0) - (lm.schHrs || 0);
    var excessCost  = schOverHrs > 0 ? schOverHrs * WEEKLY_CONFIG.LABOR_COST_PER_HR : 0;
    var buyingSales = !isNewStore && salesGain > 0 && schOverHrs > 0 && excessCost > salesGain * WEEKLY_CONFIG.BUYING_SALES_PCT;

    // Understaffed for the week
    var weekUnderPct = (lm.optHrs > 0 && lm.actHrs < lm.optHrs)
      ? ((lm.optHrs - lm.actHrs) / lm.optHrs) * 100 : 0;

    // Missed forecast majority of days
    var fcMissRate = sm.fcDays > 0 ? sm.fcMissDays / sm.fcDays : 0;

    // New stores are excluded from isProblem designation
    var isProblem = !isNewStore && (
      ((sm.fcVar || 0) <= 0 && badDays >= WEEKLY_CONFIG.STREAK_THRESHOLD) ||
      WEEKLY_WATCH_LIST.indexOf(loc) !== -1
    );

    return {
      location:              loc,
      market:                getWeeklyMarket(loc),
      isNewStore:            isNewStore,
      sales:                 sm.sales   || 0,
      pySales:               sm.pySales || 0,
      fcVar:                 sm.fcVar   || 0,
      fcMissDays:            sm.fcMissDays || 0,
      fcDays:                sm.fcDays  || 0,
      fcMissRate:            fcMissRate,
      actHrs:                lm.actHrs  || 0,
      schHrs:                lm.schHrs  || 0,
      optHrs:                lm.optHrs  || 0,
      excessHrsBeyondBuffer: Math.round(lm.excessHrsBeyondBuffer || 0),
      grades:                grades.join(''),
      badDays:               badDays,
      goodDays:              goodDays,
      totalDays:             grades.length,
      isProblem:             isProblem,
      isWatchList:           WEEKLY_WATCH_LIST.indexOf(loc) !== -1,
      isStandout:            goodDays >= 5 && badDays === 0,
      buyingSalesWithLabor:  buyingSales,
      salesGainW:            Math.round(salesGain),
      excessHrsW:            schOverHrs.toFixed(1),
      understaffed:          weekUnderPct >= WEEKLY_CONFIG.OPT_UNDER_PCT,
      underPct:              weekUnderPct.toFixed(1),
      autoClockouts:         0
    };
  });

  locations.sort(function(a, b) { return a.location.localeCompare(b.location); });
  return locations;
}

// Returns distinct days with at least one auto-clockout per location
function getWeeklyClockoutCounts(ss, weekDates) {
  var sheet  = ss.getSheetByName(WEEKLY_CONFIG.CLOCKOUT_SHEET);
  var dayCounts = {};
  if (!sheet) return {};
  var dateSet = {};
  weekDates.forEach(function(d) { dateSet[d] = true; });
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var ds  = normDateW(data[i][0]);
    var loc = String(data[i][1] || '').trim();
    if (!loc || !dateSet[ds]) continue;
    if (!dayCounts[loc]) dayCounts[loc] = {};
    dayCounts[loc][ds] = true;
  }
  var result = {};
  Object.keys(dayCounts).forEach(function(loc) {
    result[loc] = Object.keys(dayCounts[loc]).length;
  });
  return result;
}

function buildMarketSummaries(locations) {
  var markets = {};
  locations.forEach(function(loc) {
    var m = loc.market;
    if (!markets[m]) markets[m] = {
      sales: 0, pySales: 0, fcVar: 0,
      actHrs: 0, optHrs: 0, excessBeyondBuffer: 0,
      badDayCount: 0, goodDayCount: 0, totalDays: 0,
      storeCount: 0
    };
    var mk = markets[m];
    mk.sales              += loc.sales;
    mk.pySales            += loc.pySales;
    mk.fcVar              += loc.fcVar;
    mk.actHrs             += loc.actHrs;
    mk.optHrs             += loc.optHrs;
    mk.excessBeyondBuffer += loc.excessHrsBeyondBuffer;
    mk.badDayCount        += loc.badDays;
    mk.goodDayCount       += loc.goodDays;
    mk.totalDays          += loc.totalDays;
    mk.storeCount++;
  });

  var result = {};
  Object.keys(markets).forEach(function(m) {
    var mk  = markets[m];
    var hrsOver = Math.round(mk.actHrs - mk.optHrs);
    var excessCost = mk.excessBeyondBuffer > 0
      ? Math.round(mk.excessBeyondBuffer * WEEKLY_CONFIG.LABOR_COST_PER_HR) : null;
    var pyPct = mk.pySales > 0
      ? (((mk.sales - mk.pySales) / mk.pySales) * 100).toFixed(1) : null;
    var fcVarFmt = (mk.fcVar >= 0 ? '+$' : '-$') + Math.abs(Math.round(mk.fcVar)).toLocaleString();
    result[m] = {
      market:       m,
      sales:        '$' + Math.round(mk.sales).toLocaleString(),
      vsPriorYear:  pyPct ? (pyPct > 0 ? '+' : '') + pyPct + '%' : null,
      vsForecast:   fcVarFmt,
      hrsOverOpt:   hrsOver,
      excessCost:   excessCost,
      storeCount:   mk.storeCount,
      badDayRate:   mk.totalDays > 0 ? ((mk.badDayCount / mk.totalDays) * 100).toFixed(0) + '%' : null
    };
  });
  return result;
}

function buildPriorMarketTotals(priorLocations) {
  var totals = {};
  priorLocations.forEach(function(loc) {
    var m = loc.market;
    if (!totals[m]) totals[m] = { actHrs: 0, optHrs: 0 };
    totals[m].actHrs += loc.actHrs;
    totals[m].optHrs += loc.optHrs;
  });
  var result = {};
  Object.keys(totals).forEach(function(m) {
    result[m] = Math.round(totals[m].actHrs - totals[m].optHrs);
  });
  return result;
}

// ============================================================================
// GRADE — internal use only
// ============================================================================

function calcGradeW(loc) {
  if (!loc.optHrs || loc.optHrs === 0) return null;

  var hoursVar    = (loc.actHrs || 0) - loc.optHrs;
  var hoursVarPct = (hoursVar / loc.optHrs) * 100;
  var hoursScore  = hoursVarPct > 0
    ? Math.max(0, 100 - (hoursVarPct * 8))
    : Math.max(0, 100 - (Math.abs(hoursVarPct) * 5));

  var lpv        = loc.laborPctVar || 0;
  var laborScore = 100;
  if (Math.abs(lpv) > 2) {
    var excess = Math.abs(lpv) - 2;
    laborScore = lpv > 0
      ? Math.max(0, 100 - (excess * 10))
      : Math.max(0, 100 - (excess * 5));
  }

  var schedScore = 100;
  if (loc.schHrs && loc.schHrs > 0) {
    var schVar    = (loc.actHrs || 0) - loc.schHrs;
    var schVarPct = Math.abs((schVar / loc.schHrs) * 100);
    if (schVarPct > 2) {
      var schExcess = schVarPct - 2;
      schedScore = Math.max(0, 100 - (schExcess * (schVar > 0 ? 5 : 3)));
    }
  }

  var composite = Math.min(100, Math.max(0,
    (laborScore * 0.45) + (hoursScore * 0.35) + (schedScore * 0.20)
  ));

  if (composite >= 90) return { letter: 'A', score: composite };
  if (composite >= 75) return { letter: 'B', score: composite };
  if (composite >= 60) return { letter: 'C', score: composite };
  if (composite >= 40) return { letter: 'D', score: composite };
  return { letter: 'F', score: composite };
}

// ============================================================================
// AI NARRATIVE
// ============================================================================

function writeWeeklyNarrative(locations, marketSummaries, priorMarketTotals, weekStart, weekEnd) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return weeklyFallback(locations, marketSummaries, weekStart, weekEnd);

  var totSales = 0, totPySales = 0, totFcVar = 0, totActHrs = 0, totOptHrs = 0, totSchHrs = 0;
  var totalExcessBeyondBuffer = 0;
  var problemStores = [], standoutStores = [], efficiencyStores = [], underStores = [], clockoutStores = [], newStoresSummary = [];

  locations.forEach(function(loc) {
    totSales              += loc.sales;
    totPySales            += loc.pySales;
    totFcVar              += loc.fcVar;
    totActHrs             += loc.actHrs;
    totOptHrs             += loc.optHrs;
    totSchHrs             += loc.schHrs;
    totalExcessBeyondBuffer += loc.excessHrsBeyondBuffer;

    // New stores get a separate summary, not placed in problems
    if (loc.isNewStore) {
      var nsPyPct = loc.pySales > 0 ? (((loc.sales - loc.pySales) / loc.pySales) * 100).toFixed(1) : null;
      var nsFcPct = loc.sales > 0 ? ((loc.fcVar / loc.sales) * 100).toFixed(1) : null;
      newStoresSummary.push({
        location:     loc.location,
        market:       loc.market,
        weeklySales:  '$' + Math.round(loc.sales).toLocaleString(),
        vsForecast:   nsFcPct ? (nsFcPct > 0 ? '+' : '') + nsFcPct + '%' : null,
        vsPriorYear:  nsPyPct ? (nsPyPct > 0 ? '+' : '') + nsPyPct + '%' : null,
        note:         'New store — still in ramp-up period. Metrics expected to be off as the team finds its rhythm.'
      });
      return;
    }

    if (loc.isProblem) {
      var pyPctLoc = loc.pySales > 0 ? (((loc.sales - loc.pySales) / loc.pySales) * 100).toFixed(1) : null;
      var fcPctLoc = loc.sales > 0 ? ((loc.fcVar / loc.sales) * 100).toFixed(1) : null;
      var hrsOverSch = (loc.actHrs - loc.schHrs).toFixed(1);
      var hrsOverOpt = (loc.actHrs - loc.optHrs).toFixed(1);
      problemStores.push({
        location:        loc.location,
        market:          loc.market,
        badDays:         loc.badDays,
        totalDays:       loc.totalDays,
        weeklySales:     '$' + Math.round(loc.sales).toLocaleString(),
        vsForecast:      fcPctLoc ? (fcPctLoc > 0 ? '+' : '') + fcPctLoc + '%' : null,
        fcVarDollars:    (loc.fcVar >= 0 ? '+$' : '-$') + Math.abs(Math.round(loc.fcVar)).toLocaleString(),
        vsPriorYear:     pyPctLoc ? (pyPctLoc > 0 ? '+' : '') + pyPctLoc + '%' : null,
        hrsOverScheduled: (parseFloat(hrsOverSch) > 0 ? '+' : '') + hrsOverSch + ' hrs vs scheduled (primary)',
        hrsOverOptimal:   (parseFloat(hrsOverOpt) > 0 ? '+' : '') + hrsOverOpt + ' hrs vs optimal (benchmark)',
        actHrs:          loc.actHrs.toFixed(1),
        schHrs:          loc.schHrs.toFixed(1),
        optHrs:          loc.optHrs.toFixed(1)
      });
    }
    if (loc.isStandout) standoutStores.push(loc.location + ' [' + loc.market + ']');
    if (loc.buyingSalesWithLabor) efficiencyStores.push(
      loc.location + ' — beat forecast by $' + loc.salesGainW.toLocaleString()
      + ' but ran ' + loc.excessHrsW + ' hrs over scheduled — the labor cost ate into the gain'
    );
    if (loc.understaffed) underStores.push(
      loc.location + ' — ' + loc.underPct + '% under optimal, may have been short-staffed'
    );
    if (loc.autoClockouts > 0) {
      var acDays = loc.autoClockouts; // in weekly, autoClockouts = distinct days
      var acMsg  = loc.location + ' — auto-clockouts on ' + acDays + ' day' + (acDays > 1 ? 's' : '') + ' this week. System clocked out at 3 AM, so reported hours are OVERSTATED — actual hours worked were LESS than recorded.';
      if (acDays >= WAC_CHRONIC) {
        acMsg += ' This needs to be addressed — it\'s been consistent.';
      } else if (acDays >= WAC_PATTERN) {
        acMsg += ' Something to keep an eye on.';
      }
      clockoutStores.push(acMsg);
    }
  });

  var pyVarPct   = totPySales > 0 ? (((totSales - totPySales) / totPySales) * 100).toFixed(1) : null;
  var fcVarFmt   = (totFcVar >= 0 ? '+$' : '-$') + Math.abs(Math.round(totFcVar)).toLocaleString();
  var rawHrsOverSch = Math.round(totActHrs - totSchHrs);
  var rawHrsOverOpt = Math.round(totActHrs - totOptHrs);
  var excessCost = totalExcessBeyondBuffer > 0
    ? Math.round(totalExcessBeyondBuffer * WEEKLY_CONFIG.LABOR_COST_PER_HR) : null;
  var annualized = excessCost ? Math.round(excessCost * 52) : null;

  // Market trend context (vs scheduled)
  var marketTrends = {};
  Object.keys(marketSummaries).forEach(function(m) {
    var mk       = marketSummaries[m];
    var prior    = priorMarketTotals[m];
    var trendStr = null;
    if (prior !== null && prior !== undefined) {
      var diff = mk.hrsOverOpt - prior;
      if (Math.abs(diff) >= 5) trendStr = diff > 0 ? 'worse than last week (+' + diff + ' hrs)' : 'better than last week (' + diff + ' hrs)';
      else trendStr = 'flat vs last week';
    }
    marketTrends[m] = trendStr;
  });

  var laborStr = rawHrsOverSch > 0
    ? rawHrsOverSch + ' hours over scheduled for the week (primary accountability metric)'
      + (rawHrsOverOpt > 0 ? '; ' + rawHrsOverOpt + ' hours over optimal (aspirational benchmark)' : '')
      + (excessCost ? '. Excess labor beyond acceptable range approximately $' + excessCost.toLocaleString() : '')
      + (annualized ? ' ($' + annualized.toLocaleString() + ' annualized)' : '')
    : 'At or under scheduled hours for the week'
      + (rawHrsOverOpt > 0 ? '; ' + rawHrsOverOpt + ' hours over optimal (aspirational benchmark)' : '');

  var marketBlob = Object.keys(marketSummaries).map(function(m) {
    return Object.assign({}, marketSummaries[m], { trendVsLastWeek: marketTrends[m] });
  });

  var dataBlob = {
    weekEnding:         fmtDisplayDateW(weekEnd),
    weekStarting:       fmtDisplayDateW(weekStart),
    totalSales:         '$' + Math.round(totSales).toLocaleString(),
    vsForecast:         fcVarFmt,
    vsPriorYear:        pyVarPct ? (pyVarPct > 0 ? '+' : '') + pyVarPct + '%' : null,
    laborContext:       laborStr,
    markets:            marketBlob,
    problemStores:      problemStores,
    standoutStores:     standoutStores,
    efficiencyWarnings: efficiencyStores,
    understaffedStores: underStores,
    clockoutStores:     clockoutStores,
    newStores:          newStoresSummary.length > 0 ? newStoresSummary : null
  };

  var prompt =
    'You are writing the Ranchers Weekly Debrief for Ranchers Custard Company (Andy\'s Frozen Custard). '
    + 'Monday morning operations email. Direct, conversational, and constructive. No subject line.\n\n'
    + 'TONE:\n'
    + '- Be direct but not harsh. Frame underperformance as areas that need attention, not failures.\n'
    + '- Use language like "needs attention," "worth looking into," "room for improvement," "opportunity to tighten up" — not "bad management" or blaming language.\n'
    + '- Acknowledge good results genuinely. When a store struggles, state the facts and suggest it\'s worth a closer look — don\'t pile on.\n'
    + '- The goal is to inform and drive action, not to punish.\n\n'
    + 'RULES:\n'
    + '1. Every number must come from the data provided. Do not invent or estimate figures.\n'
    + '2. Never mention grades. Never mention an hourly rate.\n'
    + '3. Never reference store locations or markets by geography — the reader knows where every store is.\n'
    + '4. PRIMARY labor metric is ACTUAL vs SCHEDULED hours. This is what management committed to.\n'
    + '5. Optimal hours is an aspirational benchmark — best-case scenario. Use as context, not primary accountability.\n'
    + '6. 15%+ under optimal = possible understaffing and lost sales.\n'
    + '7. Beating forecast with excess SCHEDULED labor is worth flagging when the labor cost exceeds 20% of the sales gain — the gain is real but the efficiency isn\'t there yet.\n'
    + '8. Missing forecast AND over scheduled hours = the combination that needs the most attention. Flag it clearly but constructively.\n'
    + '9. Auto-clockouts = the system clocked employees out at 3 AM, so reported hours are OVERSTATED. Actual hours worked were LESS than recorded. The labor picture is better than it appears, not worse.\n'
    + '10. If newStores are present in the data, include a brief note in Notes acknowledging their weekly results with context that they\'re still ramping up. Do NOT put new stores in Problems — their metrics are expected to be off. Do NOT critique them the same way you would an established store.\n'
    + '11. Never state a count of stores — just name them.\n'
    + '12. EVERY bullet and sentence must be written fresh based on that store\'s specific numbers. Never reuse the same phrasing, structure, or verdict across bullets. A reader should not be able to predict how the next bullet will be worded. Vary the language, the angle, and the emphasis based on what actually stands out about each store.\n'
    + '13. Every bullet that references a store must start with the store name in **double asterisks** like this: **Store Name** — required for formatting. No exceptions.\n\n'
    + 'FORMAT — follow exactly:\n\n'
    + 'Summary:\n'
    + 'Two to three sentences. Total weekly sales, vs forecast, vs prior year. Lead with hrsOverScheduled as the primary labor headline. Mention hrsOverOptimal only as benchmark context if meaningful. One sentence on market performance. Factual and direct.\n\n'
    + 'Problems:\n'
    + '- One bullet per problem store (isProblem = true). EVERY problem store must appear — no trimming.\n'
    + '- For each: store name, missed forecast by $X (-X%), vs prior year (+ or -%), hours over SCHEDULED (primary), bad days out of total days, one-sentence constructive observation about what stands out and what needs attention.\n'
    + '- Never mention watch list or any internal flag names.\n'
    + '- Include efficiencyWarnings stores here too — beat forecast but scheduled labor cost ate into the gain.\n\n'
    + 'Standouts:\n'
    + '- One bullet per standout store. Lead with what is most impressive about that store\'s week — forecast beat, year-over-year growth, labor discipline, or some combination. Each bullet should feel distinct.\n\n'
    + 'Notes:\n'
    + '- One bullet per item for understaffedStores and clockoutStores if present. Write each note based on the specific numbers — do not use boilerplate.\n'
    + '- If newStores are present, include one bullet per new store acknowledging their results with ramp-up context.\n'
    + '- Final line: one sentence summarizing the week — written as a plain sentence, NOT a bullet point.\n\n'
    + 'Do not include a title, header, or subject line at the top of the email.\n\n'
    + 'Data:\n' + JSON.stringify(dataBlob, null, 2);

  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1400,
        messages:   [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });
    var result = JSON.parse(resp.getContentText());
    if (result.content && result.content[0] && result.content[0].text) {
      return result.content[0].text.trim();
    }
    Logger.log('Unexpected API response: ' + resp.getContentText());
  } catch (e) {
    Logger.log('Claude API error: ' + e.toString());
  }
  return weeklyFallback(locations, marketSummaries, weekStart, weekEnd);
}

// ============================================================================
// FALLBACK NARRATIVE
// ============================================================================

function weeklyFallback(locations, marketSummaries, weekStart, weekEnd) {
  var totSales = 0, totPySales = 0, totFcVar = 0, totActHrs = 0, totOptHrs = 0;
  var totalExcess = 0;
  var problems = [], standouts = [], eff = [], under = [], ac = [], newStoresList = [];

  locations.forEach(function(loc) {
    totSales  += loc.sales; totPySales += loc.pySales; totFcVar  += loc.fcVar;
    totActHrs += loc.actHrs; totOptHrs += loc.optHrs;
    totalExcess += loc.excessHrsBeyondBuffer;
    if (loc.isNewStore) {
      newStoresList.push(loc.location);
      return; // Don't categorize new stores as problems
    }
    if (loc.isProblem)            problems.push(loc.location);
    if (loc.isStandout)           standouts.push(loc.location);
    if (loc.buyingSalesWithLabor) eff.push(loc.location);
    if (loc.understaffed)         under.push(loc.location);
    if (loc.autoClockouts > 0) {
      var wacLabel = loc.location + ' (' + loc.autoClockouts + ' day' + (loc.autoClockouts > 1 ? 's' : '');
      if (loc.autoClockouts >= WAC_CHRONIC) wacLabel += ' — needs attention';
      else if (loc.autoClockouts >= WAC_PATTERN) wacLabel += ' — worth watching';
      wacLabel += ')';
      ac.push(wacLabel);
    }
  });

  var pyPct      = totPySales > 0 ? (((totSales - totPySales) / totPySales) * 100).toFixed(1) : null;
  var rawHrsOver = Math.round(totActHrs - totOptHrs);
  var excessCost = totalExcess > 0 ? Math.round(totalExcess * WEEKLY_CONFIG.LABOR_COST_PER_HR) : null;

  var p1 = 'Summary:\nWeek ending ' + fmtDisplayDateW(weekEnd) + ' — $' + Math.round(totSales).toLocaleString() + ' total'
    + (pyPct ? ', ' + (pyPct > 0 ? 'up ' : 'down ') + Math.abs(pyPct) + '% vs prior year' : '')
    + ', ' + (totFcVar >= 0 ? '+$' : '-$') + Math.abs(Math.round(totFcVar)).toLocaleString() + ' vs forecast.'
    + (rawHrsOver > 0 ? ' ' + rawHrsOver + ' hours over optimal' + (excessCost ? ', $' + excessCost.toLocaleString() + ' in excess labor cost.' : '.') : '');

  var p2 = 'Problems:\n' + [
    problems.length > 0 ? problems.map(function(s) { return '- ' + s + ' had a tough week — worth looking into.'; }).join('\n') : '',
    eff.length > 0 ? eff.map(function(s) { return '- ' + s + ' beat forecast but ran over on labor — the gain was offset by cost.'; }).join('\n') : ''
  ].filter(Boolean).join('\n');

  var p3 = 'Standouts:\n' + (standouts.length > 0 ? standouts.map(function(s) { return '- ' + s; }).join('\n') : '- None this week.')
    + '\n\nNotes:\n' + [
    under.length > 0 ? '- ' + under.join(', ') + ' ran under optimal — may have been short-staffed.' : '',
    ac.length > 0 ? '- Auto-clockouts at ' + ac.join(', ') + ' — reported hours overstated.' : '',
    newStoresList.length > 0 ? '- ' + newStoresList.join(', ') + ' still ramping up — metrics expected to be off during the opening period.' : ''
  ].filter(Boolean).join('\n');

  return [p1, p2, p3].filter(Boolean).join('\n\n');
}

// ============================================================================
// EMAIL HTML
// ============================================================================

function buildWeeklyHtml(narrative, weekEnd) {
  var lines = narrative.split('\n');
  var body = '';
  var inList = false;
  var inSummary = false;

  lines.forEach(function(line) {
    var trimmed = line.trim();
    if (!trimmed) {
      if (inList) { body += '</ul>'; inList = false; }
      return;
    }
    if (/^(Summary|Problems|Standouts|Notes):?\s*$/i.test(trimmed)) {
      if (inList) { body += '</ul>'; inList = false; }
      inSummary = /^Summary/i.test(trimmed);
      body += '<p style="margin:20px 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:#1a2e4a;">' + trimmed.replace(/:$/, '') + '</p>';
      return;
    }
    if (trimmed.charAt(0) === '-') {
      if (!inList) { body += '<ul style="margin:0 0 4px;padding-left:18px;">'; inList = true; }
      inSummary = false;
      var content = trimmed.substring(1).trim()
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      body += '<li style="margin:0 0 9px;line-height:1.65;color:#1a1a1a;font-size:14px;">' + content + '</li>';
      return;
    }
    if (inList) { body += '</ul>'; inList = false; }
    var weight = inSummary ? 'font-weight:600;' : '';
    body += '<p style="margin:0 0 14px;line-height:1.8;color:#1a1a1a;font-size:15px;' + weight + '">' + trimmed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
  });

  if (inList) body += '</ul>';

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;">'
    + '<div style="max-width:620px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<div style="background:#1a2e4a;padding:24px 32px;">'
    + '<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 4px;">Ranchers Weekly Debrief</h1>'
    + '<p style="color:#a0b8d0;font-size:13px;margin:0;">Week Ending ' + fmtDisplayDateW(weekEnd) + '</p>'
    + '</div>'
    + '<div style="padding:28px 32px;border-bottom:3px solid #1a2e4a;">' + body + '</div>'
    + '<div style="padding:14px 32px;text-align:center;background:#f8f9fa;">'
    + '<p style="color:#888;font-size:12px;margin:0;">Andy\'s Dashboard &nbsp;&middot;&nbsp; <a href="https://andysdashboard.com" style="color:#1a2e4a;text-decoration:none;">andysdashboard.com</a></p>'
    + '</div></div></body></html>';
}

// ============================================================================
// TRIGGER SETUP
// ============================================================================

function setupWeeklyDebriefTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendWeeklyDebrief') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendWeeklyDebrief')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(WEEKLY_CONFIG.SEND_HOUR).inTimezone('America/Chicago').create();
  Logger.log('Weekly Debrief trigger set: ' + WEEKLY_CONFIG.SEND_HOUR + ':00 AM Central every Monday.');
}

// ============================================================================
// TEST
// ============================================================================

function testWeeklyDebrief() {
  var ss         = SpreadsheetApp.openById(WEEKLY_CONFIG.SPREADSHEET_ID);
  var weekDates  = getWeekDates(0, 7);
  var priorDates = getWeekDates(7, 14);
  var weekEnd    = weekDates[0];
  var weekStart  = weekDates[weekDates.length - 1];

  var locations         = buildWeeklyLocationData(ss, weekDates);
  var priorLocations    = buildWeeklyLocationData(ss, priorDates);
  var clockoutsByLoc    = getWeeklyClockoutCounts(ss, weekDates);
  var marketSummaries   = buildMarketSummaries(locations);
  var priorMarketTotals = buildPriorMarketTotals(priorLocations);

  locations.forEach(function(loc) { loc.autoClockouts = clockoutsByLoc[loc.location] || 0; });

  Logger.log('Week: ' + weekStart + ' — ' + weekEnd);
  Logger.log('Locations: ' + locations.length);

  Object.keys(marketSummaries).forEach(function(m) {
    var mk    = marketSummaries[m];
    var prior = priorMarketTotals[m];
    Logger.log('MARKET [' + m + '] Sales:' + mk.sales + ' FC:' + mk.vsForecast
      + ' HrsOver:' + mk.hrsOverOpt + ' ExcessCost:' + (mk.excessCost ? '$' + mk.excessCost : 'N/A')
      + ' PriorHrsOver:' + (prior !== undefined ? prior : 'N/A'));
  });

  locations.forEach(function(loc) {
    var flags = [];
    if (loc.isNewStore)           flags.push('NEW_STORE');
    if (loc.isProblem)            flags.push(loc.isWatchList ? 'WATCH_LIST' : 'PROBLEM');
    if (loc.isStandout)           flags.push('STANDOUT');
    if (loc.buyingSalesWithLabor) flags.push('BUYING_SALES');
    if (loc.understaffed)         flags.push('UNDERSTAFFED(' + loc.underPct + '%)');
    if (loc.autoClockouts > 0)    flags.push('AC:' + loc.autoClockouts);
    Logger.log(loc.location + ' [' + loc.market + ']'
      + '  HrsOvOpt:' + (loc.actHrs - loc.optHrs).toFixed(1)
      + '  ExcessBuf:' + loc.excessHrsBeyondBuffer
      + '  FcMiss:' + loc.fcMissDays + '/' + loc.fcDays
      + (flags.length ? '  [' + flags.join(', ') + ']' : ''));
  });

  if (locations.length === 0) { Logger.log('No data.'); return; }

  var narrative = writeWeeklyNarrative(locations, marketSummaries, priorMarketTotals, weekStart, weekEnd);
  Logger.log('--- NARRATIVE ---\n' + narrative);

  MailApp.sendEmail({
    to:       WEEKLY_CONFIG.RECIPIENTS,
    subject:  '[TEST] Ranchers Weekly Debrief — Week Ending ' + fmtDisplayDateW(weekEnd),
    htmlBody: buildWeeklyHtml(narrative, weekEnd)
  });
  Logger.log('Test sent.');
}

// ============================================================================
// UTILITIES
// ============================================================================

function normDateW(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'America/Chicago', 'M/d/yyyy');
  var m = val.toString().trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? parseInt(m[1]) + '/' + parseInt(m[2]) + '/' + m[3] : val.toString().trim();
}

function fmtDisplayDateW(ds) {
  try {
    var p = ds.split('/');
    var d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  } catch(e) { return ds; }
}

function pnW(val) {
  if (val === null || val === undefined || val === '') return null;
  var n = parseFloat(val); return isNaN(n) ? null : n;
}