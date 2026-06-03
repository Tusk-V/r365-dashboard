import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { deriveChannelsForUser } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;
    const isAdmin = userEmail === ADMIN_EMAIL;

    const user = await db.collection('users').findOne({ email: userEmail });
    const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });

    const channels = deriveChannelsForUser({ isAdmin, dashboardAccess });
    if (channels.length === 0) {
      return res.status(200).json({ channels: [], totalUnread: 0 });
    }

    const keys = channels.map(c => c.key);

    const reads = await db.collection('chat_reads')
      .find({ userEmail, channelKey: { $in: keys } })
      .toArray();
    const readMap = new Map(reads.map(r => [r.channelKey, r.lastReadAt]));

    const unreadAgg = await db.collection('chat_messages').aggregate([
      { $match: { channelKey: { $in: keys }, deleted: { $ne: true }, authorEmail: { $ne: userEmail } } },
      { $project: { channelKey: 1, createdAt: 1 } },
    ]).toArray();

    const unreadByChannel = {};
    for (const m of unreadAgg) {
      const last = readMap.get(m.channelKey);
      const after = last ? new Date(last).getTime() : 0;
      if (new Date(m.createdAt).getTime() > after) {
        unreadByChannel[m.channelKey] = (unreadByChannel[m.channelKey] || 0) + 1;
      }
    }

    let totalUnread = 0;
    const withUnread = channels.map(c => {
      const unread = unreadByChannel[c.key] || 0;
      totalUnread += unread;
      return { ...c, unread };
    });

    return res.status(200).json({ channels: withUnread, totalUnread });
  } catch (error) {
    console.error('Error listing channels:', error);
    return res.status(500).json({ error: 'Failed to load channels' });
  }
}
