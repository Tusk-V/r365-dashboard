// pages/api/auth/[...nextauth].js

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import EmailProvider from "next-auth/providers/email";
import { MongoDBAdapter } from "@next-auth/mongodb-adapter";
import clientPromise from "../../../lib/mongodb";

export const authOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "select_account",
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
            lastLogin: new Date()
          });
          console.log(`Created new user record for: ${user.email}`);
        } else {
          // Update last login and sync name/image if changed
          await db.collection('users').updateOne(
            { email: user.email },
            {
              $set: {
                lastLogin: new Date(),
                name: user.name || profile?.name || existingUser.name,
                image: user.image || profile?.picture || existingUser.image
              }
            }
          );
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
