// pages/api/chat/channel-members.js
// Lightweight member summary for a single channel (count + a few sample avatars
// for the conversation header). Any member of the channel may read it. Called
// once when a channel opens, not polled.
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { canAccessChannel } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { channel } = req.query;
  if (!channel) return res.status(400).json({ error: 'channel is required' });

  const client = await clientPromise;
  const db = client.db("andysdashboard");
  const email = session.user.email;
  const isAdmin = email === ADMIN_EMAIL;
  const me = await db.collection('users').findOne({ email });
  const fomOf = (u) => !!(u?.fom || u?.role === 'FOM' || u?.role === 'Admin');
  const meAccess = {
    isAdmin,
    fom: isAdmin || fomOf(me),
    managedMarkets: me?.managedMarkets || [],
    dashboardAccess: isAdmin ? { type: 'all' } : (me?.dashboardAccess || { type: 'none' }),
    chatAccess: me?.chatAccess || { status: 'none', stores: [] },
  };
  if (!canAccessChannel(meAccess, channel)) return res.status(403).json({ error: 'No access to this channel' });

  try {
    const users = await db.collection('users')
      .find({})
      .project({ email: 1, name: 1, image: 1, role: 1, fom: 1, managedMarkets: 1, dashboardAccess: 1, chatAccess: 1 })
      .toArray();

    const members = [];
    for (const u of users) {
      if (!u.email) continue;
      const uIsAdmin = u.email === ADMIN_EMAIL;
      const access = { isAdmin: uIsAdmin, fom: fomOf(u), managedMarkets: u.managedMarkets || [], dashboardAccess: u.dashboardAccess, chatAccess: u.chatAccess };
      if (canAccessChannel(access, channel)) {
        members.push({ name: u.name || u.email, image: u.image || null });
      }
    }
    members.sort((a, b) => a.name.localeCompare(b.name));
    return res.status(200).json({ count: members.length, sample: members.slice(0, 5) });
  } catch (error) {
    console.error('channel-members error:', error);
    return res.status(500).json({ error: 'Failed to load members' });
  }
}
