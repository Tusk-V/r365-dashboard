import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { LOCATIONS } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { stores } = req.body;
    const chosen = Array.isArray(stores) ? stores.filter(s => LOCATIONS.includes(s)) : [];
    if (chosen.length === 0) return res.status(400).json({ error: 'Pick at least one store' });

    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;
    const user = await db.collection('users').findOne({ email: userEmail });

    const hasDashboard = userEmail === ADMIN_EMAIL || (user?.dashboardAccess?.type && user.dashboardAccess.type !== 'none');
    if (hasDashboard) return res.status(400).json({ error: 'Account already has access' });
    if (user?.chatAccess?.status === 'approved') return res.status(400).json({ error: 'Already approved' });

    await db.collection('users').updateOne(
      { email: userEmail },
      { $set: { chatAccess: { level: 'employee', status: 'pending', stores: chosen, requestedAt: new Date() } } },
      { upsert: true }
    );
    return res.status(200).json({ success: true, status: 'pending', stores: chosen });
  } catch (error) {
    console.error('Error onboarding chat user:', error);
    return res.status(500).json({ error: 'Failed to submit request' });
  }
}
