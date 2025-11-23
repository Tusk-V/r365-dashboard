// pages/api/get-pl-data.js
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // For now, allow all access for testing
  // You'll need to integrate with your NextAuth session later
  
  /* 
  // Uncomment this when you have NextAuth configured:
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  */

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const database = client.db('planalytics');
    const plCollection = database.collection('pl_data');

    // For now, return all locations (remove this when NextAuth is configured)
    const allowedLocations = 'all';

    /* 
    // Uncomment this when you have NextAuth configured:
    const usersCollection = database.collection('users');
    const userEmail = session.user.email.toLowerCase();
    let allowedLocations = [];

    // Check if admin
    if (userEmail === ADMIN_EMAIL) {
      allowedLocations = 'all';
    } else {
      // Check user's access
      const user = await usersCollection.findOne({ email: userEmail });
      
      if (!user || !user.plAccess || user.plAccess.type === 'none') {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have permission to view P&L data' 
        });
      }

      if (user.plAccess.type === 'all') {
        allowedLocations = 'all';
      } else if (user.plAccess.type === 'specific') {
        allowedLocations = user.plAccess.locations || [];
      }
    }
    */

    // Get all P&L data or filter by allowed locations
    let query = {};
    if (allowedLocations !== 'all') {
      if (allowedLocations.length === 0) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'No locations assigned to your account' 
        });
      }
      query = { location: { $in: allowedLocations } };
    }

    const allData = await plCollection.find(query).toArray();

    if (allData.length === 0) {
      return res.status(404).json({ 
        error: 'No P&L data found',
        message: allowedLocations === 'all' 
          ? 'Please upload a P&L file first' 
          : 'No P&L data available for your assigned locations'
      });
    }

    // Convert to the format expected by the dashboard
    const formattedData = {};
    allData.forEach(item => {
      formattedData[item.location] = {
        location: item.location,
        period: item.period,
        data: item.data
      };
    });

    return res.status(200).json({
      success: true,
      data: formattedData,
      period: allData[0]?.period || '',
      locationCount: allData.length,
      availableLocations: Object.keys(formattedData).sort()
    });

  } catch (error) {
    console.error('Error retrieving P&L data:', error);
    return res.status(500).json({
      error: 'Failed to retrieve P&L data',
      details: error.message
    });
  } finally {
    await client.close();
  }
}
