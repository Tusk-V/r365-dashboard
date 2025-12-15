import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import clientPromise from "../../lib/mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await clientPromise;
  const db = client.db("andys_dashboard");
  const userEmail = session.user.email;
  const isAdmin = userEmail === ADMIN_EMAIL;

  if (req.method === 'GET') {
    try {
      // Admin always has full access
      if (isAdmin) {
        return res.status(200).json({ 
          dashboardAccess: { type: 'all', locations: [] },
          plAccess: { type: 'all', locations: [] },
          employeeTitle: 'Admin',
          messagingPermission: 'admin',
          isAdmin: true
        });
      }

      // Find user in database
      const user = await db.collection('users').findOne({ email: userEmail });

      if (!user) {
        return res.status(200).json({ 
          dashboardAccess: { type: 'none', locations: [] },
          plAccess: { type: 'none', locations: [] },
          employeeTitle: null,
          messagingPermission: 'user',
          isAdmin: false
        });
      }

      // Calculate effective messaging permission
      let effectivePermission = user.messagingPermission || 'user';
      if (!user.messagingPermission || user.messagingPermission === 'user') {
        if (user.employeeTitle === 'GM' || user.employeeTitle === 'AGM') {
          effectivePermission = 'manager';
        }
      }

      return res.status(200).json({ 
        dashboardAccess: user.dashboardAccess || { type: 'none', locations: [] },
        plAccess: user.plAccess || { type: 'none', locations: [] },
        employeeTitle: user.employeeTitle || null,
        messagingPermission: effectivePermission,
        isAdmin: false
      });
    } catch (error) {
      console.error('Error checking access:', error);
      return res.status(500).json({ error: 'Failed to check access' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
