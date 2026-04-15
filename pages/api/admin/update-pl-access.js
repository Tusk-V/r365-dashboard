import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import clientPromise from '../../../lib/mongodb';
import nodemailer from 'nodemailer';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Send access granted email to user
async function sendAccessGrantedEmail(userEmail, userName) {
  try {
    const port = parseInt(process.env.EMAIL_SERVER_PORT, 10) || 587;
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SERVER_HOST,
      port: port,
      secure: port === 465,
      auth: {
        user: process.env.EMAIL_SERVER_USER,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: userEmail,
      subject: `Your Dashboard Access Has Been Granted`,
      text: `Hi ${userName},\n\nYou now have access to Andy's Dashboard.\n\nVisit: https://andysdashboard.com\n\nThanks!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Access Granted! 🎉</h2>
          <p>Hi ${userName},</p>
          <p>You now have access to Andy's Dashboard.</p>
          <a href="https://andysdashboard.com" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">Go to Dashboard</a>
          <p style="color: #64748b; margin-top: 24px; font-size: 14px;">Thanks!</p>
        </div>
      `,
    });
    
    console.log(`Access granted email sent to: ${userEmail}`);
  } catch (err) {
    console.error('Failed to send access granted email:', err);
  }
}

// Check if user has any access
function hasAnyAccess(dashboardAccess, plAccess, bonusAccess) {
  const hasDb = dashboardAccess?.type && dashboardAccess.type !== 'none';
  const hasPl = plAccess?.type && plAccess.type !== 'none';
  const hasBonus = bonusAccess?.type && bonusAccess.type !== 'none';
  return hasDb || hasPl || hasBonus;
}

export default async function handler(req, res) {
  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (session.user.email !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const client = await clientPromise;
    const db = client.db('andysdashboard');

    // GET - Fetch all users
    if (req.method === 'GET') {
      const users = await db.collection('users')
        .find({})
        .sort({ lastLogin: -1, createdAt: -1 })
        .toArray();
      
      return res.status(200).json({ 
        users: users.map(u => ({
          email: u.email,
          name: u.name,
          image: u.image,
          dashboardAccess: u.dashboardAccess || { type: 'none', locations: [] },
          plAccess: u.plAccess || { type: 'none', locations: [] },
          bonusAccess: u.bonusAccess || { type: 'none', locations: [] },
          lastLogin: u.lastLogin,
          createdAt: u.createdAt
        }))
      });
    }

    // POST - Update user access
    if (req.method === 'POST') {
      const { email, dashboardAccess, plAccess, bonusAccess, accessType, locations } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      // Get existing user to check if this is a new grant
      const existingUser = await db.collection('users').findOne({ email });
      const hadAccessBefore = existingUser ? hasAnyAccess(existingUser.dashboardAccess, existingUser.plAccess, existingUser.bonusAccess) : false;

      // Build update object
      const updateFields = {
        updatedAt: new Date(),
        updatedBy: session.user.email
      };

      // Support new two-column format
      if (dashboardAccess !== undefined) {
        updateFields.dashboardAccess = {
          type: dashboardAccess.type || 'none',
          locations: dashboardAccess.locations || []
        };
      }

      if (plAccess !== undefined) {
        updateFields.plAccess = {
          type: plAccess.type || 'none',
          locations: plAccess.locations || []
        };
      }

      if (bonusAccess !== undefined) {
        updateFields.bonusAccess = {
          type: bonusAccess.type || 'none',
          locations: bonusAccess.locations || []
        };
      }

      // Backward compatibility: if only accessType/locations sent, treat as plAccess
      if (accessType !== undefined && plAccess === undefined) {
        updateFields.plAccess = {
          type: accessType || 'none',
          locations: locations || []
        };
      }

      await db.collection('users').updateOne(
        { email },
        { $set: updateFields },
        { upsert: true }
      );

      // Check if user now has access when they didn't before
      const newDashboardAccess = updateFields.dashboardAccess || existingUser?.dashboardAccess;
      const newPlAccess = updateFields.plAccess || existingUser?.plAccess;
      const newBonusAccess = updateFields.bonusAccess || existingUser?.bonusAccess;
      const hasAccessNow = hasAnyAccess(newDashboardAccess, newPlAccess, newBonusAccess);

      // Send email if access was just granted
      if (!hadAccessBefore && hasAccessNow) {
        const userName = existingUser?.name || email.split('@')[0];
        sendAccessGrantedEmail(email, userName);
      }

      return res.status(200).json({ success: true });
    }

    // DELETE - Remove user
    if (req.method === 'DELETE') {
      const { email } = req.query;
      
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      await db.collection('users').deleteOne({ email });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Update access error:', error);
    return res.status(500).json({ error: error.message });
  }
}
