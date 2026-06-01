const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorized, extractManagers } = require('../lib/storeManagers');

test('isAuthorized: correct bearer token passes', () => {
  assert.equal(isAuthorized('Bearer secret123', 'secret123'), true);
});

test('isAuthorized: wrong / missing / empty-config all fail', () => {
  assert.equal(isAuthorized('Bearer nope', 'secret123'), false);
  assert.equal(isAuthorized(undefined, 'secret123'), false);
  assert.equal(isAuthorized('Bearer ', ''), false);   // unset env must never authorize
  assert.equal(isAuthorized('Bearer secret123', ''), false);
});

test('extractManagers: keeps only specific-access users with locations', () => {
  const users = [
    { name: 'Jane Doe', email: 'jane@r.com', dashboardAccess: { type: 'specific', locations: ['Bixby'] } },
    { name: 'All Access', email: 'all@r.com', dashboardAccess: { type: 'all', locations: [] } },
    { name: 'No Loc', email: 'noloc@r.com', dashboardAccess: { type: 'specific', locations: [] } },
    { name: 'No Access', email: 'na@r.com', dashboardAccess: { type: 'none', locations: [] } },
    { name: 'Missing Field', email: 'mf@r.com' },
  ];
  assert.deepEqual(extractManagers(users), [
    { name: 'Jane Doe', email: 'jane@r.com', locations: ['Bixby'] },
  ]);
});

test('extractManagers: non-array input returns empty array', () => {
  assert.deepEqual(extractManagers(undefined), []);
  assert.deepEqual(extractManagers(null), []);
});
