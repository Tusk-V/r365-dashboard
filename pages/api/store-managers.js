// pages/api/store-managers.js
// Server-to-server roster endpoint for the Apps Script manager recap job.
// Auth is a shared bearer token (MANAGER_SYNC_TOKEN), NOT a NextAuth session.
// Source of truth is the curated `recapRoster` collection; if it's empty (not
// yet set up), fall back to the old dashboard-access derivation so nothing
// breaks during migration.

import clientPromise from "../../lib/mongodb";
import { isAuthorized, extractManagers, rosterToManagers } from "../../lib/storeManagers";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req.headers.authorization, process.env.MANAGER_SYNC_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = (await clientPromise).db("andysdashboard");

    const rosterDocs = await db.collection('recapRoster').find({}).toArray();
    if (rosterDocs.length > 0) {
      return res.status(200).json({ managers: rosterToManagers(rosterDocs) });
    }

    // Fallback: derive from dashboard access until the roster is curated.
    const users = await db.collection('users').find({ 'dashboardAccess.type': 'specific' }).toArray();
    return res.status(200).json({ managers: extractManagers(users) });
  } catch (error) {
    console.error('store-managers error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
