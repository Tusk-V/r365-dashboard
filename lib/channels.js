// Pure, framework-free channel/location helpers. CommonJS so both the Next.js
// app (via import interop) and the `node --test` runner can consume them.
// This is the single source of truth for markets, locations, and channels.

const LOCATION_MARKETS = {
  // Tulsa
  'Bixby': 'Tulsa',
  'Yale': 'Tulsa',
  'Broken Arrow': 'Tulsa',
  'Owasso': 'Tulsa',
  'Claremore': 'Tulsa',
  // Oklahoma City
  'Warr Acres': 'Oklahoma City',
  'Penn': 'Oklahoma City',
  'Edmond': 'Oklahoma City',
  'Norman': 'Oklahoma City',
  // Dallas
  'Carrollton': 'Dallas',
  'Frisco #1': 'Dallas',
  'Frisco #2': 'Dallas',
  'Frisco #3': 'Dallas',
  'The Colony': 'Dallas',
  'Hillcrest Village': 'Dallas',
  'Lake Highlands': 'Dallas',
  'Allen': 'Dallas',
  'Prosper': 'Dallas',
  // Orlando
  'Sanford': 'Orlando',
  'Lakeland': 'Orlando',
  "Hunter's Creek": 'Orlando',
};

const MARKETS = ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando'];
const LOCATIONS = Object.keys(LOCATION_MARKETS).sort((a, b) => a.localeCompare(b));
const COMPANY_CHANNEL = 'company-wide';

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[#']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function channelKeyForMarket(market) {
  return `market:${slugify(market)}`;
}

function channelKeyForLocation(location) {
  return `loc:${slugify(location)}`;
}

const MARKET_ORDER = Object.fromEntries(MARKETS.map((m, i) => [m, i]));

function deriveChannelsForUser(user) {
  const isAdmin = !!(user && user.isAdmin);
  const access = isAdmin ? { type: 'all' } : (user && user.dashboardAccess) || { type: 'none' };
  if (access.type === 'none') return [];

  const locations = access.type === 'all'
    ? [...LOCATIONS]
    : LOCATIONS.filter(loc => (access.locations || []).includes(loc));

  const markets = MARKETS.filter(m => locations.some(loc => LOCATION_MARKETS[loc] === m));

  const channels = [{ key: COMPANY_CHANNEL, type: 'company', name: 'Company-Wide' }];

  for (const market of markets) {
    channels.push({ key: channelKeyForMarket(market), type: 'market', name: market, market });
  }

  const sortedLocations = [...locations].sort((a, b) => {
    const ma = MARKET_ORDER[LOCATION_MARKETS[a]] ?? 99;
    const mb = MARKET_ORDER[LOCATION_MARKETS[b]] ?? 99;
    if (ma !== mb) return ma - mb;
    return a.localeCompare(b);
  });
  for (const loc of sortedLocations) {
    channels.push({ key: channelKeyForLocation(loc), type: 'location', name: loc, market: LOCATION_MARKETS[loc] });
  }

  return channels;
}

function canAccessChannel(user, channelKey) {
  return deriveChannelsForUser(user).some(c => c.key === channelKey);
}

function canPostAnnouncements(role) {
  return role === 'Admin' || role === 'FOM';
}

function unreadCount(messages, lastReadAt, userEmail) {
  const after = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  return (messages || []).filter(m =>
    new Date(m.createdAt).getTime() > after && m.authorEmail !== userEmail
  ).length;
}

module.exports = {
  MARKETS,
  LOCATIONS,
  LOCATION_MARKETS,
  COMPANY_CHANNEL,
  slugify,
  channelKeyForMarket,
  channelKeyForLocation,
  deriveChannelsForUser,
  canAccessChannel,
  canPostAnnouncements,
  unreadCount,
};
