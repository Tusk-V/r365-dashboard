import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { deriveChannelsForUser } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const db = (await clientPromise).db("andysdashboard");
    const email = session.user.email;
    const isAdmin = email === ADMIN_EMAIL;
    const user = await db.collection('users').findOne({ email });
    const channels = deriveChannelsForUser({
      isAdmin,
      owner: isAdmin || !!user?.owner,
      fom: isAdmin || !!(user?.fom || user?.role === 'FOM'),
      managedMarkets: user?.managedMarkets || [],
      dashboardAccess: isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' }),
      chatAccess: user?.chatAccess || { status: 'none', stores: [] },
      channelInclusions: user?.channelInclusions || [],
      channelExclusions: user?.channelExclusions || [],
    });
    if (channels.length) {
      const now = new Date();
      await db.collection('chat_reads').bulkWrite(channels.map(c => ({
        updateOne: { filter: { userEmail: email, channelKey: c.key }, update: { $set: { lastReadAt: now } }, upsert: true },
      })));
    }
    return res.status(200).json({ success: true });
  } catch (e) { console.error('read-all error', e); return res.status(500).json({ error: 'Failed to mark all read' }); }
}
