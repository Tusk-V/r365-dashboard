// app/api/admin/users/[id]/route.js
// or pages/api/admin/users/[id].js for Pages Router

import { getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]/route"; // Adjust path as needed
import clientPromise from "@/lib/mongodb"; // Adjust path as needed
import { ObjectId } from "mongodb";

// For App Router (app directory)
export async function DELETE(request, { params }) {
  try {
    // Check if user is authenticated
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email?.endsWith('@rancherscustard.com')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = params.id;

    // Validate ObjectId
    if (!ObjectId.isValid(userId)) {
      return Response.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Connect to MongoDB
    const client = await clientPromise;
    const db = client.db();

    // Delete user and related data
    await Promise.all([
      db.collection('users').deleteOne({ _id: new ObjectId(userId) }),
      db.collection('accounts').deleteMany({ userId: new ObjectId(userId) }),
      db.collection('sessions').deleteMany({ userId: new ObjectId(userId) }),
    ]);

    return Response.json({ success: true, message: 'User deleted' }, { status: 200 });
  } catch (error) {
    console.error('Error deleting user:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// For Pages Router (pages directory), use this instead:
/*
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
*/
