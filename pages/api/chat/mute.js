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
    const { channel, muted } = req.body;
    if (!channel) return res.status(400).json({ error: 'channel required' });
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const email = session.user.email;
    const isAdmin = email === ADMIN_EMAIL;
    const user = await db.collection('users').findOne({ email });
    const fom = isAdmin || !!(user?.fom || user?.role === 'FOM');
    const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });
    const chatAccess = user?.chatAccess || { status: 'none', stores: [] };
    if (!canAccessChannel({ isAdmin, fom, managedMarkets: user?.managedMarkets || [], dashboardAccess, chatAccess }, channel)) return res.status(403).json({ error: 'No access to this channel' });
    await db.collection('users').updateOne({ email }, muted ? { $addToSet: { mutedChannels: channel } } : { $pull: { mutedChannels: channel } });
    return res.status(200).json({ success: true, muted: !!muted });
  } catch (e) { console.error('mute error', e); return res.status(500).json({ error: 'Failed to update mute' }); }
}
