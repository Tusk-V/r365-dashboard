import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { canAccessChannel, canPostAnnouncements } from "../../../lib/channels";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';
const PAGE_SIZE = 50;

let indexesEnsured = false;
async function ensureIndexes(db) {
  if (indexesEnsured) return;
  await db.collection('chat_messages').createIndex({ channelKey: 1, createdAt: 1 });
  await db.collection('chat_reads').createIndex({ userEmail: 1, channelKey: 1 }, { unique: true });
  indexesEnsured = true;
}

async function loadContext(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  const client = await clientPromise;
  const db = client.db("andysdashboard");
  await ensureIndexes(db);
  const userEmail = session.user.email;
  const isAdmin = userEmail === ADMIN_EMAIL;
  const user = await db.collection('users').findOne({ email: userEmail });
  const userRole = isAdmin ? 'Admin' : (user?.role || 'User');
  const dashboardAccess = isAdmin ? { type: 'all' } : (user?.dashboardAccess || { type: 'none' });
  return { db, session, userEmail, isAdmin, userRole, dashboardAccess,
           authorName: session.user.name || userEmail };
}

export default async function handler(req, res) {
  const ctx = await loadContext(req, res);
  if (!ctx) return;
  const { db, userEmail, userRole, isAdmin, dashboardAccess, authorName } = ctx;
  const accessUser = { isAdmin, dashboardAccess };

  if (req.method === 'GET') {
    try {
      const { channel, after } = req.query;
      if (!channel) return res.status(400).json({ error: 'channel is required' });
      if (!canAccessChannel(accessUser, channel)) return res.status(403).json({ error: 'No access to this channel' });

      const baseQuery = { channelKey: channel, deleted: { $ne: true } };
      let messages;
      if (after) {
        messages = await db.collection('chat_messages')
          .find({ ...baseQuery, createdAt: { $gt: new Date(after) } })
          .sort({ createdAt: 1 }).limit(200).toArray();
      } else {
        const latest = await db.collection('chat_messages')
          .find(baseQuery).sort({ createdAt: -1 }).limit(PAGE_SIZE).toArray();
        messages = latest.reverse();
      }

      const pinned = await db.collection('chat_messages')
        .find({ channelKey: channel, pinned: true, deleted: { $ne: true } })
        .sort({ createdAt: -1 }).toArray();

      const ser = m => ({ ...m, _id: m._id.toString() });
      return res.status(200).json({ messages: messages.map(ser), pinned: pinned.map(ser) });
    } catch (error) {
      console.error('Error loading messages:', error);
      return res.status(500).json({ error: 'Failed to load messages' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { channel, body, isAnnouncement = false, priority = 'normal' } = req.body;
      if (!channel || !body || !body.trim()) return res.status(400).json({ error: 'channel and body are required' });
      if (!canAccessChannel(accessUser, channel)) return res.status(403).json({ error: 'No access to this channel' });
      if (isAnnouncement && !canPostAnnouncements(userRole)) {
        return res.status(403).json({ error: 'Only Admin and FOM can post announcements' });
      }

      const doc = {
        channelKey: channel,
        body: body.trim(),
        authorEmail: userEmail,
        authorName,
        authorRole: userRole,
        createdAt: new Date(),
        editedAt: null,
        isAnnouncement: !!isAnnouncement,
        priority: isAnnouncement ? priority : 'normal',
        pinned: !!isAnnouncement,
        reactions: {},
        deleted: false,
      };
      const result = await db.collection('chat_messages').insertOne(doc);
      return res.status(201).json({ message: { ...doc, _id: result.insertedId.toString() } });
    } catch (error) {
      console.error('Error sending message:', error);
      return res.status(500).json({ error: 'Failed to send message' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { messageId, body } = req.body;
      if (!messageId || !body || !body.trim()) return res.status(400).json({ error: 'messageId and body are required' });
      if (!ObjectId.isValid(messageId)) return res.status(400).json({ error: 'Invalid messageId' });
      const msg = await db.collection('chat_messages').findOne({ _id: new ObjectId(messageId) });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const canModerate = canPostAnnouncements(userRole);
      if (!canModerate && msg.authorEmail !== userEmail) {
        return res.status(403).json({ error: 'You can only edit your own messages' });
      }
      await db.collection('chat_messages').updateOne(
        { _id: new ObjectId(messageId) },
        { $set: { body: body.trim(), editedAt: new Date() } }
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error editing message:', error);
      return res.status(500).json({ error: 'Failed to edit message' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { messageId } = req.query;
      if (!messageId) return res.status(400).json({ error: 'messageId is required' });
      if (!ObjectId.isValid(messageId)) return res.status(400).json({ error: 'Invalid messageId' });
      const msg = await db.collection('chat_messages').findOne({ _id: new ObjectId(messageId) });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const canModerate = canPostAnnouncements(userRole);
      if (!canModerate && msg.authorEmail !== userEmail) {
        return res.status(403).json({ error: 'You can only delete your own messages' });
      }
      await db.collection('chat_messages').updateOne(
        { _id: new ObjectId(messageId) },
        { $set: { deleted: true, pinned: false, body: '', reactions: {} } }
      );
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      return res.status(500).json({ error: 'Failed to delete message' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
