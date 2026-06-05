// lib/dailyCard.js — pure generator for "Hugh's Scoop" daily morning cards.
// CommonJS so the node test runner and the Next.js cron route can both consume it.
const { LOCATIONS, LOCATION_MARKETS, channelKeyForLocation } = require('./channels');

const RAMP_UP = new Set(['Claremore', "Hunter's Creek"]);
const MARKET_ORDER = ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando'];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function num(v) {
  const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}
function dowOf(mdy) {
  const [m, d, y] = String(mdy).split('/').map(Number);
  if (!m || !d || !y) return null;
  return new Date(y, m - 1, d).getDay();
}
function prettyDate(mdy) {
  const [m, d, y] = String(mdy).split('/').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]}, ${MONTHS[m - 1]} ${d}`;
}
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function pick(arr, i) { return arr[((i % arr.length) + arr.length) % arr.length]; }

function nudgeFor(store, deltaPct, idx) {
  if (RAMP_UP.has(store)) {
    return pick([
      '🌱 Building every day — proud of the progress. Keep climbing!',
      '🌱 Steady growth, team — every guest counts. Let\'s go get today!',
    ], idx);
  }
  const d = deltaPct;
  if (d >= 12) return pick(['🔥 Big day — well over forecast! Keep it rolling.', '🚀 Crushed it yesterday — let\'s stack another.'], idx);
  if (d >= 4) return pick(['✅ Solid — beat forecast. Nice work, team.', '💪 Over forecast yesterday — keep the momentum.'], idx);
  if (d >= -4) return pick(['🎯 Right around forecast — steady day.', '👍 Held the line yesterday — let\'s edge ahead today.'], idx);
  if (d >= -12) return pick(['💪 Just shy yesterday — let\'s chase a strong afternoon.', '📈 A little under — a small push gets us there today.'], idx);
  return pick(['🌟 Tougher day yesterday — fresh start today, let\'s go get it.', '💙 Off the mark yesterday — today\'s a new shot, team.'], idx);
}

function cardBody(prettyDay, sales, deltaPct, guests, gPct, nudge) {
  const over = deltaPct >= 0;
  const arrow = over ? '📈' : '📉';
  const sign = over ? '+' : '−';
  const word = over ? 'over' : 'under';
  const check = over ? ' ✅' : '';
  const g = gPct == null ? '' : ` (${gPct >= 0 ? '+' : '−'}${Math.abs(Math.round(gPct))}%)`;
  const line1 = `📊 ${prettyDay} · 🍦 Sales ${money(sales)} · ${arrow} ${sign}${Math.abs(deltaPct).toFixed(1)}% ${word} forecast${check} · 👥 ${guests} guests${g}`;
  return `${line1}\n${nudge}`;
}

// rows: Flash - Daily Sales rows. targetDate: 'M/D/YYYY'.
// Returns one card object per known store that has a row on targetDate.
function buildDailyCards(rows, targetDate) {
  const all = (rows || []).filter(r => r && r[0] && r[1]);
  const targetDow = dowOf(targetDate);
  const today = all.filter(r => r[0] === targetDate);
  const pretty = prettyDate(targetDate);
  const ordered = [...LOCATIONS].sort((a, b) => {
    const ma = MARKET_ORDER.indexOf(LOCATION_MARKETS[a]);
    const mb = MARKET_ORDER.indexOf(LOCATION_MARKETS[b]);
    return ma - mb || a.localeCompare(b);
  });
  const byMarketIdx = {};
  const out = [];
  for (const store of ordered) {
    const r = today.find(x => x[1] === store);
    if (!r) continue;
    const sales = num(r[2]);
    const fv = num(r[5]);
    const forecast = sales - fv;
    const guests = num(r[6]);
    const deltaPct = forecast > 0 ? (fv / forecast) * 100 : 0;
    const hist = all.filter(x => x[1] === store && dowOf(x[0]) === targetDow && x[0] !== targetDate)
      .sort((a, b) => new Date(a[0]) - new Date(b[0])).slice(-4).map(x => num(x[6])).filter(g => g > 0);
    const avgG = hist.length ? hist.reduce((s, n) => s + n, 0) / hist.length : null;
    const gPct = avgG ? ((guests - avgG) / avgG) * 100 : null;
    const market = LOCATION_MARKETS[store];
    const idx = byMarketIdx[market] || 0;
    byMarketIdx[market] = idx + 1;
    const nudge = nudgeFor(store, deltaPct, idx);
    out.push({
      store, market, channelKey: channelKeyForLocation(store),
      sales, forecast, deltaPct, guests, gPct,
      body: cardBody(pretty, sales, deltaPct, guests, gPct, nudge),
    });
  }
  return out;
}

module.exports = { buildDailyCards };
