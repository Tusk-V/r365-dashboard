import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import clientPromise from '../../../lib/mongodb';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (session.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    // GET - Fetch all users
    if (req.method === 'GET') {
      const users = await db.collection('users')
        .find({})
        .sort({ lastLogin: -1, createdAt: -1 })
        .toArray();
      
      return res.status(200).json({ 
        users: users.map(u => ({
          email: u.email,
          name: u.name,
          image: u.image,
          dashboardAccess: u.dashboardAccess || { type: 'none', locations: [] },
          plAccess: u.plAccess || { type: 'none', locations: [] },
          lastLogin: u.lastLogin,
          createdAt: u.createdAt
        }))
      });
    }

    // POST - Update user access
    if (req.method === 'POST') {
      const { email, dashboardAccess, plAccess, accessType, locations } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      // Build update object
      const updateFields = {
        updatedAt: new Date(),
        updatedBy: session.user.email
      };

      // Support new two-column format
      if (dashboardAccess !== undefined) {
        updateFields.dashboardAccess = {
          type: dashboardAccess.type || 'none',
          locations: dashboardAccess.locations || []
        };
      }

      if (plAccess !== undefined) {
        updateFields.plAccess = {
          type: plAccess.type || 'none',
          locations: plAccess.locations || []
        };
      }

      // Backward compatibility: if only accessType/locations sent, treat as plAccess
      if (accessType !== undefined && plAccess === undefined) {
        updateFields.plAccess = {
          type: accessType || 'none',
          locations: locations || []
        };
      }

      await db.collection('users').updateOne(
        { email },
        { $set: updateFields },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

    // DELETE - Remove user
    if (req.method === 'DELETE') {
      const { email } = req.query;
      
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      await db.collection('users').deleteOne({ email });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Update access error:', error);
    return res.status(500).json({ error: error.message });
  }
}
