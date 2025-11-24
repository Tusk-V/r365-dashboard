// pages/api/get-pl.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { location } = req.query;
  const userEmail = session.user.email.toLowerCase();

  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('andysdashboard');

    // Check user's P&L access
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ email: { $regex: new RegExp(`^${userEmail}$`, 'i') } });

    // Admin has full access
    const isAdmin = userEmail === ADMIN_EMAIL.toLowerCase();
    
    // Determine access
    let hasAccess = false;
    let allowedLocations = [];

    if (isAdmin) {
      hasAccess = true;
      allowedLocations = 'all';
    } else if (user && user.plAccess) {
      if (user.plAccess.type === 'all') {
        hasAccess = true;
        allowedLocations = 'all';
      } else if (user.plAccess.type === 'specific' && user.plAccess.locations) {
        allowedLocations = user.plAccess.locations;
        if (location) {
          hasAccess = allowedLocations.includes(location);
        } else {
          hasAccess = allowedLocations.length > 0;
        }
      }
    }

    if (!hasAccess) {
      await client.close();
      return res.status(403).json({ 
        error: 'No P&L access',
        allowedLocations: []
      });
    }

    const plCollection = db.collection('pl_data');

    // If requesting specific location
    if (location) {
      // Verify access to this specific location
      if (allowedLocations !== 'all' && !allowedLocations.includes(location)) {
        await client.close();
        return res.status(403).json({ error: 'No access to this location' });
      }

      const plData = await plCollection.findOne(
        { location },
        { sort: { periodEnding: -1 } }
      );

      await client.close();
      return res.status(200).json({ 
        data: plData,
        allowedLocations: allowedLocations === 'all' ? 'all' : allowedLocations
      });
    }

    // Get all available locations (for dropdown)
    const allLocations = await plCollection.distinct('location');
    
    // Filter to only allowed locations
    let availableLocations;
    if (allowedLocations === 'all') {
      availableLocations = allLocations.sort();
    } else {
      availableLocations = allLocations.filter(loc => allowedLocations.includes(loc)).sort();
    }

    await client.close();
    return res.status(200).json({ 
      availableLocations,
      allowedLocations: allowedLocations === 'all' ? 'all' : allowedLocations
    });

  } catch (error) {
    console.error('Get P&L error:', error);
    return res.status(500).json({ error: error.message });
  }
}
