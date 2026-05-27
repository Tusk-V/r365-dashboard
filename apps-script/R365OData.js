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
  var DEFAULT_BASE = 'https://andys.restaurant365.com/api/ExternalApi';

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

  // SalesDetail must be fetched one day at a time (per CLAUDE.md — multi-day → 500).
  // `date` is a JS Date for the desired day; filter uses [date, date+1) range.
  function fetchSalesDetailForDay(date) {
    var startIso = Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'00:00:00'Z'");
    var endIso = nextDayIso(date);
    var filter = "DateOfBusiness ge datetime'" + startIso + "' and DateOfBusiness lt datetime'" + endIso + "'";
    var query = '$filter=' + encodeURIComponent(filter);
    return fetchEntity('SalesDetail', query);
  }

  // LaborDetail accepts ranges. Pass two JS Dates.
  function fetchLaborDetailRange(startDate, endDate) {
    var startIso = Utilities.formatDate(startDate, 'UTC', "yyyy-MM-dd'T'00:00:00'Z'");
    var endIso = nextDayIso(endDate);
    var filter = "DateOfBusiness ge datetime'" + startIso + "' and DateOfBusiness lt datetime'" + endIso + "'";
    var query = '$filter=' + encodeURIComponent(filter);
    return fetchEntity('LaborDetail', query);
  }

  return {
    fetchEntity: fetchEntity,
    fetchSalesDetailForDay: fetchSalesDetailForDay,
    fetchLaborDetailRange: fetchLaborDetailRange
  };
})();

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

  // Try yesterday's SalesDetail. Adjust if R365 uses a different entity name —
  // we'll log the error verbatim so you can see what R365 returned.
  var yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  Logger.log('Fetching SalesDetail for: ' + yesterday.toDateString());

  try {
    var data = R365.fetchSalesDetailForDay(yesterday);
    var rows = data.value || data.d?.results || data;
    var count = Array.isArray(rows) ? rows.length : 'unknown';
    Logger.log('SUCCESS — received ' + count + ' rows');
    if (Array.isArray(rows) && rows.length > 0) {
      Logger.log('First row keys: ' + Object.keys(rows[0]).join(', '));
      Logger.log('First row sample: ' + JSON.stringify(rows[0]).slice(0, 500));
    } else {
      Logger.log('Raw response (truncated): ' + JSON.stringify(data).slice(0, 800));
    }
  } catch (e) {
    Logger.log('FAILED: ' + e.toString());
    Logger.log('Common causes:');
    Logger.log('  - Wrong entity name (try fetchEntity("Locations") via custom function to probe)');
    Logger.log('  - Backslash in ODATA_USERNAME not escaped (Script Properties stores "andys\\claude" as "andys\\claude" — that is correct)');
    Logger.log('  - Subdomain different from andys.restaurant365.com — set ODATA_BASE_URL to override');
  }
  Logger.log('=== test complete ===');
}

// Probe arbitrary entities to discover the OData surface area.
// Edit the entity name below and run from the editor.
function probeODataEntity() {
  var entity = 'Locations'; // <-- change this to explore (Locations, SalesDetail, LaborDetail, etc.)
  var query = '$top=3';
  Logger.log('Probing ' + entity + ' with ' + query);
  try {
    var data = R365.fetchEntity(entity, query);
    Logger.log('Response (truncated): ' + JSON.stringify(data).slice(0, 1500));
  } catch (e) {
    Logger.log('Error: ' + e.toString());
  }
}
