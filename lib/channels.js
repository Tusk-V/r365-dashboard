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
const MANAGERS_CHANNEL = 'managers'; // company-wide, dashboard users only (no associates)

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

// Management scope. An actor is { isAdmin, fom, managedMarkets:[], dashboardAccess }.
// - Admin / FOM manage everything.
// - Market managers manage every store in their markets (auto-includes future stores).
// - Store managers manage their explicit dashboardAccess locations.
function storesInMarkets(markets) {
  const set = new Set(markets || []);
  return LOCATIONS.filter(l => set.has(LOCATION_MARKETS[l]));
}

function managedStores(actor) {
  if (!actor) return [];
  if (actor.isAdmin || actor.fom) return [...LOCATIONS];
  const da = actor.dashboardAccess || { type: 'none' };
  if (da.type === 'all') return [...LOCATIONS];
  const set = new Set(storesInMarkets(actor.managedMarkets));
  if (da.type === 'specific') for (const l of da.locations || []) set.add(l);
  return [...set];
}

function canManageStore(actor, store) {
  if (!actor) return false;
  if (actor.isAdmin || actor.fom) return true;
  const da = actor.dashboardAccess || { type: 'none' };
  if (da.type === 'all') return true;
  if ((actor.managedMarkets || []).includes(LOCATION_MARKETS[store])) return true;
  if (da.type === 'specific') return (da.locations || []).includes(store);
  return false;
}

// Can the actor moderate/announce in a channel? company → admin/FOM only;
// market → admin/FOM or a manager of that market; location → admin/FOM or a
// manager of that store (market manager or store manager).
function canManageChannel(actor, channelKey) {
  if (!actor || !channelKey) return false;
  if (actor.isAdmin || actor.fom) return true;
  if (channelKey === COMPANY_CHANNEL) return false;
  if (channelKey === MANAGERS_CHANNEL) return false;
  for (const m of MARKETS) {
    if (channelKeyForMarket(m) === channelKey) return (actor.managedMarkets || []).includes(m);
  }
  for (const l of LOCATIONS) {
    if (channelKeyForLocation(l) === channelKey) return canManageStore(actor, l);
  }
  return false;
}

// A dashboard user (sees all channels; passes the dashboard-data security gate).
function isDashboardUser(actor) {
  if (!actor) return false;
  if (actor.isAdmin || actor.fom) return true;
  if ((actor.managedMarkets || []).length > 0) return true;
  const t = actor.dashboardAccess && actor.dashboardAccess.type;
  return t === 'all' || t === 'specific';
}

// Resolve a channel key to its display object (for explicit inclusions).
function channelByKey(key) {
  if (key === MANAGERS_CHANNEL) return { key, type: 'company', name: 'Managers' };
  return allChannels().find(c => c.key === key) || null;
}

function deriveChannelsForUser(user) {
  // Membership is scoped to what a user is assigned: admin/FOM see every channel;
  // a market manager sees their markets; a store manager (dashboard "specific")
  // sees only their assigned stores. Everyone gets the company channel and the
  // market channel(s) that their stores belong to. Associates (chat-only) are
  // scoped to their approved stores.
  const isAdmin = !!(user && user.isAdmin);
  const owner = !!(user && user.owner);
  const fom = !!(user && user.fom);
  const da = (user && user.dashboardAccess) || { type: 'none' };
  const managedMarkets = (user && user.managedMarkets) || [];

  let dash = [];
  if (isAdmin || owner || fom || da.type === 'all') {
    dash = allChannels();
  } else {
    const locs = new Set(storesInMarkets(managedMarkets));
    if (da.type === 'specific') for (const l of da.locations || []) locs.add(l);
    dash = locs.size ? channelsForLocations([...locs]) : [];
  }

  // Managers channel — every dashboard user (manager and up), never associates.
  const isDash = isAdmin || owner || fom || managedMarkets.length > 0 || da.type === 'all' || da.type === 'specific';
  const managers = isDash ? [{ key: MANAGERS_CHANNEL, type: 'company', name: 'Managers' }] : [];

  const chat = chatChannelsFor(user && user.chatAccess);

  const byKey = new Map();
  for (const c of [...dash, ...managers, ...chat]) if (!byKey.has(c.key)) byKey.set(c.key, c);

  // Explicit per-channel overrides set by an admin in the channel member panel:
  // add people who wouldn't otherwise be in, remove people who would.
  for (const k of (user && user.channelInclusions) || []) {
    if (!byKey.has(k)) { const c = channelByKey(k); if (c) byKey.set(k, c); }
  }
  for (const k of (user && user.channelExclusions) || []) byKey.delete(k);

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
  if (actor.isAdmin || actor.fom) return true;
  const da = actor.dashboardAccess || { type: 'none' };
  if (da.type === 'all') return true;
  const markets = actor.managedMarkets || [];
  if (channel.type === 'market') return markets.includes(channel.market);
  if (channel.type === 'location') {
    return markets.includes(channel.market) || (da.type === 'specific' && (da.locations || []).includes(channel.name));
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
  MANAGERS_CHANNEL,
  slugify,
  channelKeyForMarket,
  channelKeyForLocation,
  channelsForLocations,
  allChannels,
  chatChannelsFor,
  managedStores,
  canManageStore,
  canManageChannel,
  isDashboardUser,
  deriveChannelsForUser,
  canAccessChannel,
  canViewChannelMembers,
  canPostAnnouncements,
  unreadCount,
};
