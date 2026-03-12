import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import clientPromise from '../../lib/mongodb';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
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

    const { location, periodEnding, reportType } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'Location required' });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    const selectedReportType = reportType || 'period-ytd';
    
    // Build query based on report type
    let query = { location };
    if (selectedReportType === 'period-ytd') {
      // For period-ytd, match documents with reportType='period-ytd' OR no reportType field (legacy)
      query.$or = [{ reportType: 'period-ytd' }, { reportType: { $exists: false } }];
    } else {
      // current-prior and ytd-prior-ytd each have their own reportType
      query.reportType = selectedReportType;
    }
    
    if (periodEnding) {
      query.periodEnding = periodEnding;
    }

    const result = await db.collection('pl_data').deleteMany(query);

    return res.status(200).json({
      success: true,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    console.error('Delete P&L error:', error);
    return res.status(500).json({ error: error.message });
  }
}
