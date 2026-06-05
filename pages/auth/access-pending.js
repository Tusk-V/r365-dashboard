// pages/auth/access-pending.js

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Head from "next/head";

export default function AccessPending() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If not authenticated, redirect to sign in
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Access Pending | Andy's Dashboard</title>
      </Head>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="surface rounded-lg shadow-xl p-8 w-full max-w-md text-center">
          {/* Logo */}
          <div className="mb-6">
            <img 
              src="/andys-logo.png" 
              alt="Andy's Frozen Custard" 
              className="h-20 mx-auto"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>

          {/* Clock/Pending Icon */}
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-amber-500/20 rounded-full flex items-center justify-center">
              <svg 
                className="w-10 h-10 text-amber-500" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
                />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white mb-2">
            Access Pending
          </h1>

          {/* User info */}
          {session?.user && (
            <p className="text-slate-400 mb-6">
              Signed in as <span className="text-white font-medium">{session.user.email}</span>
            </p>
          )}

          {/* Message */}
          <div className="bg-slate-700/50 rounded-lg p-4 mb-6">
            <p className="text-slate-300 leading-relaxed">
              Your account has been created successfully. You will receive an email once your access has been approved.
            </p>
          </div>

          {/* Additional info */}
          <p className="text-slate-500 text-sm mb-6">
            If you believe this is an error or need immediate access, please contact your administrator.
          </p>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => router.push("/")}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Check Access Again
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/signin" })}
              className="w-full bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
