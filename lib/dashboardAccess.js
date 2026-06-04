// lib/dashboardAccess.js
// Server-side check: does this signed-in user have access to the main dashboard?
// Associates (chat-only employees with no dashboardAccess) MUST get a 403 from
// dashboard data endpoints — the client-side redirect is not a security boundary.
import clientPromise from "./mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export async function hasDashboardAccess(email) {
  if (!email) return false;
  if (email === ADMIN_EMAIL) return true;
  const db = (await clientPromise).db("andysdashboard");
  const user = await db.collection('users').findOne(
    { email },
    { projection: { dashboardAccess: 1 } }
  );
  return !!(user?.dashboardAccess?.type && user.dashboardAccess.type !== 'none');
}
