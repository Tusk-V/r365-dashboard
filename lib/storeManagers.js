// Pure helpers for the /api/store-managers route. No framework or DB imports
// here so they can be unit-tested directly under `node --test`. CommonJS so the
// Next.js route (via import interop) and the test runner can both consume it.

const crypto = require('crypto');

function isAuthorized(authHeader, expectedToken) {
  if (!expectedToken) return false;      // unset env var must never authorize
  if (!authHeader) return false;
  const expected = 'Bearer ' + expectedToken;
  // Constant-time compare — this endpoint is publicly reachable, so avoid a timing oracle.
  // Length check first (timingSafeEqual throws on unequal-length buffers); leaking length is acceptable.
  if (authHeader.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected));
}

// Shared store-inbox accounts are named like "Andy's Frozen Custard Allen" —
// they hold specific dashboard access but are mailboxes, not people, so they
// must not receive a personal recap. Match the distinctive phrase (apostrophe-
// agnostic, case-insensitive) so it catches every store account.
const STORE_MAILBOX_NAME_PATTERN = /frozen custard/i;

function isStoreMailbox(name) {
  return STORE_MAILBOX_NAME_PATTERN.test(String(name || ''));
}

// Shape raw `users` docs into the roster the recap needs. A "manager" is any
// real person scoped to specific dashboard locations (shared store mailboxes
// are excluded).
function extractManagers(users) {
  if (!Array.isArray(users)) return [];
  return users
    .filter((u) =>
      u &&
      u.email &&
      u.dashboardAccess &&
      u.dashboardAccess.type === 'specific' &&
      Array.isArray(u.dashboardAccess.locations) &&
      u.dashboardAccess.locations.length > 0 &&
      !isStoreMailbox(u.name)
    )
    .map((u) => ({
      name: u.name || '',
      email: u.email,
      locations: u.dashboardAccess.locations,
    }));
}

// Invert the roster (person -> locations) into (location -> recipient emails)
// for the read-only admin roster view. Emails deduped + sorted; locations sorted.
function invertToLocationMap(managers) {
  if (!Array.isArray(managers)) return [];
  const byLoc = {};
  managers.forEach((m) => {
    if (!m || !m.email || !Array.isArray(m.locations)) return;
    m.locations.forEach((loc) => {
      if (!byLoc[loc]) byLoc[loc] = [];
      if (byLoc[loc].indexOf(m.email) === -1) byLoc[loc].push(m.email);
    });
  });
  return Object.keys(byLoc)
    .sort((a, b) => a.localeCompare(b))
    .map((loc) => ({ location: loc, emails: byLoc[loc].slice().sort() }));
}

// Build the per-location seed (location -> recipients) from derived managers.
// managers: [{name,email,locations}] -> [{location, recipients:[{email,name}]}]
function managersToRoster(managers) {
  if (!Array.isArray(managers)) return [];
  const byLoc = {};
  managers.forEach((m) => {
    if (!m || !m.email || !Array.isArray(m.locations)) return;
    m.locations.forEach((loc) => {
      if (!byLoc[loc]) byLoc[loc] = {};
      if (!(m.email in byLoc[loc])) byLoc[loc][m.email] = m.name || '';
    });
  });
  return Object.keys(byLoc)
    .sort((a, b) => a.localeCompare(b))
    .map((loc) => ({
      location: loc,
      recipients: Object.keys(byLoc[loc]).sort().map((email) => ({ email, name: byLoc[loc][email] })),
    }));
}

// Invert roster docs into the manager shape Apps Script consumes (grouped by
// email across stores). rosterDocs: [{location, recipients:[{email,name}]}]
// -> [{name,email,locations}]
function rosterToManagers(rosterDocs) {
  if (!Array.isArray(rosterDocs)) return [];
  const byEmail = {};
  rosterDocs.forEach((doc) => {
    if (!doc || !doc.location || !Array.isArray(doc.recipients)) return;
    doc.recipients.forEach((r) => {
      if (!r || !r.email) return;
      if (!byEmail[r.email]) byEmail[r.email] = { name: r.name || '', email: r.email, locations: [] };
      if (!byEmail[r.email].name && r.name) byEmail[r.email].name = r.name;
      if (byEmail[r.email].locations.indexOf(doc.location) === -1) byEmail[r.email].locations.push(doc.location);
    });
  });
  return Object.keys(byEmail)
    .sort((a, b) => a.localeCompare(b))
    .map((email) => {
      const m = byEmail[email];
      m.locations.sort((a, b) => a.localeCompare(b));
      return m;
    });
}

// Return recipient emails that are NOT in the known set (or are missing).
// rosterInput: [{location, recipients:[{email,name}]}]; knownEmails: string[]
function validateRecipients(rosterInput, knownEmails) {
  const known = new Set(Array.isArray(knownEmails) ? knownEmails : []);
  const invalid = [];
  (Array.isArray(rosterInput) ? rosterInput : []).forEach((doc) => {
    if (!doc || !Array.isArray(doc.recipients)) return;
    doc.recipients.forEach((r) => {
      const email = r && r.email;
      if (!email) { invalid.push('(missing email)'); return; }
      if (!known.has(email)) invalid.push(email);
    });
  });
  return invalid;
}

module.exports = { isAuthorized, extractManagers, isStoreMailbox, invertToLocationMap, managersToRoster, rosterToManagers, validateRecipients };
