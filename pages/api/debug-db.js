import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";
import clientPromise from "../../lib/mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (session.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const client = await clientPromise;
  const db = client.db("andys_dashboard");

  try {
    // List all collections
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    // Sample data from each collection
    const samples = {};
    for (const name of collectionNames) {
      const docs = await db.collection(name).find({}).limit(3).toArray();
      samples[name] = {
        count: await db.collection(name).countDocuments(),
        sample: docs.map(d => {
          // Redact sensitive fields
          const safe = { ...d, _id: d._id?.toString() };
          if (safe.password) safe.password = '[REDACTED]';
          if (safe.accessToken) safe.accessToken = '[REDACTED]';
          if (safe.refreshToken) safe.refreshToken = '[REDACTED]';
          if (safe.id_token) safe.id_token = '[REDACTED]';
          return safe;
        })
      };
    }

    return res.status(200).json({ 
      collections: collectionNames,
      samples
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
