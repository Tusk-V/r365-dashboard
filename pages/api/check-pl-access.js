// pages/api/admin/manage-pl-access.js
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]';
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  // Verify admin access
  const session = await getServerSession(req, res, authOptions);
  
  if (!session || session.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const database = client.db('planalytics');
    const usersCollection = database.collection('users');

    // GET - Fetch all users with their P&L access
    if (req.method === 'GET') {
      const users = await usersCollection.find({}).toArray();
      
      return res.status(200).json({
        success: true,
        users: users.map(user => ({
          id: user._id.toString(),
          email: user.email,
          name: user.name || user.email.split('@')[0],
          plAccess: user.plAccess || { type: 'none', locations: [] }
        }))
      });
    }

    // POST - Update user's P&L access
    if (req.method === 'POST') {
      const { email, plAccess } = req.body;

      if (!email || !plAccess) {
        return res.status(400).json({ error: 'Missing email or plAccess' });
      }

      // Validate plAccess structure
      if (!['none', 'specific', 'all'].includes(plAccess.type)) {
        return res.status(400).json({ error: 'Invalid access type' });
      }

      if (plAccess.type === 'specific' && !Array.isArray(plAccess.locations)) {
        return res.status(400).json({ error: 'Locations must be an array' });
      }

      // Update user
      const result = await usersCollection.updateOne(
        { email: email.toLowerCase() },
        {
          $set: {
            plAccess: plAccess,
            updatedAt: new Date(),
            updatedBy: session.user.email
          }
        },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        message: 'P&L access updated successfully'
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Error managing P&L access:', error);
    return res.status(500).json({
      error: 'Failed to manage P&L access',
      details: error.message
    });
  } finally {
    await client.close();
  }
}
