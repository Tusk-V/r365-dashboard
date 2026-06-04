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
const { deriveChannelsForUser, canAccessChannel } = require('../lib/channels');

test('admin sees company + all markets + all locations', () => {
  const channels = deriveChannelsForUser({ isAdmin: true });
  assert.equal(channels[0].key, 'company-wide');
  assert.equal(channels.filter(c => c.type === 'market').length, 4);
  assert.equal(channels.filter(c => c.type === 'location').length, LOCATIONS.length);
});

test('specific-access user sees company + spanned markets + their locations', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Frisco #3', 'Allen'] } };
  const keys = deriveChannelsForUser(user).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:dallas', 'loc:allen', 'loc:frisco-3']);
});

test('specific user spanning two markets gets both market channels', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby', 'Norman'] } };
  const keys = deriveChannelsForUser(user).map(c => c.key);
  assert.deepEqual(keys, ['company-wide', 'market:tulsa', 'market:oklahoma-city', 'loc:bixby', 'loc:norman']);
});

test('type "all" in dashboardAccess behaves like admin', () => {
  const channels = deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'all' } });
  assert.equal(channels.filter(c => c.type === 'location').length, LOCATIONS.length);
});

test('no-access user sees no channels', () => {
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false, dashboardAccess: { type: 'none' } }), []);
  assert.deepEqual(deriveChannelsForUser({ isAdmin: false }), []);
});

test('canAccessChannel enforces derived membership', () => {
  const user = { isAdmin: false, dashboardAccess: { type: 'specific', locations: ['Bixby'] } };
  assert.equal(canAccessChannel(user, 'company-wide'), true);
  assert.equal(canAccessChannel(user, 'market:tulsa'), true);
  assert.equal(canAccessChannel(user, 'loc:bixby'), true);
  assert.equal(canAccessChannel(user, 'market:dallas'), false);
  assert.equal(canAccessChannel(user, 'loc:allen'), false);
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

test('a user with BOTH dashboard and chat access gets the union, deduped and ordered', () => {
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
