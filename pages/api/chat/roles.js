// pages/api/chat/roles.js
// Board role assignment. Visible to the super admin (dalton) and Owners/Admins.
//   GET  -> { isSuperAdmin, users:[{email,name,image,isSuperAdmin,owner,fom,managedMarkets,hasDashboard}] }
//   POST { targetEmail, action:'owner'|'fom'|'markets', value?, markets? }
// Only the super admin may grant/revoke Owner (admin). Granting Owner also grants
// all-channel capability (fom). FOM/market assignment is open to owners + super admin.
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { MARKETS } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const client = await clientPromise;
  const db = client.db("andysdashboard");
  const email = session.user.email;
  const isSuperAdmin = email === ADMIN_EMAIL;
  const me = await db.collection('users').findOne({ email });
  if (!isSuperAdmin && !me?.owner) return res.status(403).json({ error: 'Not authorized' });

  if (req.method === 'GET') {
    try {
      const users = await db.collection('users').find({})
        .project({ email: 1, name: 1, image: 1, owner: 1, fom: 1, managedMarkets: 1, dashboardAccess: 1 })
        .toArray();
      const list = users.filter(u => u.email).map(u => ({
        email: u.email,
        name: u.name || u.email,
        image: u.image || null,
        isSuperAdmin: u.email === ADMIN_EMAIL,
        owner: !!u.owner,
        fom: !!u.fom,
        managedMarkets: u.managedMarkets || [],
        hasDashboard: !!(u.dashboardAccess && u.dashboardAccess.type && u.dashboardAccess.type !== 'none'),
      })).sort((a, b) => a.name.localeCompare(b.name));
      return res.status(200).json({ isSuperAdmin, users: list });
    } catch (error) {
      console.error('roles GET error:', error);
      return res.status(500).json({ error: 'Failed to load roles' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { targetEmail, action, value, markets } = req.body;
      if (!targetEmail || !action) return res.status(400).json({ error: 'targetEmail and action required' });
      if (targetEmail === ADMIN_EMAIL) return res.status(403).json({ error: 'Cannot modify the super admin' });
      const target = await db.collection('users').findOne({ email: targetEmail });
      if (!target) return res.status(404).json({ error: 'User not found' });

      if (action === 'owner') {
        if (!isSuperAdmin) return res.status(403).json({ error: 'Only the super admin can set admins' });
        // Owner implies all-channel capability (fom); revoking removes both.
        const set = value ? { owner: true, fom: true } : { owner: false, fom: false };
        await db.collection('users').updateOne({ email: targetEmail }, { $set: set, $unset: { role: '' } });
        return res.status(200).json({ success: true });
      }
      if (action === 'fom') {
        if (target.owner) return res.status(400).json({ error: 'User is already an admin' });
        await db.collection('users').updateOne({ email: targetEmail }, { $set: { fom: !!value }, $unset: { role: '' } });
        return res.status(200).json({ success: true });
      }
      if (action === 'markets') {
        const valid = Array.isArray(markets) ? markets.filter(m => MARKETS.includes(m)) : [];
        await db.collection('users').updateOne({ email: targetEmail }, { $set: { managedMarkets: valid }, $unset: { role: '' } });
        return res.status(200).json({ success: true });
      }
      return res.status(400).json({ error: 'Unknown action' });
    } catch (error) {
      console.error('roles POST error:', error);
      return res.status(500).json({ error: 'Failed to update role' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
