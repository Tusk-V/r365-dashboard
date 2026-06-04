// pages/api/chat/directory.js
// Read-only member directory: for each channel the caller is authorized to
// inspect, returns the users who can see that channel. Scoped by role —
// admins/full-access see every channel; a store-scoped manager/FOM sees only
// the rosters of their own store (location) channels.
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { deriveChannelsForUser, canViewChannelMembers } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const client = await clientPromise;
  const db = client.db("andysdashboard");

  const email = session.user.email;
  const isAdmin = email === ADMIN_EMAIL;
  const me = await db.collection('users').findOne({ email });
  const actor = {
    email,
    isAdmin,
    fom: isAdmin || !!(me?.fom || me?.role === 'FOM'),
    managedMarkets: me?.managedMarkets || [],
    dashboardAccess: isAdmin ? { type: 'all' } : (me?.dashboardAccess || { type: 'none' }),
  };

  const canManageAny = actor.isAdmin || actor.fom || actor.managedMarkets.length > 0 ||
    actor.dashboardAccess.type === 'all' ||
    (actor.dashboardAccess.type === 'specific' && (actor.dashboardAccess.locations || []).length > 0);
  if (!canManageAny) return res.status(403).json({ error: 'Not authorized to view members' });

  try {
    const users = await db.collection('users')
      .find({})
      .project({ email: 1, name: 1, role: 1, fom: 1, managedMarkets: 1, dashboardAccess: 1, chatAccess: 1 })
      .toArray();

    // Build channel -> members from each user's derived channel membership.
    const meta = new Map();           // key -> { key, name, type, market }
    const membersByKey = new Map();   // key -> [{ email, name, role }]
    for (const u of users) {
      if (!u.email) continue;
      const uIsAdmin = u.email === ADMIN_EMAIL;
      const chans = deriveChannelsForUser({
        isAdmin: uIsAdmin,
        fom: !!(u.fom || u.role === 'FOM'),
        managedMarkets: u.managedMarkets || [],
        dashboardAccess: u.dashboardAccess,
        chatAccess: u.chatAccess,
      });
      if (chans.length === 0) continue;
      const role = uIsAdmin ? 'Admin' : (u.role || 'User');
      for (const c of chans) {
        if (!meta.has(c.key)) meta.set(c.key, { key: c.key, name: c.name, type: c.type, market: c.market || null });
        if (!membersByKey.has(c.key)) membersByKey.set(c.key, []);
        membersByKey.get(c.key).push({ email: u.email, name: u.name || u.email, role });
      }
    }

    const rank = (c) => (c.type === 'company' ? 0 : c.type === 'market' ? 1 : 2);
    const channels = [...meta.values()]
      .filter((c) => canViewChannelMembers(actor, c))
      .map((c) => ({
        ...c,
        members: (membersByKey.get(c.key) || []).sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

    return res.status(200).json({ channels });
  } catch (error) {
    console.error('directory error:', error);
    return res.status(500).json({ error: 'Failed to load members' });
  }
}
