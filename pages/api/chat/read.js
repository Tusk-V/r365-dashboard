import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { canAccessChannel } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { channel } = req.body;
    if (!channel) return res.status(400).json({ error: 'channel is required' });

    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;
    const isAdmin = userEmail === ADMIN_EMAIL;
    const user = await db.collection('users').findOne({ email: userEmail });
    const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });
    const chatAccess = user?.chatAccess || { status: 'none', stores: [] };

    if (!canAccessChannel({ isAdmin, dashboardAccess, chatAccess }, channel)) {
      return res.status(403).json({ error: 'No access to this channel' });
    }

    await db.collection('chat_reads').updateOne(
      { userEmail, channelKey: channel },
      { $set: { userEmail, channelKey: channel, lastReadAt: new Date() } },
      { upsert: true }
    );
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking channel read:', error);
    return res.status(500).json({ error: 'Failed to mark read' });
  }
}
