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
    maxFileSize: 50 * 1024 * 1024,
  });

  try {
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    const adminPin = Array.isArray(fields.adminPin) ? fields.adminPin[0] : fields.adminPin;
    if (adminPin !== ADMIN_PIN) {
      return res.status(401).json({ error: 'Invalid admin PIN' });
    }

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = XLSX.readFile(file.filepath);
    
    let allLocationData = {};
    let periodDate = '';
    let processedCount = 0;

    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        
        const range = XLSX.utils.decode_range(sheet['!ref']);
        const data = [];
        for (let R = range.s.r; R <= range.e.r; ++R) {
          const row = [];
          for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellAddress];
            if (cell && cell.v !== undefined) {
              row.push(cell.v);
            } else {
              row.push(null);
            }
          }
          data.push(row);
        }

        const locationRow = data[1];
        const locationFull = locationRow && locationRow[0] ? locationRow[0].toString() : sheetName;
        
        let locationName = locationFull;
        if (locationFull.match(/^\d{3}\s*-\s*/)) {
          locationName = locationFull.replace(/^\d{3}\s*-\s*/, '').trim();
        } else if (locationFull.includes(' - ')) {
          const parts = locationFull.split(' - ');
          locationName = parts[parts.length - 1].trim();
        }
        
        if (!periodDate) {
          const periodRow = data[2];
          periodDate = periodRow && periodRow[0] ? periodRow[0].toString() : '';
        }

        console.log(`  Processing: ${locationName}`);

        // Get value from specific row/column
        const getVal = (rowIndex, colIndex) => {
          if (!data[rowIndex] || data[rowIndex][colIndex] === null || data[rowIndex][colIndex] === undefined) {
            return 0;
          }
          const val = data[rowIndex][colIndex];
          if (typeof val === 'number') return val;
          if (typeof val === 'string') {
            const parsed = parseFloat(val.replace(/[^0-9.-]/g, ''));
            return isNaN(parsed) ? 0 : parsed;
          }
          return 0;
        };

        // Helper to create item with both period and YTD
        const makeItem = (rowIdx) => ({
          period: getVal(rowIdx, 1), // Column B
          ytd: getVal(rowIdx, 3)     // Column D
        });

        const plData = {};

        // ========== SALES ==========
        plData['Sales'] = {
          'Food Sales': makeItem(6),
          'Comps': makeItem(9),
          'Discounts': makeItem(10),
          'Total Comps & Discounts': {
            period: getVal(9, 1) + getVal(10, 1),
            ytd: getVal(9, 3) + getVal(10, 3)
          },
          'Refunds': makeItem(12),
          'Total Sales': {
            period: getVal(6, 1) + getVal(9, 1) + getVal(10, 1) + getVal(12, 1),
            ytd: getVal(6, 3) + getVal(9, 3) + getVal(10, 3) + getVal(12, 3)
          }
        };

        // ========== PRIME COST ==========
        const foodPaperPeriod = getVal(17, 1) + getVal(18, 1) + getVal(19, 1) + getVal(20, 1) + getVal(21, 1) + getVal(22, 1) + getVal(23, 1) + getVal(24, 1);
        const foodPaperYTD = getVal(17, 3) + getVal(18, 3) + getVal(19, 3) + getVal(20, 3) + getVal(21, 3) + getVal(22, 3) + getVal(23, 3) + getVal(24, 3);
        
        const managerWagesPeriod = getVal(28, 1) + getVal(29, 1) + getVal(30, 1);
        const managerWagesYTD = getVal(28, 3) + getVal(29, 3) + getVal(30, 3);
        
        const totalSalariesPeriod = managerWagesPeriod + getVal(31, 1) + getVal(32, 1) + getVal(33, 1);
        const totalSalariesYTD = managerWagesYTD + getVal(31, 3) + getVal(32, 3) + getVal(33, 3);
        
        const payrollTaxesPeriod = getVal(38, 1) + getVal(39, 1) + getVal(40, 1);
        const payrollTaxesYTD = getVal(38, 3) + getVal(39, 3) + getVal(40, 3);
        
        const payrollBenefitsPeriod = getVal(44, 1) + getVal(45, 1) + getVal(46, 1) + getVal(47, 1);
        const payrollBenefitsYTD = getVal(44, 3) + getVal(45, 3) + getVal(46, 3) + getVal(47, 3);
        
        const totalPrimeCostPeriod = foodPaperPeriod + totalSalariesPeriod + payrollTaxesPeriod + payrollBenefitsPeriod;
        const totalPrimeCostYTD = foodPaperYTD + totalSalariesYTD + payrollTaxesYTD + payrollBenefitsYTD;

        plData['Prime Cost'] = {
          'Food and Paper Cost': { period: foodPaperPeriod, ytd: foodPaperYTD },
          'Custard Cost': makeItem(17),
          'Nuts Cost': makeItem(18),
          'Toppings Cost': makeItem(19),
          'Beverage Cost': makeItem(20),
          'Take Home Cost': makeItem(21),
          'Other Food Cost': makeItem(22),
          'Paper Products Cost': makeItem(23),
          'Mistakes': makeItem(24),
          'Total Food and Paper Cost': { period: foodPaperPeriod, ytd: foodPaperYTD },
          'Salaries and Wages': { period: totalSalariesPeriod, ytd: totalSalariesYTD },
          'Manager Wages': { period: managerWagesPeriod, ytd: managerWagesYTD },
          'Hourly Wages': makeItem(31),
          'Training Wages': makeItem(32),
          'Employee Bonuses': makeItem(33),
          'Total Salaries and Wages': { period: totalSalariesPeriod, ytd: totalSalariesYTD },
          'Payroll Taxes': { period: payrollTaxesPeriod, ytd: payrollTaxesYTD },
          'FICA Taxes': makeItem(38),
          'FUTA Taxes': makeItem(39),
          'State Unemployment Tax': makeItem(40),
          'Total Payroll Taxes': { period: payrollTaxesPeriod, ytd: payrollTaxesYTD },
          'Payroll Benefits': { period: payrollBenefitsPeriod, ytd: payrollBenefitsYTD },
          'Retirement Expense': makeItem(44),
          'Health Insurance': makeItem(46),
          'Life Insurance': makeItem(47),
          'Total Payroll Benefits': { period: payrollBenefitsPeriod, ytd: payrollBenefitsYTD },
          'Total Prime Cost': { period: totalPrimeCostPeriod, ytd: totalPrimeCostYTD }
        };

        // ========== OPERATING EXPENSE ==========
        const directOpsPeriod = getVal(55, 1) + getVal(56, 1) + getVal(59, 1) + getVal(61, 1) + getVal(62, 1) + getVal(64, 1) + getVal(66, 1) + getVal(68, 1) + getVal(69, 1) + getVal(70, 1) + getVal(72, 1);
        const directOpsYTD = getVal(55, 3) + getVal(56, 3) + getVal(59, 3) + getVal(61, 3) + getVal(62, 3) + getVal(64, 3) + getVal(66, 3) + getVal(68, 3) + getVal(69, 3) + getVal(70, 3) + getVal(72, 3);
        
        const utilitiesPeriod = getVal(76, 1) + getVal(78, 1) + getVal(79, 1);
        const utilitiesYTD = getVal(76, 3) + getVal(78, 3) + getVal(79, 3);
        
        const advertisingPeriod = getVal(83, 1) + getVal(85, 1) + getVal(86, 1) + getVal(88, 1) + getVal(90, 1) + getVal(91, 1);
        const advertisingYTD = getVal(83, 3) + getVal(85, 3) + getVal(86, 3) + getVal(88, 3) + getVal(90, 3) + getVal(91, 3);
        
        const generalAdminPeriod = getVal(95, 1) + getVal(96, 1) + getVal(106, 1) + getVal(107, 1) + getVal(109, 1) + getVal(111, 1) + getVal(115, 1) + getVal(116, 1) + getVal(118, 1) + getVal(119, 1) + getVal(121, 1);
        const generalAdminYTD = getVal(95, 3) + getVal(96, 3) + getVal(106, 3) + getVal(107, 3) + getVal(109, 3) + getVal(111, 3) + getVal(115, 3) + getVal(116, 3) + getVal(118, 3) + getVal(119, 3) + getVal(121, 3);
        
        const totalOpExPeriod = directOpsPeriod + utilitiesPeriod + advertisingPeriod + generalAdminPeriod;
        const totalOpExYTD = directOpsYTD + utilitiesYTD + advertisingYTD + generalAdminYTD;

        plData['Operating Expense'] = {
          'Direct Operating Expense': { period: directOpsPeriod, ytd: directOpsYTD },
          'Cleaning Supplies': makeItem(55),
          'Contract Cleaning': makeItem(56),
          'Kitchen Equipment and Supplies': makeItem(59),
          'Uniforms and Linen Rental': makeItem(61),
          'Miscellaneous Expense': makeItem(62),
          'Pest Control': makeItem(64),
          'Employee Meals': makeItem(66),
          'Cash Over/Short': makeItem(68),
          'Product Waste': makeItem(69),
          'Repairs and Maintenance': makeItem(70),
          'Custard Machine Repairs': makeItem(71),
          'Grounds Maintenance': makeItem(72),
          'Total Direct Operating Expense': { period: directOpsPeriod, ytd: directOpsYTD },
          'Utilities': { period: utilitiesPeriod, ytd: utilitiesYTD },
          'Electricity': makeItem(76),
          'Trash Removal': makeItem(78),
          'Water and Sewage': makeItem(79),
          'Total Utilities': { period: utilitiesPeriod, ytd: utilitiesYTD },
          'Advertising': { period: advertisingPeriod, ytd: advertisingYTD },
          'Advertising Fund': makeItem(83),
          'Online Advertising': makeItem(85),
          'Marketing Manager': makeItem(86),
          'Radio and Television': makeItem(87),
          'Direct Mailers': makeItem(89),
          'Cost of Giveaways and Comps': makeItem(90),
          'Other Sponsorships': makeItem(91),
          'Donations': makeItem(92),
          'Total Advertising': { period: advertisingPeriod, ytd: advertisingYTD },
          'General and Administrative': { period: generalAdminPeriod, ytd: generalAdminYTD },
          'Credit Card Fees': makeItem(105),
          'Dues and Subscriptions': makeItem(106),
          'Store Menus and Displays': makeItem(107),
          'Computer Costs': makeItem(109),
          'Royalties': makeItem(110),
          'Licenses and Permits Expense': makeItem(111),
          'Insurance Expense': makeItem(112),
          'State Business Taxes': makeItem(114),
          'Security System Expense': makeItem(115),
          'Internet/Telephone': makeItem(116),
          'Training Programs': makeItem(117),
          'Gift Cards Expense': makeItem(118),
          'Travel': makeItem(119),
          'Office Supplies': makeItem(120),
          'Interest Expense': makeItem(121),
          'Total General and Administrative': { period: generalAdminPeriod, ytd: generalAdminYTD },
          'Total Operating Expense': { period: totalOpExPeriod, ytd: totalOpExYTD }
        };

        // ========== NON CONTROLLABLE EXPENSE ==========
        const occupancyPeriod = getVal(128, 1) + getVal(129, 1) + getVal(130, 1);
        const occupancyYTD = getVal(128, 3) + getVal(129, 3) + getVal(130, 3);
        
        const depreciationPeriod = getVal(134, 1) + getVal(135, 1) + getVal(137, 1) + getVal(138, 1);
        const depreciationYTD = getVal(134, 3) + getVal(135, 3) + getVal(137, 3) + getVal(138, 3);
        
        const totalNonControlPeriod = occupancyPeriod + depreciationPeriod;
        const totalNonControlYTD = occupancyYTD + depreciationYTD;

        plData['Non Controllable Expense'] = {
          'Occupancy Costs': { period: occupancyPeriod, ytd: occupancyYTD },
          'Rent': makeItem(128),
          'Personal Property Taxes': makeItem(129),
          'Real Estate Taxes': makeItem(130),
          'Total Occupancy Costs': { period: occupancyPeriod, ytd: occupancyYTD },
          'Depreciation and Amortization': { period: depreciationPeriod, ytd: depreciationYTD },
          'Equipment Depreciation': makeItem(134),
          'Signage Depreciation': makeItem(135),
          'Leasehold Improvement Depreciation': makeItem(137),
          'Amortization Expense': makeItem(138),
          'Total Depreciation and Amortization': { period: depreciationPeriod, ytd: depreciationYTD },
          'Total Non Controllable Expense': { period: totalNonControlPeriod, ytd: totalNonControlYTD }
        };

        // ========== NET PROFIT ==========
        const totalSalesPeriod = plData['Sales']['Total Sales'].period;
        const totalSalesYTD = plData['Sales']['Total Sales'].ytd;
        
        plData['Net Profit'] = {
          'Net Profit': {
            period: totalSalesPeriod - totalPrimeCostPeriod - totalOpExPeriod - totalNonControlPeriod,
            ytd: totalSalesYTD - totalPrimeCostYTD - totalOpExYTD - totalNonControlYTD
          }
        };

        allLocationData[locationName] = plData;
        processedCount++;

      } catch (error) {
        console.error(`Error processing sheet ${sheetName}:`, error);
      }
    }

    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db();
    
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
