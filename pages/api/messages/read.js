import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await clientPromise;
  const db = client.db("andys_dashboard");
  const userEmail = session.user.email;

  // POST - Mark message(s) as read
  if (req.method === 'POST') {
    try {
      const { messageId, messageIds } = req.body;

      // Handle single or multiple message IDs
      const idsToMark = messageIds || (messageId ? [messageId] : []);

      if (idsToMark.length === 0) {
        return res.status(400).json({ error: 'Message ID(s) required' });
      }

      const operations = idsToMark.map(id => ({
        updateOne: {
          filter: { messageId: id, userEmail: userEmail },
          update: { 
            $set: { 
              messageId: id, 
              userEmail: userEmail,
              readAt: new Date() 
            }
          },
          upsert: true
        }
      }));

      await db.collection('message_reads').bulkWrite(operations);

      return res.status(200).json({ success: true, marked: idsToMark.length });
    } catch (error) {
      console.error('Error marking as read:', error);
      return res.status(500).json({ error: 'Failed to mark as read' });
    }
  }

  // GET - Get unread count
  if (req.method === 'GET') {
    try {
      // Get all messages user can see
      const user = await db.collection('users').findOne({ email: userEmail });
      const ADMIN_EMAIL = 'dalton@rancherscustard.com';
      const isAdmin = userEmail === ADMIN_EMAIL;
      const userLocations = isAdmin ? null : (user?.dashboardAccess?.locations || []);
      const accessType = isAdmin ? 'all' : (user?.dashboardAccess?.type || 'none');

      if (accessType === 'none') {
        return res.status(200).json({ unreadCount: 0 });
      }

      // Build query for messages user can see
      let query = {};
      if (!isAdmin && accessType === 'specific') {
        query.$or = [
          { targetType: 'all' },
          { targetLocations: { $in: userLocations } },
          { authorEmail: userEmail }
        ];
      }

      const messages = await db.collection('messages')
        .find(query, { projection: { _id: 1 } })
        .toArray();

      const messageIds = messages.map(m => m._id.toString());

      // Get read statuses
      const readStatuses = await db.collection('message_reads')
        .find({ 
          messageId: { $in: messageIds },
          userEmail: userEmail 
        })
        .toArray();

      const readSet = new Set(readStatuses.map(r => r.messageId));
      const unreadCount = messageIds.filter(id => !readSet.has(id)).length;

      return res.status(200).json({ unreadCount });
    } catch (error) {
      console.error('Error getting unread count:', error);
      return res.status(500).json({ error: 'Failed to get unread count' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
