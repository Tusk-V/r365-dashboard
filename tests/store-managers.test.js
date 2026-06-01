const test = require('node:test');
const assert = require('node:assert/strict');
const { isAuthorized, extractManagers, isStoreMailbox, invertToLocationMap, managersToRoster, rosterToManagers, validateRecipients } = require('../lib/storeManagers');

test('isAuthorized: correct bearer token passes', () => {
  assert.equal(isAuthorized('Bearer secret123', 'secret123'), true);
});

test('isAuthorized: wrong / missing / empty-config all fail', () => {
  assert.equal(isAuthorized('Bearer nope', 'secret123'), false);
  assert.equal(isAuthorized(undefined, 'secret123'), false);
  assert.equal(isAuthorized('Bearer ', ''), false);   // unset env must never authorize
  assert.equal(isAuthorized('Bearer secret123', ''), false);
  // Same-length wrong token — exercises the timingSafeEqual path (not the length guard)
  assert.equal(isAuthorized('Bearer aaaaaaaaa', 'secret123'), false);
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
  assert.deepEqual(extractManagers([]), []);
});

test('isStoreMailbox flags shared store-inbox accounts, not people', () => {
  assert.equal(isStoreMailbox("Andy's Frozen Custard Allen"), true);
  assert.equal(isStoreMailbox('Andy’s Frozen Custard Carrollton'), true); // curly apostrophe
  assert.equal(isStoreMailbox('  andys frozen custard eldorado & custer  '), true);
  assert.equal(isStoreMailbox('Jane Doe'), false);
  assert.equal(isStoreMailbox(''), false);
  assert.equal(isStoreMailbox(null), false);
});

test('extractManagers excludes shared store-mailbox accounts', () => {
  const users = [
    { name: 'Ashley Saucedo', email: 'ashley@r.com', dashboardAccess: { type: 'specific', locations: ['Bixby'] } },
    { name: "Andy's Frozen Custard Allen", email: 'allen@r.com', dashboardAccess: { type: 'specific', locations: ['Allen'] } },
    { name: "Andy's Frozen Custard Carrollton", email: 'carrollton@r.com', dashboardAccess: { type: 'specific', locations: ['Carrollton'] } },
  ];
  assert.deepEqual(extractManagers(users), [
    { name: 'Ashley Saucedo', email: 'ashley@r.com', locations: ['Bixby'] },
  ]);
});

test('invertToLocationMap groups by location, dedupes + sorts emails, sorts locations', () => {
  const managers = [
    { name: 'Avery', email: 'avery@r.com', locations: ['Frisco #1', 'Allen'] },
    { name: 'Logan', email: 'logan@r.com', locations: ['Allen'] },
    { name: 'Dup', email: 'avery@r.com', locations: ['Allen'] }, // duplicate email on Allen
  ];
  assert.deepEqual(invertToLocationMap(managers), [
    { location: 'Allen', emails: ['avery@r.com', 'logan@r.com'] },
    { location: 'Frisco #1', emails: ['avery@r.com'] },
  ]);
});

test('invertToLocationMap handles empty / malformed input', () => {
  assert.deepEqual(invertToLocationMap(null), []);
  assert.deepEqual(invertToLocationMap(undefined), []);
  assert.deepEqual(invertToLocationMap([]), []);
  assert.deepEqual(invertToLocationMap([{ name: 'X' }]), []); // no email/locations
});

test('managersToRoster groups managers into per-location recipients (seed shape)', () => {
  const managers = [
    { name: 'Ashley', email: 'ashley@r.com', locations: ['Bixby'] },
    { name: 'Chris', email: 'chris@r.com', locations: ['Bixby', 'Owasso'] },
  ];
  assert.deepEqual(managersToRoster(managers), [
    { location: 'Bixby', recipients: [{ email: 'ashley@r.com', name: 'Ashley' }, { email: 'chris@r.com', name: 'Chris' }] },
    { location: 'Owasso', recipients: [{ email: 'chris@r.com', name: 'Chris' }] },
  ]);
  assert.deepEqual(managersToRoster(null), []);
});

test('rosterToManagers inverts roster docs to managers grouped by email', () => {
  const docs = [
    { location: 'Bixby', recipients: [{ email: 'ashley@r.com', name: 'Ashley' }, { email: 'chris@r.com', name: 'Chris' }] },
    { location: 'Owasso', recipients: [{ email: 'chris@r.com', name: 'Chris' }] },
  ];
  assert.deepEqual(rosterToManagers(docs), [
    { name: 'Ashley', email: 'ashley@r.com', locations: ['Bixby'] },
    { name: 'Chris', email: 'chris@r.com', locations: ['Bixby', 'Owasso'] },
  ]);
  assert.deepEqual(rosterToManagers(undefined), []);
});

test('rosterToManagers skips malformed docs and recipients', () => {
  const docs = [
    { location: 'Bixby', recipients: [{ email: 'a@r.com', name: '' }, { name: 'no email' }] },
    { location: 'NoArray' },
  ];
  assert.deepEqual(rosterToManagers(docs), [
    { name: '', email: 'a@r.com', locations: ['Bixby'] },
  ]);
});

test('validateRecipients flags only malformed/missing emails (any valid address allowed)', () => {
  const input = [
    { location: 'Bixby', recipients: [{ email: 'anyone@example.com' }, { email: 'not-an-email' }] },
    { location: 'Owasso', recipients: [{ name: 'no email' }] },
  ];
  assert.deepEqual(validateRecipients(input), ['not-an-email', '(missing email)']);
  assert.deepEqual(validateRecipients([]), []);
});

test('managersToRoster dedupes a repeated email within a location', () => {
  const managers = [
    { name: 'Chris', email: 'chris@r.com', locations: ['Bixby'] },
    { name: 'Chris Dup', email: 'chris@r.com', locations: ['Bixby'] },
  ];
  assert.deepEqual(managersToRoster(managers), [
    { location: 'Bixby', recipients: [{ email: 'chris@r.com', name: 'Chris' }] },
  ]);
});

test('validateRecipients dedupes and tolerates non-array input', () => {
  const input = [
    { location: 'Bixby', recipients: [{ email: 'bad' }] },
    { location: 'Owasso', recipients: [{ email: 'bad' }] },
  ];
  assert.deepEqual(validateRecipients(input), ['bad']);
  assert.deepEqual(validateRecipients(null), []);
});
