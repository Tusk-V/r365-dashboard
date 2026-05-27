// ============================================================================
// RESTAURANT SIGNALS — R365 OData-derived per-day signals for forecast hygiene
//
// Aggregates SalesEmployee (tickets/guests/voids), SalesDetail (discounts),
// and LaborDetail (hours/cost) into one row per location per day. Used by
// Modelforecast.js to filter "abnormal" days out of coefficient tuning:
// promo days, capacity-constrained days, high-void days. Keeps the auto-tuner
// learning weather/rain effects only from operationally normal days.
//
// Functions:
//   refreshYesterdayR365Signals()      - Daily, after main R365 ingestion
//   backfillR365Signals(startStr, days) - Backfill historical signals
//   loadR365Signals(ss)                - Lookup map for tuning/prediction
//   isAbnormalDay(signal)              - Classifier helper
//   probeR365FieldNames()              - Discover SalesDetail/LaborDetail schema
//
// Sheet:
//   "R365 Signals" — Date | Location | Net Sales | Tickets | Guests |
//                    Avg Ticket | Discount $ | Discount Rate | Void Rate |
//                    Hours | Labor Cost | Labor Cost %
//
// Cadence: refreshYesterdayR365Signals() once per day (call from the 6:30 AM
// processor after the main ingestion, or add a separate trigger).
// ============================================================================

var SIGNALS_CONFIG = {
  SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  SIGNALS_SHEET: 'R365 Signals',

  // Field name mappings — verified against Andy's R365 tenant schema via
  // probeR365FieldNames() on 5/27/2026. SalesDetail.category is the product
  // category ("$ FOOD'S"), not transaction type; salesAccount is checked as
  // a secondary signal for discount classification.
  FIELDS: {
    salesDetail: {
      itemType: ['category'],
      salesAccount: ['salesAccount'],
      amount: ['amount'],
      location: ['location']
    },
    laborDetail: {
      hours: ['hours'],
      cost: ['total'],
      location: ['location', 'location_ID']
    }
  },

  THRESHOLDS: {
    PROMO_DISCOUNT_RATE: 0.10,   // >10% of gross discounted = promo day
    CAPACITY_HOURS_DROP: 0.20,   // hours <80% of location's median = capacity issue
    HIGH_VOID_RATE: 0.05         // >5% void rate = operational hiccup
  },

  // Tokens that mark a SalesDetail row as a discount/comp (case-insensitive).
  DISCOUNT_ITEM_TOKENS: ['discount', 'comp', 'promo', 'coupon'],

  BACKFILL_CHUNK_DAYS: 30  // Apps Script has a 6-min limit; chunk to stay under
};


// ============================================================================
// DAILY REFRESH
// ============================================================================

function refreshYesterdayR365Signals() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(12, 0, 0, 0);
  refreshR365SignalsForDate_(d);
}

function refreshR365SignalsForDate_(date) {
  var ss = SpreadsheetApp.openById(SIGNALS_CONFIG.SPREADSHEET_ID);
  var sheet = ensureSignalsSheet_(ss);

  var rows = computeSignalsForDate_(date);
  if (!rows || rows.length === 0) {
    Logger.log('No signals computed for ' + formatSignalDate_(date));
    return 0;
  }

  upsertSignalRows_(sheet, rows);
  Logger.log('Wrote ' + rows.length + ' signal rows for ' + formatSignalDate_(date));
  return rows.length;
}

function backfillR365Signals(startStr, days) {
  if (!startStr) {
    var d = new Date();
    d.setDate(d.getDate() - SIGNALS_CONFIG.BACKFILL_CHUNK_DAYS);
    startStr = formatSignalDate_(d);
  }
  if (!days) days = SIGNALS_CONFIG.BACKFILL_CHUNK_DAYS;
  if (days > SIGNALS_CONFIG.BACKFILL_CHUNK_DAYS) {
    Logger.log('Capping backfill to ' + SIGNALS_CONFIG.BACKFILL_CHUNK_DAYS + ' days per run (Apps Script timeout). Re-run with adjusted start date.');
    days = SIGNALS_CONFIG.BACKFILL_CHUNK_DAYS;
  }

  Logger.log('=== Backfilling R365 Signals: ' + startStr + ' for ' + days + ' days ===');
  var parts = startStr.split('/');
  var startDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]), 12, 0, 0);

  var total = 0;
  for (var i = 0; i < days; i++) {
    var d = new Date(startDate);
    d.setDate(d.getDate() + i);
    try {
      total += refreshR365SignalsForDate_(d);
    } catch (e) {
      Logger.log('Backfill ' + formatSignalDate_(d) + ' failed: ' + e.toString());
    }
    Utilities.sleep(250);
  }
  Logger.log('=== Backfill Complete: ' + total + ' total rows ===');
}


// ============================================================================
// AGGREGATION
// ============================================================================

function computeSignalsForDate_(date) {
  var locMap;
  try {
    locMap = R365.getLocationMap();
  } catch (e) {
    Logger.log('Could not get location map: ' + e.toString());
    return [];
  }

  var byLoc = {};
  function bucket(name) {
    if (!byLoc[name]) {
      byLoc[name] = {
        netSales: 0, tickets: 0, guests: 0, voids: 0,
        grossSales: 0, discountAmount: 0,
        hours: 0, laborCost: 0
      };
    }
    return byLoc[name];
  }

  // --- SalesEmployee: tickets, guests, voids, netSales ---
  try {
    var seData = R365.fetchSalesEmployeeForDay(date);
    var seRows = seData.value || (seData.d && seData.d.results) || [];
    seRows.forEach(function(r) {
      var name = locMap[r.location] || ('Unknown ' + r.location);
      var b = bucket(name);
      b.tickets += 1;
      if (r.void) {
        b.voids += 1;
      } else {
        b.netSales += Number(r.netSales) || 0;
        b.guests += Number(r.numberofGuests) || 0;
      }
    });
  } catch (e) {
    Logger.log('SalesEmployee fetch failed for ' + formatSignalDate_(date) + ': ' + e.toString());
  }

  // --- SalesDetail: gross sales + discount amount per location ---
  try {
    var sdData = R365.fetchSalesDetailForDay(date);
    var sdRows = sdData.value || (sdData.d && sdData.d.results) || [];
    if (sdRows.length > 0) {
      var itemTypeField = findFirstField_(sdRows[0], SIGNALS_CONFIG.FIELDS.salesDetail.itemType);
      var salesAcctField = findFirstField_(sdRows[0], SIGNALS_CONFIG.FIELDS.salesDetail.salesAccount);
      var amountField = findFirstField_(sdRows[0], SIGNALS_CONFIG.FIELDS.salesDetail.amount);
      var locField = findFirstField_(sdRows[0], SIGNALS_CONFIG.FIELDS.salesDetail.location);

      if (itemTypeField && amountField && locField) {
        sdRows.forEach(function(r) {
          var locGuid = r[locField];
          var name = locMap[locGuid] || ('Unknown ' + locGuid);
          var b = bucket(name);
          var amount = Number(r[amountField]) || 0;
          var typeLower = (r[itemTypeField] || '').toString().toLowerCase();
          var acctLower = salesAcctField ? (r[salesAcctField] || '').toString().toLowerCase() : '';

          var isDiscount = false;
          for (var t = 0; t < SIGNALS_CONFIG.DISCOUNT_ITEM_TOKENS.length; t++) {
            var token = SIGNALS_CONFIG.DISCOUNT_ITEM_TOKENS[t];
            if (typeLower.indexOf(token) >= 0 || acctLower.indexOf(token) >= 0) {
              isDiscount = true; break;
            }
          }
          // Fallback: any non-void negative-amount line is treated as a discount/comp/refund
          if (!isDiscount && amount < 0 && !r.void) {
            isDiscount = true;
          }

          if (isDiscount) {
            b.discountAmount += Math.abs(amount);
          } else if (!r.void) {
            b.grossSales += amount;
          }
        });
      } else {
        Logger.log('SalesDetail field names not detected. Run probeR365FieldNames() and update SIGNALS_CONFIG.FIELDS.');
      }
    }
  } catch (e) {
    Logger.log('SalesDetail fetch failed for ' + formatSignalDate_(date) + ': ' + e.toString());
  }

  // --- LaborDetail: hours, cost per location ---
  try {
    var ldData = R365.fetchLaborDetailForDay(date);
    var ldRows = ldData.value || (ldData.d && ldData.d.results) || [];
    if (ldRows.length > 0) {
      var hoursField = findFirstField_(ldRows[0], SIGNALS_CONFIG.FIELDS.laborDetail.hours);
      var costField = findFirstField_(ldRows[0], SIGNALS_CONFIG.FIELDS.laborDetail.cost);
      var locField2 = findFirstField_(ldRows[0], SIGNALS_CONFIG.FIELDS.laborDetail.location);

      if (hoursField && locField2) {
        ldRows.forEach(function(r) {
          var locGuid = r[locField2];
          var name = locMap[locGuid] || ('Unknown ' + locGuid);
          var b = bucket(name);
          b.hours += Number(r[hoursField]) || 0;
          if (costField) b.laborCost += Number(r[costField]) || 0;
        });
      } else {
        Logger.log('LaborDetail field names not detected. Run probeR365FieldNames() and update SIGNALS_CONFIG.FIELDS.');
      }
    }
  } catch (e) {
    Logger.log('LaborDetail fetch failed for ' + formatSignalDate_(date) + ': ' + e.toString());
  }

  // --- Build output rows ---
  var dateStr = formatSignalDate_(date);
  var out = [];
  var locNames = Object.keys(byLoc);
  for (var i = 0; i < locNames.length; i++) {
    var name = locNames[i];
    var b = byLoc[name];
    if (b.tickets === 0 && b.hours === 0) continue;

    var avgTicket = b.tickets > 0 ? b.netSales / b.tickets : 0;
    var gross = b.grossSales > 0 ? b.grossSales : (b.netSales + b.discountAmount);
    var discountRate = gross > 0 ? b.discountAmount / gross : 0;
    var voidRate = b.tickets > 0 ? b.voids / b.tickets : 0;
    var laborPct = b.netSales > 0 ? b.laborCost / b.netSales : 0;

    out.push([
      dateStr, name,
      Math.round(b.netSales * 100) / 100,
      b.tickets, b.guests,
      Math.round(avgTicket * 100) / 100,
      Math.round(b.discountAmount * 100) / 100,
      Math.round(discountRate * 10000) / 10000,
      Math.round(voidRate * 10000) / 10000,
      Math.round(b.hours * 100) / 100,
      Math.round(b.laborCost * 100) / 100,
      Math.round(laborPct * 10000) / 10000
    ]);
  }
  return out;
}


// ============================================================================
// SHEET WRITE — UPSERT BY (Date, Location)
// ============================================================================

function ensureSignalsSheet_(ss) {
  var sheet = ss.getSheetByName(SIGNALS_CONFIG.SIGNALS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SIGNALS_CONFIG.SIGNALS_SHEET);
    sheet.getRange(1, 1, 1, 12).setValues([[
      'Date', 'Location', 'Net Sales', 'Tickets', 'Guests',
      'Avg Ticket', 'Discount $', 'Discount Rate', 'Void Rate',
      'Hours', 'Labor Cost', 'Labor Cost %'
    ]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function upsertSignalRows_(sheet, rows) {
  var existing = sheet.getDataRange().getValues();
  var indexByKey = {};
  for (var i = 1; i < existing.length; i++) {
    var dateRaw = existing[i][0];
    var loc = existing[i][1] ? existing[i][1].toString().trim() : '';
    if (!dateRaw || !loc) continue;
    var dateStr = (dateRaw instanceof Date)
      ? formatSignalDate_(dateRaw)
      : dateRaw.toString().trim();
    indexByKey[loc + '|' + dateStr] = i + 1;
  }

  var appendRows = [];
  for (var r = 0; r < rows.length; r++) {
    var key = rows[r][1] + '|' + rows[r][0];
    var rowNum = indexByKey[key];
    if (rowNum) {
      sheet.getRange(rowNum, 1, 1, rows[r].length).setValues([rows[r]]);
    } else {
      appendRows.push(rows[r]);
    }
  }
  if (appendRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appendRows.length, appendRows[0].length).setValues(appendRows);
  }
}


// ============================================================================
// LOAD + CLASSIFY (used by Modelforecast.js tuneCoefficients)
// ============================================================================

function loadR365Signals(ss) {
  var sheet = ss.getSheetByName(SIGNALS_CONFIG.SIGNALS_SHEET);
  if (!sheet) return { byKey: {}, medianHours: {} };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { byKey: {}, medianHours: {} };

  var byKey = {};
  var hoursByLoc = {};

  for (var i = 1; i < data.length; i++) {
    var dateRaw = data[i][0];
    var loc = data[i][1] ? data[i][1].toString().trim() : '';
    if (!dateRaw || !loc) continue;
    var dateStr = (dateRaw instanceof Date)
      ? formatSignalDate_(dateRaw)
      : dateRaw.toString().trim();

    var rec = {
      netSales: parseFloat(data[i][2]) || 0,
      tickets: parseInt(data[i][3]) || 0,
      guests: parseInt(data[i][4]) || 0,
      avgTicket: parseFloat(data[i][5]) || 0,
      discountAmt: parseFloat(data[i][6]) || 0,
      discountRate: parseFloat(data[i][7]) || 0,
      voidRate: parseFloat(data[i][8]) || 0,
      hours: parseFloat(data[i][9]) || 0,
      laborCost: parseFloat(data[i][10]) || 0,
      laborPct: parseFloat(data[i][11]) || 0
    };
    byKey[loc + '|' + dateStr] = rec;

    if (rec.hours > 0) {
      if (!hoursByLoc[loc]) hoursByLoc[loc] = [];
      hoursByLoc[loc].push(rec.hours);
    }
  }

  var medianHours = {};
  var locKeys = Object.keys(hoursByLoc);
  for (var lk = 0; lk < locKeys.length; lk++) {
    var arr = hoursByLoc[locKeys[lk]].slice().sort(function(a, b) { return a - b; });
    medianHours[locKeys[lk]] = arr[Math.floor(arr.length / 2)];
  }

  return { byKey: byKey, medianHours: medianHours };
}

function isAbnormalDay(signal, medianHoursForLoc) {
  if (!signal) return null;
  var t = SIGNALS_CONFIG.THRESHOLDS;
  if (signal.discountRate > t.PROMO_DISCOUNT_RATE) return 'promo';
  if (signal.voidRate > t.HIGH_VOID_RATE) return 'voids';
  if (medianHoursForLoc && signal.hours > 0 && signal.hours < medianHoursForLoc * (1 - t.CAPACITY_HOURS_DROP)) return 'capacity';
  return null;
}


// ============================================================================
// HELPERS
// ============================================================================

function formatSignalDate_(date) {
  if (date instanceof Date) {
    return (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
  }
  return date.toString();
}

function findFirstField_(row, candidates) {
  if (!row || !candidates) return null;
  for (var i = 0; i < candidates.length; i++) {
    if (row[candidates[i]] !== undefined) return candidates[i];
  }
  return null;
}


// ============================================================================
// SCHEMA PROBE — run once to verify field names
// ============================================================================

function probeR365FieldNames() {
  Logger.log('=== Probing R365 SalesDetail + LaborDetail field names ===');
  var y = new Date(); y.setDate(y.getDate() - 1); y.setHours(12, 0, 0, 0);

  try {
    var sd = R365.fetchSalesDetailForDay(y);
    var sdRows = sd.value || (sd.d && sd.d.results) || [];
    if (sdRows.length > 0) {
      Logger.log('SalesDetail keys: ' + Object.keys(sdRows[0]).join(', '));
      Logger.log('SalesDetail sample: ' + JSON.stringify(sdRows[0]).slice(0, 500));
    } else {
      Logger.log('SalesDetail returned 0 rows for yesterday');
    }
  } catch (e) {
    Logger.log('SalesDetail probe failed: ' + e.toString());
  }

  Logger.log('---');

  try {
    var ld = R365.fetchLaborDetailForDay(y);
    var ldRows = ld.value || (ld.d && ld.d.results) || [];
    if (ldRows.length > 0) {
      Logger.log('LaborDetail keys: ' + Object.keys(ldRows[0]).join(', '));
      Logger.log('LaborDetail sample: ' + JSON.stringify(ldRows[0]).slice(0, 500));
    } else {
      Logger.log('LaborDetail returned 0 rows for yesterday');
    }
  } catch (e) {
    Logger.log('LaborDetail probe failed: ' + e.toString());
  }
  Logger.log('=== Probe Complete ===');
}


// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

function testRefreshYesterdayR365Signals() { refreshYesterdayR365Signals(); }
function testBackfillR365Signals30() {
  var d = new Date(); d.setDate(d.getDate() - 30);
  backfillR365Signals(formatSignalDate_(d), 30);
}
function testBackfillR365Signals90() {
  var d = new Date(); d.setDate(d.getDate() - 90);
  backfillR365Signals(formatSignalDate_(d), 30);
  Logger.log('Run testBackfillR365Signals60 next, then testBackfillR365Signals30');
}
function testBackfillR365Signals60() {
  var d = new Date(); d.setDate(d.getDate() - 60);
  backfillR365Signals(formatSignalDate_(d), 30);
}
function testProbeR365FieldNames() { probeR365FieldNames(); }
