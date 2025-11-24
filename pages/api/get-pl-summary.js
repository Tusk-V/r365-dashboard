// pages/api/get-pl-summary.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Only admin can see summary
  if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('andysdashboard');
    const collection = db.collection('pl_data');

    const summary = await collection.find({})
      .project({ location: 1, periodEnding: 1, uploadedAt: 1, uploadedBy: 1 })
      .sort({ location: 1, periodEnding: -1 })
      .toArray();

    await client.close();
    return res.status(200).json({ summary });

  } catch (error) {
    console.error('Get P&L summary error:', error);
    return res.status(500).json({ error: error.message });
  }
}
