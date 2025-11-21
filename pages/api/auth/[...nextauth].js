// app/api/auth/[...nextauth]/route.js
// or pages/api/auth/[...nextauth].js (depending on your setup)

import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import EmailProvider from "next-auth/providers/email";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb"; // Adjust path as needed

export const authOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_SECRET,
      authorization: {
        params: {
          hd: "rancherscustard.com", // Restricts Google login to this domain
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
        return false; // Reject sign in
      }
      return true; // Allow sign in
    },
    async session({ session, user }) {
      // Add user ID to session
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin', // Custom sign-in page (optional)
    error: '/auth/error',   // Error page
  },
  session: {
    strategy: "database",
  },
};

const handler = NextAuth(authOptions);

// For App Router (app directory)
export { handler as GET, handler as POST };

// For Pages Router (pages directory), export default handler instead:
// export default handler;
