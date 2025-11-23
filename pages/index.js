/**
 * R365 Dashboard Data Processor - Consolidated Script
 * Processes all R365 email reports daily at 6:30 AM
 * 
 * Reports Processed:
 * 1. Weekly Sales & Labor Report (Mon-Sun schedule)
 * 2. Flash Report - Daily sales/guest counts
 * 3. Scheduled Today - Employee schedules
 * 4. Labor Actual vs Scheduled - Auto-clockouts & call-offs
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

var CONFIG = {
  // Weekly Sales & Labor
  WEEKLY_SHEET_NAME: 'Sheet1',
  HISTORICAL_SHEET_NAME: 'Historical Data',
  WEEKS_TO_KEEP: 12,
  PREVIOUS_WEEK_SUBJECT: 'Weekly Sales and Labor Report - Previous Week',
  CURRENT_WEEK_SUBJECT: 'Weekly Sales and Labor Report',
  
  // Flash Report
  FLASH_DAY_SHEET: 'Flash - Day',
  FLASH_WTD_SHEET: 'Flash - WTD',
  FLASH_SUBJECT: 'Flash Report',
  
  // Scheduled Today
  SCHEDULED_SHEET: 'Scheduled Today',
  SCHEDULED_SUBJECT: 'Labor Actual vs Scheduled - Today',
  
  // Labor Report (Auto-clockouts & Call-offs)
  LABOR_SEARCH_QUERY: 'subject:"Labor Actual vs Scheduled - Punch Details" has:attachment',
  LABOR_SPREADSHEET_ID: '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20',
  AUTO_CLOCKOUT_SHEET: 'Auto-Clockouts',
  CALL_OFFS_SHEET: 'Call-Offs',
  DAYS_TO_KEEP: 7,
  AUTO_CLOCKOUT_TIME: '5:00 AM'
};

// ============================================================================
// MAIN ORCHESTRATOR - Called by daily trigger
// ============================================================================

function processAllR365Reports() {
  var today = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
  
  Logger.log('=== Starting R365 Report Processing ===');
  Logger.log('Day of week: ' + today);
  
  try {
    // 1. Weekly Sales & Labor (day-specific logic)
    if (today === 1) {
      Logger.log('Monday: Processing Previous Week report');
      processWeeklySalesPreviousWeek();
    } else if (today === 2) {
      Logger.log('Tuesday: Archiving and processing current week');
      archiveWeeklySales();
      processWeeklySalesCurrentWeek();
    } else {
      Logger.log('Wed-Sun: Processing current week');
      processWeeklySalesCurrentWeek();
    }
    
    // 2. Flash Report (daily)
    Logger.log('Processing Flash Report...');
    processFlashReport();
    
    // 3. Scheduled Today (daily)
    Logger.log('Processing Scheduled Today...');
    processScheduledToday();
    
    // 4. Labor Report - Auto-clockouts & Call-offs (daily)
    Logger.log('Processing Labor Report...');
    processLaborReport();
    
    Logger.log('=== All Reports Processed Successfully ===');
  } catch (error) {
    Logger.log('ERROR in processAllR365Reports: ' + error);
    throw error;
  }
}

// ============================================================================
// 1. WEEKLY SALES & LABOR REPORT
// ============================================================================

function processWeeklySalesPreviousWeek() {
  var threads = GmailApp.search('subject:"' + CONFIG.PREVIOUS_WEEK_SUBJECT + '" newer_than:2h has:attachment');
  
  if (threads.length === 0) {
    Logger.log('No Previous Week report found');
    return;
  }
  
  var message = threads[0].getMessages()[0];
  var attachment = getExcelAttachment(message);
  
  if (attachment) {
    processWeeklySalesAttachment(attachment);
  }
}

function processWeeklySalesCurrentWeek() {
  var threads = GmailApp.search('subject:"' + CONFIG.CURRENT_WEEK_SUBJECT + '" -subject:"Previous Week" newer_than:2h has:attachment');
  
  if (threads.length === 0) {
    Logger.log('No current week report found');
    return;
  }
  
  var message = threads[0].getMessages()[0];
  var attachment = getExcelAttachment(message);
  
  if (attachment) {
    processWeeklySalesAttachment(attachment);
  }
}

function processWeeklySalesAttachment(attachment) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(CONFIG.WEEKLY_SHEET_NAME);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.WEEKLY_SHEET_NAME);
  }
  
  var blob = attachment.copyBlob();
  var file = DriveApp.createFile(blob);
  var fileId = file.getId();
  
  var resource = { mimeType: MimeType.GOOGLE_SHEETS };
  var convertedFile = Drive.Files.copy(resource, fileId);
  
  var tempSheet = SpreadsheetApp.openById(convertedFile.id).getSheets()[0];
  var lastCol = tempSheet.getLastColumn();
  var data = tempSheet.getRange(7, 1, 20, lastCol).getValues();
  
  sheet.clear();
  if (data.length > 0) {
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
  
  DriveApp.getFileById(fileId).setTrashed(true);
  DriveApp.getFileById(convertedFile.id).setTrashed(true);
  
  Logger.log('Weekly Sales: Imported ' + data.length + ' rows');
}

function archiveWeeklySales() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var mainSheet = spreadsheet.getSheetByName(CONFIG.WEEKLY_SHEET_NAME);
  
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
  
  var weekDate = data[0][data[0].length - 1];
  if (!weekDate || weekDate.toString().length < 5) {
    weekDate = new Date().toLocaleDateString();
  }
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (row[0]) {
      histSheet.appendRow([
        weekDate, row[0], row[7], row[6], row[8], row[9], 
        row[10], row[12], row[13], row[15], row[18]
      ]);
    }
  }
  
  cleanOldWeeklyData(histSheet);
  Logger.log('Archived week ' + weekDate);
}

function cleanOldWeeklyData(sheet) {
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

// ============================================================================
// 2. FLASH REPORT
// ============================================================================

function processFlashReport() {
  var threads = GmailApp.search('subject:"' + CONFIG.FLASH_SUBJECT + '" newer_than:2h has:attachment');
  
  if (threads.length === 0) {
    Logger.log('No Flash Report found');
    return;
  }
  
  var message = threads[0].getMessages()[0];
  var attachment = getExcelAttachment(message);
  
  if (!attachment) {
    Logger.log('No Flash attachment found');
    return;
  }
  
  var blob = attachment.copyBlob();
  var file = DriveApp.createFile(blob);
  var fileId = file.getId();
  
  var resource = { mimeType: MimeType.GOOGLE_SHEETS };
  var convertedFile = Drive.Files.copy(resource, fileId);
  
  var tempSheet = SpreadsheetApp.openById(convertedFile.id).getSheets()[0];
  var data = tempSheet.getDataRange().getValues();
  
  var reportDate = new Date().toLocaleDateString();
  if (data.length > 3 && data[3][0]) {
    var dateStr = data[3][0].toString();
    if (dateStr.includes('Day of ')) {
      reportDate = dateStr.replace('Day of ', '').trim();
    }
  }
  
  processFlashDayOfData(data, reportDate);
  processFlashWTDData(data, reportDate);
  
  DriveApp.getFileById(fileId).setTrashed(true);
  DriveApp.getFileById(convertedFile.id).setTrashed(true);
  
  Logger.log('Flash Report processed');
}

function processFlashDayOfData(data, reportDate) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(CONFIG.FLASH_DAY_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.FLASH_DAY_SHEET);
    sheet.getRange(1, 1, 1, 14).setValues([[
      'Date', 'Location', 'Sales', 'Same Day LY Sales', 'Dollar Change', 
      'Percent Change', 'Avg Sales per Guest', 'Total Counts', 'Same Day LY Counts',
      'Comps', 'Discounts', 'Voids', 'Total Discounts', 'Discount %'
    ]]);
    sheet.getRange(1, 1, 1, 14).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  var startRow = 6;
  
  for (var i = startRow; i < data.length; i++) {
    var row = data[i];
    var location = row[0];
    
    if (!location || location === 'Totals' || location === '') break;
    
    sheet.appendRow([
      reportDate, location, row[1], row[3], row[4], row[5], row[6],
      row[9], row[10], row[27], row[28], row[31], row[29], row[30]
    ]);
  }
  
  Logger.log('Flash Day processed');
}

function processFlashWTDData(data, reportDate) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(CONFIG.FLASH_WTD_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.FLASH_WTD_SHEET);
    sheet.getRange(1, 1, 1, 14).setValues([[
      'Date', 'Location', 'Sales', 'Same Week LY Sales', 'Dollar Change', 
      'Percent Change', 'Avg Sales per Guest', 'Total Counts', 'Same Week LY Counts',
      'Comps', 'Discounts', 'Voids', 'Total Discounts', 'Discount %'
    ]]);
    sheet.getRange(1, 1, 1, 14).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  var wtdStartRow = -1;
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().includes('Week To Date')) {
      wtdStartRow = i + 2;
      break;
    }
  }
  
  if (wtdStartRow === -1) {
    Logger.log('WTD section not found');
    return;
  }
  
  for (var i = wtdStartRow; i < data.length; i++) {
    var row = data[i];
    var location = row[0];
    
    if (!location || location === 'Totals' || location === '') break;
    
    sheet.appendRow([
      reportDate, location, row[1], row[3], row[4], row[5], row[6],
      row[9], row[10], row[27], row[28], row[31], row[29], row[30]
    ]);
  }
  
  Logger.log('Flash WTD processed');
}

// ============================================================================
// 3. SCHEDULED TODAY
// ============================================================================

function processScheduledToday() {
  var threads = GmailApp.search('subject:"' + CONFIG.SCHEDULED_SUBJECT + '" newer_than:2h has:attachment');
  
  if (threads.length === 0) {
    Logger.log('No Scheduled Today report found');
    return;
  }
  
  var message = threads[0].getMessages()[0];
  var attachment = getExcelAttachment(message);
  
  if (!attachment) {
    Logger.log('No Scheduled attachment found');
    return;
  }
  
  var blob = attachment.copyBlob();
  var file = DriveApp.createFile(blob);
  var fileId = file.getId();
  
  var resource = { mimeType: MimeType.GOOGLE_SHEETS };
  var convertedFile = Drive.Files.copy(resource, fileId);
  
  var tempSheet = SpreadsheetApp.openById(convertedFile.id).getSheets()[0];
  var data = tempSheet.getDataRange().getValues();
  
  var reportDate = new Date().toLocaleDateString();
  if (data.length > 3 && data[3][0]) {
    var dateStr = data[3][0].toString();
    if (dateStr.includes('Report Date:')) {
      reportDate = dateStr.replace('Report Date:', '').trim();
    }
  }
  
  processScheduledData(data, reportDate);
  
  DriveApp.getFileById(fileId).setTrashed(true);
  DriveApp.getFileById(convertedFile.id).setTrashed(true);
  
  Logger.log('Scheduled Today processed');
}

function processScheduledData(data, reportDate) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(CONFIG.SCHEDULED_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SCHEDULED_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([[
      'Date', 'Location', 'Employee', 'Sch Start', 'Sch End'
    ]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  var currentLocation = '';
  var previousEmployeeName = '';
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    
    if (row[0] && row[0].toString().trim() !== '' && 
        (!row[1] || row[1].toString().trim() === '') &&
        (!row[2] || row[2].toString().trim() === '') &&
        row[5] !== undefined) {
      var locationName = row[0].toString().trim();
      if (locationName !== 'Location: More than 5 selected' && 
          !locationName.includes('Report') &&
          locationName !== 'Grand Total' &&
          !locationName.includes('Grand Total')) {
        currentLocation = locationName;
        previousEmployeeName = '';
      }
      continue;
    }
    
    var employeeName = row[2] ? row[2].toString().trim() : '';
    if (employeeName && employeeName !== '' && employeeName !== 'Date') {
      previousEmployeeName = employeeName;
      continue;
    }
    
    var dateCell = row[4] ? row[4].toString() : '';
    var schStart = row[17];
    var schEnd = row[18];
    
    if (previousEmployeeName && dateCell && dateCell.includes('2025') && schStart && schEnd) {
      var formattedStart = formatScheduledTime(schStart);
      var formattedEnd = formatScheduledTime(schEnd);
      
      if (formattedStart && formattedEnd && currentLocation) {
        sheet.appendRow([
          reportDate,
          currentLocation,
          previousEmployeeName,
          formattedStart,
          formattedEnd
        ]);
      }
      
      previousEmployeeName = '';
    }
  }
  
  Logger.log('Scheduled data processed');
}

function formatScheduledTime(timeValue) {
  if (!timeValue) return '';
  
  try {
    var hours, minutes;
    
    if (timeValue instanceof Date) {
      var formattedTime = Utilities.formatDate(timeValue, Session.getScriptTimeZone(), 'HH:mm');
      var timeComponents = formattedTime.split(':');
      hours = parseInt(timeComponents[0]);
      minutes = parseInt(timeComponents[1]);
    } else {
      var timeStr = timeValue.toString();
      if (timeStr.includes(' ') && timeStr.includes(':')) {
        var parts = timeStr.split(' ');
        if (parts.length >= 2) {
          var timePart = parts[1];
          var timeComponents = timePart.split(':');
          hours = parseInt(timeComponents[0]);
          minutes = parseInt(timeComponents[1]);
        }
      } else {
        return '';
      }
    }
    
    var period = hours >= 12 ? 'PM' : 'AM';
    var displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    var displayMinutes = minutes < 10 ? '0' + minutes : minutes;
    
    return displayHours + ':' + displayMinutes + ' ' + period;
  } catch (e) {
    Logger.log('Error formatting time: ' + e);
    return '';
  }
}

// ============================================================================
// 4. LABOR REPORT (Auto-clockouts & Call-offs)
// ============================================================================

function processLaborReport() {
  var threads = GmailApp.search(CONFIG.LABOR_SEARCH_QUERY, 0, 1);
  
  if (threads.length === 0) {
    Logger.log('No labor report found');
    return;
  }
  
  var messages = threads[0].getMessages();
  var latestMessage = messages[messages.length - 1];
  var attachments = latestMessage.getAttachments();
  
  for (var i = 0; i < attachments.length; i++) {
    var fileName = attachments[i].getName();
    if (fileName.includes('Labor Actual vs Scheduled') && fileName.endsWith('.xlsx')) {
      processLaborAttachment(attachments[i], latestMessage.getDate());
    }
  }
  
  Logger.log('Labor report processed');
}

function processLaborAttachment(attachment, emailDate) {
  var blob = attachment.copyBlob();
  var tempFile = DriveApp.createFile(blob);
  var tempFileId = tempFile.getId();
  
  var resource = { mimeType: MimeType.GOOGLE_SHEETS };
  var convertedFile = Drive.Files.copy(resource, tempFileId);
  var tempSheet = SpreadsheetApp.openById(convertedFile.id);
  var sheet = tempSheet.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  
  DriveApp.getFileById(tempFileId).setTrashed(true);
  DriveApp.getFileById(convertedFile.id).setTrashed(true);
  
  processLaborData(data, emailDate);
}

function processLaborData(data, emailDate) {
  var spreadsheet = SpreadsheetApp.openById(CONFIG.LABOR_SPREADSHEET_ID);
  
  var reportDateObj = new Date(emailDate);
  reportDateObj.setDate(reportDateObj.getDate() - 1);
  
  var month = String(reportDateObj.getMonth() + 1).padStart(2, '0');
  var day = String(reportDateObj.getDate()).padStart(2, '0');
  var year = reportDateObj.getFullYear();
  var reportDate = month + '/' + day + '/' + year;
  
  var currentLocation = '';
  var autoClockouts = [];
  var callOffs = [];
  var employeeData = {};
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    
    if (row[0] && typeof row[0] === 'string' && row[0].trim() !== '' && 
        !row[0].includes('Labor Actual') && 
        !row[0].includes('Show All') &&
        !row[0].includes('Date') &&
        row[4] !== 'Date' &&
        row[5] && !isNaN(parseFloat(row[5]))) {
      
      currentLocation = row[0].trim();
      continue;
    }
    
    if (!row[0] && !row[1] && row[2] && typeof row[2] === 'string' && row[2].trim() !== '') {
      var employeeName = row[2].trim();
      
      if (employeeName.includes('Date') || employeeName === 'Employee') {
        continue;
      }
      
      var empKey = currentLocation + '|' + employeeName;
      
      if (!employeeData[empKey]) {
        employeeData[empKey] = {
          location: currentLocation,
          employee: employeeName,
          actualHrs: 0,
          schedHrs: 0,
          hasPunchData: false,
          schedStart: null,
          schedEnd: null,
          actStart: null,
          actEnd: null,
          allPunches: []
        };
      }
      
      for (var j = i + 1; j < Math.min(i + 5, data.length); j++) {
        var detailRow = data[j];
        
        if (detailRow[2] && typeof detailRow[2] === 'string' && detailRow[2].trim() !== '') {
          break;
        }
        
        if (detailRow[4] && detailRow[4] instanceof Date) {
          var actualHrs = parseFloat(detailRow[5]) || 0;
          var schedHrs = parseFloat(detailRow[6]) || 0;
          var actStart = detailRow[15];
          var actEnd = detailRow[16];
          var schStart = detailRow[17];
          var schEnd = detailRow[18];
          
          employeeData[empKey].actualHrs += actualHrs;
          employeeData[empKey].schedHrs += schedHrs;
          
          if (schStart) {
            employeeData[empKey].schedStart = schStart;
            employeeData[empKey].schedEnd = schEnd;
          }
          
          if (actStart || actualHrs > 0) {
            employeeData[empKey].hasPunchData = true;
            
            if (actStart) employeeData[empKey].actStart = actStart;
            if (actEnd) employeeData[empKey].actEnd = actEnd;
            
            if (actStart && actEnd) {
              employeeData[empKey].allPunches.push({
                clockIn: formatLaborTime(actStart),
                clockOut: formatLaborTime(actEnd)
              });
            }
          }
        }
      }
    }
  }
  
  for (var empKey in employeeData) {
    var emp = employeeData[empKey];
    
    if (emp.schedHrs > 0 && emp.actualHrs === 0 && !emp.hasPunchData) {
      var schedTime = formatLaborScheduledTime(emp.schedStart, emp.schedEnd);
      callOffs.push({
        location: emp.location,
        employee: emp.employee,
        scheduledTime: schedTime
      });
    }
    
    for (var p = 0; p < emp.allPunches.length; p++) {
      if (emp.allPunches[p].clockOut === CONFIG.AUTO_CLOCKOUT_TIME) {
        autoClockouts.push({
          location: emp.location,
          employee: emp.employee,
          clockIn: emp.allPunches[p].clockIn,
          clockOut: emp.allPunches[p].clockOut
        });
      }
    }
  }
  
  if (autoClockouts.length > 0) {
    saveLaborAutoClockouts(spreadsheet, autoClockouts, reportDate);
  }
  
  if (callOffs.length > 0) {
    saveLaborCallOffs(spreadsheet, callOffs, reportDate);
  }
  
  Logger.log('Labor: ' + callOffs.length + ' call-offs, ' + autoClockouts.length + ' auto-clockouts');
}

function formatLaborTime(timeValue) {
  if (!timeValue) return '';
  
  if (timeValue instanceof Date) {
    return Utilities.formatDate(timeValue, 'America/Chicago', 'h:mm a');
  }
  
  return String(timeValue);
}

function formatLaborScheduledTime(start, end) {
  if (!start || !end) return 'Unknown';
  
  var startStr = formatLaborTime(start);
  var endStr = formatLaborTime(end);
  
  return startStr + ' - ' + endStr;
}

function saveLaborAutoClockouts(spreadsheet, clockouts, reportDate) {
  var sheet = spreadsheet.getSheetByName(CONFIG.AUTO_CLOCKOUT_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.AUTO_CLOCKOUT_SHEET);
    sheet.getRange(1, 1, 1, 6).setValues([['Report Date', 'Location', 'Employee', 'Clock In', 'Clock Out', 'Status']]);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  for (var i = 0; i < clockouts.length; i++) {
    sheet.appendRow([
      reportDate,
      clockouts[i].location,
      clockouts[i].employee,
      clockouts[i].clockIn,
      clockouts[i].clockOut,
      'Needs Fix'
    ]);
  }
  
  cleanLaborOldData(sheet);
}

function saveLaborCallOffs(spreadsheet, callOffs, reportDate) {
  var sheet = spreadsheet.getSheetByName(CONFIG.CALL_OFFS_SHEET);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.CALL_OFFS_SHEET);
    sheet.getRange(1, 1, 1, 4).setValues([['Report Date', 'Location', 'Employee', 'Scheduled Time']]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  
  for (var i = 0; i < callOffs.length; i++) {
    sheet.appendRow([
      reportDate,
      callOffs[i].location,
      callOffs[i].employee,
      callOffs[i].scheduledTime
    ]);
  }
  
  cleanLaborOldData(sheet);
}

function cleanLaborOldData(sheet) {
  var data = sheet.getDataRange().getValues();
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.DAYS_TO_KEEP);
  
  for (var i = data.length - 1; i > 0; i--) {
    var rowDate = new Date(data[i][0]);
    if (rowDate < cutoffDate) {
      sheet.deleteRow(i + 1);
    }
  }
}

// ============================================================================
// SHARED UTILITIES
// ============================================================================

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

// ============================================================================
// TRIGGER SETUP
// ============================================================================

function setupDailyTrigger() {
  // Delete ALL existing triggers in this project
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    ScriptApp.deleteTrigger(triggers[i]);
  }
  
  // Create ONE trigger for the main orchestrator function
  ScriptApp.newTrigger('processAllR365Reports')
    .timeBased()
    .atHour(6)
    .nearMinute(30)
    .everyDays(1)
    .create();
  
  Logger.log('✓ Daily trigger created for 6:30 AM');
  Logger.log('✓ Trigger calls: processAllR365Reports()');
  Logger.log('✓ All 4 reports will be processed automatically');
}

// ============================================================================
// MANUAL TEST FUNCTIONS
// ============================================================================

function testAll() {
  Logger.log('=== MANUAL TEST - ALL REPORTS ===');
  processAllR365Reports();
}

function testWeeklySales() {
  Logger.log('=== Testing Weekly Sales ===');
  var today = new Date().getDay();
  if (today === 1) {
    processWeeklySalesPreviousWeek();
  } else {
    processWeeklySalesCurrentWeek();
  }
}

function testFlash() {
  Logger.log('=== Testing Flash Report ===');
  processFlashReport();
}

function testScheduled() {
  Logger.log('=== Testing Scheduled Today ===');
  processScheduledToday();
}

function testLabor() {
  Logger.log('=== Testing Labor Report ===');
  processLaborReport();
}
