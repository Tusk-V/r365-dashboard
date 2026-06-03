import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { canManageStore } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

async function actorFrom(session, db) {
  const email = session.user.email;
  const isAdmin = email === ADMIN_EMAIL;
  const user = await db.collection('users').findOne({ email });
  const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });
  return { email, isAdmin, dashboardAccess };
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const db = client.db("andysdashboard");
  const actor = await actorFrom(session, db);

  const canManageAny = actor.isAdmin || actor.dashboardAccess.type === 'all' ||
    (actor.dashboardAccess.type === 'specific' && (actor.dashboardAccess.locations || []).length > 0);
  if (!canManageAny) return res.status(403).json({ error: 'Not authorized to manage members' });

  if (req.method === 'GET') {
    const pending = await db.collection('users')
      .find({ 'chatAccess.status': 'pending' })
      .project({ email: 1, name: 1, chatAccess: 1 })
      .toArray();
    const visible = pending
      .map(u => ({ email: u.email, name: u.name || u.email, stores: u.chatAccess?.stores || [], requestedAt: u.chatAccess?.requestedAt }))
      .filter(u => u.stores.some(s => canManageStore(actor, s)));
    return res.status(200).json({ pending: visible });
  }

  if (req.method === 'POST') {
    const { email, action } = req.body;
    if (!email || !['approve', 'deny'].includes(action)) return res.status(400).json({ error: 'email and valid action required' });
    const target = await db.collection('users').findOne({ email });
    if (!target || target.chatAccess?.status !== 'pending') return res.status(404).json({ error: 'No pending request for that user' });

    const requested = target.chatAccess?.stores || [];
    const manageable = requested.filter(s => canManageStore(actor, s));
    if (manageable.length === 0) return res.status(403).json({ error: 'You do not manage any of this employee\'s stores' });

    if (action === 'deny') {
      await db.collection('users').updateOne({ email }, { $set: { chatAccess: { level: 'employee', status: 'none', stores: [] } } });
      return res.status(200).json({ success: true, status: 'none' });
    }

    const outOfScope = requested.filter(s => !manageable.includes(s));
    if (outOfScope.length > 0) {
      await db.collection('users').updateOne({ email }, { $set: {
        'chatAccess.status': 'pending',
        'chatAccess.stores': outOfScope,
      } });
      await db.collection('users').updateOne({ email }, { $addToSet: { 'chatAccess.approvedStores': { $each: manageable } } });
      return res.status(200).json({ success: true, status: 'partial', approved: manageable, stillPending: outOfScope });
    }

    const approvedStores = [...new Set([...(target.chatAccess?.approvedStores || []), ...manageable])];
    await db.collection('users').updateOne({ email }, { $set: {
      chatAccess: { level: 'employee', status: 'approved', stores: approvedStores, approvedBy: actor.email, approvedAt: new Date() },
    } });
    return res.status(200).json({ success: true, status: 'approved', stores: approvedStores });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
