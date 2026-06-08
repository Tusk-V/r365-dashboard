// ============================================================================
// R365 CONSOLIDATED REPORT PROCESSOR
// Processes: Weekly Sales & Labor, Flash Report, Scheduled Today, Labor Report,
//            Overtime Warning, Logbook Entries, Paid Outs
// ============================================================================

var CONFIG = {
  // Spreadsheet IDs
  WEEKLY_SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  FLASH_SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  SCHEDULED_SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  LABOR_SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  
  // Sheet Names
  WEEKLY_SHEET: 'Sheet1',
  FLASH_SALES_SHEET: 'Flash - Daily Sales',
  FLASH_LABOR_SHEET: 'Flash - Daily Labor',
  SCHEDULED_SHEET: 'Scheduled Today',
  AUTO_CLOCKOUT_SHEET: 'Auto-Clockouts',
  CALL_OFFS_SHEET: 'Call-Offs',
  OVERTIME_SHEET: 'Overtime Warning',
  LOGBOOK_SHEET: 'Logbook Entries',
  PAID_OUTS_SHEET: 'Paid Outs',
  FORECAST_DATA_SHEET: 'Forecast Data',
  HISTORICAL_SHEET: 'Historical Data',

  // Email Subjects (updated to match actual R365 subjects)
  WEEKLY_SUBJECT: 'Weekly Sales and Labor Report',
  WEEKLY_PREVIOUS_SUBJECT: 'Weekly Sales and Labor Report - Previous Week',
  FLASH_SUBJECT: 'Flash Report',
  SCHEDULED_SUBJECT: 'Labor Actual vs Scheduled - Today',
  LABOR_SUBJECT: 'Labor Actual vs Scheduled - Punch Details',
  OVERTIME_SUBJECT: 'Overtime Warning Report',
  
  // Data retention
  DAYS_TO_KEEP: 28,
  WEEKLY_DAYS_TO_KEEP: 84  // 12 weeks
};

// ============================================================================
// LOCATION ROW HELPERS - Detect end-of-section markers consistently
// ============================================================================

function isSectionEndRow(location) {
  if (!location) return false;
  var l = location.toString().toLowerCase();
  return l.indexOf('total') !== -1 ||
         l.indexOf('week to date') !== -1 ||
         l.indexOf('period to date') !== -1 ||
         l.indexOf('month to date') !== -1 ||
         l.indexOf('year to date') !== -1 ||
         l.indexOf('day of') !== -1;
}

// ============================================================================
// ANOMALY ALERTING
// Collect notable processor events during a run and email a single summary
// at the end. Kill switch: set Script Property ENABLE_ALERTS to a truthy
// value to enable. Recipient defaults to dalton@rancherscustard.com but can
// be overridden via Script Property ALERT_RECIPIENT.
// ============================================================================

var Alerts = (function() {
  var entries = [];
  return {
    add: function(category, msg) {
      try {
        entries.push({ t: new Date(), category: category, msg: msg });
        Logger.log('[ALERT:' + category + '] ' + msg);
      } catch (e) { /* never let alerting break the processor */ }
    },
    reset: function() { entries = []; },
    send: function() {
      try {
        var enabled = PropertiesService.getScriptProperties().getProperty('ENABLE_ALERTS');
        if (!enabled || entries.length === 0) return;
        var to = PropertiesService.getScriptProperties().getProperty('ALERT_RECIPIENT') || 'dalton@rancherscustard.com';
        var lines = entries.map(function(e) {
          return '[' + Utilities.formatDate(e.t, Session.getScriptTimeZone(), 'HH:mm:ss') + '] [' + e.category + '] ' + e.msg;
        });
        var subject = 'R365 Processor Anomalies — ' + entries.length + ' event(s) — ' +
          Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M/d/yyyy');
        MailApp.sendEmail(to, subject, lines.join('\n'));
        Logger.log('Sent anomaly digest to ' + to + ' (' + entries.length + ' entries)');
      } catch (e) {
        Logger.log('Alerts.send failed: ' + e.toString());
      }
    }
  };
})();

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function processAllR365Reports() {
  Logger.log('========================================');
  Logger.log('Starting R365 Report Processing');
  Logger.log('Time: ' + new Date().toLocaleString());
  Logger.log('========================================');

  Alerts.reset();

  var today = new Date();
  if (today.getDay() === 2) {
    Logger.log('Tuesday detected - clearing previous week data');
    clearPreviousWeekData();
  }

  processWeeklySalesLabor();
  processFlashReport();
  processScheduledToday();
  processLaborReport();
  processOvertimeWarning();

  // OData verification — gated by ENABLE_ODATA_VERIFY script property.
  // Compares Flash - Daily Sales rows against R365 OData totals for
  // yesterday and alerts on per-location mismatches > $5 and > 1%.
  try {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    var yReportDate = (yesterday.getMonth() + 1) + '/' + yesterday.getDate() + '/' + yesterday.getFullYear();
    verifyFlashAgainstOData(yReportDate);
  } catch (e) {
    Logger.log('OData verification step failed: ' + e.toString());
    Alerts.add('ODATA_VERIFY_ERROR', e.toString());
  }
  
  // Update forecast weather data (fills in temps/conditions for recent + future days)
  try {
    updateForecastWeather();
  } catch (e) {
    Logger.log('Warning: Forecast weather update failed: ' + e.toString());
  }

  // Refresh yesterday's R365-derived signals (discounts, voids, labor) for forecast hygiene
  try {
    if (typeof refreshYesterdayR365Signals === 'function') refreshYesterdayR365Signals();
  } catch (e) {
    Logger.log('Warning: R365 signal refresh failed: ' + e.toString());
  }

  // Generate model forecasts (writes predictions to Model Forecast sheet, fills actuals)
  try {
    generateModelForecasts();
  } catch (e) {
    Logger.log('Warning: Model forecast generation failed: ' + e.toString());
  }
  
  // Auto-tune coefficients daily
  try {
    tuneCoefficients();
  } catch (e) {
    Logger.log('Warning: Coefficient tuning failed: ' + e.toString());
  }
  
  // Email anomaly digest (gated by ENABLE_ALERTS script property)
  Alerts.send();

  Logger.log('========================================');
  Logger.log('All R365 Reports Processed');
  Logger.log('========================================');
}

// ============================================================================
// TUESDAY CLEANUP (Flash sheets excluded - they use rolling 7-day retention)
// ============================================================================

function clearPreviousWeekData() {
  try {
    var spreadsheet = SpreadsheetApp.openById(CONFIG.WEEKLY_SPREADSHEET_ID);
    
    // Flash - Daily Sales: NOT cleared here - uses rolling 7-day retention via cleanOldData()
    // Flash - Daily Labor: NOT cleared here - uses rolling 7-day retention via cleanOldData()
    
    // Clear Scheduled Today
    var schedSheet = spreadsheet.getSheetByName(CONFIG.SCHEDULED_SHEET);
    if (schedSheet && schedSheet.getLastRow() > 1) {
      schedSheet.getRange(2, 1, schedSheet.getLastRow() - 1, schedSheet.getLastColumn()).clearContent();
      Logger.log('Cleared Scheduled Today data');
    }
    
    // Clear Auto-Clockouts (keep only Monday's data)
    var autoSheet = spreadsheet.getSheetByName(CONFIG.AUTO_CLOCKOUT_SHEET);
    if (autoSheet && autoSheet.getLastRow() > 1) {
      var today = new Date();
      var monday = new Date(today);
      monday.setDate(today.getDate() - 1); // Tuesday - 1 = Monday
      var mondayStr = Utilities.formatDate(monday, Session.getScriptTimeZone(), 'M/d/yyyy');
      
      var data = autoSheet.getDataRange().getValues();
      for (var i = data.length - 1; i >= 1; i--) {
        var rowDate = data[i][0];
        if (rowDate instanceof Date) {
          rowDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), 'M/d/yyyy');
        }
        if (rowDate !== mondayStr) {
          autoSheet.deleteRow(i + 1);
        }
      }
      Logger.log('Auto-Clockouts: Cleared all data except Monday (' + mondayStr + ')');
    }
    
    // Clear Call-Offs (keep only Monday's data)
    var callSheet = spreadsheet.getSheetByName(CONFIG.CALL_OFFS_SHEET);
    if (callSheet && callSheet.getLastRow() > 1) {
      var today2 = new Date();
      var monday2 = new Date(today2);
      monday2.setDate(today2.getDate() - 1);
      var mondayStr2 = Utilities.formatDate(monday2, Session.getScriptTimeZone(), 'M/d/yyyy');
      
      var data2 = callSheet.getDataRange().getValues();
      for (var i = data2.length - 1; i >= 1; i--) {
        var rowDate2 = data2[i][0];
        if (rowDate2 instanceof Date) {
          rowDate2 = Utilities.formatDate(rowDate2, Session.getScriptTimeZone(), 'M/d/yyyy');
        }
        if (rowDate2 !== mondayStr2) {
          callSheet.deleteRow(i + 1);
        }
      }
      Logger.log('Call-Offs: Cleared all data except Monday (' + mondayStr2 + ')');
    }
    
  } catch (e) {
    Logger.log('Error clearing previous week data: ' + e.toString());
  }
}

// ============================================================================
// WEEKLY SALES & LABOR PROCESSOR - WITH DYNAMIC COLUMN MAPPING
// ============================================================================

function processWeeklySalesLabor() {
  Logger.log('--- Processing Weekly Sales & Labor ---');
  
  var today = new Date();
  var dayOfWeek = today.getDay();
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  Logger.log('Day of week: ' + dayOfWeek + ' (' + dayNames[dayOfWeek] + ')');
  
  try {
    var searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 1);
    var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    
    var query;
    var expectedSubject;
    
    if (dayOfWeek === 1) {
      expectedSubject = CONFIG.WEEKLY_PREVIOUS_SUBJECT;
      query = 'subject:"' + expectedSubject + '" has:attachment after:' + dateStr;
      Logger.log('MONDAY: Looking for Previous Week report');
    } else {
      expectedSubject = CONFIG.WEEKLY_SUBJECT;
      query = 'subject:"' + expectedSubject + '" -subject:"Previous Week" has:attachment after:' + dateStr;
      Logger.log('TUE-SUN: Looking for Current Week report (excluding Previous Week)');
    }
    
    Logger.log('Search query: ' + query);
    
    var threads = GmailApp.search(query, 0, 5);
    
    if (threads.length === 0) {
      Logger.log('No Weekly Sales & Labor emails found matching: ' + expectedSubject);
      return;
    }
    
    Logger.log('Found ' + threads.length + ' matching email(s)');
    
    var messages = threads[0].getMessages();
    var message = messages[messages.length - 1];
    var actualSubject = message.getSubject();
    
    Logger.log('Using email with subject: "' + actualSubject + '"');
    Logger.log('Email date: ' + message.getDate());
    
    if (dayOfWeek === 1) {
      if (actualSubject.indexOf('Previous Week') === -1) {
        Logger.log('ERROR: Found email does NOT contain "Previous Week"!');
        Logger.log('Expected: "' + expectedSubject + '"');
        Logger.log('Got: "' + actualSubject + '"');
        Logger.log('SKIPPING - wrong email');
        return;
      }
      Logger.log('Verified: Email contains "Previous Week"');
    } else {
      if (actualSubject.indexOf('Previous Week') !== -1) {
        Logger.log('ERROR: Found email contains "Previous Week" but should not!');
        Logger.log('SKIPPING - wrong email');
        return;
      }
      Logger.log('Verified: Email is Current Week (not Previous Week)');
    }
    
    var attachment = getExcelAttachment(message);
    if (!attachment) {
      Logger.log('No Excel attachment found');
      return;
    }
    
    var data = convertExcelToArray(attachment);
    if (!data) return;
    
    processWeeklyData(data);
    Logger.log('Weekly Sales & Labor processed successfully');

    // On Monday the "Previous Week" report finalizes Sheet1 with exactly one
    // complete week. That is the moment to append an immutable snapshot to the
    // Historical Data archive (the dashboard's past-weeks dropdown reads it).
    // Tue–Sun runs hold an in-progress week and are intentionally not archived.
    if (dayOfWeek === 1) {
      archiveWeekToHistorical(getHistoricalWeekEnding());
    }

  } catch (e) {
    Logger.log('Error processing Weekly Sales & Labor: ' + e.toString());
  }
}

// ============================================================================
// DYNAMIC COLUMN MAPPING FOR WEEKLY DATA
// ============================================================================

function buildColumnMap(headerRow) {
  var columnMap = {};
  var expectedColumns = ['Location Name','Lunch','Mid-Day','Dinner','Dessert','Late Night','For Net Sales','Total Act Net Sales','For v Act Sales Var','PYSales','Labor Percent','Labor Goal','Opt Labor Hrs','Act Labor Hrs','Opt v Act Labor Var','Sch Labor Hrs','Act v Sch Labor Var','For Labor Hrs','Sch v For Labor Var','Entree Avg','Act OT Hrs','Sch OT Hrs'];
  
  for (var i = 0; i < headerRow.length; i++) {
    var headerName = headerRow[i] ? headerRow[i].toString().trim() : '';
    if (headerName) {
      columnMap[headerName] = i;
    }
  }
  
  Logger.log('Found ' + Object.keys(columnMap).length + ' columns in header');
  if (columnMap['Other'] !== undefined) {
    Logger.log('NOTE: "Other" column found at index ' + columnMap['Other'] + ' - will be ignored');
  }
  return columnMap;
}

function getColumnValue(row, columnMap, columnName) {
  var index = columnMap[columnName];
  if (index === undefined || index >= row.length) return null;
  return row[index];
}

// ============================================================================
// APPLY CONSISTENT NUMBER FORMATS TO WEEKLY SHEET
// Ensures every row gets the correct format regardless of prior sheet state.
// Column letters map to outputHeaders order (A=Location Name, B=Lunch, ...)
// ============================================================================

function applyWeeklySheetFormats(sheet, numRows) {
  if (numRows <= 0) return;
  // Currency (2 decimal): Lunch(B), Mid-Day(C), Dinner(D), Dessert(E), Late Night(F),
  //                       For Net Sales(G), Total Act Net Sales(H), For v Act Sales Var(I), PYSales(J)
  //                       Entree Avg(T)
  var currencyCols = [2, 3, 4, 5, 6, 7, 8, 9, 10, 20];
  for (var i = 0; i < currencyCols.length; i++) {
    sheet.getRange(2, currencyCols[i], numRows, 1).setNumberFormat('#,##0.00');
  }
  // Percentage (2 decimal): Labor Percent(K), Labor Goal(L)
  var percentCols = [11, 12];
  for (var i = 0; i < percentCols.length; i++) {
    sheet.getRange(2, percentCols[i], numRows, 1).setNumberFormat('0.00%');
  }
  // Hours (1 decimal): Opt Labor Hrs(M), Act Labor Hrs(N), Opt v Act Labor Var(O),
  //                    Sch Labor Hrs(P), Act v Sch Labor Var(Q), For Labor Hrs(R),
  //                    Sch v For Labor Var(S), Act OT Hrs(U), Sch OT Hrs(V)
  var hourCols = [13, 14, 15, 16, 17, 18, 19, 21, 22];
  for (var i = 0; i < hourCols.length; i++) {
    sheet.getRange(2, hourCols[i], numRows, 1).setNumberFormat('#,##0.0');
  }
  Logger.log('Applied consistent number formats to ' + numRows + ' data rows');
}

function processWeeklyData(data) {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.WEEKLY_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(CONFIG.WEEKLY_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.WEEKLY_SHEET);
  
  var outputHeaders = ['Location Name', 'Lunch', 'Mid-Day', 'Dinner', 'Dessert', 'Late Night', 'For Net Sales', 'Total Act Net Sales', 'For v Act Sales Var', 'PYSales', 'Labor Percent', 'Labor Goal', 'Opt Labor Hrs', 'Act Labor Hrs', 'Opt v Act Labor Var', 'Sch Labor Hrs', 'Act v Sch Labor Var', 'For Labor Hrs', 'Sch v For Labor Var', 'Entree Avg', 'Act OT Hrs', 'Sch OT Hrs'];
  
  var headerRow = null;
  var headerRowIndex = -1;
  for (var h = 0; h < Math.min(10, data.length); h++) {
    if (data[h][0] && data[h][0].toString().trim() === 'Location Name') {
      headerRow = data[h];
      headerRowIndex = h;
      Logger.log('Found header row at index ' + h);
      break;
    }
  }
  
  if (!headerRow) { Logger.log('ERROR: Could not find header row with "Location Name"'); return; }
  
  var columnMap = buildColumnMap(headerRow);
  Logger.log('Column mapping:');
  for (var colName in columnMap) { Logger.log('  ' + colName + ' -> index ' + columnMap[colName]); }
  
  sheet.clear({ contentsOnly: false });
  sheet.getRange(1, 1, 1, outputHeaders.length).setValues([outputHeaders]);
  sheet.setFrozenRows(1);
  
  var rows = [];
  var seenLocations = {};
  // Helper: build a Sheet1-shaped row from a raw spreadsheet row using the column map
  var buildRowData = function(row, locationName) {
    return [locationName,
      parseNumber(getColumnValue(row, columnMap, 'Lunch')),
      parseNumber(getColumnValue(row, columnMap, 'Mid-Day')),
      parseNumber(getColumnValue(row, columnMap, 'Dinner')),
      parseNumber(getColumnValue(row, columnMap, 'Dessert')),
      parseNumber(getColumnValue(row, columnMap, 'Late Night')),
      parseNumber(getColumnValue(row, columnMap, 'For Net Sales')),
      parseNumber(getColumnValue(row, columnMap, 'Total Act Net Sales')),
      parseNumber(getColumnValue(row, columnMap, 'For v Act Sales Var')),
      parseNumber(getColumnValue(row, columnMap, 'PYSales')),
      parseNumber(getColumnValue(row, columnMap, 'Labor Percent')),
      parseNumber(getColumnValue(row, columnMap, 'Labor Goal')),
      parseNumber(getColumnValue(row, columnMap, 'Opt Labor Hrs')),
      parseNumber(getColumnValue(row, columnMap, 'Act Labor Hrs')),
      parseNumber(getColumnValue(row, columnMap, 'Opt v Act Labor Var')),
      parseNumber(getColumnValue(row, columnMap, 'Sch Labor Hrs')),
      parseNumber(getColumnValue(row, columnMap, 'Act v Sch Labor Var')),
      parseNumber(getColumnValue(row, columnMap, 'For Labor Hrs')),
      parseNumber(getColumnValue(row, columnMap, 'Sch v For Labor Var')),
      parseNumber(getColumnValue(row, columnMap, 'Entree Avg')),
      parseNumber(getColumnValue(row, columnMap, 'Act OT Hrs')),
      parseNumber(getColumnValue(row, columnMap, 'Sch OT Hrs'))];
  };

  var dataStartRow = headerRowIndex + 1;
  // Read until we hit a section boundary (Totals, Week To Date, etc.) or 30 rows max
  for (var i = dataStartRow; i < dataStartRow + 30; i++) {
    if (i >= data.length) break;
    var row = data[i];
    var locationName = getColumnValue(row, columnMap, 'Location Name');
    if (!locationName) locationName = row[0] ? row[0].toString().trim() : '';
    locationName = locationName ? locationName.toString().trim() : '';
    // Stop at Totals or any section break (handles multi-section weekly reports)
    if (isSectionEndRow(locationName)) {
      Logger.log('Stopped at section end: "' + locationName + '" (row ' + i + ')');
      break;
    }
    if (!locationName) continue;

    // Defense against R365 multi-section bleed: only the first occurrence of each
    // location wins. Without this, a stray weekly aggregate row can land in Sheet1.
    if (seenLocations[locationName]) {
      Logger.log('SKIP duplicate location in primary section: "' + locationName + '" (row ' + i + ')');
      Alerts.add('WEEKLY_DEDUPE', 'Skipped duplicate "' + locationName + '" in Weekly primary section (row ' + i + ')');
      continue;
    }

    rows.push(buildRowData(row, locationName));
    seenLocations[locationName] = true;
  }

  // --- BACKFILL: scan the per-location daily-breakdown section (Section 2) ---
  // R365 occasionally omits a location from the primary section. The Weekly Sales
  // & Labor report contains a second section with the same column structure,
  // where each location row is followed by per-day rows. We pull location rows
  // from there to fill any gaps.
  var dayPattern = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+\d+\/\d+\/\d+/i;
  var sec2HeaderRow = -1;
  for (var p = headerRowIndex + 1; p < data.length; p++) {
    var colA = data[p][0] ? data[p][0].toString().trim() : '';
    if (colA === 'Location Name') { sec2HeaderRow = p; break; }
  }

  if (sec2HeaderRow !== -1) {
    var backfilled = 0;
    for (var p2 = sec2HeaderRow + 1; p2 < data.length; p2++) {
      var s2row = data[p2];
      var s2name = s2row[0] ? s2row[0].toString().trim() : '';
      if (!s2name) continue;
      if (isSectionEndRow(s2name)) break;
      if (dayPattern.test(s2name)) continue; // skip per-day breakdown rows
      if (seenLocations[s2name]) continue;   // already captured from Section 1

      Logger.log('WEEKLY BACKFILL: "' + s2name + '" missing from primary section, sourced from daily-breakdown section');
      Alerts.add('WEEKLY_BACKFILL', '"' + s2name + '" missing from Weekly primary section — sourced from daily-breakdown section');
      rows.push(buildRowData(s2row, s2name));
      seenLocations[s2name] = true;
      backfilled++;
    }
    if (backfilled > 0) Logger.log('Backfilled ' + backfilled + ' location(s) from daily-breakdown section');
  }

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, outputHeaders.length).setValues(rows);
    // Apply consistent number formats to all data rows — ensures new rows match existing rows
    applyWeeklySheetFormats(sheet, rows.length);
    Logger.log('Added ' + rows.length + ' rows to Weekly Sales & Labor (Sheet1)');
  }
}

// ============================================================================
// HISTORICAL DATA ARCHIVE
// Appends a per-location snapshot of the just-completed week to the
// "Historical Data" tab, which powers the dashboard's past-weeks dropdown.
//
// Source of truth is Sheet1 (Weekly Sales & Labor). On Monday's "Previous
// Week" run Sheet1 holds exactly one finalized week, so the archive row set is
// a faithful 11-column projection of Sheet1 — values AND number formats are
// copied so the dashboard's FORMATTED_VALUE-based parsers render identically.
//
// Idempotent: any existing rows for the same Week Ending are removed before the
// fresh snapshot is appended, so re-running a week never duplicates rows.
//
// Column contract (must match parseHistoricalData in lib/sheetParsers.js):
//   A Week Ending | B Location | C Actual Sales | D Forecast Sales
//   E Sales Variance | F PY Sales | G Labor % | H Optimal Hours
//   I Actual Hours | J Scheduled Hours | K Sch v For Labor Var
// ============================================================================

// Week-ending date label = the most recent COMPLETED Sunday (the last day of
// the prior Mon–Sun business week). On the Monday processor run this is
// yesterday; computed generally so the label is always a Sunday no matter which
// day it runs. Matches the "Week Ending" convention used by the Weekly Debrief.
function getHistoricalWeekEnding() {
  var d = new Date();
  var day = d.getDay();              // 0=Sun, 1=Mon, ... 6=Sat
  var back = (day === 0) ? 7 : day;  // Mon→1 (yesterday) ... Sat→6, Sun→7
  d.setDate(d.getDate() - back);
  return Utilities.formatDate(d, 'America/Chicago', 'M/d/yyyy');
}

function archiveWeekToHistorical(weekEnding) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.WEEKLY_SPREADSHEET_ID);

    // --- Read the current week from Sheet1 (values + formats) ---------------
    var src = ss.getSheetByName(CONFIG.WEEKLY_SHEET);
    if (!src) { Logger.log('Historical archive skipped: Sheet1 not found'); return; }
    var lastRow = src.getLastRow();
    var lastCol = src.getLastColumn();
    if (lastRow < 2) { Logger.log('Historical archive skipped: Sheet1 has no data rows'); return; }

    var numRows = lastRow - 1;
    var vals = src.getRange(2, 1, numRows, lastCol).getValues();
    var fmts = src.getRange(2, 1, numRows, lastCol).getNumberFormats();

    // Sheet1 0-indexed source columns
    var C_LOC = 0, C_FOR = 6, C_ACT = 7, C_SVAR = 8, C_PY = 9,
        C_LPCT = 10, C_OPT = 12, C_AHRS = 13, C_SHRS = 15, C_SVF = 18;

    var outRows = [];
    var outFmts = [];
    for (var i = 0; i < vals.length; i++) {
      var r = vals[i];
      var loc = r[C_LOC] ? r[C_LOC].toString().trim() : '';
      if (!loc) continue;
      outRows.push([
        weekEnding, loc,
        r[C_ACT], r[C_FOR], r[C_SVAR], r[C_PY],
        r[C_LPCT], r[C_OPT], r[C_AHRS], r[C_SHRS], r[C_SVF]
      ]);
      // '@' keeps the Week Ending label as literal text so A2:A and A2:K always
      // yield the identical string the dashboard filters/sorts on.
      outFmts.push([
        '@', fmts[i][C_LOC],
        fmts[i][C_ACT], fmts[i][C_FOR], fmts[i][C_SVAR], fmts[i][C_PY],
        fmts[i][C_LPCT], fmts[i][C_OPT], fmts[i][C_AHRS], fmts[i][C_SHRS], fmts[i][C_SVF]
      ]);
    }
    if (outRows.length === 0) { Logger.log('Historical archive skipped: no location rows in Sheet1'); return; }

    // --- Open (or create) the Historical Data tab ---------------------------
    var hist = ss.getSheetByName(CONFIG.HISTORICAL_SHEET);
    if (!hist) {
      hist = ss.insertSheet(CONFIG.HISTORICAL_SHEET);
      hist.getRange(1, 1, 1, 11).setValues([[
        'Week Ending', 'Location', 'Actual Sales', 'Forecast Sales',
        'Sales Variance', 'PY Sales', 'Labor %', 'Optimal Hours',
        'Actual Hours', 'Scheduled Hours', 'Sch v For Labor Var'
      ]]);
      hist.setFrozenRows(1);
    }

    // --- Idempotency: drop any existing rows for this Week Ending ------------
    var hLast = hist.getLastRow();
    if (hLast >= 2) {
      var colA = hist.getRange(2, 1, hLast - 1, 1).getValues();
      // Bottom-up so deletions don't shift not-yet-processed row numbers.
      for (var d2 = colA.length - 1; d2 >= 0; d2--) {
        var v = colA[d2][0];
        if (v !== '' && v !== null && v.toString() === weekEnding) {
          hist.deleteRow(d2 + 2);
        }
      }
    }

    // --- Append the fresh snapshot (values + matching formats) --------------
    var startRow = hist.getLastRow() + 1;
    hist.getRange(startRow, 1, outRows.length, 11).setValues(outRows);
    hist.getRange(startRow, 1, outRows.length, 11).setNumberFormats(outFmts);

    Logger.log('Historical archive: wrote ' + outRows.length + ' rows for week ending ' + weekEnding);
    Alerts.add('HISTORICAL_ARCHIVE', 'Archived ' + outRows.length + ' location rows for week ending ' + weekEnding);
  } catch (e) {
    // Never let archiving abort the rest of the processor run.
    Logger.log('archiveWeekToHistorical failed: ' + e.toString());
    Alerts.add('HISTORICAL_ARCHIVE_ERROR', 'Failed to archive week ending ' + weekEnding + ': ' + e.toString());
  }
}

// One-time seed / verification helper. Run from the editor to snapshot whatever
// Sheet1 currently holds under the most recent Sunday's date, so the dashboard
// past-weeks dropdown can be confirmed without waiting for the Monday trigger.
// NOTE: mid-week, Sheet1 holds the in-progress week — the seeded row is for
// verification only and can be deleted. Safe to re-run (upserts by Week Ending).
function testArchiveWeekToHistorical() {
  var weekEnding = getHistoricalWeekEnding();
  Logger.log('TEST: archiving current Sheet1 as week ending ' + weekEnding);
  archiveWeekToHistorical(weekEnding);
}

// ============================================================================
// DAILY LABOR HOURS - Returns both optimal and scheduled hours per location
// from the daily breakdown section of the Weekly Sales & Labor report
// ============================================================================

function getDailyLaborHours(reportDate) {
  var result = { optimal: {}, scheduled: {} };
  try {
    var searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 3);
    var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    var reportDateObj = new Date(reportDate);
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var dayName = days[reportDateObj.getDay()];
    var month = reportDateObj.getMonth() + 1;
    var day = reportDateObj.getDate();
    var year = reportDateObj.getFullYear();
    var datePattern = dayName + ' ' + month + '/' + day + '/' + year;
    Logger.log('Looking for daily labor hours matching: ' + datePattern);

    var queries = [
      { query: 'subject:"' + CONFIG.WEEKLY_SUBJECT + '" -subject:"Previous Week" has:attachment after:' + dateStr, label: 'Current Week' },
      { query: 'subject:"' + CONFIG.WEEKLY_PREVIOUS_SUBJECT + '" has:attachment after:' + dateStr, label: 'Previous Week' }
    ];

    for (var q = 0; q < queries.length; q++) {
      Logger.log('Searching ' + queries[q].label + '...');
      var threads = GmailApp.search(queries[q].query, 0, 1);
      if (threads.length === 0) { Logger.log('No ' + queries[q].label + ' email found'); continue; }

      var messages = threads[0].getMessages();
      var message = messages[messages.length - 1];
      Logger.log('Found ' + queries[q].label + ': "' + message.getSubject() + '" from ' + message.getDate());

      var attachment = getExcelAttachment(message);
      if (!attachment) { Logger.log('No Excel attachment found in ' + queries[q].label); continue; }

      var data = convertExcelToArray(attachment);
      if (!data) continue;

      var optLaborHrsIndex = -1;
      var schLaborHrsIndex = -1;

      // Search daily section header first (rows 28-40 - widened for more locations)
      for (var h = 28; h < Math.min(40, data.length); h++) {
        var colA = data[h][0] ? data[h][0].toString().trim() : '';
        if (colA === 'Location Name') {
          for (var c = 0; c < data[h].length; c++) {
            var headerVal = data[h][c] ? data[h][c].toString().trim() : '';
            if (headerVal === 'Opt Labor Hrs') { optLaborHrsIndex = c; Logger.log('Found Opt Labor Hrs at col ' + c + ' (daily header row ' + h + ')'); }
            if (headerVal === 'Sch Labor Hrs') { schLaborHrsIndex = c; Logger.log('Found Sch Labor Hrs at col ' + c + ' (daily header row ' + h + ')'); }
          }
          break;
        }
      }

      // Fallback: search main header (rows 0-10)
      if (optLaborHrsIndex === -1 || schLaborHrsIndex === -1) {
        for (var h = 0; h < Math.min(10, data.length); h++) {
          var colA = data[h][0] ? data[h][0].toString().trim() : '';
          if (colA === 'Location Name') {
            for (var c = 0; c < data[h].length; c++) {
              var headerVal = data[h][c] ? data[h][c].toString().trim() : '';
              if (headerVal === 'Opt Labor Hrs' && optLaborHrsIndex === -1) { optLaborHrsIndex = c; Logger.log('Found Opt Labor Hrs at col ' + c + ' (main header row ' + h + ')'); }
              if (headerVal === 'Sch Labor Hrs' && schLaborHrsIndex === -1) { schLaborHrsIndex = c; Logger.log('Found Sch Labor Hrs at col ' + c + ' (main header row ' + h + ')'); }
            }
            break;
          }
        }
      }

      if (optLaborHrsIndex === -1 && schLaborHrsIndex === -1) {
        Logger.log('Could not find Opt Labor Hrs or Sch Labor Hrs columns in ' + queries[q].label);
        continue;
      }

      var currentLocation = null;
      for (var i = 30; i < data.length; i++) {
        var row = data[i];
        var colA = row[0] ? row[0].toString().trim() : '';
        if (!colA) continue;
        if (!colA.includes('/') && !colA.includes('Monday') && !colA.includes('Tuesday') && !colA.includes('Wednesday') && !colA.includes('Thursday') && !colA.includes('Friday') && !colA.includes('Saturday') && !colA.includes('Sunday') && colA !== 'Location Name' && colA !== 'Total') {
          currentLocation = colA;
          continue;
        }
        if (currentLocation && colA === datePattern) {
          if (optLaborHrsIndex !== -1) result.optimal[currentLocation] = parseNumber(row[optLaborHrsIndex]);
          if (schLaborHrsIndex !== -1) result.scheduled[currentLocation] = parseNumber(row[schLaborHrsIndex]);
        }
      }

      var optCount = Object.keys(result.optimal).length;
      var schCount = Object.keys(result.scheduled).length;
      if (optCount > 0 || schCount > 0) {
        Logger.log('Found daily labor hours from ' + queries[q].label + ': ' + optCount + ' optimal, ' + schCount + ' scheduled');
        return result;
      } else {
        Logger.log('No matching date rows found in ' + queries[q].label + ' for pattern: ' + datePattern);
      }
    }
    Logger.log('Warning: Could not find daily labor hours in either report for ' + datePattern);
  } catch (e) {
    Logger.log('Error getting daily labor hours: ' + e.toString());
  }
  return result;
}

// ============================================================================
// ONE-TIME REBUILD: Flash - Daily Labor (clears sheet, replays last 7 emails)
// Run manually via: rebuildDailyLaborSheet()
// ============================================================================

function rebuildDailyLaborSheet() {
  Logger.log('========================================');
  Logger.log('REBUILDING Flash - Daily Labor sheet');
  Logger.log('========================================');

  // Clear the sheet entirely (keep header)
  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var laborSheet = spreadsheet.getSheetByName(CONFIG.FLASH_LABOR_SHEET);
  if (!laborSheet) {
    Logger.log('Flash - Daily Labor sheet not found, will be created during rebuild');
  } else {
    if (laborSheet.getLastRow() > 1) {
      laborSheet.getRange(2, 1, laborSheet.getLastRow() - 1, laborSheet.getLastColumn()).clearContent();
    }
    // Ensure header is correct with Scheduled Hours in col F
    laborSheet.getRange(1, 1, 1, 10).setValues([['Report Date', 'Location', 'Sales', 'Actual Hours', 'Optimal Hours', 'Scheduled Hours', 'Labor %', 'Optimal Labor %', 'Labor % Variance', 'Labor Cost Per Hour']]);
    Logger.log('Cleared existing data and updated header');
  }

  // Search for last 7 days of Flash Report emails
  var searchDate = new Date();
  searchDate.setDate(searchDate.getDate() - 8);
  var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var query = 'subject:"' + CONFIG.FLASH_SUBJECT + '" has:attachment after:' + dateStr;

  Logger.log('Searching for Flash Report emails after: ' + dateStr);
  var threads = GmailApp.search(query, 0, 10);
  Logger.log('Found ' + threads.length + ' Flash Report email thread(s)');

  if (threads.length === 0) {
    Logger.log('No Flash Report emails found in last 8 days');
    return;
  }

  // Collect all messages across threads, sorted oldest first
  var allMessages = [];
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      allMessages.push(messages[m]);
    }
  }
  allMessages.sort(function(a, b) { return a.getDate() - b.getDate(); });
  Logger.log('Processing ' + allMessages.length + ' message(s) oldest-first');

  var processedDates = {};
  var successCount = 0;

  for (var i = 0; i < allMessages.length; i++) {
    var message = allMessages[i];
    var emailDate = message.getDate();
    var previousDay = new Date(emailDate);
    previousDay.setDate(previousDay.getDate() - 1);
    var reportDate = Utilities.formatDate(previousDay, Session.getScriptTimeZone(), 'M/d/yyyy');

    if (processedDates[reportDate]) {
      Logger.log('Skipping duplicate for date: ' + reportDate);
      continue;
    }

    Logger.log('--- Processing email for report date: ' + reportDate + ' ---');

    var attachment = getFlashAttachment(message);
    if (!attachment) { Logger.log('No Flash attachment found, skipping'); continue; }

    var data = convertExcelToArray(attachment);
    if (!data) { Logger.log('Could not parse attachment, skipping'); continue; }

    // Get daily labor hours (optimal + scheduled) for this specific report date
    var optimalHoursMap = {};
    var scheduledHoursMap = {};
    var dailyLaborHours = getDailyLaborHours(reportDate);
    if (Object.keys(dailyLaborHours.optimal).length > 0 || Object.keys(dailyLaborHours.scheduled).length > 0) {
      optimalHoursMap = dailyLaborHours.optimal;
      scheduledHoursMap = dailyLaborHours.scheduled;
      Logger.log('Loaded daily labor hours: ' + Object.keys(optimalHoursMap).length + ' optimal, ' + Object.keys(scheduledHoursMap).length + ' scheduled');
    } else {
      Logger.log('Warning: No daily labor hours found for ' + reportDate);
    }

    var laborRows = [];
    for (var r = 6; r <= 50; r++) {
      if (r >= data.length) break;
      var row = data[r];
      var location = row[0] ? row[0].toString().trim() : '';
      // Stop at Totals or section break (Week To Date, etc.)
      if (isSectionEndRow(location)) break;
      if (!location || location === '' || location === 'Location') continue;

      var sales = parseNumber(row[1]);
      var regularHrs = parseNumber(row[14]);
      var otHrs = parseNumber(row[16]);
      var otherHrs = parseNumber(row[18]);
      var actualHrs = regularHrs + otHrs + otherHrs;
      var laborRegular = parseNumber(row[13]);
      var laborOT = parseNumber(row[15]);
      var laborOther = parseNumber(row[17]);
      var totalLaborCost = laborRegular + laborOT + laborOther;
      var laborCostPerHour = actualHrs > 0 ? totalLaborCost / actualHrs : 0;
      var laborLaborPct = parseNumber(row[21]);
      var optimalHrs = optimalHoursMap[location] || '';
      var scheduledHrs = scheduledHoursMap[location] || '';
      var laborPctDisplay = laborLaborPct * 100;
      var optimalLaborPct = '';
      var laborPctVariance = '';
      if (optimalHrs !== '' && sales > 0 && laborCostPerHour > 0) {
        optimalLaborPct = ((optimalHrs * laborCostPerHour) / sales) * 100;
        laborPctVariance = laborPctDisplay - optimalLaborPct;
      }
      laborRows.push([reportDate, location, sales, actualHrs, optimalHrs, scheduledHrs, laborPctDisplay, optimalLaborPct, laborPctVariance, laborCostPerHour]);
    }

    if (laborRows.length > 0) {
      var sheet = spreadsheet.getSheetByName(CONFIG.FLASH_LABOR_SHEET);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(CONFIG.FLASH_LABOR_SHEET);
        sheet.getRange(1, 1, 1, 10).setValues([['Report Date', 'Location', 'Sales', 'Actual Hours', 'Optimal Hours', 'Scheduled Hours', 'Labor %', 'Optimal Labor %', 'Labor % Variance', 'Labor Cost Per Hour']]);
        sheet.setFrozenRows(1);
      }
      sheet.getRange(sheet.getLastRow() + 1, 1, laborRows.length, 10).setValues(laborRows);
      Logger.log('Wrote ' + laborRows.length + ' rows for ' + reportDate);
      processedDates[reportDate] = true;
      successCount++;
    } else {
      Logger.log('No labor rows extracted for ' + reportDate);
    }

    Utilities.sleep(500);
  }

  Logger.log('========================================');
  Logger.log('Rebuild complete. Processed ' + successCount + ' report date(s).');
  Logger.log('========================================');
}

// ============================================================================
// FLASH REPORT PROCESSOR (Rolling 7-day retention)
// ============================================================================

function processFlashReport() {
  Logger.log('--- Processing Flash Report ---');
  try {
    var searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 1);
    var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    var query = 'subject:"' + CONFIG.FLASH_SUBJECT + '" has:attachment after:' + dateStr;
    var threads = GmailApp.search(query, 0, 1);
    if (threads.length === 0) { Logger.log('No Flash Report emails found'); return; }
    var messages = threads[0].getMessages();
    var message = messages[messages.length - 1];
    Logger.log('Found email from: ' + message.getDate());
    var attachment = getFlashAttachment(message);
    if (!attachment) { Logger.log('No Flash Report attachment found'); return; }
    var data = convertExcelToArray(attachment);
    if (!data) return;
    processFlashData(data, message.getDate());
    processPaidOuts(data, message.getDate());
    processLogbookEntries(data, message.getDate());
    Logger.log('Flash Report processed successfully');
  } catch (e) {
    Logger.log('Error processing Flash Report: ' + e.toString());
  }
}

function getFlashAttachment(message) {
  var attachments = message.getAttachments();
  for (var i = 0; i < attachments.length; i++) {
    var name = attachments[i].getName();
    if (name.toLowerCase().includes('flash') && (name.toLowerCase().endsWith('.xlsx') || name.toLowerCase().endsWith('.xls'))) {
      return attachments[i];
    }
  }
  return getExcelAttachment(message);
}

function processFlashData(data, emailDate) {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var previousDay = new Date(emailDate);
  previousDay.setDate(previousDay.getDate() - 1);
  var reportDate = Utilities.formatDate(previousDay, Session.getScriptTimeZone(), 'M/d/yyyy');
  Logger.log('Processing Flash Report for date: ' + reportDate);
  
  var optimalHoursMap = {};
  var scheduledHoursMap = {};
  var dailyLaborHours = getDailyLaborHours(reportDate);
  if (Object.keys(dailyLaborHours.optimal).length > 0 || Object.keys(dailyLaborHours.scheduled).length > 0) {
    optimalHoursMap = dailyLaborHours.optimal;
    scheduledHoursMap = dailyLaborHours.scheduled;
    Logger.log('Loaded daily optimal hours for ' + Object.keys(optimalHoursMap).length + ' locations');
    Logger.log('Loaded daily scheduled hours for ' + Object.keys(scheduledHoursMap).length + ' locations');
  } else {
    Logger.log('Warning: Could not load daily labor hours for ' + reportDate);
  }
  
  var salesRows = [];
  var laborRows = [];
  
  for (var i = 6; i <= 50; i++) {
    if (i >= data.length) break;
    var row = data[i];
    var location = row[0] ? row[0].toString().trim() : '';
    // Stop at Totals or section break (Week To Date, Period To Date, Day of, etc.)
    if (isSectionEndRow(location)) {
      Logger.log('Stopped at section end: "' + location + '" (row ' + i + ')');
      break;
    }
    if (!location || location === '' || location === 'Location') continue;
    
    var sales = parseNumber(row[1]);
    var forecast = parseNumber(row[2]);
    var pySales = parseNumber(row[3]);
    var salesVariance = parseNumber(row[4]);
    var forecastVariance = sales - forecast;
    var guestCount = parseNumber(row[9]);
    var pyGuestCount = parseNumber(row[10]);
    var laborPercent = parseNumber(row[21]);
    
    salesRows.push([reportDate, location, sales, pySales, salesVariance, forecastVariance, guestCount, pyGuestCount, laborPercent * 100]);
    
    var regularHrs = parseNumber(row[14]);
    var otHrs = parseNumber(row[16]);
    var otherHrs = parseNumber(row[18]);
    var actualHrs = regularHrs + otHrs + otherHrs;
    var laborRegular = parseNumber(row[13]);
    var laborOT = parseNumber(row[15]);
    var laborOther = parseNumber(row[17]);
    var totalLaborCost = laborRegular + laborOT + laborOther;
    var laborCostPerHour = actualHrs > 0 ? totalLaborCost / actualHrs : 0;
    var laborLaborPct = parseNumber(row[21]);
    var optimalHrs = optimalHoursMap[location] || '';
    var scheduledHrs = scheduledHoursMap[location] || '';
    var laborPctDisplay = laborLaborPct * 100;
    var optimalLaborPct = '';
    var laborPctVariance = '';
    if (optimalHrs !== '' && sales > 0 && laborCostPerHour > 0) {
      optimalLaborPct = ((optimalHrs * laborCostPerHour) / sales) * 100;
      laborPctVariance = laborPctDisplay - optimalLaborPct;
    }
    // Column order: reportDate, location, sales, actualHrs, optimalHrs, scheduledHrs, laborPctDisplay, optimalLaborPct, laborPctVariance, laborCostPerHour
    laborRows.push([reportDate, location, sales, actualHrs, optimalHrs, scheduledHrs, laborPctDisplay, optimalLaborPct, laborPctVariance, laborCostPerHour]);
  }

  // --- BACKFILL: locations present in Period To Date but missing from Day-of section ---
  // R365 occasionally omits a location from the Day-of section even when it has sales.
  // We scan PTD (which lists every active location) and append a $0 placeholder row for any
  // location absent from the Day-of capture so the dashboard's location list stays complete.
  var dayOfLocations = {};
  for (var s = 0; s < salesRows.length; s++) dayOfLocations[salesRows[s][1]] = true;

  var ptdStart = -1;
  for (var p = 0; p < data.length; p++) {
    var ptdColA = data[p][0] ? data[p][0].toString().trim() : '';
    if (ptdColA.toLowerCase().indexOf('period to date') !== -1) { ptdStart = p; break; }
  }

  if (ptdStart !== -1) {
    var ptdDataStart = -1;
    for (var p2 = ptdStart + 1; p2 < Math.min(ptdStart + 5, data.length); p2++) {
      var hdr = data[p2][0] ? data[p2][0].toString().trim() : '';
      if (hdr === 'Location') { ptdDataStart = p2 + 1; break; }
    }

    if (ptdDataStart !== -1) {
      var backfilled = 0;
      for (var p3 = ptdDataStart; p3 < data.length; p3++) {
        var ptdRow = data[p3];
        var ptdLocation = ptdRow[0] ? ptdRow[0].toString().trim() : '';
        if (isSectionEndRow(ptdLocation)) break;
        if (!ptdLocation || ptdLocation === 'Location') continue;

        if (!dayOfLocations[ptdLocation]) {
          Logger.log('BACKFILL: "' + ptdLocation + '" missing from Day-of section, writing $0 placeholder row');
          Alerts.add('FLASH_PTD_BACKFILL', '"' + ptdLocation + '" missing from Flash Day-of for ' + reportDate + ' — wrote $0 placeholder');
          salesRows.push([reportDate, ptdLocation, 0, 0, 0, 0, 0, 0, 0]);
          laborRows.push([reportDate, ptdLocation, 0, 0, '', '', 0, '', '', 0]);
          dayOfLocations[ptdLocation] = true;
          backfilled++;
        }
      }
      if (backfilled > 0) Logger.log('Backfilled ' + backfilled + ' location(s) from PTD section');
    }
  }

  if (salesRows.length > 0) {
    var salesSheet = spreadsheet.getSheetByName(CONFIG.FLASH_SALES_SHEET);
    if (!salesSheet) {
      salesSheet = spreadsheet.insertSheet(CONFIG.FLASH_SALES_SHEET);
      salesSheet.getRange(1, 1, 1, 9).setValues([['Report Date', 'Location', 'Sales', 'PY Sales', 'Sales Variance', 'Forecast Variance', 'Guest Count', 'PY Guest Count', 'Labor %']]);
      salesSheet.setFrozenRows(1);
    }
    removeExistingDateData(salesSheet, reportDate);
    salesSheet.getRange(salesSheet.getLastRow() + 1, 1, salesRows.length, 9).setValues(salesRows);
    Logger.log('Added ' + salesRows.length + ' rows to Flash - Daily Sales');
    cleanOldData(salesSheet);
  }
  
  if (laborRows.length > 0) {
    var laborSheet = spreadsheet.getSheetByName(CONFIG.FLASH_LABOR_SHEET);
    if (!laborSheet) {
      laborSheet = spreadsheet.insertSheet(CONFIG.FLASH_LABOR_SHEET);
      laborSheet.getRange(1, 1, 1, 10).setValues([['Report Date', 'Location', 'Sales', 'Actual Hours', 'Optimal Hours', 'Scheduled Hours', 'Labor %', 'Optimal Labor %', 'Labor % Variance', 'Labor Cost Per Hour']]);
      laborSheet.setFrozenRows(1);
    } else {
      // Update column F header from 'Hours Variance' to 'Scheduled Hours' if needed
      var existingHeader = laborSheet.getRange(1, 6).getValue();
      if (existingHeader === 'Hours Variance') {
        laborSheet.getRange(1, 6).setValue('Scheduled Hours');
        Logger.log('Updated Flash - Daily Labor column F header to "Scheduled Hours"');
      }
    }
    removeExistingDateData(laborSheet, reportDate);
    laborSheet.getRange(laborSheet.getLastRow() + 1, 1, laborRows.length, 10).setValues(laborRows);
    Logger.log('Added ' + laborRows.length + ' rows to Flash - Daily Labor');
    cleanOldData(laborSheet);
  }

  // --- Append to Forecast Data (permanent historical archive - never deleted) ---
  if (salesRows.length > 0) {
    var forecastSalesData = [];
    for (var k = 0; k < salesRows.length; k++) {
      forecastSalesData.push({
        location: salesRows[k][1],
        sales: salesRows[k][2]
      });
    }
    appendToForecastData(reportDate, forecastSalesData);
  }
}

// ============================================================================
// FORECAST DATA - APPEND DAILY SALES (permanent archive, never deleted)
// ============================================================================

function appendToForecastData(reportDate, salesData) {
  try {
    var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
    var sheet = spreadsheet.getSheetByName(CONFIG.FORECAST_DATA_SHEET);
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(CONFIG.FORECAST_DATA_SHEET);
      sheet.getRange(1, 1, 1, 5).setValues([['Date', 'Location', 'Net Sales', 'High Temp', 'Conditions']]);
      sheet.setFrozenRows(1);
      Logger.log('Created new Forecast Data sheet with headers');
    }
    
    var existingData = sheet.getDataRange().getValues();
    var existingMap = {};
    for (var i = 1; i < existingData.length; i++) {
      var rowDate = existingData[i][0];
      var rowLocation = existingData[i][1];
      if (!rowDate || !rowLocation) continue;
      var normalizedDate = normalizeDateForForecast(rowDate);
      var key = normalizedDate + '|' + rowLocation.toString().trim();
      existingMap[key] = i + 1;
    }
    
    var normalizedReportDate = normalizeDateForForecast(reportDate);
    var newRows = [];
    var updatedCount = 0;
    
    for (var j = 0; j < salesData.length; j++) {
      var entry = salesData[j];
      var key = normalizedReportDate + '|' + entry.location;
      
      if (existingMap[key]) {
        var rowNum = existingMap[key];
        sheet.getRange(rowNum, 3).setValue(entry.sales);
        updatedCount++;
      } else {
        newRows.push([reportDate, entry.location, entry.sales, '', '']);
      }
    }
    
    if (newRows.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
      Logger.log('Forecast Data: Appended ' + newRows.length + ' new rows for ' + reportDate);
    }
    
    if (updatedCount > 0) {
      Logger.log('Forecast Data: Updated sales for ' + updatedCount + ' existing rows on ' + reportDate);
    }
    
  } catch (e) {
    Logger.log('ERROR appending to Forecast Data: ' + e.toString());
  }
}

function normalizeDateForForecast(dateVal) {
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

// ============================================================================
// PAID OUTS PROCESSOR
// ============================================================================

function processPaidOuts(data, emailDate) {
  Logger.log('--- Processing Paid Outs ---');
  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var previousDay = new Date(emailDate);
  previousDay.setDate(previousDay.getDate() - 1);
  var reportDate = Utilities.formatDate(previousDay, Session.getScriptTimeZone(), 'M/d/yyyy');
  
  var paidOutsStartRow = -1;
  for (var i = 0; i < data.length; i++) {
    var colA = data[i][0] ? data[i][0].toString().trim() : '';
    if (colA.includes('Exceptions and Paid Out Details')) { paidOutsStartRow = i; Logger.log('Found Paid Outs header at row ' + i); break; }
  }
  if (paidOutsStartRow === -1) { Logger.log('No Exceptions and Paid Out Details section found'); return; }
  
  var paidOutsRows = [];
  for (var i = paidOutsStartRow + 2; i < data.length; i++) {
    var row = data[i];
    var location = row[0] ? row[0].toString().trim() : '';
    var type = row[1] ? row[1].toString().trim() : '';
    var ticketNum = row[2] ? row[2].toString().trim() : '-';
    var amount = parseNumber(row[3]);
    var comment = row[5] ? row[5].toString().trim() : '';
    if (location.includes('Logbook Entries')) break;
    if (location === 'Location' || location === 'Location Name') continue;
    if (!location && !type && amount === 0) continue;
    if (!location) continue;
    paidOutsRows.push([reportDate, location, type || 'Unknown', ticketNum, amount, comment]);
    Logger.log('Found paid out: ' + location + ' - ' + type + ' - $' + amount);
  }
  
  if (paidOutsRows.length > 0) {
    var paidOutsSheet = spreadsheet.getSheetByName(CONFIG.PAID_OUTS_SHEET);
    if (!paidOutsSheet) {
      paidOutsSheet = spreadsheet.insertSheet(CONFIG.PAID_OUTS_SHEET);
      paidOutsSheet.getRange(1, 1, 1, 6).setValues([['Report Date', 'Location', 'Type', 'Ticket #', 'Amount', 'Comment']]);
      paidOutsSheet.setFrozenRows(1);
      paidOutsSheet.setColumnWidth(1, 100); paidOutsSheet.setColumnWidth(2, 120); paidOutsSheet.setColumnWidth(3, 100);
      paidOutsSheet.setColumnWidth(4, 80); paidOutsSheet.setColumnWidth(5, 80); paidOutsSheet.setColumnWidth(6, 300);
    }
    removeExistingDateData(paidOutsSheet, reportDate);
    paidOutsSheet.getRange(paidOutsSheet.getLastRow() + 1, 1, paidOutsRows.length, 6).setValues(paidOutsRows);
    Logger.log('Added ' + paidOutsRows.length + ' paid out entries');
    cleanOldData(paidOutsSheet);
  } else { Logger.log('No paid out entries found for ' + reportDate); }
}

// ============================================================================
// LOGBOOK ENTRIES PROCESSOR
// ============================================================================

function processLogbookEntries(data, emailDate) {
  Logger.log('--- Processing Logbook Entries ---');
  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var previousDay = new Date(emailDate);
  previousDay.setDate(previousDay.getDate() - 1);
  var reportDate = Utilities.formatDate(previousDay, Session.getScriptTimeZone(), 'M/d/yyyy');
  
  var logbookStartRow = -1;
  for (var i = 0; i < data.length; i++) {
    var colA = data[i][0] ? data[i][0].toString().trim() : '';
    if (colA.includes('Logbook Entries')) { logbookStartRow = i; Logger.log('Found Logbook Entries header at row ' + i); break; }
  }
  if (logbookStartRow === -1) { Logger.log('No Logbook Entries section found'); return; }
  
  var entriesByLocation = {};
  for (var i = logbookStartRow + 2; i < data.length; i++) {
    var row = data[i];
    var location = row[0] ? row[0].toString().trim() : '';
    var category = row[1] ? row[1].toString().trim() : '';
    var comment = row[3] ? row[3].toString().trim() : '';
    var priority = row[16] ? row[16].toString().trim() : '';
    if (!location || location === 'Location Name' || location === '') continue;
    if (!comment) continue;
    comment = comment.replace(/^[\n\r\s]+/, '').replace(/[\n\r\s]+$/, '');
    if (!entriesByLocation[location]) entriesByLocation[location] = { categories: [], priorities: [], comments: [] };
    entriesByLocation[location].categories.push(category || 'General');
    entriesByLocation[location].priorities.push(priority || 'General');
    entriesByLocation[location].comments.push(comment);
    Logger.log('Found logbook entry: ' + location + ' - ' + category);
  }
  
  var logbookRows = [];
  var locations = Object.keys(entriesByLocation);
  for (var j = 0; j < locations.length; j++) {
    var location = locations[j];
    var entry = entriesByLocation[location];
    var uniqueCategories = [];
    for (var k = 0; k < entry.categories.length; k++) { if (uniqueCategories.indexOf(entry.categories[k]) === -1) uniqueCategories.push(entry.categories[k]); }
    var combinedCategory = uniqueCategories.join(', ');
    var priorityOrder = ['Critical', 'High', 'Medium', 'Low', 'General'];
    var highestPriority = 'General';
    for (var k = 0; k < entry.priorities.length; k++) { var p = entry.priorities[k]; if (priorityOrder.indexOf(p) < priorityOrder.indexOf(highestPriority) && priorityOrder.indexOf(p) !== -1) highestPriority = p; }
    var combinedComment = entry.comments.join(' | ');
    var summary = generateLogbookSummary(combinedComment);
    logbookRows.push([reportDate, location, combinedCategory, highestPriority, combinedComment, summary]);
    Logger.log('Combined ' + entry.comments.length + ' entries for ' + location);
    if (j < locations.length - 1) Utilities.sleep(200);
  }
  
  if (logbookRows.length > 0) {
    var logbookSheet = spreadsheet.getSheetByName(CONFIG.LOGBOOK_SHEET);
    if (!logbookSheet) {
      logbookSheet = spreadsheet.insertSheet(CONFIG.LOGBOOK_SHEET);
      logbookSheet.getRange(1, 1, 1, 6).setValues([['Report Date', 'Location', 'Category', 'Priority', 'Comment', 'Summary']]);
      logbookSheet.setFrozenRows(1);
      logbookSheet.setColumnWidth(1, 100); logbookSheet.setColumnWidth(2, 120); logbookSheet.setColumnWidth(3, 150);
      logbookSheet.setColumnWidth(4, 80); logbookSheet.setColumnWidth(5, 500); logbookSheet.setColumnWidth(6, 400);
    }
    removeExistingDateData(logbookSheet, reportDate);
    logbookSheet.getRange(logbookSheet.getLastRow() + 1, 1, logbookRows.length, 6).setValues(logbookRows);
    Logger.log('Added ' + logbookRows.length + ' combined logbook entries (from ' + countTotalEntries(entriesByLocation) + ' original entries)');
    cleanOldData(logbookSheet);
  } else { Logger.log('No logbook entries found for ' + reportDate); }
}

function countTotalEntries(entriesByLocation) {
  var total = 0;
  var locations = Object.keys(entriesByLocation);
  for (var i = 0; i < locations.length; i++) total += entriesByLocation[locations[i]].comments.length;
  return total;
}

// ============================================================================
// AI SUMMARY FUNCTIONS
// ============================================================================

function generateLogbookSummary(comment) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) { Logger.log('No Anthropic API key found, using fallback summary'); return generateFallbackSummary(comment); }
  try {
    var prompt = "Summarize this restaurant shift logbook entry in 1-2 short sentences. Focus on key operational details (sales performance, staffing issues, drive times, problems). Be concise and factual. Do not include location name.\n\nEntry: " + comment;
    var payload = { model: "claude-sonnet-4-6", max_tokens: 100, messages: [{ role: "user", content: prompt }] };
    var options = { method: "post", contentType: "application/json", headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, payload: JSON.stringify(payload), muteHttpExceptions: true };
    var response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", options);
    var responseCode = response.getResponseCode();
    if (responseCode === 200) {
      var json = JSON.parse(response.getContentText());
      if (json.content && json.content[0] && json.content[0].text) return json.content[0].text.trim();
    } else { Logger.log('Anthropic API error: ' + responseCode + ' - ' + response.getContentText()); }
  } catch (e) { Logger.log('Error generating summary: ' + e.toString()); }
  return generateFallbackSummary(comment);
}

function generateFallbackSummary(comment) {
  var cleaned = comment.replace(/Sales:.*?(?=\n|$)/gi, '').replace(/DT:.*?(?=\n|$)/gi, '').replace(/\s+/g, ' ').trim();
  var sentences = cleaned.match(/[^.!?]+[.!?]+/g);
  if (sentences && sentences.length > 0) { var summary = sentences.slice(0, 2).join(' ').trim(); if (summary.length > 150) summary = summary.substring(0, 147) + '...'; return summary; }
  if (cleaned.length > 150) return cleaned.substring(0, 147) + '...';
  return cleaned;
}

// ============================================================================
// SCHEDULED TODAY PROCESSOR
// ============================================================================

function processScheduledToday() {
  Logger.log('--- Processing Scheduled Today ---');
  try {
    var searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 1);
    var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    var query = 'subject:"' + CONFIG.SCHEDULED_SUBJECT + '" has:attachment after:' + dateStr;
    var threads = GmailApp.search(query, 0, 1);
    if (threads.length === 0) { Logger.log('No Scheduled Today emails found'); return; }
    var messages = threads[0].getMessages();
    var message = messages[messages.length - 1];
    Logger.log('Found email from: ' + message.getDate());
    var attachment = getExcelAttachment(message);
    if (!attachment) { Logger.log('No Excel attachment found'); return; }
    var data = convertExcelToArray(attachment);
    if (!data) return;
    processScheduledData(data, message.getDate());
    Logger.log('Scheduled Today processed successfully');
  } catch (e) { Logger.log('Error processing Scheduled Today: ' + e.toString()); }
}

function processScheduledData(data, emailDate) {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.SCHEDULED_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(CONFIG.SCHEDULED_SHEET);
  if (!sheet) { sheet = spreadsheet.insertSheet(CONFIG.SCHEDULED_SHEET); sheet.getRange(1, 1, 1, 5).setValues([['Report Date', 'Location', 'Employee', 'Sch Start', 'Sch End']]); sheet.setFrozenRows(1); }
  var reportDate = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'M/d/yyyy');
  var currentLocation = null; var currentEmployee = null; var rows = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var colA = row[0] ? row[0].toString().trim() : '';
    var colC = row[2] ? row[2].toString().trim() : '';
    var colE = row[4] ? row[4].toString().trim() : '';
    if (colA.includes('Labor Actual') || colA.includes('Location:') || colA.includes('GRAND TOTAL') || colE === 'Date') continue;
    if (colA && colA !== '' && !colA.includes('/')) { currentLocation = colA; currentEmployee = null; continue; }
    if (currentLocation && colC && colC !== '' && !colC.includes('Date')) { currentEmployee = colC; continue; }
    if (currentLocation && currentEmployee && row[4] instanceof Date) {
      var startTime = formatScheduledTime(row[17]); var endTime = formatScheduledTime(row[18]);
      if (startTime || endTime) rows.push([reportDate, currentLocation, currentEmployee, startTime, endTime]);
      currentEmployee = null;
    }
  }
  if (rows.length > 0) {
    if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
    Logger.log('Added ' + rows.length + ' rows to Scheduled Today');
  } else { Logger.log('No scheduled employees found in report'); }
}

// ============================================================================
// LABOR REPORT PROCESSOR (Auto-Clockouts & Call-Offs)
// ============================================================================

function processLaborReport() {
  Logger.log('--- Processing Labor Report ---');
  try {
    var searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 1);
    var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    var query = 'subject:"' + CONFIG.LABOR_SUBJECT + '" has:attachment after:' + dateStr;
    var threads = GmailApp.search(query, 0, 1);
    if (threads.length === 0) { Logger.log('No Labor Report emails found'); return; }
    var messages = threads[0].getMessages();
    var message = messages[messages.length - 1];
    Logger.log('Found email from: ' + message.getDate());
    var attachment = getExcelAttachment(message);
    if (!attachment) { Logger.log('No Excel attachment found'); return; }
    var data = convertExcelToArray(attachment);
    if (!data) return;
    processLaborData(data, message.getDate());
    Logger.log('Labor Report processed successfully');
  } catch (e) { Logger.log('Error processing Labor Report: ' + e.toString()); }
}

function processLaborData(data, emailDate) {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.LABOR_SPREADSHEET_ID);
  if (!(emailDate instanceof Date)) emailDate = new Date(emailDate);
  var previousDay = new Date(emailDate);
  previousDay.setDate(previousDay.getDate() - 1);
  var reportDate = Utilities.formatDate(previousDay, Session.getScriptTimeZone(), 'M/d/yyyy');
  Logger.log('Processing Labor Data for date: ' + reportDate + ' (email received: ' + emailDate + ')');
  
  var autoClockouts = []; var callOffs = []; var currentLocation = null;
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var colA = row[0] ? row[0].toString().trim() : '';
    var colC = row[2] ? row[2].toString().trim() : '';
    var colF = row[5]; var colG = row[6]; var colP = row[15]; var colQ = row[16]; var colR = row[17]; var colS = row[18];
    if (colA.includes('Labor Actual') || colA.includes('Show All') || colA.includes('GRAND TOTAL') || colA === 'Date' || colA === 'Actual Hrs') continue;
    if (colA && !colA.includes('/') && colF !== undefined && colF !== '' && !isNaN(parseFloat(colF))) { currentLocation = colA; Logger.log('Found location: ' + currentLocation); continue; }
    
    if (!colA && colC && colC.length > 2 && !colC.includes('Date') && !colC.includes('Employee')) {
      var actualHrs = parseNumber(colF); var schedHrs = parseNumber(colG);
      Logger.log('Found employee: ' + colC + ' at ' + currentLocation + ' | Actual: ' + actualHrs + ' | Sched: ' + schedHrs);
      if (actualHrs === 0 && schedHrs > 0) {
        var scheduledTime = schedHrs + ' hrs';
        for (var k = 1; k <= 5 && (i + k) < data.length; k++) {
          var searchRow = data[i + k]; var searchColC = searchRow[2] ? searchRow[2].toString().trim() : '';
          var schStart = searchRow[17]; var schEnd = searchRow[18];
          if (searchColC && searchColC.length > 2 && !searchColC.includes('Date')) break;
          if (schStart instanceof Date || schEnd instanceof Date) {
            var startFormatted = formatScheduledTime(schStart); var endFormatted = formatScheduledTime(schEnd);
            if (startFormatted || endFormatted) { scheduledTime = (startFormatted || '') + ' - ' + (endFormatted || ''); break; }
          }
        }
        Logger.log('>>> CALL-OFF FOUND: ' + colC + ' at ' + currentLocation + ' | Scheduled: ' + scheduledTime);
        callOffs.push({ date: reportDate, location: currentLocation, employee: colC, scheduledTime: scheduledTime });
      }
    }
    
    if (colQ && currentLocation) {
      var isAutoClockout = false; var clockOutTime = null;
      if (colQ instanceof Date) {
        var hour = colQ.getHours(); var minute = colQ.getMinutes();
        clockOutTime = formatScheduledTime(colQ);
        if (hour === 5 && minute === 0) isAutoClockout = true;
      } else {
        var colQStr = colQ.toString(); clockOutTime = colQStr;
        if (colQStr.includes('05:00:00') || colQStr.includes('5:00:00 AM') || colQStr.includes(' 05:00')) isAutoClockout = true;
      }
      if (isAutoClockout) {
        var employeeName = null; var employeeSchedHrs = 0;
        for (var j = i; j >= 0 && j > i - 10; j--) {
          var prevColC = data[j][2] ? data[j][2].toString().trim() : '';
          var prevColA = data[j][0] ? data[j][0].toString().trim() : '';
          var prevColG = data[j][6];
          if (!prevColA && prevColC && prevColC.length > 2 && !prevColC.includes('Date')) { employeeName = prevColC; employeeSchedHrs = parseNumber(prevColG); break; }
        }
        if (employeeName) {
          Logger.log('>>> AUTO-CLOCKOUT FOUND: ' + employeeName + ' at ' + currentLocation + ' | Sched Hrs: ' + employeeSchedHrs);
          var clockInTime = formatScheduledTime(colP) || '';
          var schEndTime = ''; var schEndDate = null; var extraHours = '';
          if (employeeSchedHrs > 0) {
            if (colS instanceof Date) { schEndTime = formatScheduledTime(colS); schEndDate = colS; } else if (colS && colS.toString().trim()) { schEndTime = colS.toString(); }
            if (!schEndTime) {
              for (var k = i - 1; k >= 0 && k > i - 10; k--) {
                var searchRow = data[k]; var searchColA = searchRow[0] ? searchRow[0].toString().trim() : '';
                var searchColC = searchRow[2] ? searchRow[2].toString().trim() : ''; var searchSchEnd = searchRow[18];
                if (searchColA && !searchColA.includes('/')) break;
                if (searchColC && searchColC.length > 2 && !searchColC.includes('Date') && searchColC !== employeeName) break;
                if (searchSchEnd instanceof Date) { schEndTime = formatScheduledTime(searchSchEnd); schEndDate = searchSchEnd; Logger.log('Found Sch End on row ' + k + ': ' + schEndTime); break; }
                else if (searchSchEnd && searchSchEnd.toString().trim()) { schEndTime = searchSchEnd.toString(); break; }
              }
            }
            if (schEndDate) extraHours = calculateExtraHours(schEndDate, null);
          } else { schEndTime = 'Unsch'; extraHours = 'N/A'; }
          Logger.log('>>> ' + employeeName + ' | Sch End: ' + schEndTime + ' | Extra Hrs: ' + extraHours);
          autoClockouts.push({ date: reportDate, location: currentLocation, employee: employeeName, clockIn: clockInTime, clockOut: clockOutTime, schEnd: schEndTime, extraHours: extraHours });
        }
      }
    }
  }
  Logger.log('Total auto-clockouts found: ' + autoClockouts.length);
  Logger.log('Total call-offs found: ' + callOffs.length);
  if (autoClockouts.length > 0) saveAutoClockouts(spreadsheet, autoClockouts, reportDate);
  if (callOffs.length > 0) saveCallOffs(spreadsheet, callOffs, reportDate);
}

function calculateExtraHours(schEndDate, unused) {
  try {
    if (!schEndDate || !(schEndDate instanceof Date)) return '';
    var schHour = schEndDate.getHours(); var schMinute = schEndDate.getMinutes(); var autoClockoutHour = 5; var totalExtraMinutes;
    if (schHour >= 12) { totalExtraMinutes = ((24 - schHour) * 60 - schMinute) + (autoClockoutHour * 60); }
    else if (schHour < autoClockoutHour) { totalExtraMinutes = (autoClockoutHour - schHour) * 60 - schMinute; }
    else { totalExtraMinutes = 0; }
    var extraHours = totalExtraMinutes / 60;
    if (extraHours <= 0) return '';
    return extraHours.toFixed(1);
  } catch (e) { Logger.log('Error calculating extra hours: ' + e.toString()); return ''; }
}

function saveAutoClockouts(spreadsheet, autoClockouts, reportDate) {
  var sheet = spreadsheet.getSheetByName(CONFIG.AUTO_CLOCKOUT_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.AUTO_CLOCKOUT_SHEET);
  sheet.getRange(1, 1, 1, 7).setValues([['Report Date', 'Location', 'Employee', 'Clock In', 'Clock Out', 'Sch End', 'Extra Hrs']]);
  sheet.setFrozenRows(1);
  removeExistingDateData(sheet, reportDate);
  var rows = autoClockouts.map(function(ac) { return [ac.date, ac.location, ac.employee, ac.clockIn, ac.clockOut, ac.schEnd, ac.extraHours]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
  Logger.log('Saved ' + rows.length + ' auto-clockouts');
  cleanOldData(sheet);
}

function saveCallOffs(spreadsheet, callOffs, reportDate) {
  var sheet = spreadsheet.getSheetByName(CONFIG.CALL_OFFS_SHEET);
  if (!sheet) { sheet = spreadsheet.insertSheet(CONFIG.CALL_OFFS_SHEET); sheet.getRange(1, 1, 1, 4).setValues([['Report Date', 'Location', 'Employee', 'Scheduled Time']]); sheet.setFrozenRows(1); }
  removeExistingDateData(sheet, reportDate);
  var rows = callOffs.map(function(co) { return [co.date, co.location, co.employee, co.scheduledTime]; });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  Logger.log('Saved ' + rows.length + ' call-offs');
  cleanOldData(sheet);
}

// ============================================================================
// OVERTIME WARNING PROCESSOR
// ============================================================================

function processOvertimeWarning() {
  Logger.log('--- Processing Overtime Warning Report ---');
  try {
    var searchDate = new Date();
    searchDate.setDate(searchDate.getDate() - 1);
    var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    var query = 'subject:"' + CONFIG.OVERTIME_SUBJECT + '" has:attachment after:' + dateStr;
    var threads = GmailApp.search(query, 0, 1);
    if (threads.length === 0) { Logger.log('No Overtime Warning Report emails found'); return; }
    var messages = threads[0].getMessages();
    var message = messages[messages.length - 1];
    Logger.log('Found email from: ' + message.getDate());
    var attachment = getOvertimeAttachment(message);
    if (!attachment) { Logger.log('No Overtime Warning attachment found'); return; }
    var data = convertExcelToArray(attachment);
    if (!data) return;
    processOvertimeData(data);
    Logger.log('Overtime Warning Report processed successfully');
  } catch (e) { Logger.log('Error processing Overtime Warning Report: ' + e.toString()); }
}

function getOvertimeAttachment(message) {
  var attachments = message.getAttachments();
  for (var i = 0; i < attachments.length; i++) {
    var name = attachments[i].getName();
    if (name.startsWith('Overtime_Warning_Report') || name.startsWith('Overtime Warning Report')) {
      if (name.toLowerCase().endsWith('.xlsx') || name.toLowerCase().endsWith('.xls')) return attachments[i];
    }
  }
  return null;
}

function processOvertimeData(data) {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.WEEKLY_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(CONFIG.OVERTIME_SHEET);
  if (!sheet) sheet = spreadsheet.insertSheet(CONFIG.OVERTIME_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, 1, 3).setValues([['Employee', 'Location', 'Est OT Start']]);
  sheet.setFrozenRows(1);
  var rows = [];
  for (var i = 7; i < data.length; i++) {
    var row = data[i];
    var employeeName = row[1] ? row[1].toString().trim() : '';
    var location = row[3] ? row[3].toString().trim() : '';
    var weeklyOTStarts = row[7];
    if (weeklyOTStarts && employeeName && location) { rows.push([employeeName, location, formatOTStartTime(weeklyOTStarts)]); }
  }
  if (rows.length > 0) { sheet.getRange(2, 1, rows.length, 3).setValues(rows); Logger.log('Saved ' + rows.length + ' overtime warnings'); }
  else { Logger.log('No employees with overtime warnings found'); }
}

function formatOTStartTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dayName = days[value.getDay()]; var hours = value.getHours(); var minutes = value.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12; hours = hours ? hours : 12;
    var minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
    return dayName + ' ' + hours + ':' + minutesStr + ' ' + ampm;
  }
  var str = value.toString().trim();
  try {
    str = str.replace(/(\d)(AM|PM)/i, '$1 $2');
    var parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      var dayName = days[parsed.getDay()]; var hours = parsed.getHours(); var minutes = parsed.getMinutes();
      var ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12; hours = hours ? hours : 12;
      var minutesStr = minutes < 10 ? '0' + minutes : minutes.toString();
      return dayName + ' ' + hours + ':' + minutesStr + ' ' + ampm;
    }
  } catch (e) { Logger.log('Error parsing OT time: ' + e.toString()); }
  return str;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function convertExcelToArray(attachment) {
  try {
    var blob = attachment.copyBlob();
    var tempFile = Drive.Files.insert({ title: 'TempExcel_' + new Date().getTime(), mimeType: MimeType.GOOGLE_SHEETS }, blob, { convert: true });
    var tempSheet = SpreadsheetApp.openById(tempFile.id);
    var data = tempSheet.getSheets()[0].getDataRange().getValues();
    Drive.Files.remove(tempFile.id);
    return data;
  } catch (e) { Logger.log('Error converting Excel: ' + e.toString()); return null; }
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  var str = value.toString().replace(/[$,%]/g, '').replace(/,/g, '').trim();
  var num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function formatScheduledTime(value) {
  if (!value) return '';
  if (value instanceof Date) {
    var hours = value.getHours(); var minutes = value.getMinutes();
    var ampm = hours >= 12 ? 'PM' : 'AM'; hours = hours % 12; hours = hours ? hours : 12;
    var minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutesStr + ' ' + ampm;
  }
  return value.toString();
}

function removeExistingDateData(sheet, reportDate) {
  var data = sheet.getDataRange().getValues();
  var reportDateStr = reportDate.toString().trim();
  for (var i = data.length - 1; i >= 1; i--) {
    var cellValue = data[i][0]; var cellStr = '';
    if (cellValue instanceof Date) cellStr = (cellValue.getMonth() + 1) + '/' + cellValue.getDate() + '/' + cellValue.getFullYear();
    else cellStr = cellValue ? cellValue.toString().trim() : '';
    if (cellStr === reportDateStr) sheet.deleteRow(i + 1);
  }
}

function cleanOldData(sheet) {
  if (!sheet) return;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.DAYS_TO_KEEP);
  for (var i = data.length - 1; i >= 1; i--) {
    var rowDate = new Date(data[i][0]);
    if (rowDate < cutoffDate) sheet.deleteRow(i + 1);
  }
}

function getExcelAttachment(message) {
  var attachments = message.getAttachments();
  for (var i = 0; i < attachments.length; i++) {
    var name = attachments[i].getName().toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return attachments[i];
  }
  return null;
}

// ============================================================================
// CLEANUP: Remove "Week To Date" / "Totals" rows from Flash sheets that
// got captured by the previous overly-permissive loop.
// Run manually via: cleanupBadFlashRows()
// ============================================================================

function cleanupBadFlashRows() {
  Logger.log('========================================');
  Logger.log('CLEANUP: Removing bad rows from Flash sheets');
  Logger.log('========================================');
  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var sheetsToClean = [CONFIG.FLASH_SALES_SHEET, CONFIG.FLASH_LABOR_SHEET];

  for (var s = 0; s < sheetsToClean.length; s++) {
    var sheet = spreadsheet.getSheetByName(sheetsToClean[s]);
    if (!sheet || sheet.getLastRow() <= 1) continue;
    var data = sheet.getDataRange().getValues();
    var removed = 0;
    for (var i = data.length - 1; i >= 1; i--) {
      var location = data[i][1] ? data[i][1].toString().trim() : '';
      if (isSectionEndRow(location)) {
        sheet.deleteRow(i + 1);
        removed++;
      }
    }
    Logger.log(sheetsToClean[s] + ': removed ' + removed + ' bad row(s)');
  }

  // Also clean Forecast Data
  var forecastSheet = spreadsheet.getSheetByName(CONFIG.FORECAST_DATA_SHEET);
  if (forecastSheet && forecastSheet.getLastRow() > 1) {
    var fdata = forecastSheet.getDataRange().getValues();
    var fremoved = 0;
    for (var i = fdata.length - 1; i >= 1; i--) {
      var location = fdata[i][1] ? fdata[i][1].toString().trim() : '';
      if (isSectionEndRow(location)) {
        forecastSheet.deleteRow(i + 1);
        fremoved++;
      }
    }
    Logger.log(CONFIG.FORECAST_DATA_SHEET + ': removed ' + fremoved + ' bad row(s)');
  }

  Logger.log('Cleanup complete.');
}

// ============================================================================
// ONE-TIME BACKFILL: Flash - Daily Sales (replays last 7 emails for sales only)
// Run manually via: rebuildDailySalesSheet()
// ============================================================================

function rebuildDailySalesSheet() {
  Logger.log('========================================');
  Logger.log('REBUILDING Flash - Daily Sales sheet');
  Logger.log('========================================');

  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var salesSheet = spreadsheet.getSheetByName(CONFIG.FLASH_SALES_SHEET);
  if (!salesSheet) {
    salesSheet = spreadsheet.insertSheet(CONFIG.FLASH_SALES_SHEET);
    salesSheet.getRange(1, 1, 1, 9).setValues([['Report Date', 'Location', 'Sales', 'PY Sales', 'Sales Variance', 'Forecast Variance', 'Guest Count', 'PY Guest Count', 'Labor %']]);
    salesSheet.setFrozenRows(1);
  }

  var searchDate = new Date();
  searchDate.setDate(searchDate.getDate() - 8);
  var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var query = 'subject:"' + CONFIG.FLASH_SUBJECT + '" has:attachment after:' + dateStr;

  Logger.log('Searching for Flash Report emails after: ' + dateStr);
  var threads = GmailApp.search(query, 0, 10);
  Logger.log('Found ' + threads.length + ' Flash Report email thread(s)');

  if (threads.length === 0) {
    Logger.log('No Flash Report emails found in last 8 days');
    return;
  }

  var allMessages = [];
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      allMessages.push(messages[m]);
    }
  }
  allMessages.sort(function(a, b) { return a.getDate() - b.getDate(); });
  Logger.log('Processing ' + allMessages.length + ' message(s) oldest-first');

  var processedDates = {};
  var successCount = 0;

  for (var i = 0; i < allMessages.length; i++) {
    var message = allMessages[i];
    var emailDate = message.getDate();
    var previousDay = new Date(emailDate);
    previousDay.setDate(previousDay.getDate() - 1);
    var reportDate = Utilities.formatDate(previousDay, Session.getScriptTimeZone(), 'M/d/yyyy');

    if (processedDates[reportDate]) {
      Logger.log('Skipping duplicate for date: ' + reportDate);
      continue;
    }

    Logger.log('--- Processing email for report date: ' + reportDate + ' ---');

    var attachment = getFlashAttachment(message);
    if (!attachment) { Logger.log('No Flash attachment found, skipping'); continue; }

    var data = convertExcelToArray(attachment);
    if (!data) { Logger.log('Could not parse attachment, skipping'); continue; }

    var salesRows = [];
    for (var r = 6; r <= 50; r++) {
      if (r >= data.length) break;
      var row = data[r];
      var location = row[0] ? row[0].toString().trim() : '';
      // Stop at Totals or section break
      if (isSectionEndRow(location)) break;
      if (!location || location === '' || location === 'Location') continue;

      var sales = parseNumber(row[1]);
      var forecast = parseNumber(row[2]);
      var pySales = parseNumber(row[3]);
      var salesVariance = parseNumber(row[4]);
      var forecastVariance = sales - forecast;
      var guestCount = parseNumber(row[9]);
      var pyGuestCount = parseNumber(row[10]);
      var laborPercent = parseNumber(row[21]);

      salesRows.push([reportDate, location, sales, pySales, salesVariance, forecastVariance, guestCount, pyGuestCount, laborPercent * 100]);
    }

    if (salesRows.length > 0) {
      removeExistingDateData(salesSheet, reportDate);
      salesSheet.getRange(salesSheet.getLastRow() + 1, 1, salesRows.length, 9).setValues(salesRows);
      Logger.log('Wrote ' + salesRows.length + ' rows for ' + reportDate);

      // Also update Forecast Data archive
      var forecastSalesData = [];
      for (var k = 0; k < salesRows.length; k++) {
        forecastSalesData.push({ location: salesRows[k][1], sales: salesRows[k][2] });
      }
      appendToForecastData(reportDate, forecastSalesData);

      processedDates[reportDate] = true;
      successCount++;
    } else {
      Logger.log('No sales rows extracted for ' + reportDate);
    }

    Utilities.sleep(500);
  }

  Logger.log('========================================');
  Logger.log('Rebuild complete. Processed ' + successCount + ' report date(s).');
  Logger.log('========================================');
}

// ============================================================================
// TEST & DEBUG FUNCTIONS
// ============================================================================

function testAll() { processAllR365Reports(); }
function testWeeklySalesLabor() { processWeeklySalesLabor(); }
function testFlashReport() { processFlashReport(); }
function testScheduledToday() { processScheduledToday(); }
function testLaborReport() { processLaborReport(); }
function testOvertimeWarning() { processOvertimeWarning(); }
function testLogbookProcessing() { processFlashReport(); }
function testPaidOutsProcessing() { processFlashReport(); }
function testForecastAppend() { processFlashReport(); }

function debugWeeklyEmailSearch() {
  Logger.log('=== DEBUG: Weekly Sales Email Search ===');
  var searchDate = new Date(); searchDate.setDate(searchDate.getDate() - 1);
  var dateStr = Utilities.formatDate(searchDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
  var prevQuery = 'subject:"' + CONFIG.WEEKLY_PREVIOUS_SUBJECT + '" has:attachment after:' + dateStr;
  Logger.log('Previous Week query: ' + prevQuery);
  var prevThreads = GmailApp.search(prevQuery, 0, 5);
  Logger.log('Previous Week emails found: ' + prevThreads.length);
  for (var i = 0; i < prevThreads.length; i++) { var msg = prevThreads[i].getMessages()[0]; Logger.log('  - "' + msg.getSubject() + '" | ' + msg.getDate()); }
  var currQuery = 'subject:"' + CONFIG.WEEKLY_SUBJECT + '" -subject:"Previous Week" has:attachment after:' + dateStr;
  Logger.log('Current Week query: ' + currQuery);
  var currThreads = GmailApp.search(currQuery, 0, 5);
  Logger.log('Current Week emails found: ' + currThreads.length);
  for (var i = 0; i < currThreads.length; i++) { var msg = currThreads[i].getMessages()[0]; Logger.log('  - "' + msg.getSubject() + '" | ' + msg.getDate()); }
  Logger.log('=== DEBUG COMPLETE ===');
}

// ============================================================================
// SETUP TRIGGER
// ============================================================================

function setupDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) { if (triggers[i].getHandlerFunction() === 'processAllR365Reports') ScriptApp.deleteTrigger(triggers[i]); }
  ScriptApp.newTrigger('processAllR365Reports').timeBased().atHour(6).nearMinute(30).everyDays(1).create();
  Logger.log('Daily trigger created for 6:30 AM');
}

// ============================================================================
// ONE-SHOT: Backfill Claremore for 5/25/2026 using corrected Flash Report values
// Run manually via: backfillClaremore_5_25_2026()
// Values sourced from the re-issued Flash Report attachment for 5/25/2026.
// Safe to delete after running.
// ============================================================================

function backfillClaremore_5_25_2026() {
  Logger.log('=== One-shot backfill: Claremore 5/25/2026 ===');
  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var reportDate = '5/25/2026';
  var location = 'Claremore';

  // Sales section values (from corrected Flash Report)
  var sales = 5475.71;
  var pySales = 0;
  var salesVariance = 5475.71;
  var forecast = 7000;
  var forecastVariance = sales - forecast; // -1524.29
  var guestCount = 384;
  var pyGuestCount = 0;
  var laborPctDisplay = 0.22659435945292938 * 100;

  var salesSheet = spreadsheet.getSheetByName(CONFIG.FLASH_SALES_SHEET);
  if (!salesSheet) { Logger.log('ERROR: Flash - Daily Sales sheet not found'); return; }

  // Remove any existing Claremore row for this date, then append
  var sdata = salesSheet.getDataRange().getValues();
  for (var i = sdata.length - 1; i >= 1; i--) {
    var d = sdata[i][0];
    var ds = (d instanceof Date) ? ((d.getMonth()+1)+'/'+d.getDate()+'/'+d.getFullYear()) : (d ? d.toString().trim() : '');
    var loc = sdata[i][1] ? sdata[i][1].toString().trim() : '';
    if (ds === reportDate && loc === location) { salesSheet.deleteRow(i + 1); Logger.log('Removed existing Sales row'); }
  }
  salesSheet.appendRow([reportDate, location, sales, pySales, salesVariance, forecastVariance, guestCount, pyGuestCount, laborPctDisplay]);
  Logger.log('Appended Sales row');

  // Labor section values
  var regularHrs = 77.7168;
  var actualHrs = regularHrs; // OT=0, Other=0
  var laborRegular = 1024.435;
  var laborOther = 216.33;
  var totalLaborCost = laborRegular + laborOther;
  var laborCostPerHour = totalLaborCost / actualHrs;
  var optimalHrs = '';
  var scheduledHrs = '';
  var optimalLaborPct = '';
  var laborPctVariance = '';

  var laborSheet = spreadsheet.getSheetByName(CONFIG.FLASH_LABOR_SHEET);
  if (laborSheet) {
    var ldata = laborSheet.getDataRange().getValues();
    for (var j = ldata.length - 1; j >= 1; j--) {
      var d2 = ldata[j][0];
      var ds2 = (d2 instanceof Date) ? ((d2.getMonth()+1)+'/'+d2.getDate()+'/'+d2.getFullYear()) : (d2 ? d2.toString().trim() : '');
      var loc2 = ldata[j][1] ? ldata[j][1].toString().trim() : '';
      if (ds2 === reportDate && loc2 === location) { laborSheet.deleteRow(j + 1); Logger.log('Removed existing Labor row'); }
    }
    laborSheet.appendRow([reportDate, location, sales, actualHrs, optimalHrs, scheduledHrs, laborPctDisplay, optimalLaborPct, laborPctVariance, laborCostPerHour]);
    Logger.log('Appended Labor row');
  }

  // Forecast Data archive
  appendToForecastData(reportDate, [{ location: location, sales: sales }]);

  Logger.log('=== Backfill complete ===');
}