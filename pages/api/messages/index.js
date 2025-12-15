import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { ObjectId } from "mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await clientPromise;
  const db = client.db("andysdashboard");
  const userEmail = session.user.email;
  const isAdmin = userEmail === ADMIN_EMAIL;

  // GET - List messages
  if (req.method === 'GET') {
    try {
      const { location, market, unreadOnly } = req.query;
      
      // Get user's access permissions
      const user = await db.collection('users').findOne({ email: userEmail });
      const userLocations = isAdmin ? null : (user?.dashboardAccess?.locations || []);
      const accessType = isAdmin ? 'all' : (user?.dashboardAccess?.type || 'none');
      
      if (accessType === 'none') {
        return res.status(200).json({ messages: [] });
      }

      // Build query
      let query = {};
      
      // Filter by target audience the user can see
      if (!isAdmin && accessType === 'specific') {
        query.$or = [
          { targetType: 'all' },
          { targetLocations: { $in: userLocations } },
          { authorEmail: userEmail } // Can always see own messages
        ];
      }

      // Additional filters
      if (location) {
        query.targetLocations = location;
      }
      if (market) {
        query.targetMarkets = market;
      }

      const messages = await db.collection('messages')
        .find(query)
        .sort({ pinned: -1, createdAt: -1 })
        .limit(100)
        .toArray();

      // Get read status for current user
      const messageIds = messages.map(m => m._id.toString());
      const readStatuses = await db.collection('message_reads')
        .find({ 
          messageId: { $in: messageIds },
          userEmail: userEmail 
        })
        .toArray();
      
      const readMap = new Set(readStatuses.map(r => r.messageId));

      // Add read status and reply counts to messages
      const messagesWithStatus = messages.map(msg => ({
        ...msg,
        _id: msg._id.toString(),
        isRead: readMap.has(msg._id.toString()),
        replyCount: msg.replies?.length || 0
      }));

      // Count unread
      const unreadCount = messagesWithStatus.filter(m => !m.isRead).length;

      return res.status(200).json({ 
        messages: messagesWithStatus,
        unreadCount 
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }

  // POST - Create new message
  if (req.method === 'POST') {
    try {
      const { 
        title, 
        content, 
        priority = 'normal',  // normal, important, urgent
        targetType = 'all',   // all, markets, locations
        targetMarkets = [],
        targetLocations = [],
        pinned = false
      } = req.body;

      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }

      // Admin can always post
      let effectivePermission = isAdmin ? 'admin' : 'user';
      
      if (!isAdmin) {
        // Check user's messaging permission
        const user = await db.collection('users').findOne({ email: userEmail });
        const messagingPermission = user?.messagingPermission || 'user';
        
        // Determine effective permission (title-based default with override)
        effectivePermission = messagingPermission;
        if (messagingPermission === 'user') {
          // Check if user has a title that grants higher permission
          const employeeTitle = user?.employeeTitle;
          if (employeeTitle === 'GM' || employeeTitle === 'AGM') {
            effectivePermission = 'manager';
          }
        }
      }

      // Permission checks
      if (effectivePermission === 'user') {
        return res.status(403).json({ error: 'You do not have permission to post messages' });
      }
      
      if (priority === 'urgent' && !isAdmin) {
        return res.status(403).json({ error: 'Only admin can post urgent messages' });
      }
      
      if (priority === 'important' && effectivePermission !== 'manager' && !isAdmin) {
        return res.status(403).json({ error: 'You do not have permission to post important messages' });
      }

      if (pinned && !isAdmin) {
        return res.status(403).json({ error: 'Only admin can pin messages' });
      }

      const message = {
        title,
        content,
        priority,
        targetType,
        targetMarkets,
        targetLocations,
        pinned: isAdmin ? pinned : false,
        authorEmail: userEmail,
        authorName: session.user.name || userEmail,
        replies: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await db.collection('messages').insertOne(message);

      return res.status(201).json({ 
        success: true, 
        messageId: result.insertedId.toString(),
        message: { ...message, _id: result.insertedId.toString() }
      });
    } catch (error) {
      console.error('Error creating message:', error);
      return res.status(500).json({ error: 'Failed to create message' });
    }
  }

  // PUT - Update message (admin only, or author for own message)
  if (req.method === 'PUT') {
    try {
      const { messageId, title, content, pinned, priority } = req.body;

      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      const message = await db.collection('messages').findOne({ 
        _id: new ObjectId(messageId) 
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Only admin or author can edit
      if (!isAdmin && message.authorEmail !== userEmail) {
        return res.status(403).json({ error: 'You can only edit your own messages' });
      }

      const updates = { updatedAt: new Date() };
      if (title) updates.title = title;
      if (content) updates.content = content;
      if (isAdmin && typeof pinned === 'boolean') updates.pinned = pinned;
      if (isAdmin && priority) updates.priority = priority;

      await db.collection('messages').updateOne(
        { _id: new ObjectId(messageId) },
        { $set: updates }
      );

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error updating message:', error);
      return res.status(500).json({ error: 'Failed to update message' });
    }
  }

  // DELETE - Delete message (admin only, or author for own message)
  if (req.method === 'DELETE') {
    try {
      const { messageId } = req.query;

      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      const message = await db.collection('messages').findOne({ 
        _id: new ObjectId(messageId) 
      });

      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Only admin or author can delete
      if (!isAdmin && message.authorEmail !== userEmail) {
        return res.status(403).json({ error: 'You can only delete your own messages' });
      }

      await db.collection('messages').deleteOne({ _id: new ObjectId(messageId) });
      await db.collection('message_reads').deleteMany({ messageId: messageId });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting message:', error);
      return res.status(500).json({ error: 'Failed to delete message' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
