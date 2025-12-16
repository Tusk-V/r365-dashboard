import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const client = await clientPromise;
  const db = client.db("andysdashboard");
  const userEmail = session.user.email;

  try {
    const { messageId, emoji } = req.body;

    if (!messageId || !emoji) {
      return res.status(400).json({ error: 'Message ID and emoji are required' });
    }

    const message = await db.collection('messages').findOne({ 
      _id: new ObjectId(messageId) 
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Get current reactions or initialize empty object
    const reactions = message.reactions || {};
    const emojiUsers = reactions[emoji] || [];

    // Toggle: add if not present, remove if present
    if (emojiUsers.includes(userEmail)) {
      // Remove user's reaction
      reactions[emoji] = emojiUsers.filter(e => e !== userEmail);
      // Clean up empty arrays
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      // Add user's reaction
      reactions[emoji] = [...emojiUsers, userEmail];
    }

    await db.collection('messages').updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { reactions } }
    );

    return res.status(200).json({ success: true, reactions });
  } catch (error) {
    console.error('Error toggling reaction:', error);
    return res.status(500).json({ error: 'Failed to toggle reaction' });
  }
}
