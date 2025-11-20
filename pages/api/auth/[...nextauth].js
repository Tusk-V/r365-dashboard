import NextAuth from "next-auth"
import AppleProvider from "next-auth/providers/apple"
import GoogleProvider from "next-auth/providers/google"
import EmailProvider from "next-auth/providers/email"
import { MongoDBAdapter } from "@next-auth/mongodb-adapter"
import clientPromise from "../../../lib/mongodb"

export const authOptions = {
  // Configure authentication providers
  providers: [
    AppleProvider({
      clientId: process.env.APPLE_ID,
      clientSecret: process.env.APPLE_SECRET,
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
  
  // Use MongoDB adapter to store users and sessions
  adapter: MongoDBAdapter(clientPromise),
  
  // Custom pages
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  
  // Callbacks for customization
  callbacks: {
    async session({ session, user }) {
      // Add user id to session
      session.user.id = user.id;
      return session;
    },
    async signIn({ user, account, profile }) {
      // Log all sign-ins (optional)
      console.log(`User signed in: ${user.email} via ${account.provider}`);
      return true;
    },
  },
  
  // Session configuration
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  
  // Enable debug messages in development
  debug: process.env.NODE_ENV === 'development',
}

export default NextAuth(authOptions)
