// pages/api/admin/recap-roster.js
// Session-gated admin endpoint — returns the location-to-recipients roster for
// the manager morning recap emails. Admin-only; browsers use their NextAuth
// session (unlike /api/store-managers which uses a bearer token).

import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { extractManagers, invertToLocationMap } from "../../../lib/storeManagers";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session || session.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const client = await clientPromise;
    const users = await client
      .db("andysdashboard")
      .collection('users')
      .find({ 'dashboardAccess.type': 'specific' })
      .toArray();

    const managers = extractManagers(users);
    const locations = invertToLocationMap(managers);

    return res.status(200).json({
      locations,
      recipientCount: managers.length,
      locationCount: locations.length,
    });
  } catch (error) {
    console.error('recap-roster error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
