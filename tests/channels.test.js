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
