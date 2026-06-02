// ============================================================================
// DAILY LABOR GRADE CALCULATION
// Grades each day A-F based on how well labor was managed relative to optimal.
// The sweet spot is AT optimal — deviations in either direction are penalized,
// but there's a 5% "comfort zone" around optimal where you're still doing great.
// Being over optimal is weighted more heavily (direct cost waste) than being
// under (potential lost sales from understaffing).
//
// AUTO-F RULE: If the store missed forecast by 5%+ AND went 5%+ over scheduled hours,
// that's an automatic F — you meaningfully overstaffed and still meaningfully missed sales.
// Small misses on both sides don't trigger it.
//
// forecastVariance comes from Flash - Daily Sales (cross-referenced by location+date).
// A negative forecastVariance means actual sales were BELOW forecast.
// ============================================================================
export const getDailyLaborGrade = (day, forecastVariance) => {
  // Need at least optimal hours to grade meaningfully
  if (!day.optimalHours || day.optimalHours === 0) return null;

  // --- Determine if store is beating forecast (used to soften "under optimal" penalties) ---
  let forecastPct = null;
  const beatingForecast = (() => {
    if (forecastVariance === null || forecastVariance === undefined || !day.sales || day.sales === 0) return false;
    forecastPct = (forecastVariance / day.sales) * 100;
    return forecastPct >= 0;
  })();

  // --- AUTO-F: Missed forecast by 5%+ AND over scheduled by 5%+ ---
  if (forecastPct !== null && forecastPct < -5
      && day.scheduledHours > 0) {
    const schOverPct = ((day.actualHours - day.scheduledHours) / day.scheduledHours) * 100;
    if (schOverPct > 5) {
      return { letter: 'F', color: 'text-red-400', bg: 'bg-red-900/40 border-red-700', score: 0, autoF: true };
    }
  }

  // --- 1. Hours Variance Score (0-100) ---
  // How close are actual hours to optimal hours?
  // Within 2% = comfort zone. Beyond that, gradual penalty.
  // If beating forecast, "under optimal" penalty is reduced (lean & efficient).
  const hoursVariance = day.actualHours - day.optimalHours;
  const hoursVariancePct = Math.abs((hoursVariance / day.optimalHours) * 100);
  let hoursScore = 100;
  if (hoursVariancePct > 2) {
    const excessPct = hoursVariancePct - 2;
    if (hoursVariance > 0) {
      // Over optimal: lose 6 points per 1%
      hoursScore = Math.max(0, 100 - (excessPct * 6));
    } else {
      // Under optimal: lose 4 pts normally, but only 1.5 pts if beating forecast
      const penalty = beatingForecast ? 1.5 : 4;
      hoursScore = Math.max(0, 100 - (excessPct * penalty));
    }
  }

  // --- 2. Labor % Variance Score (0-100) ---
  // How close is actual labor % to optimal labor %?
  // Within 2% = comfort zone.
  // If beating forecast, "under optimal" penalty is reduced.
  const laborPctVar = day.laborPercentVariance; // Act% - Opt%
  const laborPctVarAbs = Math.abs(laborPctVar);
  let laborPctScore = 100;
  if (laborPctVarAbs > 2) {
    const excessPct = laborPctVarAbs - 2;
    if (laborPctVar > 0) {
      // Over optimal %: lose 10 points per 1%
      laborPctScore = Math.max(0, 100 - (excessPct * 10));
    } else {
      // Under optimal %: lose 5 pts normally, but only 2 pts if beating forecast
      const penalty = beatingForecast ? 2 : 5;
      laborPctScore = Math.max(0, 100 - (excessPct * penalty));
    }
  }

  // --- 3. Scheduled Adherence Score (0-100) --- weight: 10%
  // Supporting signal only. Optimal is the real target.
  let schedScore = 100;
  if (day.scheduledHours > 0) {
    const schVariance = day.actualHours - day.scheduledHours;
    const schVariancePctAbs = Math.abs((schVariance / day.scheduledHours) * 100);
    if (schVariancePctAbs > 2) {
      const excessPct = schVariancePctAbs - 2;
      if (schVariance > 0) {
        schedScore = Math.max(0, 100 - (excessPct * 5));
      } else {
        schedScore = Math.max(0, 100 - (excessPct * 3));
      }
    }
  }

  // --- 4. Forecast Sales Modifier ---
  // Big sales beats = meaningful cushion. Misses = penalty.
  let forecastModifier = 0;
  if (forecastPct !== null) {
    if (forecastPct >= 15) forecastModifier = 15;
    else if (forecastPct >= 10) forecastModifier = 12;
    else if (forecastPct >= 5) forecastModifier = 8;
    else if (forecastPct >= 0) forecastModifier = 3;
    else if (forecastPct >= -5) forecastModifier = -3;
    else if (forecastPct >= -10) forecastModifier = -6;
    else forecastModifier = -8;
  }

  // --- Weighted composite ---
  // Labor % is king (50%), hours vs optimal (40%), schedule is just a supporting signal (10%)
  const composite = Math.min(100, Math.max(0,
    (laborPctScore * 0.50) + (hoursScore * 0.40) + (schedScore * 0.10) + forecastModifier
  ));

  // --- Letter grade ---
  if (composite >= 90) return { letter: 'A', color: 'text-green-400', bg: 'bg-green-900/40 border-green-700', score: composite };
  if (composite >= 75) return { letter: 'B', color: 'text-blue-400', bg: 'bg-blue-900/40 border-blue-700', score: composite };
  if (composite >= 60) return { letter: 'C', color: 'text-yellow-400', bg: 'bg-yellow-900/40 border-yellow-700', score: composite };
  if (composite >= 40) return { letter: 'D', color: 'text-orange-400', bg: 'bg-orange-900/40 border-orange-700', score: composite };
  return { letter: 'F', color: 'text-red-400', bg: 'bg-red-900/40 border-red-700', score: composite };
};
