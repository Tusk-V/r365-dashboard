// apps-script/RanchersManagerRecap.js
// ============================================================================
// RANCHERS MANAGER RECAP
// ~7:15 AM personal good-morning email to each store manager about THEIR store's
// prior day, inviting a recap reply. Separate from the 7:00 AM leadership debrief.
//
// - Recipients are derived from the app's admin/users list (dashboardAccess) via
//   the /api/store-managers endpoint — manage who gets emails there.
// - Multi-store managers get ONE combined email, one paragraph per store.
// - Claude writes each note fresh; falls back to plain prose if the API is down.
// - "Missed forecast AND over scheduled hours" escalates the ASK (constructively).
// - Leadership (MANAGER_RECAP_CC Script Property) is visibly CC'd on every email.
// - Every send is logged to the 'Manager Recap Log' tab, full body included.
//
// SETUP:
//   1. Script Properties -> MANAGER_SYNC_TOKEN = (same value as Vercel env)
//   2. Script Properties -> MANAGER_RECAP_CC   = josh@...,eric@...,kandace@...
//   3. (ANTHROPIC_API_KEY already set for the debrief - reused here)
//   4. Run setupManagerRecapTrigger() ONCE
//   5. Run testManagerRecaps() to preview to dalton only
// ============================================================================

var RECAP_CONFIG = {
  MANAGER_API_URL: 'https://andysdashboard.com/api/store-managers',
  REPLY_TO:        DAILY_CONFIG.RECIPIENTS, // recaps land with leadership
  SEND_HOUR:       7,
  SEND_MINUTE:     15,
  LOG_SHEET:       'Manager Recap Log'
};

// --- pure helpers (unit-tested) --------------------------------------------

function parseRecapCcList(raw) {
  if (!raw) return [];
  return String(raw).split(',')
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s.length > 0; });
}

function recapFirstName(name) {
  if (!name) return 'there';
  var token = String(name).trim().split(/\s+/)[0];
  return token || 'there';
}

// managers: [{name, email, locations:[...]}]; locations: buildDailyLocationData output.
// Returns recipients that have >=1 store with data yesterday, stores sorted by name.
function buildRecipientGroups(managers, locations) {
  var byName = {};
  locations.forEach(function(loc) { byName[loc.location] = loc; });

  var groups = [];
  (managers || []).forEach(function(mgr) {
    if (!mgr || !mgr.email || !mgr.locations) return;
    var stores = [];
    mgr.locations.forEach(function(locName) {
      if (byName[locName]) stores.push(byName[locName]);
    });
    if (stores.length === 0) return;
    stores.sort(function(a, b) { return a.location.localeCompare(b.location); });
    groups.push({
      name:      mgr.name || '',
      email:     mgr.email,
      firstName: recapFirstName(mgr.name),
      stores:    stores
    });
  });
  return groups;
}

// Compress one location row into the light facts the prose is grounded in.
function buildManagerStoreFacts(loc) {
  var fcPct = null;
  if (loc.forecastVariance != null && loc.sales && loc.sales > 0) {
    var fc = loc.sales - loc.forecastVariance;
    if (fc > 0) fcPct = ((loc.forecastVariance / fc) * 100).toFixed(1);
  }
  var pyPct = (loc.sales && loc.pySales && loc.pySales > 0)
    ? (((loc.sales - loc.pySales) / loc.pySales) * 100).toFixed(1) : null;
  var hrsVsSch = (loc.actHrs !== null && loc.actHrs !== undefined &&
                  loc.schHrs !== null && loc.schHrs !== undefined)
    ? (loc.actHrs - loc.schHrs).toFixed(1) : null;

  return {
    store:          loc.location,
    sales:          loc.sales ? '$' + Math.round(loc.sales).toLocaleString() : null,
    vsForecast:     fcPct !== null ? (fcPct > 0 ? '+' : '') + fcPct + '%' : null,
    vsPriorYear:    pyPct !== null ? (pyPct > 0 ? '+' : '') + pyPct + '%' : null,
    hrsVsScheduled: hrsVsSch !== null ? (hrsVsSch > 0 ? '+' : '') + hrsVsSch + ' hrs vs scheduled' : null,
    missedForecastAndOverScheduled: !!(loc.missedFcAndOverSch && !loc.isNewStore),
    isNewStore:     !!loc.isNewStore
  };
}

// Build the Claude prompt for one recipient.
function buildManagerPrompt(firstName, storeFactsList) {
  var anyEscalation = storeFactsList.some(function(s) { return s.missedForecastAndOverScheduled; });

  var prompt =
    'You are writing a brief, warm, personal good-morning email to ' + firstName + ', a store manager '
    + 'at Ranchers Custard Company (Andy\'s Frozen Custard), about how their store(s) did YESTERDAY. '
    + 'It must read like a real note from a person who actually looked at the numbers — never a template.\n\n'
    + 'TONE & RULES:\n'
    + '- Open by greeting ' + firstName + ' by first name.\n'
    + '- Conversational and constructive. Never harsh, never blaming.\n'
    + '- Weave the numbers naturally into the prose. Do NOT print a table or a stat line.\n'
    + '- Every number you state must come from the data provided. Never invent or estimate figures.\n'
    + '- Write each store\'s paragraph fresh. Never reuse phrasing or sentence structure across stores or days.\n'
    + '- End each store\'s paragraph by inviting a quick reply recapping how yesterday went.\n'
    + '- One paragraph per store. With multiple stores, start each paragraph with the store name in **double asterisks**.\n'
    + '- Never mention grades, hourly labor rates, or any internal flag names.\n'
    + (anyEscalation
        ? '- For any store flagged "missedForecastAndOverScheduled": yesterday came in under the sales forecast AND ran over the scheduled hours that were committed to. Gently and specifically ask what drove the softer sales and how the staffing/hours call played out — framed as "worth looking into" / "help me understand the day," never as criticism.\n'
        : '')
    + '- For any store flagged "isNewStore": it is still ramping up. Be encouraging and context-first; do not critique it.\n\n'
    + 'Do not include a subject line, title, or signature.\n\n'
    + 'Data:\n' + JSON.stringify({ manager: firstName, stores: storeFactsList }, null, 2);

  return prompt;
}
