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

    // Get user's access level
    const user = await db.collection('users').findOne({ email: session.user.email });
    const isAdmin = session.user.email === ADMIN_EMAIL;
    
    let accessType = 'none';
    let allowedLocations = [];
    
    if (isAdmin) {
      accessType = 'all';
    } else if (user?.plAccess) {
      accessType = user.plAccess.type || 'none';
      allowedLocations = user.plAccess.locations || [];
    }

    const { location, period, listPeriods, reportType } = req.query;
    
    // Default to 'period-ytd' if not specified
    const selectedReportType = reportType || 'period-ytd';

    // Get all available locations from database
    // Each reportType gets its own explicit filter
    // period-ytd (default): excludes current-prior, ytd-prior-ytd, and quarterly (includes legacy data)
    let locationQuery = {};
    if (selectedReportType === 'current-prior') {
      locationQuery = { reportType: 'current-prior' };
    } else if (selectedReportType === 'ytd-prior-ytd') {
      locationQuery = { reportType: 'ytd-prior-ytd' };
    } else if (selectedReportType === 'quarterly') {
      locationQuery = { reportType: 'quarterly' };
    } else {
      locationQuery = { reportType: { $nin: ['current-prior', 'ytd-prior-ytd', 'quarterly'] } };
    }
    
    const allLocations = await db.collection('pl_data').distinct('location', locationQuery);
    
    // Filter locations based on access
    let availableLocations = [];
    if (accessType === 'all') {
      availableLocations = allLocations;
    } else if (accessType === 'specific') {
      availableLocations = allLocations.filter(loc => allowedLocations.includes(loc));
    }

    // If no specific location requested, return list of available locations
    if (!location) {
      return res.status(200).json({
        accessType,
        availableLocations: availableLocations.sort()
      });
    }

    // Check if user has access to requested location
    if (accessType === 'none') {
      return res.status(403).json({ error: 'No P&L access' });
    }
    
    if (accessType === 'specific' && !allowedLocations.includes(location)) {
      return res.status(403).json({ error: 'No access to this location' });
    }

    // If listPeriods=true, return list of available periods for this location
    if (listPeriods === 'true') {
      let periodQuery = { location };
      if (selectedReportType === 'current-prior') {
        periodQuery.reportType = 'current-prior';
      } else if (selectedReportType === 'ytd-prior-ytd') {
        periodQuery.reportType = 'ytd-prior-ytd';
      } else if (selectedReportType === 'quarterly') {
        periodQuery.reportType = 'quarterly';
      } else {
        periodQuery.reportType = { $nin: ['current-prior', 'ytd-prior-ytd', 'quarterly'] };
      }
      
      const periods = await db.collection('pl_data')
        .find(periodQuery)
        .project({ periodEnding: 1 })
        .sort({ periodEnding: -1 })
        .toArray();
      
      const uniquePeriods = [...new Set(periods.map(p => p.periodEnding))];
      
      return res.status(200).json({
        periods: uniquePeriods
      });
    }

    // Get P&L data for location (and optionally specific period)
    let query = { location };
    if (selectedReportType === 'current-prior') {
      query.reportType = 'current-prior';
    } else if (selectedReportType === 'ytd-prior-ytd') {
      query.reportType = 'ytd-prior-ytd';
    } else if (selectedReportType === 'quarterly') {
      query.reportType = 'quarterly';
    } else {
      query.reportType = { $nin: ['current-prior', 'ytd-prior-ytd', 'quarterly'] };
    }
    if (period) {
      query.periodEnding = period;
    }

    const plData = await db.collection('pl_data').findOne(
      query,
      { sort: { periodEnding: -1 } }
    );

    if (!plData) {
      return res.status(404).json({ error: 'No P&L data found for this location' });
    }

    return res.status(200).json({
      accessType,
      availableLocations: availableLocations.sort(),
      data: plData
    });

  } catch (error) {
    console.error('Get P&L error:', error);
    return res.status(500).json({ error: error.message });
  }
}
