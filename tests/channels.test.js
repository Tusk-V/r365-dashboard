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
