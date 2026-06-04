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
    owner: isAdmin || !!user?.owner,
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
        .project({ email: 1, name: 1, image: 1, role: 1, owner: 1, fom: 1, manager: 1, managedMarkets: 1, dashboardAccess: 1, chatAccess: 1, channelInclusions: 1, channelExclusions: 1 })
        .toArray();

      const members = [];
      const pending = [];
      const addable = [];
      for (const u of users) {
        if (!u.email) continue;
        const uIsAdmin = u.email === ADMIN_EMAIL;
        const access = {
          isAdmin: uIsAdmin,
          owner: !!u.owner,
          fom: isFom(u),
          managedMarkets: u.managedMarkets || [],
          dashboardAccess: u.dashboardAccess,
          chatAccess: u.chatAccess,
          channelInclusions: u.channelInclusions || [],
          channelExclusions: u.channelExclusions || [],
        };
        if (canAccessChannel(access, channel)) {
          members.push({
            email: u.email,
            name: u.name || u.email,
            image: u.image || null,
            owner: !!u.owner,
            fom: uIsAdmin || isFom(u),
            manager: !!u.manager,
            managedMarkets: u.managedMarkets || [],
            isAdmin: uIsAdmin,
            // Anyone can be removed from a channel (via an override) except you
            // and the super admin.
            removable: u.email !== actor.email && u.email !== ADMIN_EMAIL,
          });
        } else if (u.email !== actor.email) {
          addable.push({ email: u.email, name: u.name || u.email, image: u.image || null });
        }
        if (store && u.chatAccess?.status === 'pending' && (u.chatAccess?.stores || []).includes(store)) {
          pending.push({ email: u.email, name: u.name || u.email, stores: u.chatAccess?.stores || [] });
        }
      }
      members.sort((a, b) => a.name.localeCompare(b.name));
      addable.sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ canManage: true, isAdmin: actor.isAdmin, store, members, pending, addable });
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

      if (action === 'remove' || action === 'add') {
        if (!canManageChannel(actor, channel)) return res.status(403).json({ error: 'You do not manage this channel' });
        const incl = new Set(target.channelInclusions || []);
        const excl = new Set(target.channelExclusions || []);
        if (action === 'remove') { excl.add(channel); incl.delete(channel); }
        else { incl.add(channel); excl.delete(channel); }
        await db.collection('users').updateOne({ email }, { $set: { channelInclusions: [...incl], channelExclusions: [...excl] } });
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
