// pages/api/upload-pl.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import formidable from 'formidable';
import * as XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import fs from 'fs';

export const config = {
  api: {
    bodyParser: false,
  },
};

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Only admin can upload
  if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Not authorized to upload P&L data' });
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

    // Read the Excel file
    const fileBuffer = fs.readFileSync(file.filepath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    // Parse the P&L data
    const plData = parsePLData(data);

    if (!plData.location) {
      return res.status(400).json({ error: 'Could not determine location from file' });
    }

    // Connect to MongoDB and save
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('andysdashboard');
    const collection = db.collection('pl_data');

    // Upsert the P&L data (update if exists, insert if not)
    await collection.updateOne(
      { 
        location: plData.location,
        periodEnding: plData.periodEnding 
      },
      { 
        $set: {
          ...plData,
          uploadedAt: new Date(),
          uploadedBy: session.user.email
        }
      },
      { upsert: true }
    );

    await client.close();

    // Clean up temp file
    fs.unlinkSync(file.filepath);

    return res.status(200).json({ 
      success: true, 
      message: `P&L uploaded for ${plData.location}`,
      location: plData.location,
      periodEnding: plData.periodEnding
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}

function parsePLData(data) {
  const result = {
    location: null,
    periodEnding: null,
    period: {},
    ytd: {}
  };

  // Row 1: Location (e.g., "201 - Carrollton")
  if (data[1] && data[1][0]) {
    const locationStr = data[1][0].toString();
    const match = locationStr.match(/\d+\s*-\s*(.+)/);
    if (match) {
      result.location = match[1].trim();
    } else {
      result.location = locationStr.trim();
    }
  }

  // Row 2: Period ending date
  if (data[2] && data[2][0]) {
    result.periodEnding = data[2][0].toString();
  }

  // Parse line items - Column 0 is label, Column 1 is Period value, Column 3 is YTD value
  const lineItems = [
    { row: 6, key: 'foodSales', label: 'Food Sales' },
    { row: 9, key: 'comps', label: 'Comps' },
    { row: 10, key: 'discounts', label: 'Discounts' },
    { row: 12, key: 'refunds', label: 'Refunds' },
    { row: 17, key: 'custardCost', label: 'Custard Cost' },
    { row: 18, key: 'nutsCost', label: 'Nuts Cost' },
    { row: 19, key: 'toppingsCost', label: 'Toppings Cost' },
    { row: 20, key: 'beverageCost', label: 'Beverage Cost' },
    { row: 21, key: 'takeHomeCost', label: 'Take Home Cost' },
    { row: 22, key: 'otherFoodCost', label: 'Other Food Cost' },
    { row: 23, key: 'paperProductsCost', label: 'Paper Products Cost' },
    { row: 24, key: 'mistakes', label: 'Mistakes' },
    { row: 28, key: 'marketManagerWages', label: 'Market Manager Wages' },
    { row: 29, key: 'generalManagerWages', label: 'General Manager Wages' },
    { row: 30, key: 'assistantManagerWages', label: 'Assistant Manager Wages' },
    { row: 31, key: 'hourlyWages', label: 'Hourly Wages' },
    { row: 32, key: 'trainingWages', label: 'Training Wages' },
    { row: 33, key: 'employeeBonuses', label: 'Employee Bonuses' },
    { row: 38, key: 'ficaTaxes', label: 'FICA Taxes' },
    { row: 39, key: 'futaTaxes', label: 'FUTA Taxes' },
    { row: 40, key: 'stateUnemploymentTax', label: 'State Unemployment Tax' },
    { row: 46, key: 'healthInsurance', label: 'Health Insurance' },
    { row: 47, key: 'lifeInsurance', label: 'Life Insurance' },
    { row: 55, key: 'cleaningSupplies', label: 'Cleaning Supplies' },
    { row: 56, key: 'contractCleaning', label: 'Contract Cleaning' },
    { row: 57, key: 'kitchenEquipment', label: 'Kitchen Equipment' },
    { row: 59, key: 'kitchenSuppliesSmallwares', label: 'Kitchen Supplies and Smallwares' },
    { row: 61, key: 'uniformsLinenRental', label: 'Uniforms and Linen Rental' },
    { row: 62, key: 'miscellaneousExpense', label: 'Miscellaneous Expense' },
    { row: 64, key: 'pestControl', label: 'Pest Control' },
    { row: 66, key: 'employeeMeals', label: 'Employee Meals' },
    { row: 68, key: 'cashOverShort', label: 'Cash Over/Short' },
    { row: 69, key: 'productWaste', label: 'Product Waste' },
    { row: 70, key: 'repairsAndMaintenance', label: 'Repairs and Maintenance' },
    { row: 71, key: 'custardMachineRepairs', label: 'Custard Machine Repairs' },
    { row: 72, key: 'groundsMaintenance', label: 'Grounds Maintenance' },
    { row: 76, key: 'electricity', label: 'Electricity' },
    { row: 77, key: 'gas', label: 'Gas' },
    { row: 78, key: 'trashRemoval', label: 'Trash Removal' },
    { row: 79, key: 'waterAndSewage', label: 'Water and Sewage' },
    { row: 83, key: 'advertisingFund', label: 'Advertising Fund' },
    { row: 86, key: 'marketingManager', label: 'Marketing Manager' },
    { row: 87, key: 'radioAndTelevision', label: 'Radio and Television' },
    { row: 89, key: 'directMailers', label: 'Direct Mailers' },
    { row: 90, key: 'costOfGiveawaysAndComps', label: 'Cost of Giveaways and Comps' },
    { row: 91, key: 'otherSponsorships', label: 'Other Sponsorships' },
    { row: 105, key: 'creditCardFees', label: 'Credit Card Fees' },
    { row: 106, key: 'duesAndSubscriptions', label: 'Dues and Subscriptions' },
    { row: 107, key: 'storeMenusAndDisplays', label: 'Store Menus and Displays' },
    { row: 109, key: 'computerCosts', label: 'Computer Costs' },
    { row: 110, key: 'royalties', label: 'Royalties' },
    { row: 111, key: 'licensesAndPermitsExpense', label: 'Licenses and Permits Expense' },
    { row: 112, key: 'insuranceExpense', label: 'Insurance Expense' },
    { row: 114, key: 'stateBusinessTaxes', label: 'State Business Taxes' },
    { row: 115, key: 'securitySystemExpense', label: 'Security System Expense' },
    { row: 116, key: 'internetTelephone', label: 'Internet/Telephone' },
    { row: 118, key: 'giftCardsExpense', label: 'Gift Cards Expense' },
    { row: 120, key: 'officeSupplies', label: 'Office Supplies' },
    { row: 128, key: 'rent', label: 'Rent' },
    { row: 129, key: 'personalPropertyTaxes', label: 'Personal Property Taxes' },
    { row: 130, key: 'realEstateTaxes', label: 'Real Estate Taxes' },
    { row: 134, key: 'equipmentDepreciation', label: 'Equipment Depreciation' },
    { row: 137, key: 'leaseholdImprovementDepreciation', label: 'Leasehold Improvement Depreciation' },
    { row: 138, key: 'amortizationExpense', label: 'Amortization Expense' },
    { row: 142, key: 'totalSales', label: 'Total Sales' }
  ];

  for (const item of lineItems) {
    if (data[item.row]) {
      const periodValue = parseFloat(data[item.row][1]) || 0;
      const ytdValue = parseFloat(data[item.row][3]) || 0;
      result.period[item.key] = periodValue;
      result.ytd[item.key] = ytdValue;
    }
  }

  // Calculate totals
  const totalSales = result.period.totalSales || result.period.foodSales || 0;
  const ytdTotalSales = result.ytd.totalSales || result.ytd.foodSales || 0;

  // Food Cost
  result.period.totalFoodCost = (result.period.custardCost || 0) + (result.period.nutsCost || 0) + 
    (result.period.toppingsCost || 0) + (result.period.beverageCost || 0) + 
    (result.period.takeHomeCost || 0) + (result.period.otherFoodCost || 0) + 
    (result.period.paperProductsCost || 0) + (result.period.mistakes || 0);
  
  result.ytd.totalFoodCost = (result.ytd.custardCost || 0) + (result.ytd.nutsCost || 0) + 
    (result.ytd.toppingsCost || 0) + (result.ytd.beverageCost || 0) + 
    (result.ytd.takeHomeCost || 0) + (result.ytd.otherFoodCost || 0) + 
    (result.ytd.paperProductsCost || 0) + (result.ytd.mistakes || 0);

  // Labor Cost
  result.period.totalLaborCost = (result.period.marketManagerWages || 0) + (result.period.generalManagerWages || 0) +
    (result.period.assistantManagerWages || 0) + (result.period.hourlyWages || 0) +
    (result.period.trainingWages || 0) + (result.period.employeeBonuses || 0) +
    (result.period.ficaTaxes || 0) + (result.period.futaTaxes || 0) +
    (result.period.stateUnemploymentTax || 0) + (result.period.healthInsurance || 0) +
    (result.period.lifeInsurance || 0);

  result.ytd.totalLaborCost = (result.ytd.marketManagerWages || 0) + (result.ytd.generalManagerWages || 0) +
    (result.ytd.assistantManagerWages || 0) + (result.ytd.hourlyWages || 0) +
    (result.ytd.trainingWages || 0) + (result.ytd.employeeBonuses || 0) +
    (result.ytd.ficaTaxes || 0) + (result.ytd.futaTaxes || 0) +
    (result.ytd.stateUnemploymentTax || 0) + (result.ytd.healthInsurance || 0) +
    (result.ytd.lifeInsurance || 0);

  // Prime Cost
  result.period.primeCost = result.period.totalFoodCost + result.period.totalLaborCost;
  result.ytd.primeCost = result.ytd.totalFoodCost + result.ytd.totalLaborCost;

  // Utilities
  result.period.totalUtilities = (result.period.electricity || 0) + (result.period.gas || 0) +
    (result.period.trashRemoval || 0) + (result.period.waterAndSewage || 0);
  result.ytd.totalUtilities = (result.ytd.electricity || 0) + (result.ytd.gas || 0) +
    (result.ytd.trashRemoval || 0) + (result.ytd.waterAndSewage || 0);

  // Occupancy
  result.period.totalOccupancy = (result.period.rent || 0) + (result.period.personalPropertyTaxes || 0) +
    (result.period.realEstateTaxes || 0);
  result.ytd.totalOccupancy = (result.ytd.rent || 0) + (result.ytd.personalPropertyTaxes || 0) +
    (result.ytd.realEstateTaxes || 0);

  // Calculate percentages
  if (totalSales > 0) {
    result.period.foodCostPercent = (result.period.totalFoodCost / totalSales) * 100;
    result.period.laborCostPercent = (result.period.totalLaborCost / totalSales) * 100;
    result.period.primeCostPercent = (result.period.primeCost / totalSales) * 100;
    result.period.utilitiesPercent = (result.period.totalUtilities / totalSales) * 100;
    result.period.occupancyPercent = (result.period.totalOccupancy / totalSales) * 100;
  }

  if (ytdTotalSales > 0) {
    result.ytd.foodCostPercent = (result.ytd.totalFoodCost / ytdTotalSales) * 100;
    result.ytd.laborCostPercent = (result.ytd.totalLaborCost / ytdTotalSales) * 100;
    result.ytd.primeCostPercent = (result.ytd.primeCost / ytdTotalSales) * 100;
    result.ytd.utilitiesPercent = (result.ytd.totalUtilities / ytdTotalSales) * 100;
    result.ytd.occupancyPercent = (result.ytd.totalOccupancy / ytdTotalSales) * 100;
  }

  return result;
}
