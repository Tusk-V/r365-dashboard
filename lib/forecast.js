// ===== MODEL PREDICTION LOOKUP (from Model Forecast sheet) =====
export const getModelPrediction = (modelForecastData, dateStr, locationName) => {
  if (!modelForecastData || modelForecastData.length === 0) return null;
  const entry = modelForecastData.find(d => {
    if (d.location !== locationName) return false;
    if (d.date === dateStr) return true;
    try {
      const d1 = new Date(d.date);
      const d2 = new Date(dateStr);
      return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    } catch { return false; }
  });
  return entry || null;
};

// Get all model predictions for a location in a date range
export const getModelPredictionsForLocation = (modelForecastData, locationName, startDate, endDate) => {
  if (!modelForecastData || modelForecastData.length === 0) return [];
  return modelForecastData.filter(d => {
    if (d.location !== locationName) return false;
    try {
      const rowDate = new Date(d.date);
      return rowDate >= startDate && rowDate <= endDate;
    } catch { return false; }
  });
};

// ===== R365 FORECAST LOOKUP (from Flash Daily Sales data) =====
export const getR365Forecast = (dailyFlashData, dateStr, locationName) => {
  const locData = dailyFlashData[locationName];
  if (!locData) return null;
  const entry = locData.find(d => {
    if (d.date === dateStr) return true;
    try {
      const d1 = new Date(d.date);
      const d2 = new Date(dateStr);
      return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
    } catch { return false; }
  });
  return entry?.r365Forecast || null;
};

// Forecast calculation helpers
export const getWeekMonday = (offset) => {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff + (offset * 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const formatForecastDate = (d) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

export const getWeatherEmoji = (conditions) => {
  if (!conditions) return '--';
  const c = conditions.toLowerCase();
  if (c.includes('rain') || c.includes('storm') || c.includes('drizzle') || c.includes('thunder')) return '🌧️';
  if (c.includes('snow') || c.includes('sleet') || c.includes('ice') || c.includes('freezing')) return '🌨️';
  if (c.includes('overcast') || c.includes('cloudy')) return '☁️';
  if (c.includes('partly') || c.includes('partial')) return '⛅';
  if (c.includes('clear') || c.includes('sunny')) return '☀️';
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return '🌫️';
  return '⛅';
};

export const computeForecastForLocation = (
  { forecastData, dailyFlashData, modelForecastData },
  locationName,
  weekOffset
) => {
  const locData = forecastData.filter(d => d.location === locationName && d.sales > 0);
  if (locData.length === 0) return [];
  const monday = getWeekMonday(weekOffset);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const result = [];
  for (let i = 0; i < 7; i++) {
    const targetDate = new Date(monday);
    targetDate.setDate(monday.getDate() + i);
    const targetKey = formatForecastDate(targetDate);
    const targetWeather = forecastData.find(d => d.location === locationName && d.date === targetKey);
    const highTemp = targetWeather?.highTemp;
    const conditions = targetWeather?.conditions || '';
    const actualEntry = locData.find(d => d.date === targetKey);
    const actualSales = actualEntry?.sales || null;

    // R365 Forecast from Flash Daily Sales
    const r365Forecast = getR365Forecast(dailyFlashData, targetKey, locationName);

    const pwDate = new Date(targetDate); pwDate.setDate(targetDate.getDate() - 7);
    const pwKey = formatForecastDate(pwDate);
    const pwEntry = locData.find(d => d.date === pwKey);
    const pwSales = pwEntry?.sales || null;
    const pwWeatherEntry = forecastData.find(d => d.location === locationName && d.date === pwKey);
    const pwTemp = pwWeatherEntry?.highTemp;
    const pwConditions = pwWeatherEntry?.conditions || '';

    const weeklyData = [];
    for (let w = 1; w <= 6; w++) {
      const pastDate = new Date(targetDate); pastDate.setDate(targetDate.getDate() - (w * 7));
      const pastKey = formatForecastDate(pastDate);
      const pastEntry = locData.find(d => d.date === pastKey);
      if (pastEntry && pastEntry.sales > 0) weeklyData.push(pastEntry.sales);
      if (weeklyData.length >= 4) break;
    }
    let weightedAvg = 0;
    if (weeklyData.length >= 4) weightedAvg = weeklyData[0] * 0.4 + weeklyData[1] * 0.3 + weeklyData[2] * 0.2 + weeklyData[3] * 0.1;
    else if (weeklyData.length > 0) weightedAvg = weeklyData.reduce((a, b) => a + b, 0) / weeklyData.length;

    const pyDate = new Date(targetDate); pyDate.setFullYear(pyDate.getFullYear() - 1);
    const pyKey = formatForecastDate(pyDate);
    const pyEntry = locData.find(d => d.date === pyKey);
    const pySales = pyEntry?.sales || null;
    const pyWeather = pyEntry?.highTemp;
    const pyConditions = pyEntry?.conditions || '';

    let forecast = 0; let forecastMethod = 'none'; let weatherAdj = 0; let pwOutlier = false;
    let useBaseline = pwSales;
    if (pwSales && pwSales > 0 && weightedAvg > 0) {
      const pwDeviation = Math.abs(pwSales - weightedAvg) / weightedAvg;
      if (pwDeviation > 0.30) { useBaseline = pwSales * 0.6 + weightedAvg * 0.4; pwOutlier = true; }
    }
    if (pwSales && pwSales > 0) {
      forecastMethod = pwOutlier ? 'blend' : 'pw';
      if (highTemp !== null && pwTemp !== null) {
        const tempDiff = highTemp - pwTemp;
        if (tempDiff >= 15) weatherAdj = 0.199;
        else if (tempDiff >= 10) weatherAdj = 0.087;
        else if (tempDiff >= 5) weatherAdj = 0.024;
        else if (tempDiff >= 3) weatherAdj = 0.007;
        else if (tempDiff <= -15) weatherAdj = -0.151;
        else if (tempDiff <= -10) weatherAdj = -0.059;
        else if (tempDiff <= -5) weatherAdj = -0.043;
        else if (tempDiff <= -3) weatherAdj = -0.020;
        else weatherAdj = 0.040;
      }
      const thisRain = conditions.toLowerCase().includes('rain') || conditions.toLowerCase().includes('storm') || conditions.toLowerCase().includes('shower');
      const pwRain = pwConditions.toLowerCase().includes('rain') || pwConditions.toLowerCase().includes('storm') || pwConditions.toLowerCase().includes('shower');
      if (thisRain && !pwRain) weatherAdj -= 0.133;
      else if (!thisRain && pwRain) weatherAdj += 0.133;
      forecast = useBaseline * (1 + weatherAdj);
    } else if (weightedAvg > 0) {
      forecastMethod = 'avg';
      if (highTemp !== null) {
        const idealTemp = 75; const tempDiff = highTemp - idealTemp;
        if (tempDiff < -20) weatherAdj = -0.12;
        else if (tempDiff < -10) weatherAdj = -0.06;
        else if (tempDiff < 0) weatherAdj = -0.02;
        else if (tempDiff <= 10) weatherAdj = 0.04;
        else weatherAdj = 0.02;
        if (conditions.toLowerCase().includes('rain') || conditions.toLowerCase().includes('storm')) weatherAdj -= 0.08;
      }
      forecast = weightedAvg * (1 + weatherAdj);
    }

    let confidence = 'high';
    if (forecastMethod === 'none') confidence = 'low';
    else if (forecastMethod === 'avg') confidence = 'med';

    let tempDelta = null; let tempCompare = 'same';
    if (highTemp !== null && pwTemp !== null) {
      tempDelta = highTemp - pwTemp;
      if (tempDelta >= 3) tempCompare = 'warmer';
      else if (tempDelta <= -3) tempCompare = 'cooler';
    }

    let conditionChange = '';
    if (pwConditions && conditions && pwConditions !== conditions) {
      const shortCond = (c) => {
        if (c.toLowerCase().includes('rain')) return 'Rain';
        if (c.toLowerCase().includes('overcast')) return 'Overcast';
        if (c.toLowerCase().includes('partly')) return 'Ptly Cloudy';
        if (c.toLowerCase().includes('clear') || c.toLowerCase().includes('sunny')) return 'Clear';
        if (c.toLowerCase().includes('cloud')) return 'Cloudy';
        return c.split(',')[0].substring(0, 12);
      };
      const from = shortCond(pwConditions); const to = shortCond(conditions);
      if (from !== to) conditionChange = `${from} -> ${to}`;
    }

    const month = targetDate.getMonth() + 1; const date = targetDate.getDate();
    let holiday = null;
    if (month === 2 && date === 14) holiday = "Valentine's Day";
    if (month === 7 && date === 4) holiday = "4th of July";
    if (month === 12 && date === 25) holiday = "Christmas";
    if (month === 12 && date === 24) holiday = "Christmas Eve";
    if (month === 10 && date === 31) holiday = "Halloween";

    const isToday = targetKey === formatForecastDate(new Date());
    const isPast = targetDate < new Date() && !isToday;

    // === Model Prediction Override ===
    const modelPred = getModelPrediction(modelForecastData, targetKey, locationName);
    let modelForecast = null;
    let modelConfidence = null;
    let modelMethod = null;
    let modelWeatherAdj = null;
    let modelGenAt = null;
    let modelCoeffVer = null;
    if (modelPred && modelPred.predicted > 0) {
      modelForecast = modelPred.predicted;
      modelConfidence = modelPred.confidence;
      modelMethod = modelPred.method;
      modelWeatherAdj = modelPred.weatherAdjPct;
      modelGenAt = modelPred.generatedAt;
      modelCoeffVer = modelPred.coeffVersion;
      // Use stored prediction as the primary forecast
      forecast = modelPred.predicted;
      confidence = modelPred.confidence || confidence;
      forecastMethod = modelPred.method || forecastMethod;
      weatherAdj = modelPred.weatherAdjPct || weatherAdj;
    }


    result.push({
      dayLabel: `${dayNames[i]} ${targetDate.getMonth() + 1}/${targetDate.getDate()}`,
      date: targetKey, forecast: Math.round(forecast), r365Forecast,
      actual: actualSales ? Math.round(actualSales) : null,
      highTemp, conditions, weightedAvg: Math.round(weightedAvg),
      weatherAdj: Math.round(weatherAdj * 100), confidence, forecastMethod, pwOutlier,
      pwSales: pwSales ? Math.round(pwSales) : null, pwTemp, pwConditions,
      pySales: pySales ? Math.round(pySales) : null, pyWeather: pyWeather, pyConditions,
      tempDelta, tempCompare, conditionChange, holiday, isToday, isPast,
      modelForecast, modelConfidence, modelMethod, modelWeatherAdj, modelGenAt, modelCoeffVer
    });
  }
  return result;
};
