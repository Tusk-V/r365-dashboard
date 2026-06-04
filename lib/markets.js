// Market helpers. Location→market data and market ordering now live in
// lib/channels.js (the single source of truth); this module keeps the existing
// getMarket/sortByMarket/marketSortOrder API that the dashboards import.
import { LOCATION_MARKETS, MARKETS } from './channels';

export const getMarket = (locationName) => LOCATION_MARKETS[locationName] || 'Other';

export const marketSortOrder = MARKETS.reduce(
  (acc, market, i) => { acc[market] = i; return acc; },
  { 'Other': MARKETS.length }
);

export const sortByMarket = (locations) => {
  return [...locations].sort((a, b) => {
    const ma = marketSortOrder[getMarket(a)] ?? marketSortOrder['Other'];
    const mb = marketSortOrder[getMarket(b)] ?? marketSortOrder['Other'];
    if (ma !== mb) return ma - mb;
    return a.localeCompare(b);
  });
};
