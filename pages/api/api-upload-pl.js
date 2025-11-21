// pages/api/upload-pl.js
// API endpoint to handle P&L Excel file uploads

import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Admin PIN - CHANGE THIS TO SOMETHING SECURE!
const ADMIN_PIN = '9999';

const parseExcelToPLData = async (filePath) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const worksheet = workbook.getWorksheet('Profit and Loss Details');
  if (!worksheet) {
    throw new Error('Sheet "Profit and Loss Details" not found');
  }

  // Extract locations from row 5 (Excel row 5 = index 4 in 0-based)
  const headerRow = worksheet.getRow(5);
  const locations = [];
  const locationColumns = {};
  
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value && 
        typeof cell.value === 'string' && 
        cell.value !== '-' &&
        !['Corporate Over', 'Other', 'Total'].includes(cell.value)) {
      locations.push(cell.value);
      locationColumns[cell.value] = colNumber;
    }
  });

  console.log(`Found ${locations.length} locations:`, locations);

  // Extract P&L data
  const plData = {};

  for (const location of locations) {
    const colIdx = locationColumns[location];
    const locationData = {};
    let currentCategory = null;

    // Start from row 8 (Sales category)
    for (let rowNum = 8; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      const label = row.getCell(1).value;
      const value = row.getCell(colIdx).value;
      const percent = row.getCell(colIdx + 1).value;

      if (!label) continue;

      const labelStr = String(label).trim();
      
      // Skip district manager expenses
      if (labelStr.toLowerCase().includes('district manager')) {
        continue;
      }

      // Check if this is a category header
      if (!value && labelStr !== '-') {
        currentCategory = labelStr;
        if (!locationData[currentCategory]) {
          locationData[currentCategory] = {};
        }
      } else if (labelStr !== '-' && value !== null && value !== undefined) {
        // This is a line item
        if (currentCategory) {
          locationData[currentCategory][labelStr] = {
            value: typeof value === 'number' ? value : 0,
            percent: typeof percent === 'number' ? percent : 0
          };
        }
      }
    }

    plData[location] = locationData;
  }

  // Extract period ending date from row 3
  const periodRow = worksheet.getRow(3);
  const periodText = periodRow.getCell(1).value;
  let periodDate = 'Unknown';
  if (periodText && typeof periodText === 'string') {
    const match = periodText.match(/Period Ending (\d{1,2}\/\d{1,2}\/\d{4})/);
    if (match) {
      periodDate = match[1];
    }
  }

  return { plData, periodDate };
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const form = formidable({
    maxFileSize: 10 * 1024 * 1024, // 10MB
  });

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // Verify admin PIN
    const providedPin = Array.isArray(fields.adminPin) ? fields.adminPin[0] : fields.adminPin;
    if (providedPin !== ADMIN_PIN) {
      return res.status(401).json({ error: 'Invalid admin PIN' });
    }

    // Get the uploaded file
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse the Excel file
    const { plData, periodDate } = await parseExcelToPLData(uploadedFile.filepath);

    // Save to public/pl_data.json
    const publicDir = path.join(process.cwd(), 'public');
    const outputPath = path.join(publicDir, 'pl_data.json');
    
    // Backup existing file
    if (fs.existsSync(outputPath)) {
      const backupPath = path.join(publicDir, `pl_data_backup_${Date.now()}.json`);
      fs.copyFileSync(outputPath, backupPath);
    }

    // Write new file
    fs.writeFileSync(outputPath, JSON.stringify(plData, null, 2));

    // Clean up uploaded file
    fs.unlinkSync(uploadedFile.filepath);

    return res.status(200).json({
      success: true,
      message: 'P&L data updated successfully',
      periodDate,
      locationCount: Object.keys(plData).length
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: 'Failed to process file', 
      details: error.message 
    });
  }
}
