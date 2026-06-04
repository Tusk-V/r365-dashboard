import { getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import clientPromise from "../../../../lib/mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys) return res.status(400).json({ error: 'Invalid subscription' });
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    await db.collection('push_subscriptions').updateOne(
      { endpoint: subscription.endpoint },
      { $set: { userEmail: session.user.email, endpoint: subscription.endpoint, keys: subscription.keys, userAgent: req.headers['user-agent'] || '', updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
    return res.status(200).json({ success: true });
  } catch (e) { console.error('subscribe error', e); return res.status(500).json({ error: 'Failed to subscribe' }); }
}
