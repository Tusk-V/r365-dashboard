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

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    // Get user's bonus access level
    const user = await db.collection('users').findOne({ email: session.user.email });
    const isAdmin = session.user.email === ADMIN_EMAIL;
    
    let accessType = 'none';
    let allowedLocations = [];
    
    if (isAdmin) {
      accessType = 'all';
    } else if (user?.bonusAccess) {
      accessType = user.bonusAccess.type || 'none';
      allowedLocations = user.bonusAccess.locations || [];
    }

    const { location, period, listPeriods } = req.query;

    // Only quarterly data
    const reportTypeQuery = { reportType: 'quarterly' };

    // Get all available locations
    const allLocations = await db.collection('pl_data').distinct('location', reportTypeQuery);
    
    let availableLocations = [];
    if (accessType === 'all') {
      availableLocations = allLocations;
    } else if (accessType === 'specific') {
      availableLocations = allLocations.filter(loc => allowedLocations.includes(loc));
    }

    // If no specific location requested, return list
    if (!location) {
      return res.status(200).json({
        accessType,
        availableLocations: availableLocations.sort()
      });
    }

    // Check access
    if (accessType === 'none') {
      return res.status(403).json({ error: 'No bonus dashboard access' });
    }
    
    if (accessType === 'specific' && !allowedLocations.includes(location)) {
      return res.status(403).json({ error: 'No access to this location' });
    }

    // List periods
    if (listPeriods === 'true') {
      const periods = await db.collection('pl_data')
        .find({ location, ...reportTypeQuery })
        .project({ periodEnding: 1 })
        .sort({ periodEnding: -1 })
        .toArray();
      
      const uniquePeriods = [...new Set(periods.map(p => p.periodEnding))];
      return res.status(200).json({ periods: uniquePeriods });
    }

    // Get data
    let query = { location, ...reportTypeQuery };
    if (period) {
      query.periodEnding = period;
    }

    const plData = await db.collection('pl_data').findOne(
      query,
      { sort: { periodEnding: -1 } }
    );

    if (!plData) {
      return res.status(404).json({ error: 'No quarterly data found for this location' });
    }

    return res.status(200).json({
      accessType,
      availableLocations: availableLocations.sort(),
      data: plData
    });

  } catch (error) {
    console.error('Get bonus error:', error);
    return res.status(500).json({ error: error.message });
  }
}
