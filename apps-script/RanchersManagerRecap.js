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
        model:      'claude-opus-4-7',
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
  var parts = ['Good morning ' + firstName + ',', ''];
  storeFactsList.forEach(function(s) {
    var bits = [];
    if (s.sales)          bits.push('came in at ' + s.sales);
    if (s.vsForecast)     bits.push(s.vsForecast + ' vs forecast');
    if (s.vsPriorYear)    bits.push(s.vsPriorYear + ' vs last year');
    if (s.hrsVsScheduled) bits.push(s.hrsVsScheduled);
    var line = '**' + s.store + '** — Yesterday '
      + (bits.length ? bits.join(', ') : 'numbers are still coming in') + '.';
    if (s.missedForecastAndOverScheduled) {
      line += ' Sales were under forecast while hours ran over what was scheduled — worth a look at how the day played out. When you get a sec, send me a quick recap.';
    } else if (s.isNewStore) {
      line += ' Still early days as the store finds its rhythm — how did it feel on the ground? A quick recap would be great.';
    } else {
      line += ' How did yesterday go? Send a quick recap when you can.';
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
    return '<p style="margin:0 0 14px;line-height:1.75;color:#1a1a1a;font-size:15px;">'
      + p.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') + '</p>';
  }).join('');

  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;">'
    + '<div style="max-width:620px;margin:24px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + '<div style="background:#1a2e4a;padding:24px 32px;">'
    + '<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 4px;">Good Morning</h1>'
    + '<p style="color:#a0b8d0;font-size:13px;margin:0;">' + fmtDisplayDate(dateStr) + '</p>'
    + '</div>'
    + '<div style="padding:28px 32px;border-bottom:3px solid #1a2e4a;">' + body + '</div>'
    + '<div style="padding:14px 32px;text-align:center;background:#f8f9fa;">'
    + '<p style="color:#888;font-size:12px;margin:0;">Andy\'s Dashboard &nbsp;&middot;&nbsp; <a href="https://andysdashboard.com" style="color:#1a2e4a;text-decoration:none;">andysdashboard.com</a></p>'
    + '</div></div></body></html>';
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

    var ccStr = parseRecapCcList(
      PropertiesService.getScriptProperties().getProperty('MANAGER_RECAP_CC')
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
          replyTo:  RECAP_CONFIG.REPLY_TO
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
  Logger.log('Manager recap trigger set: ~' + RECAP_CONFIG.SEND_HOUR + ':' + RECAP_CONFIG.SEND_MINUTE + ' Central daily.');
}

// Preview the entire batch to dalton only — no real manager is emailed.
// Each preview email is subject-tagged with its intended recipient; log rows
// are marked 'Preview'.
function testManagerRecaps() {
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
}
