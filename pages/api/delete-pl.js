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

    const { location, periodEnding, reportType, all } = req.query;

    if (!location) {
      return res.status(400).json({ error: 'Location required' });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    // Build query
    let query = { location };
    
    if (periodEnding) {
      query.periodEnding = periodEnding;
    }

    // If all=true, delete all report types for this location+period
    // Otherwise filter by specific report type
    if (all !== 'true' && reportType) {
      const selectedReportType = reportType;
      if (selectedReportType === 'period-ytd') {
        // For period-ytd, match documents with reportType='period-ytd' OR no reportType field (legacy)
        query.$or = [{ reportType: 'period-ytd' }, { reportType: { $exists: false } }];
      } else {
        query.reportType = selectedReportType;
      }
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
