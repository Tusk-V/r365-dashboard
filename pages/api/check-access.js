// pages/api/check-access.js
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

    // Admin has full access to everything
    if (userEmail === ADMIN_EMAIL) {
      return res.status(200).json({
        isAdmin: true,
        dashboardAccess: { type: 'all', locations: [] },
        plAccess: { type: 'all', locations: [] }
      });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    const user = await db.collection('users').findOne({ email: userEmail });

    if (!user) {
      return res.status(200).json({
        isAdmin: false,
        dashboardAccess: { type: 'none', locations: [] },
        plAccess: { type: 'none', locations: [] }
      });
    }

    return res.status(200).json({
      isAdmin: false,
      dashboardAccess: user.dashboardAccess || { type: 'none', locations: [] },
      plAccess: user.plAccess || { type: 'none', locations: [] }
    });

  } catch (error) {
    console.error('Check access error:', error);
    return res.status(500).json({ error: error.message });
  }
}
