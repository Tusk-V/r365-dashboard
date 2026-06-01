// pages/api/store-managers.js
// Server-to-server roster endpoint for the Apps Script manager recap job.
// Auth is a shared bearer token (MANAGER_SYNC_TOKEN), NOT a NextAuth session,
// because the caller is a script with no browser login.

import clientPromise from "../../lib/mongodb";
import { isAuthorized, extractManagers } from "../../lib/storeManagers";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req.headers.authorization, process.env.MANAGER_SYNC_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const users = await db
      .collection('users')
      .find({ 'dashboardAccess.type': 'specific' })
      .toArray();

    return res.status(200).json({ managers: extractManagers(users) });
  } catch (error) {
    console.error('store-managers error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
