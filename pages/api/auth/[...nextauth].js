// pages/api/auth/[...nextauth].js

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import EmailProvider from "next-auth/providers/email";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import clientPromise from "../../../lib/mongodb";
import nodemailer from "nodemailer";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Check if user has any access granted
function hasAnyAccess(user) {
  const dashboardAccess = user?.dashboardAccess?.type;
  const plAccess = user?.plAccess?.type;
  
  // User has access if either dashboard or P&L access is not 'none'
  return (dashboardAccess && dashboardAccess !== 'none') || 
         (plAccess && plAccess !== 'none');
}

// Send notification email to admin
async function sendNewUserNotification(newUser) {
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
      to: ADMIN_EMAIL,
      subject: `New Dashboard User: ${newUser.name || newUser.email}`,
      text: `A new user has logged into Andy's Dashboard for the first time.\n\nName: ${newUser.name || 'Not provided'}\nEmail: ${newUser.email}\nTime: ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}\n\nThey currently have no access. Visit the Users page to grant access:\nhttps://andysdashboard.com/admin/users`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">New Dashboard User</h2>
          <p>A new user has logged into Andy's Dashboard for the first time.</p>
          <table style="border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Name</td>
              <td style="padding: 8px 12px; background: #f8fafc;">${newUser.name || 'Not provided'}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Email</td>
              <td style="padding: 8px 12px; background: #f8fafc;">${newUser.email}</td>
            </tr>
            <tr>
              <td style="padding: 8px 12px; background: #f1f5f9; font-weight: bold;">Time</td>
              <td style="padding: 8px 12px; background: #f8fafc;">${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</td>
            </tr>
          </table>
          <p style="color: #64748b;">They currently have no access to any dashboards.</p>
          <a href="https://andysdashboard.com/admin/users" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 10px;">Grant Access</a>
        </div>
      `,
    });
    
    console.log(`New user notification sent for: ${newUser.email}`);
  } catch (err) {
    console.error('Failed to send new user notification:', err);
  }
}

export const authOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
          hd: "rancherscustard.com"
        }
      }
    }),
    AppleProvider({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: process.env.EMAIL_SERVER_PORT,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Verify email domain for all providers
      if (user.email && !user.email.endsWith('@rancherscustard.com')) {
        console.log(`Blocked login attempt from: ${user.email}`);
        return '/auth/error?error=AccessDenied';
      }
      
      // Auto-create/update user record in our users collection
      try {
        const client = await clientPromise;
        const db = client.db('andysdashboard');
        
        const existingUser = await db.collection('users').findOne({ email: user.email });
        
        if (!existingUser) {
          // First time login - create user with no access
          await db.collection('users').insertOne({
            email: user.email,
            name: user.name || profile?.name || user.email.split('@')[0],
            image: user.image || profile?.picture || null,
            dashboardAccess: {
              type: 'none',
              locations: []
            },
            plAccess: {
              type: 'none',
              locations: []
            },
            createdAt: new Date(),
            lastLogin: new Date(),
            notificationSent: true
          });
          console.log(`Created new user record for: ${user.email}`);
          
          // Send notification email to admin
          sendNewUserNotification({
            email: user.email,
            name: user.name || profile?.name || user.email.split('@')[0]
          });
        } else {
          // Check if we need to send notification (user exists but notification never sent)
          const shouldNotify = !existingUser.notificationSent;
          
          // Update last login and sync name/image if changed
          await db.collection('users').updateOne(
            { email: user.email },
            {
              $set: {
                lastLogin: new Date(),
                name: user.name || profile?.name || existingUser.name,
                image: user.image || profile?.picture || existingUser.image,
                notificationSent: true
              }
            }
          );
          
          // Send notification if this user was never notified about
          if (shouldNotify) {
            console.log(`Sending delayed notification for: ${user.email}`);
            sendNewUserNotification({
              email: user.email,
              name: user.name || profile?.name || existingUser.name || user.email.split('@')[0]
            });
          }
        }
      } catch (err) {
        console.error('Error managing user record:', err);
        // Don't block login if user record management fails
      }
      
      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        
        // Fetch user's access info from our users collection
        try {
          const client = await clientPromise;
          const db = client.db('andysdashboard');
          const userData = await db.collection('users').findOne({ email: session.user.email });
          
          if (userData) {
            session.user.dashboardAccess = userData.dashboardAccess;
            session.user.plAccess = userData.plAccess;
            // Check if user has any access (admin always has access)
            const isAdmin = session.user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
            session.user.accessPending = !isAdmin && !hasAnyAccess(userData);
          } else {
            session.user.accessPending = session.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase();
          }
        } catch (err) {
          console.error('Error fetching user access:', err);
          session.user.accessPending = session.user.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase();
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: "database",
  },
};

export default NextAuth(authOptions);
