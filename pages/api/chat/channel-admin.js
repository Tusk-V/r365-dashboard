// pages/api/chat/channel-admin.js
// Manage the members of a single channel, in-context.
//   GET  ?channel=KEY -> { canManage, isAdmin, store, members:[{email,name,role,image,removable}], pending:[{email,name,stores}] }
//   POST { channel, action: 'approve'|'deny'|'remove'|'role', email, role? }
// Store-scoped: a manager/FOM may manage location channels for the stores they
// oversee; admins (and dashboard "all") may manage any channel. "Remove" applies
// only to location channels (revokes that store from the member's chat access).
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { canAccessChannel, canManageStore, LOCATIONS, channelKeyForLocation } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';
const ROLES = ['Admin', 'FOM', 'Manager', 'User'];

function actorFrom(session, user) {
  const email = session.user.email;
  const isAdmin = email === ADMIN_EMAIL;
  return { email, isAdmin, dashboardAccess: isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' }) };
}

function storeForChannel(channel) {
  return LOCATIONS.find(l => channelKeyForLocation(l) === channel) || null;
}

function canManageChannel(actor, channel, store) {
  if (store) return canManageStore(actor, store);
  return actor.isAdmin || actor.dashboardAccess.type === 'all'; // market/company
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
  if (!canManageChannel(actor, channel, store)) return res.status(403).json({ error: 'Not authorized to manage this channel' });

  if (req.method === 'GET') {
    try {
      const users = await db.collection('users')
        .find({})
        .project({ email: 1, name: 1, image: 1, role: 1, dashboardAccess: 1, chatAccess: 1 })
        .toArray();

      const members = [];
      const pending = [];
      for (const u of users) {
        if (!u.email) continue;
        const uIsAdmin = u.email === ADMIN_EMAIL;
        const access = { isAdmin: uIsAdmin, dashboardAccess: u.dashboardAccess, chatAccess: u.chatAccess };
        const inChannelByStore = !!store && (u.chatAccess?.stores || []).includes(store);
        if (canAccessChannel(access, channel)) {
          members.push({
            email: u.email,
            name: u.name || u.email,
            image: u.image || null,
            role: uIsAdmin ? 'Admin' : (u.role || 'User'),
            removable: inChannelByStore && u.email !== actor.email && u.email !== ADMIN_EMAIL,
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
      const { action, email, role } = req.body;
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
        if (!store) return res.status(400).json({ error: 'Members can only be removed from location channels' });
        if (!canManageStore(actor, store)) return res.status(403).json({ error: 'You do not manage this store' });
        const remaining = (target.chatAccess?.stores || []).filter(s => s !== store);
        const chatAccess = remaining.length > 0
          ? { ...target.chatAccess, level: 'employee', status: 'approved', stores: remaining }
          : { level: 'employee', status: 'none', stores: [] };
        await db.collection('users').updateOne({ email }, { $set: { chatAccess } });
        return res.status(200).json({ success: true, stores: remaining });
      }

      if (action === 'role') {
        if (!actor.isAdmin) return res.status(403).json({ error: 'Only an admin can change roles' });
        if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
        await db.collection('users').updateOne({ email }, { $set: { role } });
        return res.status(200).json({ success: true, role });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (error) {
      console.error('channel-admin POST error:', error);
      return res.status(500).json({ error: 'Failed to update member' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
