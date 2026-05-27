// ============================================================================
// R365 OData CLIENT — Phase 1 (connectivity + verification scaffolding)
//
// Goal: stop relying on email attachments for ingestion. This file establishes
// the auth + fetch primitives. Once we confirm the response shape against
// production, Phase 2 wires verification into processAllR365Reports().
//
// Script Properties required:
//   ODATA_USERNAME   — e.g. "andys\\claude"  (already configured per CLAUDE.md)
//   ODATA_PASSWORD   — the password for that user
//   (Optional) ODATA_BASE_URL — override; defaults to the andys subdomain
//
// Run testODataConnection() from the editor to validate auth + see a response.
// ============================================================================

var R365 = (function() {
  // Official R365 OData base URL per
  // https://docs.restaurant365.com/docs/restaurant365-odata-connector
  // Auth format: <tenant>\<username> (so andys\claude).
  // Available entities include: SalesDetail, SalesEmployee, SalesPayment,
  // LaborDetail, PayrollSummary, Location, Company, Employee, Item, GLAccount.
  var DEFAULT_BASE = 'https://odata.restaurant365.net/api/v2/views';

  function getProps() {
    var p = PropertiesService.getScriptProperties();
    return {
      username: p.getProperty('ODATA_USERNAME'),
      password: p.getProperty('ODATA_PASSWORD'),
      baseUrl: p.getProperty('ODATA_BASE_URL') || DEFAULT_BASE
    };
  }

  function buildAuthHeader() {
    var c = getProps();
    if (!c.username || !c.password) {
      throw new Error('R365 OData credentials missing: set ODATA_USERNAME and ODATA_PASSWORD in Script Properties');
    }
    var token = Utilities.base64Encode(c.username + ':' + c.password);
    return 'Basic ' + token;
  }

  // ISO date with end-of-day boundary, per CLAUDE.md convention:
  //   "end date = desired last day + 1"
  function isoDate(d) {
    return Utilities.formatDate(d, 'UTC', "yyyy-MM-dd'T'HH:mm:ss'Z'");
  }

  // Returns the next-day ISO timestamp (inclusive-end semantics for OData filters).
  function nextDayIso(d) {
    var next = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    next.setHours(0, 0, 0, 0);
    return isoDate(next);
  }

  // Fetch any OData entity. `query` is an OData query string (without leading '?').
  // Returns parsed JSON. Throws on non-2xx.
  function fetchEntity(entity, query) {
    var c = getProps();
    var url = c.baseUrl + '/' + entity + (query ? ('?' + query) : '');
    Logger.log('OData GET: ' + url);
    var options = {
      method: 'get',
      headers: {
        'Authorization': buildAuthHeader(),
        'Accept': 'application/json'
      },
      muteHttpExceptions: true,
      followRedirects: true
    };
    var resp = UrlFetchApp.fetch(url, options);
    var code = resp.getResponseCode();
    var body = resp.getContentText();
    if (code < 200 || code >= 300) {
      throw new Error('OData ' + entity + ' failed: HTTP ' + code + ' — ' + body.slice(0, 500));
    }
    try {
      return JSON.parse(body);
    } catch (e) {
      throw new Error('OData ' + entity + ' returned non-JSON: ' + body.slice(0, 500));
    }
  }

  // Date helpers used in filters. R365's OData `date` and `dateWorked` are
  // DateTimeOffset (timestamp + offset). Andy's stores span US/Central (TUL,
  // OKC, DAL) and US/Eastern (ORL). For daily verification we use Central
  // local-day boundaries — Orlando edge transactions (last hour of day)
  // may straddle and skew totals slightly, but most sales fit the window.
  // Override via Script Property ODATA_BUSINESS_TIMEZONE if needed.
  function businessTimezone() {
    return PropertiesService.getScriptProperties().getProperty('ODATA_BUSINESS_TIMEZONE') || 'America/Chicago';
  }

  // R365 stores `date` (SalesEmployee/SalesDetail) and `dateWorked` (LaborDetail)
  // as BUSINESS DATES — fixed at 00:00:00Z for the calendar day, NOT real
  // transaction timestamps. The DSS rollup assigns every ticket on a given
  // business day the same midnight-UTC value. We discovered this the hard way:
  // a Central-time filter (start 05:00Z) returned zero rows because every row's
  // `date` was at 00:00:00Z, before our window opened. Business-date semantics
  // mean we filter by UTC calendar day, not by local clock time.
  function businessDateIso(date, tz) {
    tz = tz || businessTimezone();
    // Use tz to determine which calendar day this Date belongs to (so a Date
    // representing 11pm Central on the 25th doesn't get reported as the 26th).
    var ymd = Utilities.formatDate(date, tz, 'yyyy-MM-dd');
    return ymd + 'T00:00:00Z';
  }

  function nextBusinessDateIso(date, tz) {
    tz = tz || businessTimezone();
    var next = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    return businessDateIso(next, tz);
  }

  // Ticket-header rows for one business day. Use this — not SalesDetail — for
  // daily sales verification: one row per ticket vs many rows per ticket.
  // Schema: salesId, date, netSales, numberofGuests, location (Guid), void, ...
  function fetchSalesEmployeeForDay(date) {
    var filter = "date ge " + businessDateIso(date) + " and date lt " + nextBusinessDateIso(date);
    return fetchEntity('SalesEmployee', '$filter=' + encodeURIComponent(filter));
  }

  // Line-item detail for one business day. Heavier; reserve for SKU-level analysis.
  function fetchSalesDetailForDay(date) {
    var filter = "date ge " + businessDateIso(date) + " and date lt " + nextBusinessDateIso(date);
    return fetchEntity('SalesDetail', '$filter=' + encodeURIComponent(filter));
  }

  // LaborDetail's date field is `dateWorked` (also a business date per R365 conventions).
  function fetchLaborDetailRange(startDate, endDate) {
    var filter = "dateWorked ge " + businessDateIso(startDate) + " and dateWorked lt " + nextBusinessDateIso(endDate);
    return fetchEntity('LaborDetail', '$filter=' + encodeURIComponent(filter));
  }

  function fetchLaborDetailForDay(date) {
    return fetchLaborDetailRange(date, date);
  }

  // Cached locationId (Guid) → name map. Built lazily.
  var _locationMap = null;
  function getLocationMap() {
    if (_locationMap) return _locationMap;
    var data = fetchEntity('Location', '$select=locationId,name');
    var rows = data.value || (data.d && data.d.results) || [];
    _locationMap = {};
    rows.forEach(function(l) { _locationMap[l.locationId] = l.name; });
    return _locationMap;
  }

  return {
    fetchEntity: fetchEntity,
    fetchSalesEmployeeForDay: fetchSalesEmployeeForDay,
    fetchSalesDetailForDay: fetchSalesDetailForDay,
    fetchLaborDetailRange: fetchLaborDetailRange,
    fetchLaborDetailForDay: fetchLaborDetailForDay,
    getLocationMap: getLocationMap
  };
})();

// ============================================================================
// PHASE 2: SHEET vs. OData VERIFICATION
//
// For a given report date, fetch OData totals per location and compare against
// what landed in the Flash - Daily Sales sheet. Alert on mismatches greater
// than a small tolerance ($5 absolute, 1% relative). Gated by ENABLE_ODATA_VERIFY
// script property so it stays off until validated.
// ============================================================================

var ODATA_VERIFY_TOLERANCE_USD = 5.0;     // ignore tiny rounding differences
var ODATA_VERIFY_TOLERANCE_PCT = 0.01;    // 1% relative tolerance

function aggregateSalesByLocation_(date) {
  var locMap = R365.getLocationMap();
  var data = R365.fetchSalesEmployeeForDay(date);
  var rows = data.value || (data.d && data.d.results) || [];
  var totals = {};
  rows.forEach(function(r) {
    if (r.void) return;
    var name = locMap[r.location] || ('Unknown (' + r.location + ')');
    if (!totals[name]) totals[name] = { sales: 0, guests: 0, tickets: 0 };
    totals[name].sales += Number(r.netSales) || 0;
    totals[name].guests += Number(r.numberofGuests) || 0;
    totals[name].tickets += 1;
  });
  return totals;
}

function readFlashSalesForDate_(reportDate) {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.FLASH_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(CONFIG.FLASH_SALES_SHEET);
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  var byLocation = {};
  for (var i = 1; i < data.length; i++) {
    var rd = data[i][0];
    var rdStr = (rd instanceof Date) ? ((rd.getMonth()+1)+'/'+rd.getDate()+'/'+rd.getFullYear()) : (rd ? rd.toString().trim() : '');
    if (rdStr !== reportDate) continue;
    var loc = data[i][1] ? data[i][1].toString().trim() : '';
    if (!loc) continue;
    byLocation[loc] = {
      sales: Number(data[i][2]) || 0,
      guests: Number(data[i][6]) || 0
    };
  }
  return byLocation;
}

// Compare two location-keyed totals maps; emit a single Alerts entry per
// mismatch beyond tolerance. `sourceLabel` distinguishes which dataset
// is being verified (e.g. "Flash").
//
// Distinguishes two failure modes:
//   ODATA_DSS_NOT_POSTED — OData has 0 tickets for a location with sheet sales
//     (the location's Daily Sales Summary hasn't been polled into R365 yet).
//   ODATA_SALES_MISMATCH — OData has SOME tickets but the total disagrees
//     beyond tolerance (genuine data anomaly worth investigating).
function diffLocationTotals_(sourceLabel, reportDate, sheetTotals, odataTotals) {
  var allLocations = {};
  Object.keys(sheetTotals).forEach(function(k) { allLocations[k] = true; });
  Object.keys(odataTotals).forEach(function(k) { allLocations[k] = true; });

  var mismatches = 0;
  var dssMissing = 0;
  Object.keys(allLocations).forEach(function(loc) {
    var s = sheetTotals[loc] || { sales: 0, guests: 0 };
    var o = odataTotals[loc] || { sales: 0, guests: 0, tickets: 0 };

    // Zero tickets in OData but non-zero sheet → DSS hasn't been polled.
    if ((o.tickets || 0) === 0 && s.sales > 0) {
      Alerts.add('ODATA_DSS_NOT_POSTED',
        sourceLabel + ' ' + reportDate + ' "' + loc + '": OData has 0 tickets ' +
        '(DSS not yet polled). Sheet=$' + s.sales.toFixed(2));
      dssMissing++;
      return;
    }

    var diff = s.sales - o.sales;
    var absDiff = Math.abs(diff);
    var pctDiff = o.sales > 0 ? absDiff / o.sales : (s.sales > 0 ? 1 : 0);

    if (absDiff > ODATA_VERIFY_TOLERANCE_USD && pctDiff > ODATA_VERIFY_TOLERANCE_PCT) {
      Alerts.add('ODATA_SALES_MISMATCH',
        sourceLabel + ' ' + reportDate + ' "' + loc + '": ' +
        'sheet=$' + s.sales.toFixed(2) + ' vs OData=$' + o.sales.toFixed(2) +
        ' (Δ=$' + diff.toFixed(2) + ', tickets=' + (o.tickets || 0) + ')');
      mismatches++;
    }
  });
  Logger.log('Mismatches: ' + mismatches + ' | DSS-not-posted: ' + dssMissing);
  return mismatches;
}

// Diagnostic: show the actual UTC window the filter produces, plus per-location
// row counts and timestamp samples. Run from the editor to debug.
function debugODataFilterWindow() {
  var props = PropertiesService.getScriptProperties();
  var tz = props.getProperty('ODATA_BUSINESS_TIMEZONE') || 'America/Chicago';
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0); // noon, to avoid DST edge confusion
  Logger.log('Business timezone: ' + tz);
  Logger.log('Yesterday (as JS Date): ' + yesterday.toString());
  Logger.log('Yesterday (in ' + tz + '): ' + Utilities.formatDate(yesterday, tz, 'yyyy-MM-dd EEEE'));

  var data = R365.fetchSalesEmployeeForDay(yesterday);
  var rows = data.value || (data.d && data.d.results) || [];
  Logger.log('Got ' + rows.length + ' SalesEmployee rows for yesterday');
  if (rows.length > 0) {
    // Show earliest and latest transaction timestamps
    var dates = rows.map(function(r) { return new Date(r.date); }).sort(function(a, b) { return a - b; });
    Logger.log('Earliest tx: ' + dates[0].toISOString() + ' (in ' + tz + ': ' + Utilities.formatDate(dates[0], tz, 'yyyy-MM-dd HH:mm') + ')');
    Logger.log('Latest   tx: ' + dates[dates.length-1].toISOString() + ' (in ' + tz + ': ' + Utilities.formatDate(dates[dates.length-1], tz, 'yyyy-MM-dd HH:mm') + ')');
  }
}

function verifyFlashAgainstOData(reportDate) {
  var enabled = PropertiesService.getScriptProperties().getProperty('ENABLE_ODATA_VERIFY');
  if (!enabled) {
    Logger.log('OData verification disabled (set ENABLE_ODATA_VERIFY script property to enable)');
    return;
  }
  Logger.log('--- Verifying Flash sales vs OData for ' + reportDate + ' ---');
  try {
    // Parse "M/d/yyyy" → Date at NOON UTC on that calendar day. Using noon
    // gives a 12-hour buffer in any direction, so when this Date is formatted
    // in any reasonable timezone (Central, Eastern, etc.) it still lands on
    // the intended calendar day — avoiding the off-by-one error that happens
    // when constructing via `new Date(yyyy, mm-1, dd)` in a non-Central script.
    var parts = reportDate.split('/');
    var ymd = parts[2] + '-' +
              (parts[0].length === 1 ? '0' + parts[0] : parts[0]) + '-' +
              (parts[1].length === 1 ? '0' + parts[1] : parts[1]);
    var d = new Date(ymd + 'T12:00:00Z');
    var odataTotals = aggregateSalesByLocation_(d);
    var sheetTotals = readFlashSalesForDate_(reportDate);
    var mismatches = diffLocationTotals_('Flash', reportDate, sheetTotals, odataTotals);
    Logger.log('Verification complete: ' + mismatches + ' mismatch(es) over tolerance');
  } catch (e) {
    Logger.log('OData verification failed: ' + e.toString());
    Alerts.add('ODATA_VERIFY_ERROR', 'verifyFlashAgainstOData(' + reportDate + ') threw: ' + e.toString());
  }
}

// Manual one-shot for ad-hoc verification from the editor. Uses Central-time
// "yesterday" so behavior matches the 6:30 AM CT processor regardless of
// the script's underlying timezone or what UTC clock-day it is.
function verifyTodayFlash() {
  var tz = PropertiesService.getScriptProperties().getProperty('ODATA_BUSINESS_TIMEZONE') || 'America/Chicago';
  var yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  var reportDate = Utilities.formatDate(yesterday, tz, 'M/d/yyyy');
  Logger.log('verifyTodayFlash: using reportDate=' + reportDate + ' (Central-yesterday)');
  verifyFlashAgainstOData(reportDate);
}

// Verify a specific date by string. Useful for backfill checks.
//   verifyFlashFor('5/25/2026')
function verifyFlashFor(reportDate) {
  verifyFlashAgainstOData(reportDate);
}

// Hard-coded one-shot for tonight's 5/25/2026 verification — delete after use.
function verify_5_25_2026() {
  verifyFlashAgainstOData('5/25/2026');
}

// ============================================================================
// CONNECTIVITY TESTS — run these from the Apps Script editor
// ============================================================================

function testODataConnection() {
  Logger.log('=== R365 OData connectivity test ===');
  var props = PropertiesService.getScriptProperties();
  var u = props.getProperty('ODATA_USERNAME');
  var p = props.getProperty('ODATA_PASSWORD');
  Logger.log('ODATA_USERNAME present: ' + !!u + ' (value sample: ' + (u ? u.slice(0, 8) + '…' : 'missing') + ')');
  Logger.log('ODATA_PASSWORD present: ' + !!p);
  if (!u || !p) {
    Logger.log('ABORT: set both ODATA_USERNAME and ODATA_PASSWORD in Script Properties first.');
    return;
  }

  // Start with the simplest possible call: a few rows of Location to confirm
  // connectivity + auth + entity-name correctness. Once this works we can
  // explore SalesDetail's actual field names (date field, location field, etc.).
  Logger.log('Probing Location with $top=3 ...');
  try {
    var data = R365.fetchEntity('Location', '$top=3');
    var rows = data.value || (data.d && data.d.results) || data;
    var count = Array.isArray(rows) ? rows.length : 'unknown';
    Logger.log('SUCCESS — received ' + count + ' row(s) from Location');
    if (Array.isArray(rows) && rows.length > 0) {
      Logger.log('First row keys: ' + Object.keys(rows[0]).join(', '));
      Logger.log('First row sample: ' + JSON.stringify(rows[0]).slice(0, 500));
    } else {
      Logger.log('Raw response (truncated): ' + JSON.stringify(data).slice(0, 800));
    }
  } catch (e) {
    Logger.log('FAILED: ' + e.toString());
    Logger.log('Diagnostics:');
    Logger.log('  - Username format must be tenant\\user (e.g. "andys\\claude")');
    Logger.log('  - User must have role "Accounting Clerk" or "Full Access" in R365');
    Logger.log('  - Override ODATA_BASE_URL via Script Property if your tenant uses a non-standard endpoint');
    return;
  }

  // Once Location works, peek at SalesDetail with no filter ($top=1) to see
  // its column names — informs the date/location filter syntax for Phase 2.
  Logger.log('---');
  Logger.log('Probing SalesDetail with $top=1 ...');
  try {
    var sd = R365.fetchEntity('SalesDetail', '$top=1');
    var sdRows = sd.value || (sd.d && sd.d.results) || sd;
    if (Array.isArray(sdRows) && sdRows.length > 0) {
      Logger.log('SalesDetail keys: ' + Object.keys(sdRows[0]).join(', '));
      Logger.log('Sample: ' + JSON.stringify(sdRows[0]).slice(0, 500));
    } else {
      Logger.log('SalesDetail returned no rows (no recent sales?): ' + JSON.stringify(sd).slice(0, 400));
    }
  } catch (e) {
    Logger.log('SalesDetail probe failed: ' + e.toString());
  }

  Logger.log('=== test complete ===');
}

// Probe arbitrary entities to discover the OData surface area.
// Edit the entity name below and run from the editor.
function probeODataEntity() {
  var entity = 'Location'; // <-- change this to explore (Location, SalesDetail, LaborDetail, etc.)
  var query = '$top=3';
  Logger.log('Probing ' + entity + ' with ' + query);
  try {
    var data = R365.fetchEntity(entity, query);
    Logger.log('Response (truncated): ' + JSON.stringify(data).slice(0, 1500));
  } catch (e) {
    Logger.log('Error: ' + e.toString());
  }
}

// Fetch the OData $metadata document and extract SalesDetail / LaborDetail
// schema (property names + types). Tells us the exact date field to filter on.
function probeODataMetadata() {
  Logger.log('=== Fetching $metadata ===');
  var props = PropertiesService.getScriptProperties();
  var u = props.getProperty('ODATA_USERNAME');
  var p = props.getProperty('ODATA_PASSWORD');
  if (!u || !p) { Logger.log('ABORT: set ODATA_USERNAME and ODATA_PASSWORD first.'); return; }
  var base = props.getProperty('ODATA_BASE_URL') || 'https://odata.restaurant365.net/api/v2/views';
  var auth = 'Basic ' + Utilities.base64Encode(u + ':' + p);
  try {
    var resp = UrlFetchApp.fetch(base + '/$metadata', {
      method: 'get',
      headers: { 'Authorization': auth, 'Accept': 'application/xml' },
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      Logger.log('Metadata fetch failed: HTTP ' + code + ' — ' + resp.getContentText().slice(0, 400));
      return;
    }
    var xml = resp.getContentText();
    Logger.log('Metadata size: ' + xml.length + ' chars');

    // Extract entity types we care about. The XML format uses
    //   <EntityType Name="SalesDetail"> <Property Name="..." Type="..."/> ...
    var entitiesOfInterest = ['SalesDetail', 'LaborDetail', 'SalesEmployee', 'SalesPayment', 'PayrollSummary'];
    entitiesOfInterest.forEach(function(name) {
      var startTag = '<EntityType Name="' + name + '"';
      var startIdx = xml.indexOf(startTag);
      if (startIdx === -1) {
        Logger.log('— ' + name + ': NOT FOUND in metadata');
        return;
      }
      var endIdx = xml.indexOf('</EntityType>', startIdx);
      var block = xml.slice(startIdx, endIdx);
      var props = [];
      var re = /<Property Name="([^"]+)" Type="([^"]+)"/g;
      var m;
      while ((m = re.exec(block)) !== null) {
        props.push(m[1] + ': ' + m[2].replace('Edm.', ''));
      }
      Logger.log('— ' + name + ' (' + props.length + ' props):');
      props.forEach(function(p) { Logger.log('    ' + p); });
    });
  } catch (e) {
    Logger.log('Exception: ' + e.toString());
  }
  Logger.log('=== Metadata probe complete ===');
}

// ============================================================================
// PATH DISCOVERY — try common R365 OData base paths to find the live one.
// Run from the editor. Whichever path returns 200 (or 401/403 — auth-aware
// but path-correct) is the one to set as ODATA_BASE_URL.
// ============================================================================

function discoverODataBaseUrl() {
  Logger.log('=== R365 OData path discovery ===');
  var props = PropertiesService.getScriptProperties();
  var u = props.getProperty('ODATA_USERNAME');
  var p = props.getProperty('ODATA_PASSWORD');
  if (!u || !p) {
    Logger.log('ABORT: set ODATA_USERNAME and ODATA_PASSWORD first.');
    return;
  }
  var auth = 'Basic ' + Utilities.base64Encode(u + ':' + p);

  // Most-likely R365 OData paths, in rough order of popularity. We probe
  // each with a small $top query against a known-cheap entity name to
  // distinguish "wrong path" (404) from "right path, wrong entity" (200/400).
  var candidates = [
    'https://andys.restaurant365.com/api/odata/v3',
    'https://andys.restaurant365.com/odata/v3',
    'https://andys.restaurant365.com/api/odata',
    'https://andys.restaurant365.com/odata',
    'https://andys.restaurant365.com/api/ExternalApi',
    'https://odata.restaurant365.com/odata/v3',
    'https://odata.restaurant365.com/odata',
    'https://api.restaurant365.com/odata/v3'
  ];

  // Probe paths: each entry tries the candidate as a base, fetching a known
  // R365 entity (Locations) and the root metadata document.
  var probes = ['Locations?$top=1', '$metadata', ''];

  var winners = [];
  for (var c = 0; c < candidates.length; c++) {
    var base = candidates[c];
    for (var pi = 0; pi < probes.length; pi++) {
      var url = base + (probes[pi] ? '/' + probes[pi] : '');
      try {
        var resp = UrlFetchApp.fetch(url, {
          method: 'get',
          headers: { 'Authorization': auth, 'Accept': 'application/json' },
          muteHttpExceptions: true,
          followRedirects: true
        });
        var code = resp.getResponseCode();
        var bodyPreview = resp.getContentText().slice(0, 120).replace(/\s+/g, ' ');
        var marker = (code >= 200 && code < 300) ? '✅ HIT' :
                     (code === 401 || code === 403) ? '🔐 auth-issue (path likely correct)' :
                     '❌';
        Logger.log(marker + ' [' + code + '] ' + url + ' → ' + bodyPreview);
        if (code >= 200 && code < 300) winners.push(url);
        else if (code === 401 || code === 403) winners.push(url + ' (auth issue, but path resolves)');
      } catch (e) {
        Logger.log('❌ [exception] ' + url + ' → ' + e.toString().slice(0, 120));
      }
    }
  }

  Logger.log('=== Discovery complete ===');
  if (winners.length > 0) {
    Logger.log('CANDIDATES THAT RESOLVED:');
    winners.forEach(function(w) { Logger.log('  ' + w); });
    Logger.log('Set Script Property ODATA_BASE_URL to whichever returned 200 (strip the entity path).');
  } else {
    Logger.log('No paths resolved. R365 OData may be disabled for this tenant, or use a different domain.');
    Logger.log('Verify in R365: Admin → Integrations → API/OData section. The actual endpoint URL should be listed there.');
  }
}
