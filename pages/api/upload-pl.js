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

    // Read Excel file - use data_only to get raw values
    const workbook = XLSX.readFile(file.filepath);
    
    console.log(`Processing workbook with ${workbook.SheetNames.length} sheets`);
    
    let allLocationData = {};
    let periodDate = '';
    let processedCount = 0;

    // Process each sheet (each sheet is one location)
    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        
        // Get the range
        const range = XLSX.utils.decode_range(sheet['!ref']);
        
        // Build data array by reading cell values directly
        const data = [];
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const row = [];
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellAddress];
            
            // Get the cell value (not formula)
            if (cell && cell.v !== undefined) {
              row.push(cell.v);
            } else {
              row.push(null);
            }
          }
          data.push(row);
        }

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
          // Parse numbers from strings or return number directly
          if (typeof val === 'number') {
            return val;
          }
          if (typeof val === 'string') {
            // Try to parse as number, return 0 if it fails
            const parsed = parseFloat(val.replace(/[^0-9.-]/g, ''));
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        // Helper to calculate percentage
        const calcPercent = (value, totalSales) => {
          return totalSales !== 0 ? value / totalSales : 0;
        };

        // Build P&L structure with manual calculations
        const plData = {};

        // ========== SALES ==========
        const comps = getVal(9, 1) + getVal(10, 1) + getVal(11, 1); // Sum of Comps & Discounts rows
        const totalSales = getVal(7, 1) + comps + getVal(13, 1); // Food Sales + Comps + Refunds
        
        plData['Sales'] = {
          'Net Sales': {
            value: totalSales,
            percent: calcPercent(totalSales, totalSales)
          },
          'Comps & Discounts': {
            value: comps,
            percent: calcPercent(comps, totalSales)
          }
        };

        // ========== PRIME COST ==========
        // Food & Paper Cost = sum of rows 17-25
        const foodPaperCost = getVal(17, 1) + getVal(18, 1) + getVal(19, 1) + getVal(20, 1) + 
                             getVal(21, 1) + getVal(22, 1) + getVal(23, 1) + getVal(24, 1) + getVal(25, 1);
        
        // Manager Wages = sum of rows 29-31
        const managerWages = getVal(29, 1) + getVal(30, 1) + getVal(31, 1);
        
        // Total Salaries = Manager Wages + Hourly + Training + Bonuses
        const totalSalaries = managerWages + getVal(32, 1) + getVal(33, 1) + getVal(34, 1);
        
        // Payroll Taxes = sum of rows 37-41
        const payrollTaxes = getVal(37, 1) + getVal(38, 1) + getVal(39, 1) + getVal(40, 1) + getVal(41, 1);
        
        // Payroll Benefits = sum of rows 44-49
        const payrollBenefits = getVal(44, 1) + getVal(45, 1) + getVal(46, 1) + getVal(47, 1) + getVal(48, 1) + getVal(49, 1);
        
        // Total Prime Cost
        const totalPrimeCost = foodPaperCost + totalSalaries + payrollTaxes + payrollBenefits;
        
        plData['Prime Cost'] = {
          'Food & Paper Cost': {
            value: foodPaperCost,
            percent: calcPercent(foodPaperCost, totalSales)
          },
          'Manager Wages': {
            value: managerWages,
            percent: calcPercent(managerWages, totalSales)
          },
          'Hourly Wages': {
            value: getVal(32, 1),
            percent: calcPercent(getVal(32, 1), totalSales)
          },
          'Training Wages': {
            value: getVal(33, 1),
            percent: calcPercent(getVal(33, 1), totalSales)
          },
          'Employee Bonuses': {
            value: getVal(34, 1),
            percent: calcPercent(getVal(34, 1), totalSales)
          },
          'Payroll Taxes & Benefits': {
            value: payrollTaxes + payrollBenefits,
            percent: calcPercent(payrollTaxes + payrollBenefits, totalSales)
          },
          'Total Prime Cost': {
            value: totalPrimeCost,
            percent: calcPercent(totalPrimeCost, totalSales)
          }
        };

        // ========== OPERATING EXPENSE ==========
        // Direct Operating = sum of rows 54-73
        const directOps = getVal(54, 1) + getVal(55, 1) + getVal(56, 1) + getVal(57, 1) + getVal(58, 1) + 
                         getVal(59, 1) + getVal(60, 1) + getVal(62, 1) + getVal(63, 1) + getVal(64, 1) + 
                         getVal(65, 1) + getVal(66, 1) + getVal(67, 1) + getVal(68, 1) + getVal(69, 1) + 
                         getVal(70, 1) + getVal(71, 1) + getVal(72, 1) + getVal(73, 1);
        
        // Utilities = sum of rows 76-80
        const utilities = getVal(76, 1) + getVal(77, 1) + getVal(78, 1) + getVal(79, 1) + getVal(80, 1);
        
        // Advertising = sum of rows 83-93
        const advertising = getVal(83, 1) + getVal(84, 1) + getVal(85, 1) + getVal(86, 1) + getVal(87, 1) + 
                           getVal(88, 1) + getVal(89, 1) + getVal(90, 1) + getVal(91, 1) + getVal(92, 1) + getVal(93, 1);
        
        // G&A Market Manager Benefits = sum of rows 98-105
        const mmBenefits = getVal(98, 1) + getVal(99, 1) + getVal(100, 1) + getVal(101, 1) + 
                          getVal(102, 1) + getVal(103, 1) + getVal(104, 1) + getVal(105, 1);
        
        // General & Admin = sum of rows 96, 97, 106-122
        const generalAdmin = getVal(96, 1) + mmBenefits + getVal(106, 1) + getVal(107, 1) + getVal(108, 1) + 
                            getVal(109, 1) + getVal(110, 1) + getVal(111, 1) + getVal(112, 1) + getVal(113, 1) + 
                            getVal(114, 1) + getVal(115, 1) + getVal(116, 1) + getVal(117, 1) + getVal(118, 1) + 
                            getVal(119, 1) + getVal(120, 1) + getVal(121, 1) + getVal(122, 1);
        
        const totalOpEx = directOps + utilities + advertising + generalAdmin + getVal(124, 1);
        
        plData['Operating Expense'] = {
          'Direct Operating Expense': {
            value: directOps,
            percent: calcPercent(directOps, totalSales)
          },
          'Utilities': {
            value: utilities,
            percent: calcPercent(utilities, totalSales)
          },
          'Advertising': {
            value: advertising,
            percent: calcPercent(advertising, totalSales)
          },
          'General & Administrative': {
            value: generalAdmin,
            percent: calcPercent(generalAdmin, totalSales)
          },
          'Total Operating Expense': {
            value: totalOpEx,
            percent: calcPercent(totalOpEx, totalSales)
          }
        };

        // ========== NON CONTROLLABLE EXPENSE ==========
        // Occupancy = sum of rows 128-131
        const occupancy = getVal(128, 1) + getVal(129, 1) + getVal(130, 1) + getVal(131, 1);
        
        // Depreciation = sum of rows 134-139
        const depreciation = getVal(134, 1) + getVal(135, 1) + getVal(136, 1) + getVal(137, 1) + getVal(138, 1) + getVal(139, 1);
        
        const totalNonControl = occupancy + depreciation;
        
        plData['Non Controllable Expense'] = {
          'Occupancy Costs': {
            value: occupancy,
            percent: calcPercent(occupancy, totalSales)
          },
          'Depreciation & Amortization': {
            value: depreciation,
            percent: calcPercent(depreciation, totalSales)
          },
          'Total Non Controllable Expense': {
            value: totalNonControl,
            percent: calcPercent(totalNonControl, totalSales)
          }
        };

        // ========== NET PROFIT ==========
        const netProfit = totalSales - totalPrimeCost - totalOpEx - totalNonControl;
        
        plData['Net Profit'] = {
          'Net Profit': {
            value: netProfit,
            percent: calcPercent(netProfit, totalSales)
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
