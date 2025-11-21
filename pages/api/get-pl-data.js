import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db();
    
    const plDocument = await db.collection('pl_data').findOne({ _id: 'current' });
    
    await client.close();

    if (!plDocument) {
      return res.status(404).json({ error: 'No P&L data found' });
    }

    return res.status(200).json({
      data: plDocument.data,
      periodDate: plDocument.periodDate,
      updatedAt: plDocument.updatedAt
    });

  } catch (error) {
    console.error('Error fetching P&L data:', error);
    return res.status(500).json({ error: 'Failed to fetch P&L data' });
  }
}
