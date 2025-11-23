// pages/api/upload-pl.js
import formidable from 'formidable';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';

export const config = {
  api: {
    bodyParser: false,
  },
};

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

        // Extract location name from sheet name
        // Remove 3-digit code and dash (e.g., "201 - Carrollton" -> "Carrollton")
        let locationName = sheetName.replace(/^\d{3}\s*-\s*/, '').trim();
        
        // Get period date from Row 1
        if (!periodDate && data[0] && data[0][0]) {
          periodDate = data[0][0].toString();
        }

        // Extract all P&L line items
        // Row numbers are Excel row numbers (1-indexed)
        const extractValue = (row, col = 1) => {
          const val = data[row - 1]?.[col];
          if (val === null || val === undefined || val === '') return 0;
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const parsed = parseFloat(val.replace(/[$,()]/g, '').trim());
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        const locationData = {
          location: locationName,
          period: periodDate,
          data: {
            // Sales
            compsDiscounts: extractValue(12),
            netSales: extractValue(14),
            
            // Cost of Goods
            foodPaperCost: extractValue(26),
            
            // Labor
            managerWages: extractValue(28),
            hourlyWages: extractValue(32),
            trainingWages: extractValue(33),
            employeeBonuses: extractValue(34),
            payrollTaxes: extractValue(42),
            payrollBenefits: extractValue(50),
            primeCost: extractValue(51),
            
            // Operating Expenses
            directOperating: extractValue(74),
            utilities: extractValue(81),
            advertising: extractValue(94),
            generalAdmin: extractValue(123),
            totalOperating: extractValue(125),
            
            // Non-Controllable
            occupancyCosts: extractValue(132),
            depreciation: extractValue(140),
            totalNonControllable: extractValue(141),
            
            // Bottom Line
            netProfit: extractValue(142),
            totalSales: extractValue(143)
          }
        };

        allLocationData[locationName] = locationData;
        processedCount++;

      } catch (error) {
        console.error(`Error processing sheet ${sheetName}:`, error);
      }
    }

    if (processedCount === 0) {
      return res.status(400).json({ error: 'No valid location data found in file' });
    }

    // Connect to MongoDB and save data
    const client = new MongoClient(MONGODB_URI);
    
    try {
      await client.connect();
      const database = client.db('planalytics');
      const collection = database.collection('pl_data');

      // Delete existing data and insert new
      await collection.deleteMany({});
      
      // Insert all location data
      const insertData = Object.values(allLocationData).map(loc => ({
        location: loc.location,
        period: loc.period,
        data: loc.data,
        uploadedAt: new Date()
      }));

      await collection.insertMany(insertData);

      console.log(`Successfully processed ${processedCount} locations`);

      return res.status(200).json({
        success: true,
        message: `Successfully uploaded P&L data for ${processedCount} locations`,
        period: periodDate,
        locations: processedCount
      });

    } finally {
      await client.close();
    }

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      error: 'Failed to process file',
      details: error.message
    });
  }
}
