import formidable from 'formidable';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ADMIN_PIN = '9999';
const MONGODB_URI = process.env.MONGODB_URI;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // Verify admin PIN
    const adminPin = Array.isArray(fields.adminPin) ? fields.adminPin[0] : fields.adminPin;
    if (adminPin !== ADMIN_PIN) {
      return res.status(401).json({ error: 'Invalid admin PIN' });
    }

    // Get uploaded file
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read Excel file
    const workbook = XLSX.readFile(file.filepath);
    
    console.log(`Processing workbook with ${workbook.SheetNames.length} sheets`);
    
    let allLocationData = {};
    let periodDate = '';
    let processedCount = 0;

    // Process each sheet (each sheet is one location)
    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

        // Extract location name from sheet name or Row 2
        // Remove 3-digit code and dash (e.g., "201 - Carrollton" -> "Carrollton")
        const locationRow = data[1]; // Row 2
        const locationFull = locationRow && locationRow[0] ? locationRow[0].toString() : sheetName;
        
        let locationName = locationFull;
        // Remove pattern like "201 - " or "209 - "
        if (locationFull.match(/^\d{3}\s*-\s*/)) {
          locationName = locationFull.replace(/^\d{3}\s*-\s*/, '').trim();
        }
        // Also try splitting on " - " and taking the part after
        else if (locationFull.includes(' - ')) {
          const parts = locationFull.split(' - ');
          locationName = parts[parts.length - 1].trim();
        }
        
        // Get period date from Row 3
        if (!periodDate) {
          const periodRow = data[2];
          periodDate = periodRow && periodRow[0] ? periodRow[0].toString() : '';
        }

        console.log(`  Processing: ${locationName}`);

        // Helper function to get cell value
        const getVal = (rowIndex, colIndex) => {
          if (!data[rowIndex] || data[rowIndex][colIndex] === null || data[rowIndex][colIndex] === undefined) {
            return 0;
          }
          const val = data[rowIndex][colIndex];
          if (typeof val === 'string' && val.includes('IFERROR')) {
            return 0; // Skip formula cells
          }
          return typeof val === 'number' ? val : 0;
        };

        // Helper to calculate percentage
        const calcPercent = (value, totalSales) => {
          return totalSales !== 0 ? value / totalSales : 0;
        };

        // Get Total Sales (Row 143, Column B for Period)
        const totalSales = getVal(142, 1); // Row 143, Col B (0-indexed: row 142, col 1)

        // Build P&L structure with condensed categories
        const plData = {};

        // ========== SALES ==========
        plData['Sales'] = {
          'Net Sales': {
            value: getVal(13, 1), // Total Sales (Row 14)
            percent: calcPercent(getVal(13, 1), totalSales)
          },
          'Comps & Discounts': {
            value: getVal(11, 1), // Total Comps & Discounts (Row 12)
            percent: calcPercent(getVal(11, 1), totalSales)
          }
        };

        // ========== PRIME COST ==========
        plData['Prime Cost'] = {
          'Food & Paper Cost': {
            value: getVal(25, 1), // Total Food and Paper Cost (Row 26)
            percent: calcPercent(getVal(25, 1), totalSales)
          },
          'Manager Wages': {
            value: getVal(27, 1), // Manager Wages (Row 28 - already a sum)
            percent: calcPercent(getVal(27, 1), totalSales)
          },
          'Hourly Wages': {
            value: getVal(31, 1), // Hourly Wages (Row 32)
            percent: calcPercent(getVal(31, 1), totalSales)
          },
          'Training Wages': {
            value: getVal(32, 1), // Training Wages (Row 33)
            percent: calcPercent(getVal(32, 1), totalSales)
          },
          'Employee Bonuses': {
            value: getVal(33, 1), // Employee Bonuses (Row 34)
            percent: calcPercent(getVal(33, 1), totalSales)
          },
          'Payroll Taxes & Benefits': {
            value: getVal(41, 1) + getVal(49, 1), // Total Payroll Taxes (Row 42) + Total Payroll Benefits (Row 50)
            percent: calcPercent(getVal(41, 1) + getVal(49, 1), totalSales)
          },
          'Total Prime Cost': {
            value: getVal(50, 1), // Total Prime Cost (Row 51)
            percent: calcPercent(getVal(50, 1), totalSales)
          }
        };

        // ========== OPERATING EXPENSE ==========
        plData['Operating Expense'] = {
          'Direct Operating Expense': {
            value: getVal(73, 1), // Total Direct Operating Expense (Row 74)
            percent: calcPercent(getVal(73, 1), totalSales)
          },
          'Utilities': {
            value: getVal(80, 1), // Total Utilities (Row 81)
            percent: calcPercent(getVal(80, 1), totalSales)
          },
          'Advertising': {
            value: getVal(93, 1), // Total Advertising (Row 94)
            percent: calcPercent(getVal(93, 1), totalSales)
          },
          'General & Administrative': {
            value: getVal(122, 1), // Total General and Administrative (Row 123)
            percent: calcPercent(getVal(122, 1), totalSales)
          },
          'Total Operating Expense': {
            value: getVal(124, 1), // Total Operating Expense (Row 125)
            percent: calcPercent(getVal(124, 1), totalSales)
          }
        };

        // ========== NON CONTROLLABLE EXPENSE ==========
        plData['Non Controllable Expense'] = {
          'Occupancy Costs': {
            value: getVal(131, 1), // Total Occupancy Costs (Row 132)
            percent: calcPercent(getVal(131, 1), totalSales)
          },
          'Depreciation & Amortization': {
            value: getVal(139, 1), // Total Depreciation and Amortization (Row 140)
            percent: calcPercent(getVal(139, 1), totalSales)
          },
          'Total Non Controllable Expense': {
            value: getVal(140, 1), // Total Non Controllable Expense (Row 141)
            percent: calcPercent(getVal(140, 1), totalSales)
          }
        };

        // ========== NET PROFIT ==========
        plData['Net Profit'] = {
          'Net Profit': {
            value: getVal(141, 1), // Net Profit (Row 142)
            percent: calcPercent(getVal(141, 1), totalSales)
          }
        };

        // Add to collection
        allLocationData[locationName] = plData;
        processedCount++;

      } catch (error) {
        console.error(`Error processing sheet ${sheetName}:`, error);
        // Continue processing other sheets
      }
    }

    // Save to MongoDB
    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db();
    
    // Store as a single document with all locations
    await db.collection('pl_data').updateOne(
      { _id: 'current' },
      { 
        $set: { 
          data: allLocationData,
          periodDate: periodDate,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    await client.close();

    return res.status(200).json({
      success: true,
      message: 'P&L data updated successfully',
      periodDate: periodDate,
      locationCount: processedCount,
      locations: Object.keys(allLocationData).sort()
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message || 'Failed to process file' });
  }
}
