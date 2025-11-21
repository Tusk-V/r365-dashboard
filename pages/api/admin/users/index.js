// pages/api/admin/users/index.js

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import clientPromise from "../../../../lib/mongodb";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    
    if (!session || !session.user?.email?.endsWith('@rancherscustard.com')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await clientPromise;
    const db = client.db();
    
    const users = await db.collection('users')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const sanitizedUsers = users.map(user => ({
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    }));

    return res.status(200).json({ users: sanitizedUsers });
  } catch (error) {
    console.error('Error fetching users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
