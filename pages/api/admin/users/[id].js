// pages/api/admin/users/[id].js

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import clientPromise from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session || !session.user?.email?.endsWith('@rancherscustard.com')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id: userId } = req.query;

    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const client = await clientPromise;
    const db = client.db();

    await Promise.all([
      db.collection('users').deleteOne({ _id: new ObjectId(userId) }),
      db.collection('accounts').deleteMany({ userId: new ObjectId(userId) }),
      db.collection('sessions').deleteMany({ userId: new ObjectId(userId) }),
    ]);

    return res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
