import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import clientPromise from '../../lib/mongodb';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    // GET - Load saved config
    if (req.method === 'GET') {
      const config = await db.collection('bonus_config').findOne({ key: 'account_toggles' });
      return res.status(200).json({
        toggles: config?.toggles || null,
        updatedAt: config?.updatedAt || null,
        updatedBy: config?.updatedBy || null
      });
    }

    // POST - Save config (admin only)
    if (req.method === 'POST') {
      if (session.user.email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { toggles } = req.body;
      if (!toggles || typeof toggles !== 'object') {
        return res.status(400).json({ error: 'Invalid toggles data' });
      }

      await db.collection('bonus_config').updateOne(
        { key: 'account_toggles' },
        {
          $set: {
            key: 'account_toggles',
            toggles,
            updatedAt: new Date(),
            updatedBy: session.user.email
          }
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Bonus config error:', error);
    return res.status(500).json({ error: error.message });
  }
}
