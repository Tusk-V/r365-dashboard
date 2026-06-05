import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { put } from "@vercel/blob";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('image/')) return res.status(400).json({ error: 'Expected an image' });
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (buf.length === 0) return res.status(400).json({ error: 'Empty file' });
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Image too large (max 5MB)' });
    const email = session.user.email;
    const ext = (contentType.split('/')[1] || 'png').split('+')[0];
    const safe = email.replace(/[^a-z0-9]/gi, '_');
    const blob = await put(`avatars/${safe}-${Date.now()}.${ext}`, buf, { access: 'public', contentType });
    const client = await clientPromise;
    const db = client.db("andysdashboard");
    await db.collection('users').updateOne({ email }, { $set: { image: blob.url, imageCustom: true } });
    return res.status(200).json({ success: true, image: blob.url });
  } catch (e) {
    console.error('avatar upload error', e);
    return res.status(500).json({ error: 'Upload failed — image storage may not be configured yet.' });
  }
}
