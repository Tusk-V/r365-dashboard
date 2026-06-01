// pages/api/admin/recap-roster.js
// Session-gated admin endpoint for the manager-recap roster.
//   GET  -> { locations:[{location,recipients:[{email,name}]}], availableUsers:[{email,name}], seeded }
//           Returns persisted recapRoster if present; otherwise the derived
//           list as an unsaved seed (seeded:false). Every canonical store is
//           present (empty recipients if none).
//   POST  -> upserts one recapRoster doc per location. Rejects recipients that
//           are not known app users.

import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { extractManagers, managersToRoster, validateRecipients } from "../../../lib/storeManagers";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Mirrors ALL_LOCATIONS in pages/admin/users.js — every store gets a row.
const ALL_LOCATIONS = [
  'Allen', 'Bixby', 'Broken Arrow', 'Carrollton', 'Claremore', 'Edmond',
  'Frisco #1', 'Frisco #2', 'Frisco #3', 'Hillcrest Village',
  "Hunter's Creek", 'Lake Highlands', 'Lakeland', 'Norman', 'Owasso', 'Penn',
  'Prosper', 'Sanford', 'The Colony', 'Treat Truck', 'Warr Acres', 'Yale',
];

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || session.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const db = (await clientPromise).db("andysdashboard");

  if (req.method === 'GET') {
    try {
      const users = await db.collection('users').find({}).toArray();
      const availableUsers = users
        .filter((u) => u.email)
        .map((u) => ({ email: u.email, name: u.name || '' }))
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));

      const rosterDocs = await db.collection('recapRoster').find({}).toArray();
      let baseLocations;
      let seeded;
      if (rosterDocs.length > 0) {
        baseLocations = rosterDocs.map((d) => ({ location: d.location, recipients: d.recipients || [] }));
        seeded = true;
      } else {
        baseLocations = managersToRoster(extractManagers(users));
        seeded = false;
      }

      const byLoc = {};
      baseLocations.forEach((l) => { byLoc[l.location] = l.recipients || []; });
      const allNames = Array.from(new Set([...ALL_LOCATIONS, ...Object.keys(byLoc)]));
      const locations = allNames
        .sort((a, b) => a.localeCompare(b))
        .map((location) => ({ location, recipients: byLoc[location] || [] }));

      return res.status(200).json({ locations, availableUsers, seeded });
    } catch (error) {
      console.error('recap-roster GET error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const incoming = Array.isArray(req.body?.locations) ? req.body.locations : null;
      if (!incoming) {
        return res.status(400).json({ error: 'Body must include a locations array' });
      }

      const users = await db.collection('users').find({}).toArray();
      const knownEmails = users.map((u) => u.email).filter(Boolean);
      const invalid = validateRecipients(incoming, knownEmails);
      if (invalid.length > 0) {
        return res.status(400).json({ error: 'Unknown recipient(s)', invalid });
      }

      const now = new Date();
      const coll = db.collection('recapRoster');
      for (const l of incoming) {
        if (!l || !l.location) continue;
        const recipients = Array.isArray(l.recipients)
          ? l.recipients
              .filter((r) => r && r.email)
              .map((r) => ({ email: r.email, name: r.name || '' }))
          : [];
        await coll.replaceOne(
          { location: l.location },
          { location: l.location, recipients, updatedAt: now, updatedBy: session.user.email },
          { upsert: true }
        );
      }

      return res.status(200).json({ success: true, count: incoming.length });
    } catch (error) {
      console.error('recap-roster POST error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
