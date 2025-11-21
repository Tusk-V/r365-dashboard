// pages/api/auth/[...nextauth].js - DEBUG VERSION

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
          // TEMPORARILY REMOVE hd restriction to test
          // hd: "rancherscustard.com",
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
      console.log('=== SIGN IN ATTEMPT ===');
      console.log('User email:', user.email);
      console.log('Account provider:', account.provider);
      console.log('Profile:', profile);
      
      // Verify email domain for all providers
      if (user.email && !user.email.endsWith('@rancherscustard.com')) {
        console.log(`❌ BLOCKED login attempt from: ${user.email}`);
        return '/auth/error?error=AccessDenied';
      }
      
      console.log(`✅ ALLOWED login from: ${user.email}`);
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
  debug: true, // Enable debug mode
};

export default NextAuth(authOptions);
