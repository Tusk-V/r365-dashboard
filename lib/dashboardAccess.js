// lib/dashboardAccess.js
// Server-side check: does this signed-in user have access to the main dashboard?
// Associates (chat-only employees with no dashboardAccess) MUST get a 403 from
// dashboard data endpoints — the client-side redirect is not a security boundary.
import clientPromise from "./mongodb";
import { isDashboardUser } from "./channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export async function hasDashboardAccess(email) {
  if (!email) return false;
  if (email === ADMIN_EMAIL) return true;
  const db = (await clientPromise).db("andysdashboard");
  const user = await db.collection('users').findOne(
    { email },
    { projection: { dashboardAccess: 1, owner: 1, fom: 1, managedMarkets: 1 } }
  );
  // Owners and FOMs are dashboard users; market/store managers are too.
  // Associates (chat-only) are not.
  return isDashboardUser({
    isAdmin: false,
    owner: user?.owner,
    fom: user?.fom,
    managedMarkets: user?.managedMarkets,
    dashboardAccess: user?.dashboardAccess,
  });
}
