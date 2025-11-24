import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import clientPromise from '../../../../lib/mongodb';

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

    if (req.method === 'GET') {
      const users = await db.collection('users').find({}).toArray();
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const { email, accessType, locations } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      await db.collection('users').updateOne(
        { email },
        {
          $set: {
            email,
            plAccess: {
              type: accessType || 'none',
              locations: locations || []
            },
            updatedAt: new Date(),
            updatedBy: session.user.email
          }
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

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
    console.error('Update P&L access error:', error);
    return res.status(500).json({ error: error.message });
  }
}
