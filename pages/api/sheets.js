// pages/api/sheets.js
// This API route fetches data from your Google Sheets

export default async function handler(req, res) {
  // Get the type of data requested (sales, flash, scheduled, labor)
  const { type } = req.query;

  // Your Google Sheets configuration
  const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID || '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ 
      error: 'Google Sheets API key not configured',
      message: 'Please set GOOGLE_SHEETS_API_KEY in your environment variables'
    });
  }

  // Map request types to sheet names (matching your actual Google Sheet tabs)
  const sheetNames = {
    sales: 'weekly sales data',
    flash: 'flash report data',
    scheduled: 'scheduled today',
    labor: 'auto-clockouts'  // Primary labor sheet
  };

  const sheetName = sheetNames[type];

  if (!sheetName) {
    return res.status(400).json({ 
      error: 'Invalid type',
      message: 'Type must be one of: sales, flash, scheduled, labor'
    });
  }

  try {
    // For labor, we need to fetch both auto-clockouts and call-offs
    if (type === 'labor') {
      const autoClockoutsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('auto-clockouts')}?key=${API_KEY}`;
      const callOffsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent('call-offs')}?key=${API_KEY}`;
      
      const [autoClockoutsResponse, callOffsResponse] = await Promise.all([
        fetch(autoClockoutsUrl),
        fetch(callOffsUrl)
      ]);

      if (!autoClockoutsResponse.ok || !callOffsResponse.ok) {
        const errorData = !autoClockoutsResponse.ok ? await autoClockoutsResponse.json() : await callOffsResponse.json();
        console.error('Google Sheets API Error:', errorData);
        
        return res.status(autoClockoutsResponse.status || callOffsResponse.status).json({
          error: 'Failed to fetch labor data',
          details: errorData.error?.message || 'Unknown error'
        });
      }

      const autoClockoutsData = await autoClockoutsResponse.json();
      const callOffsData = await callOffsResponse.json();

      // Combine both sheets
      const combinedData = [];
      
      // Add auto-clockouts data
      if (autoClockoutsData.values && autoClockoutsData.values.length > 0) {
        combinedData.push(autoClockoutsData.values[0]); // Header
        autoClockoutsData.values.slice(1).forEach(row => {
          combinedData.push([...row, 'Auto-Clockout']); // Add type column
        });
      }
      
      // Add call-offs data
      if (callOffsData.values && callOffsData.values.length > 1) {
        callOffsData.values.slice(1).forEach(row => {
          combinedData.push([...row, 'Call-Off']); // Add type column
        });
      }

      return res.status(200).json({
        data: combinedData,
        sheetName: 'Labor Data (Combined)'
      });
    }

    // For non-labor sheets, fetch normally
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
    
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google Sheets API Error:', errorData);
      
      if (response.status === 403) {
        return res.status(403).json({
          error: 'Permission denied',
          message: 'Make sure your Google Sheet is shared with "Anyone with the link" as Viewer'
        });
      }

      return res.status(response.status).json({
        error: 'Failed to fetch from Google Sheets',
        details: errorData.error?.message || 'Unknown error'
      });
    }

    const data = await response.json();

    // Return the values from the sheet
    return res.status(200).json({
      data: data.values || [],
      sheetName: sheetName
    });

  } catch (error) {
    console.error('Error fetching sheet data:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}
