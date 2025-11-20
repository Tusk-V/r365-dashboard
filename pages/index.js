/**
 * R365 Weekly Sales and Labor Report Processor
 * Ultra-Simple Version - Direct Excel parsing
 * 
 * Schedule:
 * - Monday 6:30 AM: Process "Previous Week" report (Mon-Sun complete)
 * - Tue-Sun 6:30 AM: Process "Weekly Sales and Labor Report" (current week)
 * - Tuesday 6:30 AM: Also archives previous week before updating
 */

// Configuration
var CONFIG = {
  SHEET_NAME: 'Sheet1',
  HISTORICAL_SHEET_NAME: 'Historical Data',
  WEEKS_TO_KEEP: 12,
  PREVIOUS_WEEK_SUBJECT: 'Weekly Sales and Labor Report - Previous Week',
  CURRENT_WEEK_SUBJECT: 'Weekly Sales and Labor Report'
};

/**
 * Main function
 */
function processR365Report() {
  var today = new Date().getDay();
  
  try {
    if (today === 1) {
      Logger.log('Monday: Processing Previous Week report');
      processPreviousWeekReport();
    } else if (today === 2) {
      Logger.log('Tuesday: Archiving and processing current week report');
      archivePreviousWeek();
      processCurrentWeekReport();
    } else {
      Logger.log('Wed-Sun: Processing current week report');
      processCurrentWeekReport();
    }
    
    Logger.log('Success!');
  } catch (error) {
    Logger.log('Error: ' + error);
  }
}

/**
 * Process Previous Week report
 */
function processPreviousWeekReport() {
  var threads = GmailApp.search('subject:"' + CONFIG.PREVIOUS_WEEK_SUBJECT + '" newer_than:2h has:attachment');
  
  if (threads.length === 0) {
    Logger.log('No Previous Week report found');
    return;
  }
  
  Logger.log('Found ' + threads.length + ' Previous Week emails');
  var message = threads[0].getMessages()[0];
  Logger.log('Processing email from: ' + message.getDate());
  var attachment = getExcelAttachment(message);
  
  if (attachment) {
    processAttachment(attachment);
  }
}

/**
 * Process Current Week report
 */
function processCurrentWeekReport() {
  var threads = GmailApp.search('subject:"' + CONFIG.CURRENT_WEEK_SUBJECT + '" -subject:"Previous Week" newer_than:2h has:attachment');
  
  if (threads.length === 0) {
    Logger.log('No current week report found');
    return;
  }
  
  Logger.log('Found ' + threads.length + ' current week emails');
  var message = threads[0].getMessages()[0];
  Logger.log('Processing email from: ' + message.getDate());
  var attachment = getExcelAttachment(message);
  
  if (attachment) {
    processAttachment(attachment);
  }
}

/**
 * Get Excel attachment
 */
function getExcelAttachment(message) {
  var attachments = message.getAttachments();
  
  for (var i = 0; i < attachments.length; i++) {
    var name = attachments[i].getName().toLowerCase();
    if (name.indexOf('.xlsx') > -1 || name.indexOf('.xls') > -1) {
      return attachments[i];
    }
  }
  
  return null;
}

/**
 * Process attachment
 */
function processAttachment(attachment) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }
  
  // Create temp file in Drive
  var blob = attachment.copyBlob();
  var file = DriveApp.createFile(blob);
  var fileId = file.getId();
  
  // Convert to Sheets
  var resource = {
    mimeType: MimeType.GOOGLE_SHEETS
  };
  var convertedFile = Drive.Files.copy(resource, fileId);
  
  // Get ALL data from rows 7-26
  var tempSheet = SpreadsheetApp.openById(convertedFile.id).getSheets()[0];
  var lastCol = tempSheet.getLastColumn();
  var data = tempSheet.getRange(7, 1, 20, lastCol).getValues(); // Row 7, 20 rows, all columns
  
  // Update sheet with all columns
  sheet.clear();
  if (data.length > 0) {
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
  
  // Cleanup
  DriveApp.getFileById(fileId).setTrashed(true);
  DriveApp.getFileById(convertedFile.id).setTrashed(true);
  
  Logger.log('Imported ' + data.length + ' rows with ' + data[0].length + ' columns (rows 7-26 from Excel)');
}

/**
 * Archive data
 */
function archivePreviousWeek() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  
  if (!mainSheet || mainSheet.getLastRow() < 2) {
    Logger.log('No data to archive');
    return;
  }
  
  var histSheet = spreadsheet.getSheetByName(CONFIG.HISTORICAL_SHEET_NAME);
  if (!histSheet) {
    histSheet = spreadsheet.insertSheet(CONFIG.HISTORICAL_SHEET_NAME);
    histSheet.getRange(1, 1, 1, 11).setValues([[
      'Week Ending', 'Location', 'Actual Sales', 'Forecast Sales',
      'Sales Variance', 'Prior Year Sales', 'Labor %', 'Optimal Hours',
      'Actual Hours', 'Scheduled Hours', 'Sch vs For Var'
    ]]);
  }
  
  var numCols = mainSheet.getLastColumn();
  var data = mainSheet.getRange(2, 1, mainSheet.getLastRow() - 1, numCols).getValues();
  
  // Try to find date - might be in last column or a specific column
  var weekDate = data[0][data[0].length - 1]; // Try last column first
  if (!weekDate || weekDate.toString().length < 5) {
    weekDate = new Date().toLocaleDateString(); // Fallback to today
  }
  
  // Column indices: A=0, H=7, G=6, I=8, J=9, K=10, M=12, N=13, P=15, S=18
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (row[0]) {
      histSheet.appendRow([
        weekDate,    // Week Ending
        row[0],      // A: Location
        row[7],      // H: Actual Sales
        row[6],      // G: Forecast Sales
        row[8],      // I: Sales Variance
        row[9],      // J: Prior Year Sales
        row[10],     // K: Labor %
        row[12],     // M: Optimal Hours
        row[13],     // N: Actual Hours
        row[15],     // P: Scheduled Hours
        row[18]      // S: Sch vs For Var
      ]);
    }
  }
  
  cleanOldData(histSheet);
  Logger.log('Archived week ' + weekDate);
}

/**
 * Clean old data
 */
function cleanOldData(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;
  
  var weeks = [];
  for (var i = 1; i < data.length; i++) {
    var week = data[i][0].toString();
    if (weeks.indexOf(week) === -1) weeks.push(week);
  }
  
  weeks.sort(function(a, b) { return new Date(b) - new Date(a); });
  
  if (weeks.length > CONFIG.WEEKS_TO_KEEP) {
    var oldWeeks = weeks.slice(CONFIG.WEEKS_TO_KEEP);
    for (var i = data.length - 1; i >= 1; i--) {
      if (oldWeeks.indexOf(data[i][0].toString()) > -1) {
        sheet.deleteRow(i + 1);
      }
    }
  }
}

/**
 * Setup trigger
 */
function setupTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  ScriptApp.newTrigger('processR365Report')
    .timeBased()
    .atHour(6)
    .nearMinute(30)
    .everyDays(1)
    .create();
  
  Logger.log('Trigger created for 6:30 AM daily');
}
