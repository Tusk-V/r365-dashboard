// ============================================================================
// RANCHERS DAILY DEBRIEF
// 7:00 AM plain-English briefing about the prior day's performance.
//
// - No grades surfaced in email — used internally only to drive content
// - Day-of-week context when flagging excess hours
// - Week-over-week labor trend direction (vs prior 7-day window)
// - Forecast miss streaks (3+ consecutive days)
// - Flags stores that missed forecast AND went over scheduled hours
// - Flags stores buying sales with excess labor
// - Flags stores potentially understaffed (15%+ under optimal)
// - Optimal is a target — within 5% over / 15% under is reasonable
// - Auto-clockout = reported hours OVERSTATED (system clocks out at 3 AM,
//   actual hours worked were LESS than recorded)
// - Weekly excess cost only counts hours beyond 5% buffer over optimal
// - Constructive tone — direct but not harsh. Frame problems as areas to improve.
// - Hunter's Creek and Claremore are new stores — give grace period on metrics.
//
// SETUP:
//   1. Add as new script file "RanchersDailyDebrief" in your Apps Script project
//   2. Script Properties → ANTHROPIC_API_KEY = sk-ant-...
//   3. Run setupDailyDebriefTrigger() ONCE
//   4. Run testDailyDebrief() to preview
// ============================================================================

var DAILY_CONFIG = {
  SPREADSHEET_ID:      '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  SALES_SHEET:         'Flash - Daily Sales',
  LABOR_SHEET:         'Flash - Daily Labor',
  CLOCKOUT_SHEET:      'Auto-Clockouts',
  RECIPIENTS:          'dalton@rancherscustard.com,josh@rancherscustard.com,eric@rancherscustard.com,kandacegiles@rancherscustard.com,steve@rancherscustard.com,chriswells@rancherscustard.com,joshbernard@rancherscustard.com',
  SEND_HOUR:           7,
  STREAK_THRESHOLD:    3,
  LABOR_COST_PER_HR:   17,
  BUYING_SALES_PCT:    0.20,  // flag if excess scheduled labor cost > 20% of sales gain
  OPT_UNDER_PCT:       15   // % under optimal before flagging as potentially understaffed
};

// Stores on the watch list are flagged in Problems if they have ANY meaningful
// issue yesterday (any forecast miss, any hours over optimal, any auto-clockout).
// Add/remove stores here as performance patterns emerge.
var WATCH_LIST = ['Allen', 'Frisco #3'];

// New stores in ramp-up period — mention context in debrief, don't critique harshly.
// Remove a store from this list once it's been open ~2 months and is stabilized.
var NEW_STORES = ['Hunter\'s Creek', 'Claremore'];

var MARKETS = {
  'Tulsa':   ['Bixby', 'Yale', 'Broken Arrow', 'Owasso', 'Claremore'],
  'OKC':     ['Warr Acres', 'Penn', 'Edmond', 'Norman'],
  'Dallas':  ['Carrollton', 'Frisco #1', 'Frisco #2', 'Frisco #3', 'The Colony', 'Hillcrest Village', 'Lake Highlands', 'Allen', 'Prosper'],
  'Orlando': ['Sanford', 'Lakeland', 'Hunter\'s Creek']
};

var HIGH_VOLUME_DAYS = [5, 6, 0]; // Friday=5, Saturday=6, Sunday=0

// Auto-clockout escalation thresholds (days in rolling 7-day window)
var AC_CHRONIC = 3; // 3+ days = chronic discipline problem
var AC_PATTERN = 2; // 2 days = becoming a pattern

// ============================================================================
// MAIN
// ============================================================================

function sendDailyDebrief() {
  try {
    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();

    Logger.log('Ranchers Daily Debrief — building for: ' + yesterday);

    var locations      = buildDailyLocationData(ss, yesterday);
    if (locations.length === 0) {
      Logger.log('No data for ' + yesterday + ' — skipping.');
      return;
    }

    var clockoutCounts       = getClockoutCounts(ss, yesterday);
    var weeklyClockoutCounts = getDailyWeeklyClockoutCounts(ss);
    var fcStreaks             = buildForecastStreaks(ss);

    locations.forEach(function(loc) {
      loc.autoClockouts       = clockoutCounts[loc.location] || 0;
      loc.weeklyAutoClockouts = weeklyClockoutCounts[loc.location] || 0;
      loc.forecastStreak      = fcStreaks[loc.location] || 0;
    });

    var narrative = writeDailyNarrative(locations, yesterday);
    var html      = buildDailyHtml(narrative, yesterday);

    MailApp.sendEmail({
      to:       DAILY_CONFIG.RECIPIENTS,
      subject:  'Ranchers Daily Debrief — ' + fmtDisplayDate(yesterday),
      htmlBody: html
    });
    logDailyNarrative(ss, yesterday, narrative);
    Logger.log('Daily Debrief sent.');

  } catch (e) {
    Logger.log('Error in sendDailyDebrief: ' + e.toString());
  }
}

// ============================================================================
// DATA
// ============================================================================

function buildDailyLocationData(ss, dateStr) {
  var map = {};

  var salesSheet = ss.getSheetByName(DAILY_CONFIG.SALES_SHEET);
  if (salesSheet) {
    var sData = salesSheet.getDataRange().getValues();
    for (var i = 1; i < sData.length; i++) {
      var r = sData[i];
      if (normDate(r[0]) !== dateStr) continue;
      var loc = String(r[1] || '').trim();
      if (!loc) continue;
      map[loc] = {
        location: loc,
        sales: pn(r[2]), pySales: pn(r[3]),
        forecastVariance: pn(r[5]),
        actHrs: null, schHrs: null, optHrs: null,
        laborPct: null, optLaborPct: null, laborPctVar: null,
        autoClockouts: 0, forecastStreak: 0
      };
    }
  }

  var laborSheet = ss.getSheetByName(DAILY_CONFIG.LABOR_SHEET);
  if (laborSheet) {
    var lData = laborSheet.getDataRange().getValues();
    for (var j = 1; j < lData.length; j++) {
      var lr   = lData[j];
      if (normDate(lr[0]) !== dateStr) continue;
      var lloc = String(lr[1] || '').trim();
      if (!lloc) continue;
      if (!map[lloc]) map[lloc] = {
        location: lloc, sales: null, pySales: null,
        forecastVariance: null, autoClockouts: 0, forecastStreak: 0
      };
      map[lloc].actHrs      = pn(lr[3]);
      map[lloc].optHrs      = pn(lr[4]);  // Col E = Optimal Hours
      map[lloc].schHrs      = pn(lr[5]);  // Col F = Scheduled Hours
      map[lloc].laborPct    = pn(lr[6]);
      map[lloc].optLaborPct = pn(lr[7]);
      map[lloc].laborPctVar = pn(lr[8]);
    }
  }

  var locations = Object.values(map);

  locations.forEach(function(loc) {
    loc.grade  = calcGrade(loc);
    loc.market = getMarket(loc.location);
    loc.isNewStore = NEW_STORES.indexOf(loc.location) !== -1;

    // Missed forecast AND over scheduled hours — worst combination
    loc.missedFcAndOverSch = false;
    if (loc.forecastVariance !== null && loc.sales && loc.sales > 0 &&
        loc.schHrs && loc.schHrs > 0 && loc.actHrs !== null) {
      var fcPct  = (loc.forecastVariance / loc.sales) * 100;
      var schPct = ((loc.actHrs - loc.schHrs) / loc.schHrs) * 100;
      if (fcPct < -2 && schPct > 2) loc.missedFcAndOverSch = true;
    }

    // Beat forecast but buying sales with excess scheduled labor
    loc.buyingSalesWithLabor = false;
    if (loc.forecastVariance !== null && loc.forecastVariance > 0 &&
        loc.schHrs && loc.schHrs > 0 && loc.actHrs !== null) {
      var schOverHrs = loc.actHrs - loc.schHrs;
      var excessCost = schOverHrs * DAILY_CONFIG.LABOR_COST_PER_HR;
      if (schOverHrs > 0 && excessCost > loc.forecastVariance * DAILY_CONFIG.BUYING_SALES_PCT) {
        loc.buyingSalesWithLabor = true;
        loc.salesGain = Math.round(loc.forecastVariance);
        loc.excessHrs = schOverHrs.toFixed(1);
      }
    }

    // Potentially understaffed — 15%+ under optimal
    loc.understaffed = false;
    if (loc.optHrs && loc.optHrs > 0 && loc.actHrs !== null) {
      var underPct = ((loc.optHrs - loc.actHrs) / loc.optHrs) * 100;
      if (underPct >= DAILY_CONFIG.OPT_UNDER_PCT) {
        loc.understaffed = true;
        loc.underPct     = underPct.toFixed(1);
      }
    }

    // Watch list — escalate to CRITICAL if any meaningful issue yesterday
    // New stores are excluded from watch list escalation
    loc.onWatchList = WATCH_LIST.indexOf(loc.location) !== -1;
    if (loc.onWatchList && !loc.isNewStore && !loc.missedFcAndOverSch) {
      var hasMiss    = loc.forecastVariance !== null && loc.forecastVariance < 0;
      var hasOverSch = loc.actHrs !== null && loc.schHrs !== null && loc.actHrs > loc.schHrs;
      // Only escalate if they missed forecast — never punish a store that beat forecast
      if (hasMiss && hasOverSch) {
        loc.missedFcAndOverSch = true;
        loc.watchListEscalated = true;
      }
    }
  });

  locations.sort(function(a, b) { return a.location.localeCompare(b.location); });
  return locations;
}

function getMarket(locName) {
  var keys = Object.keys(MARKETS);
  for (var i = 0; i < keys.length; i++) {
    if (MARKETS[keys[i]].indexOf(locName) !== -1) return keys[i];
  }
  return 'Other';
}

function getClockoutCounts(ss, dateStr) {
  var sheet  = ss.getSheetByName(DAILY_CONFIG.CLOCKOUT_SHEET);
  var counts = {};
  if (!sheet) return counts;
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (normDate(data[i][0]) !== dateStr) continue;
    var loc = String(data[i][1] || '').trim();
    if (loc) counts[loc] = (counts[loc] || 0) + 1;
  }
  return counts;
}

// Count distinct days with at least one auto-clockout per location over the rolling 7-day window
function getDailyWeeklyClockoutCounts(ss) {
  var sheet = ss.getSheetByName(DAILY_CONFIG.CLOCKOUT_SHEET);
  var dayCounts = {}; // loc → Set of dates
  if (!sheet) return {};
  var dateSet = {};
  for (var d = 0; d < 7; d++) {
    var dt = new Date(); dt.setDate(dt.getDate() - 1 - d);
    dateSet[Utilities.formatDate(dt, 'America/Chicago', 'M/d/yyyy')] = true;
  }
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var ds  = normDate(data[i][0]);
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

function buildForecastStreaks(ss) {
  var sheet = ss.getSheetByName(DAILY_CONFIG.SALES_SHEET);
  var streaks = {};
  if (!sheet) return streaks;

  var dates = [];
  for (var d = 6; d >= 0; d--) {
    var dt = new Date(); dt.setDate(dt.getDate() - 1 - d);
    dates.push(Utilities.formatDate(dt, 'America/Chicago', 'M/d/yyyy'));
  }
  var dateSet = {};
  dates.forEach(function(d) { dateSet[d] = true; });

  var fcMap = {};
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var r   = data[i];
    var ds  = normDate(r[0]);
    var loc = String(r[1] || '').trim();
    if (!loc || !dateSet[ds]) continue;
    if (!fcMap[loc]) fcMap[loc] = {};
    fcMap[loc][ds] = pn(r[5]);
  }

  Object.keys(fcMap).forEach(function(loc) {
    var streak = 0;
    for (var d = dates.length - 1; d >= 0; d--) {
      var fcv = fcMap[loc][dates[d]];
      if (fcv !== null && fcv !== undefined && fcv < 0) streak++;
      else break;
    }
    if (streak >= DAILY_CONFIG.STREAK_THRESHOLD) streaks[loc] = streak;
  });

  return streaks;
}

// ============================================================================
// GRADE — mirrors getDailyLaborGrade() in index.js — internal use only
// ============================================================================

function calcGrade(loc) {
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

  var fcMod = 0;
  if (loc.forecastVariance !== null && loc.sales && loc.sales > 0) {
    var fcPct = (loc.forecastVariance / loc.sales) * 100;
    if      (fcPct >= 5)  fcMod =  5;
    else if (fcPct >= 0)  fcMod =  2;
    else if (fcPct >= -5) fcMod = -2;
    else                  fcMod = -5;
  }

  if (loc.forecastVariance !== null && loc.sales && loc.sales > 0 &&
      loc.schHrs && loc.schHrs > 0) {
    var afcPct  = (loc.forecastVariance / loc.sales) * 100;
    var aschPct = (((loc.actHrs || 0) - loc.schHrs) / loc.schHrs) * 100;
    if (afcPct <= -5 && aschPct >= 5) return { letter: 'F', score: 0 };
  }

  var composite = Math.min(100, Math.max(0,
    (laborScore * 0.45) + (hoursScore * 0.35) + (schedScore * 0.20) + fcMod
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

function writeDailyNarrative(locations, dateStr) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return dailyFallback(locations, dateStr);

  var totSales = 0, totPySales = 0, totFcVar = 0, yestActHrs = 0, yestOptHrs = 0;
  var isHighVolume = HIGH_VOLUME_DAYS.indexOf(getDayOfWeek(dateStr)) !== -1;
  var dayType      = isHighVolume ? 'high-volume day (weekend/Friday)' : 'weekday';

  var locSummaries = locations.map(function(loc) {
    if (loc.sales)            totSales   += loc.sales;
    if (loc.pySales)          totPySales += loc.pySales;
    if (loc.forecastVariance) totFcVar   += loc.forecastVariance;
    if (loc.actHrs)           yestActHrs += loc.actHrs;
    if (loc.optHrs)           yestOptHrs += loc.optHrs;

    var fcPct = null;
    if (loc.forecastVariance !== null && loc.sales && loc.sales > 0) {
      var fc = loc.sales - loc.forecastVariance;
      if (fc > 0) fcPct = ((loc.forecastVariance / fc) * 100).toFixed(1);
    }
    var pyPct = (loc.sales && loc.pySales && loc.pySales > 0)
      ? (((loc.sales - loc.pySales) / loc.pySales) * 100).toFixed(1) : null;
    var hrsVsOpt = (loc.actHrs !== null && loc.optHrs !== null)
      ? (loc.actHrs - loc.optHrs).toFixed(1) : null;
    var hrsVsSch = (loc.actHrs !== null && loc.schHrs !== null)
      ? (loc.actHrs - loc.schHrs).toFixed(1) : null;

    var summary = {
      location:       loc.location,
      market:         loc.market,
      sales:          loc.sales ? '$' + Math.round(loc.sales).toLocaleString() : null,
      vsForecast:     fcPct ? (fcPct > 0 ? '+' : '') + fcPct + '%' : null,
      vsPriorYear:    pyPct ? (pyPct > 0 ? '+' : '') + pyPct + '%' : null,
      hrsVsOptimal:   hrsVsOpt ? (hrsVsOpt > 0 ? '+' : '') + hrsVsOpt + ' hrs vs optimal' : null,
      hrsVsScheduled: hrsVsSch ? (hrsVsSch > 0 ? '+' : '') + hrsVsSch + ' hrs vs scheduled' : null,
      laborPct:       loc.laborPct !== null ? loc.laborPct.toFixed(1) + '%' : null
    };

    // Tag new stores so the AI knows to give context, not critique
    if (loc.isNewStore) {
      summary.NEW_STORE = true;
    }

    if (loc.missedFcAndOverSch && !loc.isNewStore) {
      summary.CRITICAL = 'Missed forecast AND went over scheduled hours — needs attention.';
    }
    if (loc.buyingSalesWithLabor && !loc.isNewStore) {
      summary.EFFICIENCY_WARNING = 'Beat forecast by $' + loc.salesGain.toLocaleString()
        + ' but ran ' + loc.excessHrs + ' hrs over scheduled — the labor cost ate into the gain.';
    }
    if (loc.understaffed) {
      summary.UNDERSTAFFED_WARNING = loc.underPct + '% under optimal — may have been short-staffed, worth checking if they left sales on the table.';
    }
    if (loc.forecastStreak >= DAILY_CONFIG.STREAK_THRESHOLD && !loc.isNewStore) {
      summary.FORECAST_MISS_STREAK = loc.forecastStreak + ' consecutive days missing forecast — worth digging into whether this is a traffic trend or an execution issue.';
    }
    if (loc.autoClockouts > 0 || loc.weeklyAutoClockouts > 0) {
      var acDays = loc.weeklyAutoClockouts || 0;
      var acMsg  = loc.autoClockouts + ' auto-clockout(s) yesterday — system clocked out at 3 AM, reported hours OVERSTATED. Actual hours worked were LESS than recorded.';
      if (acDays >= AC_CHRONIC) {
        acMsg += ' Occurred on ' + acDays + ' of the last 7 days — this needs to be addressed.';
      } else if (acDays >= AC_PATTERN) {
        acMsg += ' Happened on ' + acDays + ' days this week — something to keep an eye on.';
      }
      summary.AUTO_CLOCKOUTS = acMsg;
    }

    return summary;
  });

  var totSchHrs = 0;
  locSummaries.forEach(function(s) {
    var loc = locations.filter(function(l) { return l.location === s.location; })[0];
    if (loc && loc.schHrs) totSchHrs += loc.schHrs;
  });
  var pyVarPct = totPySales > 0
    ? (((totSales - totPySales) / totPySales) * 100).toFixed(1) : null;
  var fcVarFmt = (totFcVar >= 0 ? '+$' : '-$') + Math.abs(Math.round(totFcVar)).toLocaleString();
  var yestHrsOverOptimal   = Math.round(yestActHrs - yestOptHrs);
  var yestHrsOverScheduled = Math.round(yestActHrs - totSchHrs);

  // Build explicit list of CRITICAL store names so Claude cannot skip any
  var criticalStoreNames = locSummaries
    .filter(function(s) { return s.CRITICAL; })
    .map(function(s) { return s.location; });

  // Build list of new stores for context
  var newStoreNames = locSummaries
    .filter(function(s) { return s.NEW_STORE; })
    .map(function(s) { return s.location; });

  var dataBlob = {
    date:             fmtDisplayDate(dateStr),
    dayType:          dayType,
    totalSales:       '$' + Math.round(totSales).toLocaleString(),
    vsForecast:       fcVarFmt,
    vsPriorYear:      pyVarPct ? (pyVarPct > 0 ? '+' : '') + pyVarPct + '%' : null,
    hrsOverScheduled: yestHrsOverScheduled > 0 ? yestHrsOverScheduled + ' hours over scheduled' : 'at or under scheduled',
    hrsOverOptimal:   yestHrsOverOptimal > 0 ? yestHrsOverOptimal + ' hours over optimal (aspirational benchmark)' : 'at or under optimal',
    CRITICAL_STORES:  criticalStoreNames.length > 0 ? criticalStoreNames : null,
    NEW_STORES:       newStoreNames.length > 0 ? newStoreNames : null,
    locations:        locSummaries
  };

  var prompt =
    'You are writing the Ranchers Daily Debrief for Ranchers Custard Company (Andy\'s Frozen Custard). '
    + 'Morning email about YESTERDAY only. Direct, conversational, and constructive. No subject line.\n\n'
    + 'TONE:\n'
    + '- Be direct but not harsh. Frame underperformance as areas that need attention, not failures.\n'
    + '- Use language like "needs attention," "worth looking into," "room for improvement," "opportunity to tighten up" — not "bad management" or blaming language.\n'
    + '- Acknowledge good results genuinely. When a store struggles, state the facts and suggest it\'s worth a closer look — don\'t pile on.\n'
    + '- The goal is to inform and drive action, not to punish.\n\n'
    + 'RULES:\n'
    + '1. YESTERDAY only — every number you state must come from the data provided. Do not invent or estimate any figures.\n'
    + '2. Never mention grades. Never mention an hourly rate.\n'
    + '3. Never reference store locations or markets — the reader knows where every store is.\n'
    + '4. PRIMARY labor metric is ACTUAL vs SCHEDULED hours. This is what management committed to. Overages here = not executing the plan.\n'
    + '5. Optimal hours is an aspirational benchmark — a best-case scenario. Use it as context, not as the primary accountability measure.\n'
    + '6. Missing forecast AND over scheduled hours = the combination that needs the most attention. Flag it clearly but constructively.\n'
    + '7. Beating forecast with excess SCHEDULED labor is worth flagging when the labor cost exceeds 20% of the sales gain — the gain is real but the efficiency isn\'t there yet.\n'
    + '8. Auto-clockouts = the system clocked employees out at 3 AM, so reported hours are OVERSTATED. Actual hours worked were LESS than recorded. The labor picture is better than it appears, not worse.\n'
    + '9. NEW_STORES (listed in the data) are brand-new locations still ramping up. If they appear in the data, mention their results briefly in Notes with context like "still ramping up" or "finding their rhythm." Do NOT put new stores in Problems — their metrics are expected to be off. Do NOT critique them the same way you would an established store.\n'
    + '10. Never state a count of stores — just name them.\n'
    + '11. EVERY bullet and sentence must be written fresh based on that store\'s specific numbers. Never reuse the same phrasing, structure, or verdict across bullets. A reader should not be able to predict how the next bullet will be worded. Vary the language, the angle, and the emphasis based on what actually stands out about each store.\n'
    + '12. Every bullet that references a store must start with the store name in **double asterisks** like this: **Store Name** — required for formatting. No exceptions.\n\n'
    + 'FORMAT — follow exactly:\n\n'
    + 'Summary:\n'
    + 'Two to three sentences. Sales total, vs forecast, vs prior year. State hrsOverScheduled as the primary labor headline. Mention hrsOverOptimal only as benchmark context if meaningful. Factual and direct.\n\n'
    + 'Problems:\n'
    + '- The data includes a CRITICAL_STORES list. EVERY store in that list MUST have its own bullet here — no exceptions, no trimming.\n'
    + '- For each: store name, missed forecast by $X (-X%), vs prior year (+ or -%), hours over SCHEDULED (primary), labor %, one-sentence constructive observation about what stands out and what needs attention.\n'
    + '- If CRITICAL_STORES is empty, use EFFICIENCY_WARNING stores instead.\n'
    + '- Do NOT include any store tagged as NEW_STORE in Problems.\n\n'
    + 'Standouts:\n'
    + '- One bullet per store that beat forecast and stayed near or under scheduled hours. Lead with what is most impressive about that store\'s day — forecast beat, year-over-year growth, labor discipline, or some combination. Each bullet should feel distinct.\n\n'
    + 'Notes:\n'
    + '- One bullet per item for EFFICIENCY_WARNING, FORECAST_MISS_STREAK, AUTO_CLOCKOUTS, and UNDERSTAFFED_WARNING if present. Write each note based on the specific numbers — do not use boilerplate.\n'
    + '- If any NEW_STORE locations appear in the data, include a brief note acknowledging their results with context that they\'re still in ramp-up.\n'
    + '- Never mention watch list or any internal flag names.\n'
    + '- Final line: one sentence summarizing the day — written as a plain sentence, NOT a bullet point.\n\n'
    + 'Do not include a title, header, or subject line at the top of the email.\n\n'
    + 'Data:\n' + JSON.stringify(dataBlob, null, 2);

  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model:      'claude-opus-4-7',
        max_tokens: 1200,
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
    Logger.log('Claude API error: ' + e.toString()); }
  return dailyFallback(locations, dateStr);
}

// ============================================================================
// FALLBACK NARRATIVE
// ============================================================================

function dailyFallback(locations, dateStr) {
  var totSales = 0, totPySales = 0, totFcVar = 0, yestActHrs = 0, yestOptHrs = 0;
  var goodStores = [], criticalStores = [], effStores = [], underStores = [], acStores = [], fcStreakStores = [], newStoresList = [];

  locations.forEach(function(loc) {
    if (loc.sales)            totSales   += loc.sales;
    if (loc.pySales)          totPySales += loc.pySales;
    if (loc.forecastVariance) totFcVar   += loc.forecastVariance;
    if (loc.actHrs)           yestActHrs += loc.actHrs;
    if (loc.optHrs)           yestOptHrs += loc.optHrs;
    if (loc.isNewStore) {
      newStoresList.push(loc.location);
      return; // Don't categorize new stores as problems
    }
    if (loc.grade && (loc.grade.letter === 'A' || loc.grade.letter === 'B') &&
        !loc.missedFcAndOverSch && !loc.buyingSalesWithLabor) goodStores.push(loc.location);
    if (loc.missedFcAndOverSch)   criticalStores.push(loc.location);
    if (loc.buyingSalesWithLabor)  effStores.push(loc.location);
    if (loc.understaffed)          underStores.push(loc.location);
    if (loc.autoClockouts > 0) {
      var acLabel = loc.location + ' (' + loc.autoClockouts + ' yesterday';
      if (loc.weeklyAutoClockouts >= AC_CHRONIC) acLabel += ', ' + loc.weeklyAutoClockouts + ' days this week — needs attention';
      else if (loc.weeklyAutoClockouts >= AC_PATTERN) acLabel += ', ' + loc.weeklyAutoClockouts + ' days this week — worth watching';
      acLabel += ')';
      acStores.push(acLabel);
    }
    if (loc.forecastStreak >= DAILY_CONFIG.STREAK_THRESHOLD) fcStreakStores.push(loc.location + ' (' + loc.forecastStreak + ' days)');
  });

  var pyPct = totPySales > 0 ? (((totSales - totPySales) / totPySales) * 100).toFixed(1) : null;
  var yestHrsOver = Math.round(yestActHrs - yestOptHrs);

  var p1 = fmtDisplayDate(dateStr) + ' — $' + Math.round(totSales).toLocaleString() + ' total'
    + (pyPct ? ', ' + (pyPct > 0 ? 'up ' : 'down ') + Math.abs(pyPct) + '% vs prior year' : '')
    + ', ' + (totFcVar >= 0 ? '+$' : '-$') + Math.abs(Math.round(totFcVar)).toLocaleString() + ' vs forecast.'
    + (yestHrsOver > 0 ? ' ' + yestHrsOver + ' hours over optimal yesterday.' : '');

  var p2 = [
    criticalStores.length > 0 ? criticalStores.join(', ') + ' missed forecast and went over scheduled hours — needs attention.' : '',
    effStores.length > 0 ? effStores.join(', ') + ' beat forecast but ran over on labor — gain offset by cost.' : '',
    fcStreakStores.length > 0 ? fcStreakStores.join(', ') + ' missing forecast consecutively — worth looking into.' : ''
  ].filter(Boolean).join(' ');

  var p3 = [
    goodStores.length > 0  ? goodStores.join(', ') + ' had strong days.' : '',
    underStores.length > 0 ? underStores.join(', ') + ' ran well under optimal — may have been short-staffed.' : '',
    acStores.length > 0    ? 'Auto-clockouts at ' + acStores.join(', ') + ' — reported hours overstated, actual were less.' : '',
    newStoresList.length > 0 ? newStoresList.join(', ') + ' still ramping up — metrics expected to be off during the opening period.' : ''
  ].filter(Boolean).join(' ');

  return [p1, p2, p3].filter(Boolean).join('\n\n');
}

// ============================================================================
// EMAIL HTML
// ============================================================================

function buildDailyHtml(narrative, dateStr) {
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
      // Bold any **text** markdown — store names should always be wrapped this way
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
    + '<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 4px;">Ranchers Daily Debrief</h1>'
    + '<p style="color:#a0b8d0;font-size:13px;margin:0;">' + fmtDisplayDate(dateStr) + '</p>'
    + '</div>'
    + '<div style="padding:28px 32px;border-bottom:3px solid #1a2e4a;">' + body + '</div>'
    + '<div style="padding:14px 32px;text-align:center;background:#f8f9fa;">'
    + '<p style="color:#888;font-size:12px;margin:0;">Andy\'s Dashboard &nbsp;&middot;&nbsp; <a href="https://andysdashboard.com" style="color:#1a2e4a;text-decoration:none;">andysdashboard.com</a></p>'
    + '</div></div></body></html>';
}

// ============================================================================
// TRIGGER SETUP
// ============================================================================

function setupDailyDebriefTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendDailyDebrief') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyDebrief')
    .timeBased().atHour(DAILY_CONFIG.SEND_HOUR).everyDays(1)
    .inTimezone('America/Chicago').create();
  Logger.log('Daily Debrief trigger set: ' + DAILY_CONFIG.SEND_HOUR + ':00 AM Central daily.');
}

// ============================================================================
// TEST
// ============================================================================

function testDailyDebrief() {
  var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
  var yesterday = getYesterdayStr();

  var locations            = buildDailyLocationData(ss, yesterday);
  var clockoutCounts       = getClockoutCounts(ss, yesterday);
  var weeklyClockoutCounts = getDailyWeeklyClockoutCounts(ss);
  var fcStreaks             = buildForecastStreaks(ss);

  locations.forEach(function(loc) {
    loc.autoClockouts       = clockoutCounts[loc.location] || 0;
    loc.weeklyAutoClockouts = weeklyClockoutCounts[loc.location] || 0;
    loc.forecastStreak      = fcStreaks[loc.location] || 0;
  });

  var yestAct = 0, yestOpt = 0;
  locations.forEach(function(loc) { if (loc.actHrs) yestAct += loc.actHrs; if (loc.optHrs) yestOpt += loc.optHrs; });
  Logger.log('Date: ' + yesterday + ' (' + (HIGH_VOLUME_DAYS.indexOf(getDayOfWeek(yesterday)) !== -1 ? 'HIGH VOLUME' : 'weekday') + ')');
  Logger.log('Locations: ' + locations.length);
  Logger.log('Yesterday hrs over optimal: ' + Math.round(yestAct - yestOpt));

  locations.forEach(function(loc) {
    var flags = [];
    if (loc.isNewStore)                                      flags.push('NEW_STORE');
    if (loc.missedFcAndOverSch)                              flags.push('MISSED_FC+OVER_SCH');
    if (loc.buyingSalesWithLabor)                             flags.push('BUYING_SALES');
    if (loc.understaffed)                                     flags.push('UNDERSTAFFED(' + loc.underPct + '%)');
    if (loc.forecastStreak >= DAILY_CONFIG.STREAK_THRESHOLD) flags.push('FC_STREAK:' + loc.forecastStreak);
    if (loc.autoClockouts > 0)                               flags.push('AC:' + loc.autoClockouts + '/week:' + loc.weeklyAutoClockouts);
    Logger.log(loc.location + ' [' + loc.market + ']'
      + '  Sales:' + (loc.sales ? '$' + Math.round(loc.sales) : 'N/A')
      + '  FC:' + (loc.forecastVariance !== null ? (loc.forecastVariance >= 0 ? '+' : '') + Math.round(loc.forecastVariance) : 'N/A')
      + '  Act:' + loc.actHrs + '  Sch:' + loc.schHrs + '  Opt:' + loc.optHrs
      + (flags.length ? '  [' + flags.join(', ') + ']' : ''));
  });

  if (locations.length === 0) { Logger.log('No data.'); return; }

  var narrative = writeDailyNarrative(locations, yesterday);
  Logger.log('--- NARRATIVE ---\n' + narrative);

  MailApp.sendEmail({
    to:       'dalton@rancherscustard.com',
    subject:  '[TEST] Ranchers Daily Debrief — ' + fmtDisplayDate(yesterday),
    htmlBody: buildDailyHtml(narrative, yesterday)
  });
  logDailyNarrative(ss, yesterday, '[TEST] ' + narrative);
  Logger.log('Test sent to dalton only.');
}

// ============================================================================
// NARRATIVE LOGGING — writes each sent debrief to 'Debrief Log' sheet
// Columns: Date | Day | Total Sales | Vs Forecast | Narrative
// Used for monthly audits and prompt tuning
// ============================================================================

function logDailyNarrative(ss, dateStr, narrative) {
  try {
    var sheetName = 'Debrief Log';
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(['Date', 'Day', 'Narrative']);
      sheet.setFrozenRows(1);
      sheet.getRange('A1:C1').setFontWeight('bold');
      sheet.setColumnWidth(1, 100);
      sheet.setColumnWidth(2, 80);
      sheet.setColumnWidth(3, 600);
    }
    var p = dateStr.split('/');
    var d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    sheet.appendRow([dateStr, days[d.getDay()], narrative]);
    Logger.log('Narrative logged to Debrief Log.');
  } catch (e) {
    Logger.log('logDailyNarrative error: ' + e.toString());
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function getYesterdayStr() {
  var d = new Date(); d.setDate(d.getDate() - 1);
  return Utilities.formatDate(d, 'America/Chicago', 'M/d/yyyy');
}

function getDayOfWeek(ds) {
  var p = ds.split('/');
  return new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1])).getDay();
}

function normDate(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'America/Chicago', 'M/d/yyyy');
  var m = val.toString().trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? parseInt(m[1]) + '/' + parseInt(m[2]) + '/' + m[3] : val.toString().trim();
}

function fmtDisplayDate(ds) {
  try {
    var p = ds.split('/');
    var d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    var days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  } catch(e) { return ds; }
}

function pn(val) {
  if (val === null || val === undefined || val === '') return null;
  var n = parseFloat(val); return isNaN(n) ? null : n;
}