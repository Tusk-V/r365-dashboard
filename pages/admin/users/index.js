// app/api/admin/users/route.js
// or pages/api/admin/users.js for Pages Router

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]/route"; // Adjust path as needed
import clientPromise from "@/lib/mongodb"; // Adjust path as needed

// For App Router (app directory)
export async function GET(request) {
  try {
    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email?.endsWith('@rancherscustard.com')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db(); // Uses default database from connection string
    
    // Fetch all users
    const users = await db.collection('users')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Convert MongoDB ObjectIds to strings
    const sanitizedUsers = users.map(user => ({
      _id: user._id.toString(),
      email: user.email,
      name: user.name,
      image: user.image,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    }));

    return Response.json({ users: sanitizedUsers }, { status: 200 });
  } catch (error) {
    console.error('Error fetching users:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// For Pages Router (pages directory), use this instead:
/*
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
*/

