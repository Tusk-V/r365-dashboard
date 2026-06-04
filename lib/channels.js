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

const CANONICAL = (a, b) => {
  const rank = c => c.type === 'company' ? 0 : c.type === 'market' ? 1 : 2;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a.type === 'market') return (MARKET_ORDER[a.market] ?? 99) - (MARKET_ORDER[b.market] ?? 99);
  if (a.type === 'location') {
    const ma = MARKET_ORDER[a.market] ?? 99, mb = MARKET_ORDER[b.market] ?? 99;
    if (ma !== mb) return ma - mb;
    return a.name.localeCompare(b.name);
  }
  return 0;
};

function channelsForLocations(locations) {
  const locs = LOCATIONS.filter(l => (locations || []).includes(l));
  const markets = MARKETS.filter(m => locs.some(l => LOCATION_MARKETS[l] === m));
  const channels = [{ key: COMPANY_CHANNEL, type: 'company', name: 'Company' }];
  for (const m of markets) channels.push({ key: channelKeyForMarket(m), type: 'market', name: m, market: m });
  for (const l of locs) channels.push({ key: channelKeyForLocation(l), type: 'location', name: l, market: LOCATION_MARKETS[l] });
  return channels.sort(CANONICAL);
}

function allChannels() {
  return channelsForLocations(LOCATIONS);
}

function chatChannelsFor(chatAccess) {
  if (!chatAccess || chatAccess.status !== 'approved') return [];
  return channelsForLocations(chatAccess.stores || []);
}

function canManageStore(actor, store) {
  if (!actor) return false;
  if (actor.isAdmin) return true;
  const da = actor.dashboardAccess || { type: 'none' };
  if (da.type === 'all') return true;
  if (da.type === 'specific') return (da.locations || []).includes(store);
  return false;
}

function deriveChannelsForUser(user) {
  const isAdmin = !!(user && user.isAdmin);
  const access = isAdmin ? { type: 'all' } : (user && user.dashboardAccess) || { type: 'none' };

  let dash = [];
  if (access.type === 'all') dash = allChannels();
  else if (access.type === 'specific') dash = channelsForLocations(access.locations || []);

  const chat = chatChannelsFor(user && user.chatAccess);

  const byKey = new Map();
  for (const c of [...dash, ...chat]) if (!byKey.has(c.key)) byKey.set(c.key, c);
  return [...byKey.values()].sort(CANONICAL);
}

function canAccessChannel(user, channelKey) {
  return deriveChannelsForUser(user).some(c => c.key === channelKey);
}

// Who may inspect a channel's member roster. Admins and full-access users see
// every channel; a store-scoped manager/FOM sees only the rosters of their own
// store (location) channels — not the company or market rosters. `channel` is a
// derived channel object ({ key, type, name, market }); for location channels
// `name` is the store name.
function canViewChannelMembers(actor, channel) {
  if (!actor || !channel) return false;
  if (actor.isAdmin) return true;
  const da = actor.dashboardAccess || { type: 'none' };
  if (da.type === 'all') return true;
  if (da.type === 'specific' && channel.type === 'location') {
    return (da.locations || []).includes(channel.name);
  }
  return false;
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
  channelsForLocations,
  allChannels,
  chatChannelsFor,
  canManageStore,
  deriveChannelsForUser,
  canAccessChannel,
  canViewChannelMembers,
  canPostAnnouncements,
  unreadCount,
};
