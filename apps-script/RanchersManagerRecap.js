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
// - Manager replies route to MANAGER_RECAP_REPLY_TO (Script Property).
// - Every send is logged to the 'Manager Recap Log' tab, full body included.
//
// SETUP:
//   1. Script Properties -> MANAGER_SYNC_TOKEN = (same value as Vercel env)
//   2. Script Properties -> MANAGER_RECAP_CC   = josh@...,eric@...,kandace@...
//   3. (optional) Script Properties -> MANAGER_RECAP_REPLY_TO = comma-separated
//      addresses replies go to. If unset, defaults to RECAP_CONFIG.REPLY_TO_DEFAULT.
//   4. (ANTHROPIC_API_KEY already set for the debrief - reused here)
//   5. Run setupManagerRecapTrigger() ONCE
//   6. Run testManagerRecaps() to preview to dalton only
//
// EDITING RECIPIENTS (no code change / no clasp push needed):
//   - Who GETS a recap: manage in the app's admin/users screen (dashboard access).
//   - Who is CC'd:       edit the MANAGER_RECAP_CC Script Property.
//   - Where replies go:  edit the MANAGER_RECAP_REPLY_TO Script Property.
// ============================================================================

var RECAP_CONFIG = {
  MANAGER_API_URL: 'https://andysdashboard.com/api/store-managers',
  // Default reply-to if the MANAGER_RECAP_REPLY_TO Script Property is unset.
  // Edit recipients live via that property — no code change required.
  REPLY_TO_DEFAULT: 'dalton@rancherscustard.com,josh@rancherscustard.com,eric@rancherscustard.com,kandacegiles@rancherscustard.com',
  SEND_HOUR:       7,
  SEND_MINUTE:     15,
  LOG_SHEET:       'Manager Recap Log',
  SIGNATURE_IMG_URL: 'https://ci3.googleusercontent.com/mail-sig/AIorK4zYQoLW7nhXQU1EvNY5LJL02mU8weD5RJN3G9VpcHFfHabY6AFsa5h87yz5x7OVU4q4DJu2LFw',
  SIGNATURE_TEXT:  'Dalton Owens\nOwner/Operator\nRanchers Custard Company, LLC\nAndy\'s Frozen Custard Franchisee'
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
  var anyEscalation = storeFactsList.some(function(s) { return s.missedForecastAndOverScheduled; });
  var greeting = 'Good morning' + (firstName ? ' ' + firstName : '') + ',';

  var prompt =
    'Write a short, personal good-morning email about how this manager\'s store(s) did YESTERDAY. '
    + 'Sound like a real person who glanced at the numbers — not a report.\n\n'
    + 'RULES:\n'
    + '- Start with exactly: "' + greeting + '"\n'
    + '- Keep it short: one or two sentences per store. No filler.\n'
    + '- Work the key numbers into the sentence naturally; never list stats or use a table.\n'
    + '- Use only numbers from the data; never invent figures.\n'
    + '- Vary the wording; never sound templated.\n'
    + '- One short paragraph per store. With multiple stores, start each paragraph with the store name in **double asterisks**.\n'
    + '- Close each store by asking for a quick reply on how it went.\n'
    + '- No grades, no labor rates, no internal flag names.\n'
    + (anyEscalation
        ? '- For a store flagged "missedForecastAndOverScheduled": it missed forecast AND ran over scheduled hours — gently ask what happened, never critical.\n'
        : '')
    + '- For a store flagged "isNewStore": still ramping up; be encouraging, not critical.\n'
    + '- No subject line, title, or signature.\n\n'
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
  var greeting = 'Good morning' + (firstName ? ' ' + firstName : '') + ',';
  var parts = [greeting, ''];
  storeFactsList.forEach(function(s) {
    var bits = [];
    if (s.sales)          bits.push(s.sales);
    if (s.vsForecast)     bits.push(s.vsForecast + ' vs forecast');
    if (s.hrsVsScheduled) bits.push(s.hrsVsScheduled);
    var line = '**' + s.store + '** — ' + (bits.length ? bits.join(', ') + '.' : 'numbers coming in.');
    if (s.missedForecastAndOverScheduled) {
      line += ' Missed forecast and ran over scheduled hours — what happened? Quick recap when you can.';
    } else if (s.isNewStore) {
      line += ' Still finding its rhythm — how did it feel? Quick recap appreciated.';
    } else {
      line += ' How did it go? Quick recap when you can.';
    }
    parts.push(line, '');
  });
  return parts.join('\n').trim();
}

function buildManagerRecapHtml(bodyText, dateStr) {
  var paras = bodyText.split('\n')
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; });

  var body = paras.map(function(p) {
    return '<p style="margin:0 0 12px;line-height:1.5;color:#222;font-size:14px;">'
      + p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
  }).join('');

  var sigText = String(RECAP_CONFIG.SIGNATURE_TEXT || '').split('\n')
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l.length > 0; })
    .join('<br>');

  var signature =
    '<div style="margin-top:18px;">'
    + (RECAP_CONFIG.SIGNATURE_IMG_URL
        ? '<img src="' + RECAP_CONFIG.SIGNATURE_IMG_URL + '" alt="" style="max-width:320px;height:auto;display:block;margin-bottom:6px;">'
        : '')
    + (sigText ? '<div style="color:#444;font-size:13px;line-height:1.4;">' + sigText + '</div>' : '')
    + '</div>';

  return '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;color:#222;font-size:14px;">'
    + body + signature
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

function sendManagerRecaps() {
  try {
    var ss        = SpreadsheetApp.openById(DAILY_CONFIG.SPREADSHEET_ID);
    var yesterday = getYesterdayStr();

    var locations = buildDailyLocationData(ss, yesterday);
    if (locations.length === 0) { Logger.log('No data for ' + yesterday + ' — skipping manager recaps.'); return; }

    var roster = fetchManagerRoster();
    if (!roster) { Logger.log('Roster unavailable — aborting (sent nothing).'); return; }

    var groups = buildRecipientGroups(roster, locations);
    if (groups.length === 0) { Logger.log('No recipients have data — nothing to send.'); return; }

    var props = PropertiesService.getScriptProperties();
    var ccStr = parseRecapCcList(props.getProperty('MANAGER_RECAP_CC')).join(',');
    // Editable live via the MANAGER_RECAP_REPLY_TO Script Property; falls back
    // to the built-in default (Dalton, Josh, Eric, Kandace) if unset.
    var replyToStr = parseRecapCcList(
      props.getProperty('MANAGER_RECAP_REPLY_TO') || RECAP_CONFIG.REPLY_TO_DEFAULT
    ).join(',');

    groups.forEach(function(g) {
      var facts  = g.stores.map(buildManagerStoreFacts);
      var body   = writeManagerNarrative(g.firstName, facts);
      var html   = buildManagerRecapHtml(body, yesterday);
      var status = 'Sent';
      try {
        var opts = {
          to:       g.email,
          subject:  'Quick recap — ' + fmtDisplayDate(yesterday),
          htmlBody: html,
          replyTo:  replyToStr
        };
        if (ccStr) opts.cc = ccStr;
        MailApp.sendEmail(opts);
      } catch (e) {
        status = 'Failed: ' + e.toString();
        Logger.log('Send failed for ' + g.email + ': ' + e.toString());
      }
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: g.stores.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: status,
        body:   body
      });
    });

    Logger.log('Manager recaps complete: ' + groups.length + ' recipient(s).');
  } catch (e) {
    Logger.log('Error in sendManagerRecaps: ' + e.toString());
  }
}

function setupManagerRecapTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) {
    if (t.getHandlerFunction() === 'sendManagerRecaps') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendManagerRecaps')
    .timeBased().atHour(RECAP_CONFIG.SEND_HOUR).nearMinute(RECAP_CONFIG.SEND_MINUTE).everyDays(1)
    .inTimezone('America/Chicago').create();
  Logger.log('Manager recap trigger set: ~' + RECAP_CONFIG.SEND_HOUR + ':' + ('0' + RECAP_CONFIG.SEND_MINUTE).slice(-2) + ' Central daily.');
}

// Preview the entire batch to dalton only — no real manager is emailed.
// Each preview email is subject-tagged with its intended recipient; log rows
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
    Logger.log('Preview recipients: ' + groups.length);

    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
    ).join(',');

    groups.forEach(function(g) {
      var facts = g.stores.map(buildManagerStoreFacts);
      var body  = writeManagerNarrative(g.firstName, facts);
      var html  = buildManagerRecapHtml(body, yesterday);
      MailApp.sendEmail({
        to:       'dalton@rancherscustard.com',
        subject:  '[TEST → ' + g.email + '] Quick recap — ' + fmtDisplayDate(yesterday),
        htmlBody: html
      });
      logManagerRecap(ss, {
        date:   yesterday,
        name:   g.name,
        email:  g.email,
        stores: g.stores.map(function(s) { return s.location; }).join(', '),
        cc:     ccStr,
        status: 'Preview',
        body:   body
      });
    });

    Logger.log('Preview sent to dalton only.');
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
