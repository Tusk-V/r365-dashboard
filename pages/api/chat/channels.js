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
    const owner = isAdmin || !!user?.owner;
    const fom = isAdmin || !!(user?.fom || user?.role === 'FOM');
    const managedMarkets = user?.managedMarkets || [];
    const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });
    const chatAccess = user?.chatAccess || { status: 'none', stores: [] };
    const mutedChannels = user?.mutedChannels || [];

    const channels = deriveChannelsForUser({ isAdmin, owner, fom, managedMarkets, dashboardAccess, chatAccess, channelInclusions: user?.channelInclusions || [], channelExclusions: user?.channelExclusions || [] });
    if (channels.length === 0) {
      return res.status(200).json({ channels: [], totalUnread: 0 });
    }

    const keys = channels.map(c => c.key);

    const reads = await db.collection('chat_reads')
      .find({ userEmail, channelKey: { $in: keys } })
      .toArray();
    const readMap = new Map(reads.map(r => [r.channelKey, r.lastReadAt]));

    // Count unread in the database instead of pulling every message into Node.
    // Per channel, count non-deleted messages not authored by the user whose
    // createdAt is strictly greater than that channel's lastReadAt pointer
    // (missing/null pointer => epoch 0, matching unreadCount in lib/channels.js).
    // createdAt and lastReadAt are both stored as BSON Dates, so a direct $gt
    // matches the JS getTime() comparison exactly.
    const EPOCH = new Date(0);
    const thresholdBranches = keys.map(k => {
      const last = readMap.get(k);
      return { case: { $eq: ['$channelKey', k] }, then: last ? new Date(last) : EPOCH };
    });

    const unreadAgg = await db.collection('chat_messages').aggregate([
      {
        $match: {
          channelKey: { $in: keys },
          deleted: { $ne: true },
          authorEmail: { $ne: userEmail },
          $expr: {
            $gt: ['$createdAt', { $switch: { branches: thresholdBranches, default: EPOCH } }],
          },
        },
      },
      { $group: { _id: '$channelKey', count: { $sum: 1 } } },
    ]).toArray();

    const unreadByChannel = {};
    for (const row of unreadAgg) {
      unreadByChannel[row._id] = row.count;
    }

    let totalUnread = 0;
    const withUnread = channels.map(c => {
      const unread = unreadByChannel[c.key] || 0;
      totalUnread += unread;
      const last = readMap.get(c.key);
      return { ...c, unread, muted: mutedChannels.includes(c.key), lastReadAt: last ? new Date(last).toISOString() : null };
    });

    return res.status(200).json({ channels: withUnread, totalUnread });
  } catch (error) {
    console.error('Error listing channels:', error);
    return res.status(500).json({ error: 'Failed to load channels' });
  }
}
