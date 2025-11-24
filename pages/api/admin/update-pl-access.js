// pages/api/admin/update-pl-access.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Only admin can update access
  if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('andysdashboard');
  const usersCollection = db.collection('users');

  try {
    if (req.method === 'GET') {
      // Get all users with their P&L access
      const users = await usersCollection.find({}).toArray();
      await client.close();
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const { email, plAccess } = req.body;

      if (!email) {
        await client.close();
        return res.status(400).json({ error: 'Email required' });
      }

      // Update or create user with P&L access
      await usersCollection.updateOne(
        { email: { $regex: new RegExp(`^${email}$`, 'i') } },
        { 
          $set: { 
            email: email.toLowerCase(),
            plAccess: plAccess || { type: 'none', locations: [] },
            updatedAt: new Date(),
            updatedBy: session.user.email
          }
        },
        { upsert: true }
      );

      await client.close();
      return res.status(200).json({ success: true, message: `P&L access updated for ${email}` });
    }

    await client.close();
    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    await client.close();
    console.error('Update P&L access error:', error);
    return res.status(500).json({ error: error.message });
  }
}
