import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import clientPromise from "../../../../lib/mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    await db.collection('push_subscriptions').deleteOne({ endpoint, userEmail: session.user.email });
    return res.status(200).json({ success: true });
  } catch (e) { console.error('unsubscribe error', e); return res.status(500).json({ error: 'Failed to unsubscribe' }); }
}
