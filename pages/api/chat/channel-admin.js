// pages/api/chat/channel-admin.js
// Manage the members of a single channel, in-context.
//   GET  ?channel=KEY -> { canManage, isAdmin, store, members:[{email,name,image,fom,managedMarkets,removable}], pending:[{email,name,stores}] }
//   POST { channel, action: 'approve'|'deny'|'remove'|'fom'|'markets', email, value?, markets? }
// Scope-based: admin/FOM manage any channel; a market manager manages their
// markets' channels; a store manager manages their store channels. "Remove"
// revokes a member's chat access to a location channel's store.
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { canAccessChannel, canManageStore, canManageChannel, LOCATIONS, MARKETS, channelKeyForLocation } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Transition-safe FOM read (honors the legacy `role` field until migration).
function isFom(u) {
  return !!(u?.fom || u?.role === 'FOM');
}

function actorFrom(session, user) {
  const email = session.user.email;
  const isAdmin = email === ADMIN_EMAIL;
  return {
    email,
    isAdmin,
    fom: isAdmin || isFom(user),
    managedMarkets: user?.managedMarkets || [],
    dashboardAccess: isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' }),
  };
}

function storeForChannel(channel) {
  return LOCATIONS.find(l => channelKeyForLocation(l) === channel) || null;
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const db = client.db("andysdashboard");
  const me = await db.collection('users').findOne({ email: session.user.email });
  const actor = actorFrom(session, me);

  const channel = req.method === 'GET' ? req.query.channel : req.body?.channel;
  if (!channel) return res.status(400).json({ error: 'channel is required' });
  const store = storeForChannel(channel);
  if (!canManageChannel(actor, channel)) return res.status(403).json({ error: 'Not authorized to manage this channel' });

  if (req.method === 'GET') {
    try {
      const users = await db.collection('users')
        .find({})
        .project({ email: 1, name: 1, image: 1, role: 1, owner: 1, fom: 1, managedMarkets: 1, dashboardAccess: 1, chatAccess: 1 })
        .toArray();

      const members = [];
      const pending = [];
      for (const u of users) {
        if (!u.email) continue;
        const uIsAdmin = u.email === ADMIN_EMAIL;
        const access = {
          isAdmin: uIsAdmin,
          fom: isFom(u),
          managedMarkets: u.managedMarkets || [],
          dashboardAccess: u.dashboardAccess,
          chatAccess: u.chatAccess,
        };
        // In the channel via a single store we can pull — chat access or a
        // "specific" dashboard assignment. Broad-access people (admin/owner/FOM/
        // market manager / dashboard "all") are there by role, not a store, so
        // they're managed on the Roles / Dashboard Users pages instead.
        const inByChat = !!store && (u.chatAccess?.stores || []).includes(store);
        const daSpecificLocs = u.dashboardAccess?.type === 'specific' ? (u.dashboardAccess.locations || []) : [];
        const inByDash = !!store && daSpecificLocs.includes(store);
        const broad = uIsAdmin || !!u.owner || isFom(u) || (u.managedMarkets || []).length > 0 || u.dashboardAccess?.type === 'all';
        if (canAccessChannel(access, channel)) {
          members.push({
            email: u.email,
            name: u.name || u.email,
            image: u.image || null,
            owner: !!u.owner,
            fom: uIsAdmin || isFom(u),
            managedMarkets: u.managedMarkets || [],
            isAdmin: uIsAdmin,
            removable: (inByChat || inByDash) && !broad && u.email !== actor.email && u.email !== ADMIN_EMAIL,
          });
        }
        if (store && u.chatAccess?.status === 'pending' && (u.chatAccess?.stores || []).includes(store)) {
          pending.push({ email: u.email, name: u.name || u.email, stores: u.chatAccess?.stores || [] });
        }
      }
      members.sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ canManage: true, isAdmin: actor.isAdmin, store, members, pending });
    } catch (error) {
      console.error('channel-admin GET error:', error);
      return res.status(500).json({ error: 'Failed to load members' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { action, email, value, markets } = req.body;
      if (!email || !action) return res.status(400).json({ error: 'email and action are required' });
      if (email === actor.email) return res.status(400).json({ error: 'You cannot manage your own account here' });
      if (email === ADMIN_EMAIL) return res.status(403).json({ error: 'Cannot modify the admin account' });

      const target = await db.collection('users').findOne({ email });
      if (!target) return res.status(404).json({ error: 'User not found' });

      if (action === 'approve' || action === 'deny') {
        if (target.chatAccess?.status !== 'pending') return res.status(400).json({ error: 'No pending request for that user' });
        const requested = target.chatAccess?.stores || [];
        const manageable = requested.filter(s => canManageStore(actor, s));
        if (manageable.length === 0) return res.status(403).json({ error: 'You do not manage any of this employee\'s stores' });
        if (action === 'deny') {
          await db.collection('users').updateOne({ email }, { $set: { chatAccess: { level: 'employee', status: 'none', stores: [] } } });
          return res.status(200).json({ success: true, status: 'none' });
        }
        await db.collection('users').updateOne({ email }, { $set: {
          chatAccess: { level: 'employee', status: 'approved', stores: manageable, approvedBy: actor.email, approvedAt: new Date() },
        } });
        return res.status(200).json({ success: true, status: 'approved', stores: manageable });
      }

      if (action === 'remove') {
        if (!store) return res.status(400).json({ error: 'Members can only be removed from store channels' });
        if (!canManageStore(actor, store)) return res.status(403).json({ error: 'You do not manage this store' });
        const updates = {};
        // Pull the store from chat access (associates)…
        if ((target.chatAccess?.stores || []).includes(store)) {
          const remaining = (target.chatAccess.stores || []).filter(s => s !== store);
          updates.chatAccess = remaining.length > 0
            ? { ...target.chatAccess, level: 'employee', status: 'approved', stores: remaining }
            : { level: 'employee', status: 'none', stores: [] };
        }
        // …and from a "specific" dashboard assignment (store managers).
        if (target.dashboardAccess?.type === 'specific' && (target.dashboardAccess.locations || []).includes(store)) {
          const locs = (target.dashboardAccess.locations || []).filter(s => s !== store);
          updates.dashboardAccess = { ...target.dashboardAccess, type: 'specific', locations: locs };
        }
        if (Object.keys(updates).length > 0) await db.collection('users').updateOne({ email }, { $set: updates });
        return res.status(200).json({ success: true });
      }

      // Scope assignment — admin only.
      if (action === 'fom') {
        if (!actor.isAdmin) return res.status(403).json({ error: 'Only an admin can set FOM' });
        await db.collection('users').updateOne({ email }, { $set: { fom: !!value }, $unset: { role: '' } });
        return res.status(200).json({ success: true, fom: !!value });
      }

      if (action === 'markets') {
        if (!actor.isAdmin) return res.status(403).json({ error: 'Only an admin can set market managers' });
        const valid = Array.isArray(markets) ? markets.filter(m => MARKETS.includes(m)) : [];
        await db.collection('users').updateOne({ email }, { $set: { managedMarkets: valid }, $unset: { role: '' } });
        return res.status(200).json({ success: true, managedMarkets: valid });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (error) {
      console.error('channel-admin POST error:', error);
      return res.status(500).json({ error: 'Failed to update member' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
