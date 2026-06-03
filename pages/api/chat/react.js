import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messageId, emoji } = req.body;
    if (!messageId || !emoji) return res.status(400).json({ error: 'messageId and emoji are required' });

    const client = await clientPromise;
    const db = client.db("andysdashboard");
    const userEmail = session.user.email;

    const msg = await db.collection('chat_messages').findOne({ _id: new ObjectId(messageId) });
    if (!msg || msg.deleted) return res.status(404).json({ error: 'Message not found' });

    const reactions = msg.reactions || {};
    const users = reactions[emoji] || [];
    if (users.includes(userEmail)) {
      reactions[emoji] = users.filter(e => e !== userEmail);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, userEmail];
    }

    await db.collection('chat_messages').updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { reactions } }
    );
    return res.status(200).json({ reactions });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    return res.status(500).json({ error: 'Failed to toggle reaction' });
  }
}
