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
//
// EDITING RECIPIENTS (no code change / no clasp push needed):
//   - Who GETS a recap: manage in the app's admin/users screen (dashboard access).
//   - Who is CC'd:       edit the MANAGER_RECAP_CC Script Property.
// ============================================================================

var RECAP_CONFIG = {
  MANAGER_API_URL: 'https://andysdashboard.com/api/store-managers',
  SEND_HOUR:       7,
  SEND_MINUTE:     15,
  LOG_SHEET:       'Manager Recap Log',
  // Always CC'd on recap drafts. Override with the MANAGER_RECAP_CC Script Property.
  CC_DEFAULT:      'josh@rancherscustard.com,eric@rancherscustard.com,kandacegiles@rancherscustard.com',
  // The owner/sender is never a recipient (guards against accidental self-adds).
  OWNER_EMAIL:     'dalton@rancherscustard.com',
  FORECAST_MISS_PCT:   0.03,  // must be MORE than 3% under forecast to flag
  OVER_SCHEDULED_PCT:  0.05   // AND 5%+ actual hours over scheduled
};

// --- pure helpers (unit-tested) --------------------------------------------

function parseRecapCcList(raw) {
  if (!raw) return [];
  return String(raw).split(',')
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s.length > 0; });
}

function recapFirstName(name) {
  if (!name) return '';
  var token = String(name).trim().split(/\s+/)[0];
  return token || '';
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
  var greeting = (firstName ? firstName : 'Hi') + ',';

  var prompt =
    'Write a short, professional email from the owner to a store manager about YESTERDAY. '
    + 'Each store listed came in under its sales forecast and ran over its scheduled labor hours. '
    + 'The point is to check in and understand what happened with the labor when sales were tracking soft.\n\n'
    + 'RULES:\n'
    + '- Start with exactly: "' + greeting + '"\n'
    + '- Tone: professional and respectful — owner to manager. Clear and matter-of-fact, but not stiff or accusatory. No small talk, no effusive praise.\n'
    + '- For each store: state the sales-vs-forecast and the hours over scheduled in one sentence, then ask what drove the labor running over when sales were coming in under.\n'
    + '- Keep it tight: two or three sentences per store, maximum.\n'
    + '- Use only the numbers in the data; never invent figures.\n'
    + '- Do not begin with a store-name label or the store name. If there is only one store, write about the day directly. If there are multiple stores, identify each store naturally within its sentence (e.g. "At Bixby, ..."), never as a leading label.\n'
    + '- No grades, no labor rates, no internal flag names. No subject line or title.\n'
    + '- End the entire email with a final line that says exactly: "Thanks," (nothing after it — no name, no signature).\n\n'
    + 'Data:\n' + JSON.stringify({ stores: storeFactsList }, null, 2);

  return prompt;
}

// Invert the roster into a location -> recipient-emails map for auditing.
// managers: [{name, email, locations:[...]}]; locationNames: store names that
// have data. Returns { map: [{location, emails:[...]}] (all locations, sorted),
// unassigned: [names] } where unassigned = locations WITH data but NO recipient.
function buildLocationRecipientMap(managers, locationNames) {
  var emailsByLoc = {};
  (managers || []).forEach(function(mgr) {
    if (!mgr || !mgr.email || !mgr.locations) return;
    mgr.locations.forEach(function(locName) {
      if (!emailsByLoc[locName]) emailsByLoc[locName] = [];
      if (emailsByLoc[locName].indexOf(mgr.email) === -1) emailsByLoc[locName].push(mgr.email);
    });
  });

  var allLocs = {};
  (locationNames || []).forEach(function(n) { allLocs[n] = true; });
  Object.keys(emailsByLoc).forEach(function(n) { allLocs[n] = true; });

  var map = Object.keys(allLocs)
    .sort(function(a, b) { return a.localeCompare(b); })
    .map(function(loc) {
      return { location: loc, emails: (emailsByLoc[loc] || []).slice().sort() };
    });

  var dataSet = {};
  (locationNames || []).forEach(function(n) { dataSet[n] = true; });
  var unassigned = map
    .filter(function(e) { return dataSet[e.location] && e.emails.length === 0; })
    .map(function(e) { return e.location; });

  return { map: map, unassigned: unassigned };
}

// True only when a store warrants an exception email: under forecast by more
// than forecastMissPct, actual hours at least overSchedPct above scheduled, no
// auto-clockouts that day, and not a ramp-up store.
// NOTE: This is an intentionally STRICTER, separate gate from the debrief's
// loc.missedFcAndOverSch flag (which uses 2%-of-sales and >2% hours). Do not
// assume the two describe the same set of stores.
function qualifiesForRecap(loc, autoClockouts, forecastMissPct, overSchedPct) {
  if (!loc || loc.isNewStore) return false;
  if (autoClockouts > 0) return false;
  if (loc.schHrs == null || loc.schHrs <= 0 || loc.actHrs == null) return false;
  if (loc.forecastVariance == null || loc.sales == null) return false;
  var forecast = loc.sales - loc.forecastVariance;
  if (forecast <= 0) return false;
  var missPct = (-loc.forecastVariance) / forecast;
  if (missPct <= forecastMissPct) return false;
  var overPct = (loc.actHrs - loc.schHrs) / loc.schHrs;
  if (overPct < overSchedPct) return false;
  return true;
}

// --- orchestration (runs in Apps Script only) ------------------------------

function fetchManagerRoster() {
  var token = PropertiesService.getScriptProperties().getProperty('MANAGER_SYNC_TOKEN');
  if (!token) { Logger.log('MANAGER_SYNC_TOKEN not set — cannot fetch roster.'); return null; }
  try {
    var resp = UrlFetchApp.fetch(RECAP_CONFIG.MANAGER_API_URL, {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() !== 200) {
      Logger.log('Roster fetch HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText());
      return null;
    }
    var data = JSON.parse(resp.getContentText());
    return data.managers || [];
  } catch (e) {
    Logger.log('Roster fetch error: ' + e.toString());
    return null;
  }
}

function writeManagerNarrative(firstName, storeFactsList) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) return managerFallback(firstName, storeFactsList);

  var prompt = buildManagerPrompt(firstName, storeFactsList);
  try {
    var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({
        model:      'claude-opus-4-8',
        max_tokens: 900,
        messages:   [{ role: 'user', content: prompt }]
      }),
      muteHttpExceptions: true
    });
    var result = JSON.parse(resp.getContentText());
    if (result.content && result.content[0] && result.content[0].text) {
      return result.content[0].text.trim();
    }
    Logger.log('Unexpected API response (manager recap): ' + resp.getContentText());
  } catch (e) {
    Logger.log('Claude API error (manager recap): ' + e.toString());
  }
  return managerFallback(firstName, storeFactsList);
}

function managerFallback(firstName, storeFactsList) {
  var greeting = (firstName ? firstName : 'Hi') + ',';
  var parts = [greeting, ''];
  storeFactsList.forEach(function(s) {
    var bits = [];
    if (s.sales)          bits.push(s.sales);
    if (s.vsForecast)     bits.push(s.vsForecast + ' vs forecast');
    if (s.hrsVsScheduled) bits.push(s.hrsVsScheduled);
    var stats = bits.length ? ' (' + bits.join(', ') + ')' : '';
    var lead = storeFactsList.length > 1 ? 'At ' + s.store + ', sales' : 'Sales';
    var line = lead + ' came in under forecast and hours ran over schedule' + stats
      + '. What drove the labor running over as the day came in soft?';
    parts.push(line, '');
  });
  parts.push('Thanks,');
  return parts.join('\n').trim();
}

// Fetch the owner's actual Gmail signature HTML via the Gmail advanced service
// so it can be auto-appended to each draft (stays in sync with Gmail settings).
// Returns '' on any error so a signature problem never blocks the drafts.
function getOwnerSignatureHtml() {
  try {
    var sendAs = Gmail.Users.Settings.SendAs.get('me', RECAP_CONFIG.OWNER_EMAIL);
    return (sendAs && sendAs.signature) ? sendAs.signature : '';
  } catch (e) {
    Logger.log('Signature fetch error: ' + e.toString());
    return '';
  }
}

function buildManagerRecapHtml(bodyText, signatureHtml) {
  var paras = bodyText.split('\n')
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; });

  var body = paras.map(function(p) {
    return '<p style="margin:0 0 12px;line-height:1.5;color:#222;font-size:14px;">'
      + p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
  }).join('');

  // The owner's real Gmail signature is auto-appended below the "Thanks," line.
  var sig = signatureHtml ? '<div style="margin-top:16px;">' + signatureHtml + '</div>' : '';

  return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;color:#222;font-size:14px;">'
    + body + sig
    + '</div>';
}

// Append one row per recipient to the 'Manager Recap Log' tab (auto-created).
// Columns: Timestamp | Date | Recipient Name | Recipient Email | Stores | CC | Status | Email Body
function logManagerRecap(ss, row) {
  try {
    var sheet = ss.getSheetByName(RECAP_CONFIG.LOG_SHEET);
    if (!sheet) {
      sheet = ss.insertSheet(RECAP_CONFIG.LOG_SHEET);
      sheet.appendRow(['Timestamp', 'Date', 'Recipient Name', 'Recipient Email', 'Stores', 'CC', 'Status', 'Email Body']);
      sheet.setFrozenRows(1);
      sheet.getRange('A1:H1').setFontWeight('bold');
      sheet.setColumnWidth(5, 200);
      sheet.setColumnWidth(8, 600);
    }
    var ts = Utilities.formatDate(new Date(), 'America/Chicago', 'M/d/yyyy HH:mm');
    sheet.appendRow([ts, row.date, row.name, row.email, row.stores, row.cc, row.status, row.body]);
  } catch (e) {
    Logger.log('logManagerRecap error: ' + e.toString());
  }
}

function createManagerRecapDrafts() {
  try {
    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();

    var locations = buildDailyLocationData(ss, yesterday);
    if (locations.length === 0) { Logger.log('No data for ' + yesterday + ' — skipping recap drafts.'); return; }

    var roster = fetchManagerRoster();
    if (!roster) { Logger.log('Roster unavailable — aborting (created nothing).'); return; }

    var groups = buildRecipientGroups(roster, locations);
    if (groups.length === 0) { Logger.log('No recipients have data — nothing to draft.'); return; }

    var clockoutCounts = getClockoutCounts(ss, yesterday);
    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC') || RECAP_CONFIG.CC_DEFAULT
    ).join(',');
    var sigHtml = getOwnerSignatureHtml();

    var drafted = 0;
    groups.forEach(function(g) {
      if (g.email && g.email.toLowerCase() === RECAP_CONFIG.OWNER_EMAIL) return;  // never email the owner
      var qualifying = g.stores.filter(function(loc) {
        return qualifiesForRecap(loc, clockoutCounts[loc.location] || 0,
          RECAP_CONFIG.FORECAST_MISS_PCT, RECAP_CONFIG.OVER_SCHEDULED_PCT);
      });
      if (qualifying.length === 0) return;

      var facts  = qualifying.map(buildManagerStoreFacts);
      var body   = writeManagerNarrative(g.firstName, facts);
      var html   = buildManagerRecapHtml(body, sigHtml);
      var status = 'Drafted';
      try {
        var opts = { htmlBody: html };
        if (ccStr) opts.cc = ccStr;
        GmailApp.createDraft(g.email, 'Yesterday — labor over schedule', '', opts);
      } catch (e) {
        status = 'Failed: ' + e.toString();
        Logger.log('Draft failed for ' + g.email + ': ' + e.toString());
      }
      drafted++;
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: qualifying.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: status,
        body:   body
      });
    });

    Logger.log('Manager recap drafts created: ' + drafted + ' of ' + groups.length + ' recipient(s) had a flagged store.');
  } catch (e) {
    Logger.log('Error in createManagerRecapDrafts: ' + e.toString());
  }
}

function setupManagerRecapTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'createManagerRecapDrafts' || fn === 'sendManagerRecaps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('createManagerRecapDrafts')
    .timeBased().atHour(RECAP_CONFIG.SEND_HOUR).nearMinute(RECAP_CONFIG.SEND_MINUTE).everyDays(1)
    .inTimezone('America/Chicago').create();
  Logger.log('Manager recap trigger set: ~' + RECAP_CONFIG.SEND_HOUR + ':' + ('0' + RECAP_CONFIG.SEND_MINUTE).slice(-2) + ' Central daily (drafts).');
}

// Preview the entire batch as Gmail drafts addressed to dalton — no real manager
// is emailed. Each draft subject is tagged with its intended recipient; log rows
// are marked 'Preview'.
function testManagerRecaps() {
  try {
    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();

    var locations = buildDailyLocationData(ss, yesterday);
    if (locations.length === 0) { Logger.log('No data.'); return; }

    var roster = fetchManagerRoster();
    if (!roster) { Logger.log('Roster fetch failed.'); return; }

    var groups = buildRecipientGroups(roster, locations);
    var clockoutCounts = getClockoutCounts(ss, yesterday);
    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC') || RECAP_CONFIG.CC_DEFAULT
    ).join(',');
    var sigHtml = getOwnerSignatureHtml();

    var previewed = 0;
    groups.forEach(function(g) {
      if (g.email && g.email.toLowerCase() === RECAP_CONFIG.OWNER_EMAIL) return;  // never email the owner
      var qualifying = g.stores.filter(function(loc) {
        return qualifiesForRecap(loc, clockoutCounts[loc.location] || 0,
          RECAP_CONFIG.FORECAST_MISS_PCT, RECAP_CONFIG.OVER_SCHEDULED_PCT);
      });
      if (qualifying.length === 0) return;

      var facts = qualifying.map(buildManagerStoreFacts);
      var body  = writeManagerNarrative(g.firstName, facts);
      var html  = buildManagerRecapHtml(body, sigHtml);
      var topts = { htmlBody: html };
      if (ccStr) topts.cc = ccStr;
      GmailApp.createDraft(g.email, '[TEST] Yesterday — labor over schedule', '', topts);
      previewed++;
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: qualifying.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: 'Preview',
        body:   body
      });
    });

    Logger.log('Preview drafts created: ' + previewed + ' recipient(s) with a flagged store.');
  } catch (e) {
    Logger.log('Error in testManagerRecaps: ' + e.toString());
  }
}

// Read-only audit: log which email addresses each location's recap goes to.
// Sends nothing. Flags locations that had data yesterday but have no manager
// assigned (the gap to fix before a morning send).
function previewRecapRoster() {
  try {
    var roster = fetchManagerRoster();
    if (!roster) { Logger.log('Roster fetch failed — cannot preview roster.'); return; }

    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();
    var locationNames = buildDailyLocationData(ss, yesterday)
      .map(function(l) { return l.location; });

    var result = buildLocationRecipientMap(roster, locationNames);

    Logger.log('=== Manager Recap Roster (location -> recipients) ===');
    result.map.forEach(function(e) {
      Logger.log(e.location + ': ' + (e.emails.length ? e.emails.join(', ') : '(no manager assigned)'));
    });
    if (result.unassigned.length) {
      Logger.log('--- Had data yesterday but NO manager assigned: ' + result.unassigned.join(', '));
    } else {
      Logger.log('--- Every location with data yesterday has at least one recipient.');
    }
  } catch (e) {
    Logger.log('Error in previewRecapRoster: ' + e.toString());
  }
}
