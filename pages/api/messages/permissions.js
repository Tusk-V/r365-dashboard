import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only admin can manage permissions
  if (session.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const client = await clientPromise;
  const db = client.db("andys_dashboard");

  // GET - Get all users with their messaging permissions
  if (req.method === 'GET') {
    try {
      const users = await db.collection('users')
        .find({})
        .project({ 
          email: 1, 
          name: 1, 
          messagingPermission: 1, 
          employeeTitle: 1,
          dashboardAccess: 1 
        })
        .sort({ name: 1 })
        .toArray();

      // Add effective permission (considering title-based defaults)
      const usersWithEffective = users.map(user => {
        let effectivePermission = user.messagingPermission || 'user';
        
        // If no explicit override, check title
        if (!user.messagingPermission || user.messagingPermission === 'user') {
          if (user.employeeTitle === 'GM' || user.employeeTitle === 'AGM') {
            effectivePermission = 'manager';
          }
        }

        return {
          ...user,
          _id: user._id.toString(),
          effectivePermission,
          permissionSource: user.messagingPermission ? 'manual' : 'title'
        };
      });

      return res.status(200).json({ users: usersWithEffective });
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // PUT - Update user's messaging permission
  if (req.method === 'PUT') {
    try {
      const { userId, messagingPermission, employeeTitle } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const updates = {};
      
      if (messagingPermission !== undefined) {
        // Valid values: 'user', 'manager', 'admin', or null (to reset to title-based)
        if (messagingPermission === null) {
          // Remove the override, revert to title-based
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $unset: { messagingPermission: "" } }
          );
        } else if (['user', 'manager', 'admin'].includes(messagingPermission)) {
          updates.messagingPermission = messagingPermission;
        } else {
          return res.status(400).json({ error: 'Invalid permission level' });
        }
      }

      if (employeeTitle !== undefined) {
        // Valid titles: 'GM', 'AGM', 'SL', or null to clear
        if (employeeTitle === null || employeeTitle === '') {
          await db.collection('users').updateOne(
            { _id: new ObjectId(userId) },
            { $unset: { employeeTitle: "" } }
          );
        } else {
          updates.employeeTitle = employeeTitle;
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.collection('users').updateOne(
          { _id: new ObjectId(userId) },
          { $set: updates }
        );
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error updating permission:', error);
      return res.status(500).json({ error: 'Failed to update permission' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
