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
  const db = client.db("andysdashboard");

  // GET - Get all users with their roles
  if (req.method === 'GET') {
    try {
      const users = await db.collection('users')
        .find({})
        .project({
          email: 1,
          name: 1,
          role: 1,
          dashboardAccess: 1
        })
        .sort({ name: 1, email: 1 })
        .toArray();

      // Add default role for users without one
      const usersWithRoles = users.map(user => ({
        ...user,
        _id: user._id.toString(),
        role: user.email === ADMIN_EMAIL ? 'Admin' : (user.role || 'User')
      }));

      return res.status(200).json({ users: usersWithRoles });
    } catch (error) {
      console.error('Error fetching users:', error);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // PUT - Update user's role
  if (req.method === 'PUT') {
    try {
      const { userId, role } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Valid roles: Admin, FOM, Manager, User
      if (role && !['Admin', 'FOM', 'Manager', 'User'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        { $set: { role: role || 'User' } }
      );

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error updating role:', error);
      return res.status(500).json({ error: 'Failed to update role' });
    }
  }

  // DELETE - Remove user from dashboard
  if (req.method === 'DELETE') {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      // Get user to check email
      const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Prevent deleting admin
      if (user.email === ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Cannot delete admin user' });
      }

      // Delete user
      await db.collection('users').deleteOne({ _id: new ObjectId(userId) });

      // Clean up chat read pointers
      await db.collection('chat_reads').deleteMany({ userEmail: user.email });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting user:', error);
      return res.status(500).json({ error: 'Failed to delete user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
