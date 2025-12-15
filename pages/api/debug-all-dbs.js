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

  try {
    // List all databases
    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();
    
    const result = {};
    
    for (const dbInfo of databases) {
      const dbName = dbInfo.name;
      // Skip system databases
      if (dbName === 'admin' || dbName === 'local' || dbName === 'config') continue;
      
      const db = client.db(dbName);
      const collections = await db.listCollections().toArray();
      
      result[dbName] = {};
      
      for (const col of collections) {
        const count = await db.collection(col.name).countDocuments();
        const sample = await db.collection(col.name).findOne({});
        
        // Redact sensitive fields
        let sampleKeys = sample ? Object.keys(sample) : [];
        
        result[dbName][col.name] = {
          count,
          fields: sampleKeys
        };
      }
    }

    return res.status(200).json({ 
      databases: result,
      currentSession: {
        email: session.user.email,
        name: session.user.name
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
