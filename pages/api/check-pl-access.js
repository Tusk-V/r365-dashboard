// pages/api/check-pl-access.js
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // For now, return admin access for testing
  // You'll need to integrate with your NextAuth session
  return res.status(200).json({
    success: true,
    isAdmin: true,
    access: {
      type: 'all',
      locations: []
    }
  });

  /* 
  // Uncomment this when you have NextAuth configured:
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userEmail = session.user.email.toLowerCase();

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

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const database = client.db('planalytics');
    const usersCollection = database.collection('users');

    // Find user's access settings
    const user = await usersCollection.findOne({ email: userEmail });

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
    console.error('Error checking P&L access:', error);
    return res.status(500).json({
      error: 'Failed to check access',
      details: error.message
    });
  } finally {
    await client.close();
  }
  */
}
