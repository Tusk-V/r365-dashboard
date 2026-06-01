// Pure helpers for the /api/store-managers route. No framework or DB imports
// here so they can be unit-tested directly under `node --test`. CommonJS so the
// Next.js route (via import interop) and the test runner can both consume it.

function isAuthorized(authHeader, expectedToken) {
  if (!expectedToken) return false;      // unset env var must never authorize
  if (!authHeader) return false;
  // Exact match — no trimming, case-sensitive (caller is trusted server-to-server code)
  return authHeader === 'Bearer ' + expectedToken;
}

// Shape raw `users` docs into the roster the recap needs. A "manager" is any
// user scoped to specific dashboard locations.
function extractManagers(users) {
  if (!Array.isArray(users)) return [];
  return users
    .filter((u) =>
      u &&
      u.email &&
      u.dashboardAccess &&
      u.dashboardAccess.type === 'specific' &&
      Array.isArray(u.dashboardAccess.locations) &&
      u.dashboardAccess.locations.length > 0
    )
    .map((u) => ({
      name: u.name || '',
      email: u.email,
      locations: u.dashboardAccess.locations,
    }));
}

module.exports = { isAuthorized, extractManagers };
