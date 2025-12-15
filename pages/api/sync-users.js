import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import clientPromise from "../../lib/mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only admin can sync users
  if (session.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await clientPromise;
  const db = client.db("andys_dashboard");

  try {
    // Get all accounts from NextAuth
    const accounts = await db.collection('accounts').find({}).toArray();
    
    // Get unique userIds
    const userIds = [...new Set(accounts.map(a => a.userId?.toString()).filter(Boolean))];
    
    console.log(`Found ${userIds.length} unique user IDs from accounts`);

    // Get user info from NextAuth users collection (this is different from our custom users)
    const nextAuthUsers = await db.collection('users').find({}).toArray();
    
    console.log(`Found ${nextAuthUsers.length} users in users collection`);

    // Also check sessions for any additional user info
    const sessions = await db.collection('sessions').find({}).toArray();
    
    console.log(`Found ${sessions.length} sessions`);

    let synced = 0;
    let alreadyExists = 0;

    // For each NextAuth user, ensure they have the fields we need
    for (const user of nextAuthUsers) {
      // Check if user already has dashboardAccess field (meaning they're already set up)
      if (user.dashboardAccess) {
        alreadyExists++;
        continue;
      }

      // Update user with default fields for messaging
      await db.collection('users').updateOne(
        { _id: user._id },
        { 
          $set: {
            // Don't overwrite existing fields, just ensure these exist
            dashboardAccess: user.dashboardAccess || { type: 'none', locations: [] },
            plAccess: user.plAccess || { type: 'none', locations: [] },
            // Don't set messagingPermission - let it default based on title
            // Don't set employeeTitle - admin will set this manually
          }
        }
      );
      synced++;
    }

    // Return list of all users now in the system
    const allUsers = await db.collection('users')
      .find({})
      .project({ email: 1, name: 1, messagingPermission: 1, employeeTitle: 1, dashboardAccess: 1 })
      .toArray();

    return res.status(200).json({ 
      success: true, 
      message: `Synced ${synced} users, ${alreadyExists} already existed`,
      totalUsers: allUsers.length,
      users: allUsers.map(u => ({
        _id: u._id.toString(),
        email: u.email,
        name: u.name,
        employeeTitle: u.employeeTitle || null,
        messagingPermission: u.messagingPermission || null,
        hasDashboardAccess: u.dashboardAccess?.type !== 'none'
      }))
    });
  } catch (error) {
    console.error('Error syncing users:', error);
    return res.status(500).json({ error: 'Failed to sync users', details: error.message });
  }
}
