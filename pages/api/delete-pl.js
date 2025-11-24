// pages/api/delete-pl.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Only admin can delete
  if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const { location, periodEnding } = req.body;

  if (!location || !periodEnding) {
    return res.status(400).json({ error: 'Location and periodEnding required' });
  }

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('andysdashboard');
    const collection = db.collection('pl_data');

    await collection.deleteOne({ location, periodEnding });

    await client.close();
    return res.status(200).json({ success: true, message: `Deleted P&L for ${location}` });

  } catch (error) {
    console.error('Delete P&L error:', error);
    return res.status(500).json({ error: error.message });
  }
}
