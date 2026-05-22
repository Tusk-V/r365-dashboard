// ============================================================================
// FORECAST WEATHER - Fetches weather data from Open-Meteo API
// 
// Functions:
//   testForecastWeather()     - Quick test (run first to verify API works)
//   backfillForecastWeather() - Run ONCE to populate 2 years of weather history
//   updateForecastWeather()   - Run DAILY (called from processAllR365Reports)
// ============================================================================

var FORECAST_CONFIG = {
  SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  SHEET_NAME: 'Forecast Data',
  
  LOCATIONS: {
    'Allen':              { lat: 33.1032, lon: -96.6736, market: 'Dallas' },
    'Bixby':              { lat: 35.9421, lon: -95.8803, market: 'Tulsa' },
    'Broken Arrow':       { lat: 36.0526, lon: -95.7908, market: 'Tulsa' },
    'Carrollton':         { lat: 32.9537, lon: -96.8903, market: 'Dallas' },
    'Claremore':          { lat: 36.3126, lon: -95.6161, market: 'Tulsa' },
    'Edmond':             { lat: 35.6528, lon: -97.4781, market: 'Oklahoma City' },
    'Frisco #1':          { lat: 33.1507, lon: -96.8236, market: 'Dallas' },
    'Frisco #2':          { lat: 33.1507, lon: -96.8236, market: 'Dallas' },
    'Frisco #3':          { lat: 33.1507, lon: -96.8236, market: 'Dallas' },
    'Hillcrest Village':  { lat: 32.8668, lon: -96.7700, market: 'Dallas' },
    "Hunter's Creek":     { lat: 28.4518, lon: -81.4429, market: 'Orlando' },
    'Lake Highlands':     { lat: 32.8818, lon: -96.7300, market: 'Dallas' },
    'Lakeland':           { lat: 28.0395, lon: -81.9498, market: 'Orlando' },
    'Norman':             { lat: 35.2226, lon: -97.4395, market: 'Oklahoma City' },
    'Owasso':             { lat: 36.2695, lon: -95.8547, market: 'Tulsa' },
    'Penn':               { lat: 35.4676, lon: -97.5164, market: 'Oklahoma City' },
    'Prosper':            { lat: 33.2362, lon: -96.8011, market: 'Dallas' },
    'Sanford':            { lat: 28.8003, lon: -81.2733, market: 'Orlando' },
    'The Colony':         { lat: 33.0807, lon: -96.8928, market: 'Dallas' },
    'Warr Acres':         { lat: 35.5226, lon: -97.6186, market: 'Oklahoma City' },
    'Yale':               { lat: 36.1540, lon: -95.9696, market: 'Tulsa' }
  }
};

var WEATHER_CODES = {
  0: 'Clear',
  1: 'Mostly Clear', 2: 'Partly Cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog',
  51: 'Light Drizzle', 53: 'Drizzle', 55: 'Heavy Drizzle',
  56: 'Freezing Drizzle', 57: 'Freezing Drizzle',
  61: 'Light Rain', 63: 'Rain', 65: 'Heavy Rain',
  66: 'Freezing Rain', 67: 'Freezing Rain',
  71: 'Light Snow', 73: 'Snow', 75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Light Showers', 81: 'Showers', 82: 'Heavy Showers',
  85: 'Snow Showers', 86: 'Heavy Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm w/ Hail', 99: 'Thunderstorm w/ Hail'
};

function updateForecastWeather() {
  Logger.log('=== Starting Forecast Weather Update ===');
  
  var ss = SpreadsheetApp.openById(FORECAST_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(FORECAST_CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(FORECAST_CONFIG.SHEET_NAME);
    sheet.getRange(1, 1, 1, 5).setValues([['Date', 'Location', 'Net Sales', 'High Temp', 'Conditions']]);
    sheet.setFrozenRows(1);
    Logger.log('Created new Forecast Data sheet with headers');
  }
  
  var existingData = sheet.getDataRange().getValues();
  var existingMap = {};
  for (var i = 1; i < existingData.length; i++) {
    var dateStr = existingData[i][0];
    var loc = existingData[i][1];
    if (dateStr && loc) {
      if (dateStr instanceof Date) {
        dateStr = Utilities.formatDate(dateStr, 'America/Chicago', 'MM/dd/yyyy');
      }
      existingMap[dateStr + '|' + loc] = i + 1;
    }
  }
  
  var today = new Date();
  var startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 7);
  var endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 14);
  
  Logger.log('Fetching weather from ' + formatDateForAPI(startDate) + ' to ' + formatDateForAPI(endDate));
  
  var coordGroups = {};
  var locationNames = Object.keys(FORECAST_CONFIG.LOCATIONS);
  
  for (var n = 0; n < locationNames.length; n++) {
    var name = locationNames[n];
    var loc = FORECAST_CONFIG.LOCATIONS[name];
    var coordKey = loc.lat + ',' + loc.lon;
    if (!coordGroups[coordKey]) {
      coordGroups[coordKey] = { lat: loc.lat, lon: loc.lon, locations: [] };
    }
    coordGroups[coordKey].locations.push(name);
  }
  
  var coordKeys = Object.keys(coordGroups);
  Logger.log('Grouped ' + locationNames.length + ' locations into ' + coordKeys.length + ' coordinate groups');
  
  var updatedCells = [];
  var newRows = [];
  
  for (var g = 0; g < coordKeys.length; g++) {
    var group = coordGroups[coordKeys[g]];
    
    try {
      var weatherData = fetchForecastWeather(group.lat, group.lon, 7, 14);
      if (!weatherData) continue;
      
      var dates = weatherData.daily.time;
      var temps = weatherData.daily.temperature_2m_max;
      var codes = weatherData.daily.weather_code;
      
      for (var d = 0; d < dates.length; d++) {
        var apiDate = dates[d];
        var parts = apiDate.split('-');
        var formattedDate = parseInt(parts[1]) + '/' + parseInt(parts[2]) + '/' + parts[0];
        var paddedDate = parts[1] + '/' + parts[2] + '/' + parts[0];
        
        var temp = temps[d];
        var condition = WEATHER_CODES[codes[d]] || ('Code ' + codes[d]);
        
        for (var loc = 0; loc < group.locations.length; loc++) {
          var locationName = group.locations[loc];
          var key1 = formattedDate + '|' + locationName;
          var key2 = paddedDate + '|' + locationName;
          var existingRow = existingMap[key1] || existingMap[key2];
          
          if (existingRow) {
            updatedCells.push({ row: existingRow, temp: temp, condition: condition });
          } else {
            newRows.push([formattedDate, locationName, '', temp, condition]);
          }
        }
      }
      
      Utilities.sleep(500);
      
    } catch (e) {
      Logger.log('Error fetching weather for ' + group.lat + ',' + group.lon + ': ' + e.message);
    }
  }
  
  for (var u = 0; u < updatedCells.length; u++) {
    var cell = updatedCells[u];
    if (cell.row > 0) {
      sheet.getRange(cell.row, 4).setValue(cell.temp);
      sheet.getRange(cell.row, 5).setValue(cell.condition);
    }
  }
  Logger.log('Updated weather for ' + updatedCells.length + ' existing rows');
  
  if (newRows.length > 0) {
    newRows.sort(function(a, b) {
      var dateA = parseDateStr(a[0]);
      var dateB = parseDateStr(b[0]);
      if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
      return a[1].localeCompare(b[1]);
    });
    
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newRows.length, 5).setValues(newRows);
    Logger.log('Added ' + newRows.length + ' new rows (future weather forecasts)');
  }
  
  Logger.log('=== Forecast Weather Update Complete ===');
}

function backfillForecastWeather() {
  Logger.log('=== Starting Weather Backfill (2 years) ===');
  Logger.log('WARNING: This may take several minutes due to API rate limiting');
  
  var ss = SpreadsheetApp.openById(FORECAST_CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(FORECAST_CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = ss.insertSheet(FORECAST_CONFIG.SHEET_NAME);
    sheet.getRange(1, 1, 1, 5).setValues([['Date', 'Location', 'Net Sales', 'High Temp', 'Conditions']]);
    sheet.setFrozenRows(1);
  }
  
  var existingData = sheet.getDataRange().getValues();
  var existingMap = {};
  for (var i = 1; i < existingData.length; i++) {
    var dateStr = existingData[i][0];
    var loc = existingData[i][1];
    if (dateStr && loc) {
      if (dateStr instanceof Date) {
        dateStr = (dateStr.getMonth() + 1) + '/' + dateStr.getDate() + '/' + dateStr.getFullYear();
      }
      existingMap[dateStr + '|' + loc] = i + 1;
    }
  }
  
  var coordGroups = {};
  var locationNames = Object.keys(FORECAST_CONFIG.LOCATIONS);
  for (var n = 0; n < locationNames.length; n++) {
    var name = locationNames[n];
    var loc = FORECAST_CONFIG.LOCATIONS[name];
    var coordKey = loc.lat + ',' + loc.lon;
    if (!coordGroups[coordKey]) {
      coordGroups[coordKey] = { lat: loc.lat, lon: loc.lon, locations: [] };
    }
    coordGroups[coordKey].locations.push(name);
  }
  
  var coordKeys = Object.keys(coordGroups);
  var today = new Date();
  var twoYearsAgo = new Date(today);
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  
  var updatedCells = [];
  var apiCalls = 0;
  
  for (var g = 0; g < coordKeys.length; g++) {
    var group = coordGroups[coordKeys[g]];
    Logger.log('Fetching history for ' + group.locations.join(', ') + ' (' + group.lat + ',' + group.lon + ')');
    
    try {
      var weatherData = fetchArchiveWeather(group.lat, group.lon, twoYearsAgo, today);
      apiCalls++;
      
      if (!weatherData || !weatherData.daily) { Logger.log('No data returned'); continue; }
      
      var dates = weatherData.daily.time;
      var temps = weatherData.daily.temperature_2m_max;
      var codes = weatherData.daily.weather_code;
      
      for (var d = 0; d < dates.length; d++) {
        var apiDate = dates[d];
        var parts = apiDate.split('-');
        var formattedDate = parseInt(parts[1]) + '/' + parseInt(parts[2]) + '/' + parts[0];
        var temp = temps[d];
        var condition = WEATHER_CODES[codes[d]] || ('Code ' + codes[d]);
        
        for (var loc = 0; loc < group.locations.length; loc++) {
          var locationName = group.locations[loc];
          var key = formattedDate + '|' + locationName;
          if (existingMap[key]) {
            updatedCells.push({ row: existingMap[key], temp: temp, condition: condition });
          }
        }
      }
      
      Utilities.sleep(1000);
    } catch (e) {
      Logger.log('Error fetching archive for ' + group.lat + ',' + group.lon + ': ' + e.message);
    }
  }
  
  Logger.log('Writing ' + updatedCells.length + ' weather updates...');
  for (var u = 0; u < updatedCells.length; u++) {
    var cell = updatedCells[u];
    sheet.getRange(cell.row, 4).setValue(cell.temp);
    sheet.getRange(cell.row, 5).setValue(cell.condition);
  }
  
  Logger.log('=== Backfill Complete ===');
  Logger.log('API calls made: ' + apiCalls);
  Logger.log('Rows updated with weather: ' + updatedCells.length);
}

function formatDateForAPI(date) {
  return Utilities.formatDate(date, 'America/Chicago', 'yyyy-MM-dd');
}

function parseDateStr(dateStr) {
  var parts = dateStr.split('/');
  return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
}

function fetchForecastWeather(lat, lon, pastDays, forecastDays) {
  var url = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + lat + '&longitude=' + lon
    + '&daily=temperature_2m_max,weather_code'
    + '&temperature_unit=fahrenheit'
    + '&timezone=America/Chicago'
    + '&past_days=' + pastDays
    + '&forecast_days=' + forecastDays;
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    Logger.log('Forecast API error ' + response.getResponseCode() + ': ' + response.getContentText().substring(0, 200));
    return null;
  }
  return JSON.parse(response.getContentText());
}

function fetchArchiveWeather(lat, lon, startDate, endDate) {
  var url = 'https://archive-api.open-meteo.com/v1/archive'
    + '?latitude=' + lat + '&longitude=' + lon
    + '&start_date=' + formatDateForAPI(startDate)
    + '&end_date=' + formatDateForAPI(endDate)
    + '&daily=temperature_2m_max,weather_code'
    + '&temperature_unit=fahrenheit'
    + '&timezone=America/Chicago';
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    Logger.log('Archive API error ' + response.getResponseCode() + ': ' + response.getContentText().substring(0, 200));
    return null;
  }
  return JSON.parse(response.getContentText());
}

function testForecastWeather() {
  Logger.log('=== Testing Forecast Weather API ===');
  var data = fetchForecastWeather(33.1032, -96.6736, 3, 3);
  if (data && data.daily) {
    Logger.log('SUCCESS! Got ' + data.daily.time.length + ' days of weather data');
    for (var i = 0; i < data.daily.time.length; i++) {
      var condition = WEATHER_CODES[data.daily.weather_code[i]] || 'Unknown';
      Logger.log('  ' + data.daily.time[i] + ': ' + data.daily.temperature_2m_max[i] + 'F, ' + condition);
    }
  } else { Logger.log('FAILED - no data returned'); }
  Logger.log('=== Test Complete ===');
}