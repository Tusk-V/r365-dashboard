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

  // Map request types to sheet names
  const sheetNames = {
    sales: 'Weekly Sales Data',
    flash: 'Flash Report Data',
    scheduled: 'Scheduled Today',
    labor: 'Labor Report'
  };

  const sheetName = sheetNames[type];

  if (!sheetName) {
    return res.status(400).json({ 
      error: 'Invalid type',
      message: 'Type must be one of: sales, flash, scheduled, labor'
    });
  }

  try {
    // Fetch data from Google Sheets API
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
