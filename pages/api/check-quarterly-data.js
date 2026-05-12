// pages/api/admin/check-quarterly-data.js
// Admin-only diagnostic — lists all quarterly P&L docs grouped by location
// so you can spot duplicates before they cause stale reads on the bonus dashboard.
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import clientPromise from '../../../lib/mongodb';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session || session.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin only' });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    const docs = await db.collection('pl_data')
      .find({ reportType: 'quarterly' })
      .project({
        location: 1,
        periodEnding: 1,
        quarterLabel: 1,
        priorQuarterLabel: 1,
        uploadedAt: 1,
        uploadedBy: 1
      })
      .sort({ location: 1, periodEnding: -1, uploadedAt: -1 })
      .toArray();

    // Group by location + periodEnding to surface duplicates
    const groups = {};
    for (const d of docs) {
      const key = `${d.location} | ${d.periodEnding}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        _id: d._id.toString(),
        periodEnding: d.periodEnding,
        quarterLabel: d.quarterLabel,
        priorQuarterLabel: d.priorQuarterLabel,
        uploadedAt: d.uploadedAt,
        uploadedBy: d.uploadedBy
      });
    }

    const duplicates = Object.entries(groups)
      .filter(([, arr]) => arr.length > 1)
      .map(([key, arr]) => ({ key, count: arr.length, docs: arr }));

    // Also surface near-duplicates: same location, similar but not identical periodEnding
    const byLocation = {};
    for (const d of docs) {
      if (!byLocation[d.location]) byLocation[d.location] = new Set();
      byLocation[d.location].add(d.periodEnding);
    }
    const locationsWithMultiplePeriods = Object.entries(byLocation)
      .filter(([, set]) => set.size > 1)
      .map(([loc, set]) => ({ location: loc, periodEndings: [...set] }));

    return res.status(200).json({
      totalQuarterlyDocs: docs.length,
      uniqueLocationPeriodCombos: Object.keys(groups).length,
      exactDuplicates: duplicates,
      locationsWithMultiplePeriods,
      allDocs: docs.map(d => ({
        _id: d._id.toString(),
        location: d.location,
        periodEnding: d.periodEnding,
        quarterLabel: d.quarterLabel,
        uploadedAt: d.uploadedAt
      }))
    });
  } catch (error) {
    console.error('check-quarterly-data error:', error);
    return res.status(500).json({ error: error.message });
  }
}
