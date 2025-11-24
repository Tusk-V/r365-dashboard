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
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (session.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    const plData = await db.collection('pl_data')
      .find({})
      .project({ location: 1, periodEnding: 1, uploadedAt: 1, uploadedBy: 1 })
      .sort({ location: 1, periodEnding: -1 })
      .toArray();

    return res.status(200).json({ data: plData });

  } catch (error) {
    console.error('Get P&L summary error:', error);
    return res.status(500).json({ error: error.message });
  }
}
