import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await clientPromise;
  const db = client.db("andys_dashboard");
  const userEmail = session.user.email;

  // POST - Add reply to a message
  if (req.method === 'POST') {
    try {
      const { messageId, content } = req.body;

      if (!messageId || !content) {
        return res.status(400).json({ error: 'Message ID and content are required' });
      }

      const message = await db.collection('messages').findOne({ 
        _id: new ObjectId(messageId) 
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const reply = {
        _id: new ObjectId().toString(),
        content,
        authorEmail: userEmail,
        authorName: session.user.name || userEmail,
        createdAt: new Date()
      };

      await db.collection('messages').updateOne(
        { _id: new ObjectId(messageId) },
        { 
          $push: { replies: reply },
          $set: { updatedAt: new Date() }
        }
      );

      return res.status(201).json({ success: true, reply });
    } catch (error) {
      console.error('Error adding reply:', error);
      return res.status(500).json({ error: 'Failed to add reply' });
    }
  }

  // DELETE - Delete a reply (admin or reply author only)
  if (req.method === 'DELETE') {
    try {
      const { messageId, replyId } = req.query;
      const ADMIN_EMAIL = 'dalton@rancherscustard.com';
      const isAdmin = userEmail === ADMIN_EMAIL;

      if (!messageId || !replyId) {
        return res.status(400).json({ error: 'Message ID and reply ID are required' });
      }

      const message = await db.collection('messages').findOne({ 
        _id: new ObjectId(messageId) 
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const reply = message.replies?.find(r => r._id === replyId);
      
      if (!reply) {
        return res.status(404).json({ error: 'Reply not found' });
      }

      // Only admin or reply author can delete
      if (!isAdmin && reply.authorEmail !== userEmail) {
        return res.status(403).json({ error: 'You can only delete your own replies' });
      }

      await db.collection('messages').updateOne(
        { _id: new ObjectId(messageId) },
        { 
          $pull: { replies: { _id: replyId } },
          $set: { updatedAt: new Date() }
        }
      );

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting reply:', error);
      return res.status(500).json({ error: 'Failed to delete reply' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
