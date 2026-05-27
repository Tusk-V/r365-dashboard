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
