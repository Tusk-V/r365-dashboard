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

module.exports = { isAuthorized, extractManagers, isStoreMailbox };
