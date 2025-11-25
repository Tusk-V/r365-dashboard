// pages/api/check-pl-access.js
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import clientPromise from '../../lib/mongodb';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userEmail = session.user.email;

    // Admin has full access
    if (userEmail === ADMIN_EMAIL) {
      return res.status(200).json({
        success: true,
        isAdmin: true,
        access: {
          type: 'all',
          locations: []
        }
      });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    const user = await db.collection('users').findOne({ email: userEmail });

    if (!user || !user.plAccess) {
      return res.status(200).json({
        success: true,
        isAdmin: false,
        access: {
          type: 'none',
          locations: []
        }
      });
    }

    return res.status(200).json({
      success: true,
      isAdmin: false,
      access: user.plAccess
    });

  } catch (error) {
    console.error('Check P&L access error:', error);
    return res.status(500).json({
      error: 'Failed to check access',
      details: error.message
    });
  }
}
