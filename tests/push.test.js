const test = require('node:test');
const assert = require('node:assert/strict');
const { recipientsForChannel } = require('../lib/push');

const admin = { email: 'dalton@rancherscustard.com' };
const gmBixby = { email: 'gm@rancherscustard.com', dashboardAccess: { type: 'specific', locations: ['Bixby'] } };
const empBixby = { email: 'emp@x.com', chatAccess: { level: 'employee', status: 'approved', stores: ['Bixby'] } };
const empAllen = { email: 'allen@x.com', chatAccess: { level: 'employee', status: 'approved', stores: ['Allen'] } };
const empPending = { email: 'pend@x.com', chatAccess: { level: 'employee', status: 'pending', stores: ['Bixby'] } };
const users = [admin, gmBixby, empBixby, empAllen, empPending];

test('recipients for a store channel = everyone who can access it, minus author', () => {
  const r = recipientsForChannel(users, 'loc:bixby', { excludeEmail: 'gm@rancherscustard.com', isAnnouncement: false });
  assert.deepEqual(new Set(r), new Set(['dalton@rancherscustard.com', 'emp@x.com']));
});

test('employee for another store is excluded', () => {
  const r = recipientsForChannel(users, 'loc:bixby', { excludeEmail: null, isAnnouncement: false });
  assert.ok(!r.includes('allen@x.com'));
});

test('pending/none chat users get nothing', () => {
  const r = recipientsForChannel(users, 'loc:bixby', { excludeEmail: null, isAnnouncement: false });
  assert.ok(!r.includes('pend@x.com'));
});

test('company-wide reaches all approved chat users + admin', () => {
  const r = recipientsForChannel(users, 'company-wide', { excludeEmail: null, isAnnouncement: false });
  assert.deepEqual(new Set(r), new Set(['dalton@rancherscustard.com', 'gm@rancherscustard.com', 'emp@x.com', 'allen@x.com']));
});

test('muted channel is skipped for normal messages but NOT for announcements', () => {
  const muted = { email: 'm@x.com', chatAccess: { level: 'employee', status: 'approved', stores: ['Bixby'] }, mutedChannels: ['loc:bixby'] };
  const set = [muted];
  assert.deepEqual(recipientsForChannel(set, 'loc:bixby', { excludeEmail: null, isAnnouncement: false }), []);
  assert.deepEqual(recipientsForChannel(set, 'loc:bixby', { excludeEmail: null, isAnnouncement: true }), ['m@x.com']);
});
