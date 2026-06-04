const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MARKETS, LOCATIONS, LOCATION_MARKETS,
  slugify, channelKeyForMarket, channelKeyForLocation, COMPANY_CHANNEL,
} = require('../lib/channels');

test('MARKETS lists the four markets in business order', () => {
  assert.deepEqual(MARKETS, ['Tulsa', 'Oklahoma City', 'Dallas', 'Orlando']);
});

test('LOCATION_MARKETS maps every location to its market', () => {
  assert.equal(LOCATION_MARKETS['Bixby'], 'Tulsa');
  assert.equal(LOCATION_MARKETS['Warr Acres'], 'Oklahoma City');
  assert.equal(LOCATION_MARKETS['Frisco #3'], 'Dallas');
  assert.equal(LOCATION_MARKETS["Hunter's Creek"], 'Orlando');
});

test('LOCATIONS is the sorted list of all mapped locations', () => {
  assert.equal(LOCATIONS.length, Object.keys(LOCATION_MARKETS).length);
  assert.deepEqual(LOCATIONS, [...LOCATIONS].sort((a, b) => a.localeCompare(b)));
  assert.ok(LOCATIONS.includes('Allen'));
});

test('slugify lowercases and strips punctuation/spaces', () => {
  assert.equal(slugify('Frisco #3'), 'frisco-3');
  assert.equal(slugify('Warr Acres'), 'warr-acres');
  assert.equal(slugify("Hunter's Creek"), 'hunters-creek');
  assert.equal(slugify('The Colony'), 'the-colony');
  assert.equal(slugify('Oklahoma City'), 'oklahoma-city');
});

test('channel key helpers build prefixed keys', () => {
  assert.equal(COMPANY_CHANNEL, 'company-wide');
  assert.equal(channelKeyForMarket('Dallas'), 'market:dallas');
  assert.equal(channelKeyForLocation('Frisco #3'), 'loc:frisco-3');
});

// Task 2: deriveChannelsForUser + canAccessChannel
const { deriveChannelsForUser, canAccessChannel, allChannels } = require('../lib/channels');

test('admin sees company + all markets + all locations', () => {
  const channels = deriveChannelsForUser({ isAdmin: true });
  assert.equal(channels[0].key, 'company-wide');
  assert.equal(channels.filter(c => c.type === 'market').length, 4);
  assert.equal(channels.filter(c => c.type === 'location').length, LOCATIONS.length);
});

test('a store-scoped dashboard user sees company + their markets + their stores', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Frisco #3', 'Allen'] } };
  const keys = deriveChannelsForUser(user).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:dallas', 'loc:allen', 'loc:frisco-3']);
});

test('a market manager sees company + their market + that market\'s stores only', () => {
  const keys = deriveChannelsForUser({ isAdmin: false, managedMarkets: ['Dallas'] }).map(c => c.key);
  assert.equal(keys[0], 'company-wide');
  assert.ok(keys.includes('market:dallas'));
  assert.ok(keys.includes('loc:allen') && keys.includes('loc:frisco-3') && keys.includes('loc:carrollton'));
  assert.ok(!keys.includes('market:tulsa'));
  assert.ok(!keys.includes('loc:bixby'));
});

test('FOM sees every channel', () => {
  const all = allChannels().map(c => c.key);
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, fom: true }).map(c => c.key), all);
});

test('type "all" in dashboardAccess behaves like admin', () => {
  const channels = deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'all' } });
  assert.equal(channels.filter(c => c.type === 'location').length, LOCATIONS.length);
});

test('no-access user sees no channels', () => {
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' } }), []);
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false }), []);
});

test('canAccessChannel: a store-scoped dashboard user is limited to their stores', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby'] } };
  assert.equal(canAccessChannel(user, 'company-wide'), true);
  assert.equal(canAccessChannel(user, 'market:tulsa'), true);
  assert.equal(canAccessChannel(user, 'loc:bixby'), true);
  assert.equal(canAccessChannel(user, 'market:dallas'), false);
  assert.equal(canAccessChannel(user, 'loc:allen'), false);
});

test('canAccessChannel: an associate stays store-scoped', () => {
  const a = { isAdmin: false, dashboardAccess: { type: 'none' }, chatAccess: { status: 'approved', stores: ['Bixby'] } };
  assert.equal(canAccessChannel(a, 'company-wide'), true);
  assert.equal(canAccessChannel(a, 'market:tulsa'), true);
  assert.equal(canAccessChannel(a, 'loc:bixby'), true);
  assert.equal(canAccessChannel(a, 'market:dallas'), false);
  assert.equal(canAccessChannel(a, 'loc:allen'), false);
});

// Task 3: canPostAnnouncements + unreadCount
const { canPostAnnouncements, unreadCount } = require('../lib/channels');


test('only Admin and FOM can post announcements', () => {
  assert.equal(canPostAnnouncements('Admin'), true);
  assert.equal(canPostAnnouncements('FOM'), true);
  assert.equal(canPostAnnouncements('Manager'), false);
  assert.equal(canPostAnnouncements('User'), false);
  assert.equal(canPostAnnouncements(undefined), false);
});

test('unreadCount counts messages after lastReadAt not authored by the user', () => {
  const msgs = [
    { createdAt: '2026-06-03T10:00:00Z', authorEmail: 'a@r.com' },
    { createdAt: '2026-06-03T11:00:00Z', authorEmail: 'me@r.com' },
    { createdAt: '2026-06-03T12:00:00Z', authorEmail: 'b@r.com' },
  ];
  assert.equal(unreadCount(msgs, '2026-06-03T10:30:00Z', 'me@r.com'), 1);
  assert.equal(unreadCount(msgs, null, 'me@r.com'), 2);
  assert.equal(unreadCount([], null, 'me@r.com'), 0);
});

// Task 4 (Phase 1): chatAccess channel derivation + canManageStore
const { chatChannelsFor, canManageStore } = require('../lib/channels');

test('approved employee sees company + their markets + their stores (multi-store)', () => {
  const chatAccess = { level: 'employee', status: 'approved', stores: ['Bixby', 'Allen'] };
  const keys = deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' }, chatAccess }).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:tulsa', 'market:dallas', 'loc:bixby', 'loc:allen']);
});

test('pending or none chatAccess yields no channels', () => {
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' }, chatAccess: { status: 'pending', stores: ['Bixby'] } }), []);
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' } }), []);
});

test('a dashboard+chat user sees the union of their stores', () => {
  const keys = deriveChannelsForUser({
    isAdmin: false,
    dashboardAccess: { type: 'specific', locations: ['Bixby'] },
    chatAccess: { level: 'employee', status: 'approved', stores: ['Allen'] },
  }).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:tulsa', 'market:dallas', 'loc:bixby', 'loc:allen']);
});

test('chatChannelsFor returns [] unless approved', () => {
  assert.deepEqual(chatChannelsFor({ status: 'pending', stores: ['Bixby'] }), []);
  assert.equal(chatChannelsFor({ status: 'approved', stores: ['Bixby'] }).length, 3); // company + tulsa + bixby
});

test('canManageStore: admin/all manage any; specific manages only their locations', () => {
  assert.equal(canManageStore({ isAdmin: true }, 'Allen'), true);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'all' } }, 'Allen'), true);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Allen'] } }, 'Allen'), true);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby'] } }, 'Allen'), false);
  assert.equal(canManageStore({ isAdmin: false, dashboardAccess: { type: 'none' } }, 'Allen'), false);
});

// Scope tiers: FOM + market manager
const { managedStores, canManageChannel, isDashboardUser } = require('../lib/channels');

test('canManageStore: FOM manages any store; market manager manages their markets', () => {
  assert.equal(canManageStore({ isAdmin: false, fom: true }, 'Allen'), true);
  assert.equal(canManageStore({ isAdmin: false, fom: true }, 'Bixby'), true);
  const dallasMgr = { isAdmin: false, managedMarkets: ['Dallas'] };
  assert.equal(canManageStore(dallasMgr, 'Allen'), true);   // Dallas store
  assert.equal(canManageStore(dallasMgr, 'Frisco #3'), true);
  assert.equal(canManageStore(dallasMgr, 'Bixby'), false);  // Tulsa store
});

test('managedStores: union of FOM/market/specific scopes', () => {
  assert.equal(managedStores({ isAdmin: false, fom: true }).length, LOCATIONS.length);
  assert.equal(managedStores({ isAdmin: false, dashboardAccess: { type: 'all' } }).length, LOCATIONS.length);
  const dallas = managedStores({ isAdmin: false, managedMarkets: ['Dallas'] });
  assert.ok(dallas.includes('Allen') && dallas.includes('Frisco #3'));
  assert.ok(!dallas.includes('Bixby'));
  const mixed = managedStores({ isAdmin: false, managedMarkets: ['Tulsa'], dashboardAccess: { type: 'specific', locations: ['Allen'] } });
  assert.ok(mixed.includes('Bixby') && mixed.includes('Allen')); // Tulsa stores + Allen
});

test('canManageChannel: company=FOM/admin only; market/location by scope', () => {
  const admin = { isAdmin: true };
  for (const k of ['company-wide', 'market:dallas', 'loc:allen']) assert.equal(canManageChannel(admin, k), true);

  const fom = { isAdmin: false, fom: true };
  assert.equal(canManageChannel(fom, 'company-wide'), true);

  const dallasMgr = { isAdmin: false, managedMarkets: ['Dallas'] };
  assert.equal(canManageChannel(dallasMgr, 'market:dallas'), true);
  assert.equal(canManageChannel(dallasMgr, 'loc:allen'), true);
  assert.equal(canManageChannel(dallasMgr, 'company-wide'), false); // not the company channel
  assert.equal(canManageChannel(dallasMgr, 'market:tulsa'), false);
  assert.equal(canManageChannel(dallasMgr, 'loc:bixby'), false);

  const storeMgr = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby'] } };
  assert.equal(canManageChannel(storeMgr, 'loc:bixby'), true);
  assert.equal(canManageChannel(storeMgr, 'market:tulsa'), false); // store mgr ≠ market channel
  assert.equal(canManageChannel(storeMgr, 'company-wide'), false);
  assert.equal(canManageChannel(storeMgr, 'loc:allen'), false);
});

test('isDashboardUser: admin/FOM/market-manager/specific yes; associate no', () => {
  assert.equal(isDashboardUser({ isAdmin: true }), true);
  assert.equal(isDashboardUser({ isAdmin: false, fom: true }), true);
  assert.equal(isDashboardUser({ isAdmin: false, managedMarkets: ['Dallas'] }), true);
  assert.equal(isDashboardUser({ isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby'] } }), true);
  assert.equal(isDashboardUser({ isAdmin: false, dashboardAccess: { type: 'all' } }), true);
  assert.equal(isDashboardUser({ isAdmin: false, dashboardAccess: { type: 'none' } }), false);
  assert.equal(isDashboardUser({ isAdmin: false, managedMarkets: [] }), false);
});

// Members directory scoping
const { canViewChannelMembers } = require('../lib/channels');

const COMPANY = { key: 'company-wide', type: 'company', name: 'Company' };
const MKT_DALLAS = { key: 'market:dallas', type: 'market', name: 'Dallas', market: 'Dallas' };
const LOC_ALLEN = { key: 'loc:allen', type: 'location', name: 'Allen', market: 'Dallas' };
const LOC_BIXBY = { key: 'loc:bixby', type: 'location', name: 'Bixby', market: 'Tulsa' };

test('canViewChannelMembers: admin and full-access see every channel', () => {
  for (const ch of [COMPANY, MKT_DALLAS, LOC_ALLEN, LOC_BIXBY]) {
    assert.equal(canViewChannelMembers({ isAdmin: true }, ch), true);
    assert.equal(canViewChannelMembers({ isAdmin: false, dashboardAccess: { type: 'all' } }, ch), true);
  }
});

test('canViewChannelMembers: store-scoped manager sees only their own store rosters', () => {
  const mgr = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Allen'] } };
  assert.equal(canViewChannelMembers(mgr, LOC_ALLEN), true);
  assert.equal(canViewChannelMembers(mgr, LOC_BIXBY), false);
  assert.equal(canViewChannelMembers(mgr, MKT_DALLAS), false); // not the market roster
  assert.equal(canViewChannelMembers(mgr, COMPANY), false);    // not the company roster
});

test('canViewChannelMembers: no-access users see nothing', () => {
  assert.equal(canViewChannelMembers({ isAdmin: false, dashboardAccess: { type: 'none' } }, LOC_ALLEN), false);
  assert.equal(canViewChannelMembers(null, LOC_ALLEN), false);
  assert.equal(canViewChannelMembers({ isAdmin: false }, COMPANY), false);
});
