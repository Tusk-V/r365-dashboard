// ============================================================================
// SPORTS EVENTS — Auto-fetched game calendar + lift multipliers
//
// Pulls schedules for teams that move sales at specific Andy's locations
// (OU football for Norman, OK State football for Tulsa cluster, UCF football
// for Orlando cluster) from ESPN's free JSON endpoints. Learns per-location
// per-team lift multipliers from history, then exposes lookups so
// Modelforecast.js can apply them like holiday multipliers.
//
// Functions:
//   refreshSportsCalendar()    - Pull schedules (current + prior season)
//   learnSportsMultipliers()   - Compute lift from history
//   loadSportsMultipliers(ss)  - Read for use during prediction
//   loadSportsEvents(ss)       - Read events for use during prediction
//   getSportsEventForLocation(date, location, eventsByDateLoc)
//   getSportsMultiplier(multipliers, location, team)
//
// Sheets:
//   "Sports Events"       - Date, Sport, League, Team, Opponent, Home/Away,
//                           Affects (CSV of locations)
//   "Sports Multipliers"  - Scope, Location/Market, Team, Multiplier, Samples
//
// Cadence: refreshSportsCalendar() weekly; learnSportsMultipliers() weekly.
// Both safe to re-run manually.
// ============================================================================

var SPORTS_CONFIG = {
  SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  EVENTS_SHEET: 'Sports Events',
  MULTIPLIERS_SHEET: 'Sports Multipliers',

  // ESPN team IDs verified against site.api.espn.com.
  // `affects` lists Andy's locations that pick up sales lift on game days.
  // Only home games are tagged for college football (campus/town effect);
  // both home and away for NFL (TV/celebration effect across the metro).
  TEAMS: {
    'OU Football': {
      espnSport: 'football',
      espnLeague: 'college-football',
      espnTeamId: 201,
      homeOnly: true,
      affects: ['Norman', 'Edmond']
    },
    'OK State Football': {
      espnSport: 'football',
      espnLeague: 'college-football',
      espnTeamId: 197,
      homeOnly: true,
      affects: ['Owasso', 'Bixby', 'Yale', 'Broken Arrow', 'Claremore']
    },
    'UCF Football': {
      espnSport: 'football',
      espnLeague: 'college-football',
      espnTeamId: 2116,
      homeOnly: true,
      affects: ['Sanford', "Hunter's Creek", 'Lakeland']
    }
  },

  // How many past seasons to pull for historical multiplier learning.
  HISTORY_SEASONS: 2,

  MULTIPLIERS: {
    MIN_LOCATION_SAMPLES: 3,
    BASELINE_WINDOW_DAYS: 28
  }
};


// ============================================================================
// REFRESH: pull schedules from ESPN, write to Sports Events sheet
// ============================================================================

function refreshSportsCalendar() {
  Logger.log('=== Refreshing Sports Calendar ===');

  var ss = SpreadsheetApp.openById(SPORTS_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SPORTS_CONFIG.EVENTS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SPORTS_CONFIG.EVENTS_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, 1, 7).setValues([['Date', 'Sport', 'League', 'Team', 'Opponent', 'Home/Away', 'Affects']]);
  sheet.setFrozenRows(1);

  var currentYear = new Date().getFullYear();
  var seasonsToFetch = [];
  for (var i = 0; i < SPORTS_CONFIG.HISTORY_SEASONS; i++) {
    seasonsToFetch.push(currentYear - i);
  }
  seasonsToFetch.push(currentYear + 1);

  var allRows = [];
  var teamKeys = Object.keys(SPORTS_CONFIG.TEAMS);

  for (var t = 0; t < teamKeys.length; t++) {
    var teamName = teamKeys[t];
    var team = SPORTS_CONFIG.TEAMS[teamName];

    for (var s = 0; s < seasonsToFetch.length; s++) {
      var season = seasonsToFetch[s];
      var rows = fetchEspnSchedule_(teamName, team, season);
      for (var r = 0; r < rows.length; r++) allRows.push(rows[r]);
      Utilities.sleep(150);
    }
  }

  if (allRows.length > 0) {
    allRows.sort(function(a, b) { return new Date(a[0]) - new Date(b[0]); });
    sheet.getRange(2, 1, allRows.length, 7).setValues(allRows);
  }

  Logger.log('Wrote ' + allRows.length + ' sports events');
  Logger.log('=== Sports Calendar Refresh Complete ===');
}

function fetchEspnSchedule_(teamName, team, season) {
  var url = 'https://site.api.espn.com/apis/site/v2/sports/' +
            team.espnSport + '/' + team.espnLeague +
            '/teams/' + team.espnTeamId + '/schedule?season=' + season;

  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log('ESPN ' + teamName + ' ' + season + ': HTTP ' + code);
      return [];
    }

    var data = JSON.parse(resp.getContentText());
    var events = data.events || [];
    var rows = [];
    var affectsCsv = team.affects.join(', ');

    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var dateRaw = ev.date;
      if (!dateRaw) continue;

      var d = new Date(dateRaw);
      if (isNaN(d.getTime())) continue;

      var isHome = false;
      var opponent = '';
      try {
        var comp = ev.competitions && ev.competitions[0];
        if (comp && comp.competitors) {
          for (var c = 0; c < comp.competitors.length; c++) {
            var competitor = comp.competitors[c];
            var compTeamId = competitor.team && competitor.team.id;
            if (String(compTeamId) === String(team.espnTeamId)) {
              isHome = competitor.homeAway === 'home';
            } else {
              opponent = (competitor.team && (competitor.team.displayName || competitor.team.name)) || '';
            }
          }
        }
      } catch (e) {
        Logger.log('Parse error in ' + teamName + ' event: ' + e.toString());
      }

      if (team.homeOnly && !isHome) continue;

      var dateStr = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
      rows.push([
        dateStr, team.espnSport, team.espnLeague, teamName,
        opponent, isHome ? 'Home' : 'Away', affectsCsv
      ]);
    }

    Logger.log(teamName + ' ' + season + ': ' + rows.length + ' games');
    return rows;
  } catch (e) {
    Logger.log('ESPN fetch error ' + teamName + ' ' + season + ': ' + e.toString());
    return [];
  }
}


// ============================================================================
// LEARN: compute per-location per-team lift multipliers from history
// ============================================================================

function learnSportsMultipliers() {
  Logger.log('=== Learning Sports Multipliers ===');

  var ss = SpreadsheetApp.openById(SPORTS_CONFIG.SPREADSHEET_ID);
  var forecastSheet = ss.getSheetByName(MODEL_CONFIG.FORECAST_DATA_SHEET);
  var eventsSheet = ss.getSheetByName(SPORTS_CONFIG.EVENTS_SHEET);
  if (!forecastSheet || !eventsSheet) {
    Logger.log('Missing required sheet — run refreshSportsCalendar first');
    return;
  }

  var eventsData = eventsSheet.getDataRange().getValues();
  var eventsByDateLoc = {};
  for (var i = 1; i < eventsData.length; i++) {
    var dateRaw = eventsData[i][0];
    var team = eventsData[i][3] ? eventsData[i][3].toString().trim() : '';
    var affects = eventsData[i][6] ? eventsData[i][6].toString().trim() : '';
    if (!dateRaw || !team || !affects) continue;
    var dateObj = new Date(dateRaw);
    if (isNaN(dateObj.getTime())) continue;
    dateObj.setHours(0, 0, 0, 0);
    var dateKey = dateObj.getTime();
    var locs = affects.split(',').map(function(x) { return x.trim(); });
    for (var l = 0; l < locs.length; l++) {
      var k = dateKey + '|' + locs[l];
      if (!eventsByDateLoc[k]) eventsByDateLoc[k] = [];
      eventsByDateLoc[k].push(team);
    }
  }

  var salesData = forecastSheet.getDataRange().getValues();
  var salesByLoc = {};
  for (var j = 1; j < salesData.length; j++) {
    var dRaw = salesData[j][0];
    var loc = salesData[j][1] ? salesData[j][1].toString().trim() : '';
    var sales = parseFloat(salesData[j][2]) || 0;
    if (!dRaw || !loc || sales <= 0) continue;
    var dObj = (dRaw instanceof Date) ? new Date(dRaw) : new Date(dRaw.toString());
    if (isNaN(dObj.getTime())) continue;
    dObj.setHours(0, 0, 0, 0);
    if (!salesByLoc[loc]) salesByLoc[loc] = [];
    salesByLoc[loc].push({ date: dObj, sales: sales });
  }
  var locKeys = Object.keys(salesByLoc);
  for (var l2 = 0; l2 < locKeys.length; l2++) {
    salesByLoc[locKeys[l2]].sort(function(a, b) { return a.date - b.date; });
  }

  var window = SPORTS_CONFIG.MULTIPLIERS.BASELINE_WINDOW_DAYS;
  var byLocTeam = {};
  var byMarketTeam = {};
  var byTeamGlobal = {};

  for (var lk = 0; lk < locKeys.length; lk++) {
    var locName = locKeys[lk];
    var locSales = salesByLoc[locName];

    for (var s2 = 0; s2 < locSales.length; s2++) {
      var entry = locSales[s2];
      var lookupKey = entry.date.getTime() + '|' + locName;
      var teams = eventsByDateLoc[lookupKey];
      if (!teams || teams.length === 0) continue;

      var targetDOW = entry.date.getDay();
      var winStart = new Date(entry.date); winStart.setDate(winStart.getDate() - window);
      var winEnd = new Date(entry.date); winEnd.setDate(winEnd.getDate() + window);

      var baselineSamples = [];
      for (var b = 0; b < locSales.length; b++) {
        var bEntry = locSales[b];
        if (bEntry.date.getTime() === entry.date.getTime()) continue;
        if (bEntry.date < winStart || bEntry.date > winEnd) continue;
        if (bEntry.date.getDay() !== targetDOW) continue;
        var bLookupKey = bEntry.date.getTime() + '|' + locName;
        if (eventsByDateLoc[bLookupKey]) continue;
        if (typeof getModelHoliday === 'function' && getModelHoliday(bEntry.date)) continue;
        baselineSamples.push(bEntry.sales);
      }

      if (baselineSamples.length < 2) continue;
      baselineSamples.sort(function(a, b) { return a - b; });
      var baseline = baselineSamples[Math.floor(baselineSamples.length / 2)];
      if (baseline <= 0) continue;

      var mult = entry.sales / baseline;
      if (mult < 0.3 || mult > 4.0) continue;

      var market = (typeof getMarketForLocation === 'function') ? getMarketForLocation(locName) : 'Unknown';

      for (var tt = 0; tt < teams.length; tt++) {
        var teamName = teams[tt];
        if (!byLocTeam[locName]) byLocTeam[locName] = {};
        if (!byLocTeam[locName][teamName]) byLocTeam[locName][teamName] = [];
        byLocTeam[locName][teamName].push(mult);

        if (!byMarketTeam[market]) byMarketTeam[market] = {};
        if (!byMarketTeam[market][teamName]) byMarketTeam[market][teamName] = [];
        byMarketTeam[market][teamName].push(mult);

        if (!byTeamGlobal[teamName]) byTeamGlobal[teamName] = [];
        byTeamGlobal[teamName].push(mult);
      }
    }
  }

  var sheet = ss.getSheetByName(SPORTS_CONFIG.MULTIPLIERS_SHEET);
  if (!sheet) sheet = ss.insertSheet(SPORTS_CONFIG.MULTIPLIERS_SHEET);
  sheet.clear();
  sheet.getRange(1, 1, 1, 5).setValues([['Scope', 'Name', 'Team', 'Multiplier', 'Sample Count']]);
  sheet.setFrozenRows(1);

  var rows = [];

  var locKeys2 = Object.keys(byLocTeam);
  for (var i2 = 0; i2 < locKeys2.length; i2++) {
    var tKeys = Object.keys(byLocTeam[locKeys2[i2]]);
    for (var hi = 0; hi < tKeys.length; hi++) {
      var samples = byLocTeam[locKeys2[i2]][tKeys[hi]];
      samples.sort(function(a, b) { return a - b; });
      var med = samples[Math.floor(samples.length / 2)];
      rows.push(['location', locKeys2[i2], tKeys[hi], Math.round(med * 1000) / 1000, samples.length]);
    }
  }

  var mKeys = Object.keys(byMarketTeam);
  for (var mi = 0; mi < mKeys.length; mi++) {
    var tKeys2 = Object.keys(byMarketTeam[mKeys[mi]]);
    for (var hi2 = 0; hi2 < tKeys2.length; hi2++) {
      var samples2 = byMarketTeam[mKeys[mi]][tKeys2[hi2]];
      samples2.sort(function(a, b) { return a - b; });
      var med2 = samples2[Math.floor(samples2.length / 2)];
      rows.push(['market', mKeys[mi], tKeys2[hi2], Math.round(med2 * 1000) / 1000, samples2.length]);
    }
  }

  var gKeys = Object.keys(byTeamGlobal);
  for (var gi = 0; gi < gKeys.length; gi++) {
    var gSamples = byTeamGlobal[gKeys[gi]];
    gSamples.sort(function(a, b) { return a - b; });
    var gMed = gSamples[Math.floor(gSamples.length / 2)];
    rows.push(['global', 'all', gKeys[gi], Math.round(gMed * 1000) / 1000, gSamples.length]);
  }

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }

  Logger.log('Wrote ' + rows.length + ' sports multiplier rows');
  Logger.log('=== Sports Multipliers Learning Complete ===');
}


// ============================================================================
// LOADERS + LOOKUPS (used by Modelforecast.js)
// ============================================================================

function loadSportsEvents(ss) {
  var sheet = ss.getSheetByName(SPORTS_CONFIG.EVENTS_SHEET);
  if (!sheet) return {};

  var lookup = {};
  try {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var dateRaw = data[i][0];
      var team = data[i][3] ? data[i][3].toString().trim() : '';
      var affects = data[i][6] ? data[i][6].toString().trim() : '';
      if (!dateRaw || !team || !affects) continue;
      var d = new Date(dateRaw);
      if (isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      var dateKey = (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
      var locs = affects.split(',').map(function(x) { return x.trim(); });
      for (var l = 0; l < locs.length; l++) {
        var k = locs[l] + '|' + dateKey;
        if (!lookup[k]) lookup[k] = [];
        lookup[k].push(team);
      }
    }
  } catch (e) {
    Logger.log('Error loading sports events: ' + e.toString());
  }
  return lookup;
}

function loadSportsMultipliers(ss) {
  var sheet = ss.getSheetByName(SPORTS_CONFIG.MULTIPLIERS_SHEET);
  if (!sheet) return { location: {}, market: {}, global: {} };

  var multipliers = { location: {}, market: {}, global: {} };
  try {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var scope = data[i][0] ? data[i][0].toString().trim() : '';
      var name = data[i][1] ? data[i][1].toString().trim() : '';
      var team = data[i][2] ? data[i][2].toString().trim() : '';
      var mult = parseFloat(data[i][3]) || 1.0;
      var samples = parseInt(data[i][4]) || 0;
      if (!scope || !team) continue;

      if (scope === 'location') {
        if (!multipliers.location[name]) multipliers.location[name] = {};
        multipliers.location[name][team] = { multiplier: mult, samples: samples };
      } else if (scope === 'market') {
        if (!multipliers.market[name]) multipliers.market[name] = {};
        multipliers.market[name][team] = { multiplier: mult, samples: samples };
      } else if (scope === 'global') {
        multipliers.global[team] = { multiplier: mult, samples: samples };
      }
    }
  } catch (e) {
    Logger.log('Error loading sports multipliers: ' + e.toString());
  }
  return multipliers;
}

function getSportsTeamsForLocation(eventsLookup, location, date) {
  if (!eventsLookup) return [];
  var dateKey = (date.getMonth() + 1) + '/' + date.getDate() + '/' + date.getFullYear();
  return eventsLookup[location + '|' + dateKey] || [];
}

function getSportsMultiplier(multipliers, location, team) {
  if (!team || !multipliers) return 1.0;
  var minLoc = SPORTS_CONFIG.MULTIPLIERS.MIN_LOCATION_SAMPLES;
  var market = (typeof getMarketForLocation === 'function') ? getMarketForLocation(location) : 'Unknown';

  if (multipliers.location && multipliers.location[location] && multipliers.location[location][team]) {
    var entry = multipliers.location[location][team];
    if (entry.samples >= minLoc) return entry.multiplier;
  }
  if (multipliers.market && multipliers.market[market] && multipliers.market[market][team]) {
    return multipliers.market[market][team].multiplier;
  }
  if (multipliers.global && multipliers.global[team]) {
    return multipliers.global[team].multiplier;
  }
  return 1.0;
}

// Combine multiple teams' multipliers on the same day. Geometric mean is more
// conservative than multiplying lifts (which would double-count overlap).
function combineSportsMultipliers(mults) {
  if (!mults || mults.length === 0) return 1.0;
  if (mults.length === 1) return mults[0];
  var prod = 1.0;
  for (var i = 0; i < mults.length; i++) prod *= mults[i];
  return Math.pow(prod, 1 / mults.length);
}


// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

function testRefreshSportsCalendar() { refreshSportsCalendar(); }
function testLearnSportsMultipliers() { learnSportsMultipliers(); }
