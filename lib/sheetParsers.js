const parseNumber = (value) => {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[$,\s]/g, '');
  return parseFloat(cleaned) || 0;
};

const parsePercentage = (value) => {
  if (!value) return 0;
  const cleaned = value.toString().replace(/[%\s]/g, '');
  return parseFloat(cleaned) || 0;
};

export const parseSheetData = (rows) => {
  const parsedData = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row[0] || row[0].toString().trim() === '') continue;

    const locationName = row[0].toString();

    if (locationName.includes('11/') || locationName.toLowerCase().includes('date')) {
      continue;
    }

    const actualSales = parseNumber(row[7]);
    const forecastSales = parseNumber(row[6]);
    const priorYearSales = parseNumber(row[9]);
    const laborPercent = parsePercentage(row[10]);
    const optimalHours = parseNumber(row[12]);
    const actualHours = parseNumber(row[13]);
    const scheduledHours = parseNumber(row[15]);
    const schVsForLaborVar = parseNumber(row[18]);

    const salesVariance = actualSales - forecastSales;
    const pyVariance = actualSales - priorYearSales;
    const pyVariancePercent = priorYearSales > 0 ? (pyVariance / priorYearSales) * 100 : 0;
    const actVsOptHours = actualHours - optimalHours;
    const actVsSchHours = actualHours - scheduledHours;
    const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
    const optimalLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour) / actualSales * 100 : 0;
    const laborVariance = laborPercent - optimalLaborPercent;

    let reportDate = 'Current Week';
    if (row.length > 19 && row[19]) {
      reportDate = row[19].toString();
    }

    parsedData.push({
      location: locationName,
      actualSales,
      forecastSales,
      salesVariance,
      priorYearSales,
      pyVariance,
      pyVariancePercent,
      laborPercent,
      optimalHours,
      actualHours,
      scheduledHours,
      actVsOptHours,
      actVsSchHours,
      schVsForLaborVar,
      laborCostPerHour,
      optimalLaborPercent,
      laborVariance,
      reportDate
    });
  }

  return parsedData;
};

export const parseHistoricalData = (rows) => {
  const parsedData = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    const weekEnding = row[0] || '';
    const locationName = row[1] || '';
    const actualSales = parseNumber(row[2]);
    const forecastSales = parseNumber(row[3]);
    const salesVariance = parseNumber(row[4]);
    const priorYearSales = parseNumber(row[5]);
    const laborPercent = parsePercentage(row[6]);
    const optimalHours = parseNumber(row[7]);
    const actualHours = parseNumber(row[8]);
    const scheduledHours = parseNumber(row[9]);
    const schVsForLaborVar = parseNumber(row[10]);

    const pyVariance = actualSales - priorYearSales;
    const pyVariancePercent = priorYearSales > 0 ? (pyVariance / priorYearSales) * 100 : 0;
    const actVsOptHours = actualHours - optimalHours;
    const actVsSchHours = actualHours - scheduledHours;
    const laborCostPerHour = actualHours > 0 ? (actualSales * (laborPercent / 100)) / actualHours : 0;
    const optimalLaborPercent = actualSales > 0 ? (optimalHours * laborCostPerHour) / actualSales * 100 : 0;
    const laborVariance = laborPercent - optimalLaborPercent;

    parsedData.push({
      location: locationName,
      actualSales,
      forecastSales,
      salesVariance,
      priorYearSales,
      pyVariance,
      pyVariancePercent,
      laborPercent,
      optimalHours,
      actualHours,
      scheduledHours,
      actVsOptHours,
      actVsSchHours,
      schVsForLaborVar,
      laborCostPerHour,
      optimalLaborPercent,
      laborVariance,
      reportDate: weekEnding
    });
  }

  return parsedData;
};
