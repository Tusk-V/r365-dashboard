import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { name } = req.body || {};
    const trimmed = (name || '').trim();
    if (!trimmed) return res.status(400).json({ error: 'Name cannot be empty' });
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    await db.collection('users').updateOne(
      { email: session.user.email },
      { $set: { name: trimmed, nameCustom: true } }
    );
    return res.status(200).json({ success: true, name: trimmed });
  } catch (e) {
    console.error('profile update error', e);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}
