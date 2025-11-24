import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import formidable from 'formidable';
import fs from 'fs';
import * as XLSX from 'xlsx';
import clientPromise from '../../lib/mongodb';

export const config = {
  api: {
    bodyParser: false,
  },
};

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (session.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const form = formidable({ multiples: true });
    
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const uploadedFile = files.file?.[0] || files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileBuffer = fs.readFileSync(uploadedFile.filepath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellFormula: false });

    const results = [];
    const client = await clientPromise;
    const db = client.db('andysdashboard');

    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const plData = parseSheet(sheet, sheetName);
        
        if (plData) {
          // Upsert the data
          await db.collection('pl_data').updateOne(
            { location: plData.location, periodEnding: plData.periodEnding },
            { 
              $set: {
                ...plData,
                uploadedAt: new Date(),
                uploadedBy: session.user.email
              }
            },
            { upsert: true }
          );
          
          results.push({
            location: plData.location,
            periodEnding: plData.periodEnding,
            status: 'success'
          });
        }
      } catch (sheetError) {
        results.push({
          location: sheetName,
          status: 'error',
          error: sheetError.message
        });
      }
    }

    fs.unlinkSync(uploadedFile.filepath);

    return res.status(200).json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function parseSheet(sheet, sheetName) {
  // Get cell value helper
  const getCellValue = (cellRef) => {
    const cell = sheet[cellRef];
    if (!cell) return null;
    return cell.v;
  };

  // Row 2: Location name (e.g., "201 - Carrollton")
  const locationCell = getCellValue('A2');
  if (!locationCell) return null;
  
  // Extract just the name part after the number
  const locationMatch = locationCell.match(/^\d+\s*-\s*(.+)$/);
  const location = locationMatch ? locationMatch[1].trim() : locationCell;
  
  // Row 3: Period ending date
  const periodCell = getCellValue('A3');
  let periodEnding = '';
  if (periodCell) {
    if (typeof periodCell === 'number') {
      // Excel date serial number
      const date = XLSX.SSF.parse_date_code(periodCell);
      periodEnding = `${date.m}/${date.d}/${date.y}`;
    } else {
      periodEnding = String(periodCell);
    }
  }

  // Parse all rows preserving structure
  const rows = [];
  let totalSales = { period: 0, ytd: 0 };
  
  // Find Total Sales first for percentage calculations
  for (let rowNum = 6; rowNum <= 150; rowNum++) {
    const label = getCellValue(`A${rowNum}`);
    if (label === 'Total Sales') {
      // Look for the row with actual values
      const nextRow = rowNum + 1;
      const nextLabel = getCellValue(`A${nextRow}`);
      if (nextLabel === 'Total Sales' || (getCellValue(`B${rowNum}`) !== null && getCellValue(`B${rowNum}`) !== 0)) {
        totalSales.period = parseFloat(getCellValue(`B${rowNum}`)) || 0;
        totalSales.ytd = parseFloat(getCellValue(`D${rowNum}`)) || 0;
        if (totalSales.period === 0) {
          totalSales.period = parseFloat(getCellValue(`B${nextRow}`)) || 0;
          totalSales.ytd = parseFloat(getCellValue(`D${nextRow}`)) || 0;
        }
      }
      break;
    }
  }

  // If we didn't find Total Sales inline, check the footer row 143
  if (totalSales.period === 0) {
    totalSales.period = parseFloat(getCellValue('B143')) || 0;
    totalSales.ytd = parseFloat(getCellValue('D143')) || 0;
  }

  // Now parse all rows
  for (let rowNum = 6; rowNum <= 142; rowNum++) {
    const label = getCellValue(`A${rowNum}`);
    if (!label) continue;

    const periodValue = getCellValue(`B${rowNum}`);
    const ytdValue = getCellValue(`D${rowNum}`);
    
    // Determine row type based on label
    const isSection = isSectionHeader(label);
    const isTotal = label.startsWith('Total ');
    const isSubHeader = isSubHeaderRow(label);
    
    // Calculate percentages
    let periodPercent = null;
    let ytdPercent = null;
    
    if (periodValue !== null && periodValue !== 0 && totalSales.period !== 0) {
      periodPercent = (parseFloat(periodValue) / totalSales.period) * 100;
    }
    if (ytdValue !== null && ytdValue !== 0 && totalSales.ytd !== 0) {
      ytdPercent = (parseFloat(ytdValue) / totalSales.ytd) * 100;
    }

    rows.push({
      rowNum,
      label: label.trim(),
      period: periodValue !== null ? parseFloat(periodValue) : null,
      periodPercent,
      ytd: ytdValue !== null ? parseFloat(ytdValue) : null,
      ytdPercent,
      isSection,
      isTotal,
      isSubHeader,
      indent: getIndentLevel(label, isSection, isTotal, isSubHeader)
    });
  }

  // Add Net Profit row
  const netProfitPeriod = getCellValue('B142');
  const netProfitYtd = getCellValue('D142');
  
  return {
    location,
    periodEnding,
    totalSales,
    rows
  };
}

function isSectionHeader(label) {
  const sections = [
    'Sales',
    'Prime Cost',
    'Operating Expense',
    'Non Controllable Expense'
  ];
  return sections.includes(label);
}

function isSubHeaderRow(label) {
  const subHeaders = [
    'Comps & Discounts',
    'Food and Paper Cost',
    'Salaries and Wages',
    'Manager Wages',
    'Payroll Taxes',
    'Payroll Benefits',
    'Direct Operating Expense',
    'Utilities',
    'Advertising',
    'General and Administrative',
    'Market Manager Benefits and Taxes',
    'MM Payroll Taxes',
    'Occupancy Costs',
    'Depreciation and Amortization'
  ];
  return subHeaders.includes(label);
}

function getIndentLevel(label, isSection, isTotal, isSubHeader) {
  if (isSection) return 0;
  if (isSubHeader) return 1;
  if (isTotal) return 1;
  return 2;
}
