// pages/auth/signin.js

import { useState } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../api/auth/[...nextauth]';
import Image from 'next/image';

export default function SignIn({ providers }) {
  const googleProvider = providers
    ? Object.values(providers).find(provider => provider.id === 'google')
    : null;
  const emailProvider = providers
    ? Object.values(providers).find(provider => provider.id === 'email')
    : null;

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setEmailError('');

    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setEmailError('Email is required.');
      return;
    }
    if (!trimmed.endsWith('@rancherscustard.com')) {
      setEmailError('Must be a @rancherscustard.com address.');
      return;
    }

    setSending(true);
    try {
      const result = await signIn('email', {
        email: trimmed,
        callbackUrl: '/',
        redirect: false,
      });
      if (result?.error) {
        setEmailError('Could not send sign-in link. Try again or use Google.');
      } else {
        setSent(true);
      }
    } catch (err) {
      setEmailError('Unexpected error. Try again or use Google.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#1d2739' }}>
      <div className="max-w-md w-full space-y-6 bg-white p-10 rounded-2xl shadow-xl">
        {/* Logo */}
        <div className="flex justify-center">
          <Image
            src="/andys-logo.png"
            alt="Andy's Frozen Custard"
            width={250}
            height={250}
            priority
            className="object-contain"
          />
        </div>

        {/* Warning Message - Centered */}
        <div className="text-center space-y-2 py-2">
          <h3 className="text-lg font-semibold text-gray-800">
            Authorized Access Only
          </h3>
          <p className="text-sm text-gray-600">
            You must sign in with a <span className="font-bold text-gray-900">@rancherscustard.com</span> email address to access this dashboard.
          </p>
        </div>

        {/* Email magic-link form */}
        {emailProvider && (
          <div className="space-y-3">
            {sent ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <p className="text-sm font-semibold text-green-800">Check your email</p>
                <p className="text-xs text-green-700 mt-1">
                  We sent a sign-in link to <span className="font-semibold">{email}</span>. The link expires in 24 hours.
                </p>
                <button
                  type="button"
                  onClick={() => { setSent(false); setEmail(''); }}
                  className="mt-3 text-xs font-medium text-green-700 hover:text-green-900 underline"
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmailSubmit} className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Sign in with email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@rancherscustard.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                  disabled={sending}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 disabled:opacity-60"
                />
                {emailError && (
                  <p className="text-xs text-red-600">{emailError}</p>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="w-full flex items-center justify-center px-6 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending link…' : 'Email me a sign-in link'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Divider */}
        {emailProvider && googleProvider && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-wide">
              <span className="bg-white px-2 text-gray-500">or</span>
            </div>
          </div>
        )}

        {/* Google Sign In Button */}
        {googleProvider && (
          <div className="space-y-3">
            <button
              onClick={() => signIn(googleProvider.id, { callbackUrl: '/' })}
              className="w-full flex items-center justify-center px-6 py-3 border border-gray-300 rounded-lg shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  // If the user is already signed in, redirect them to the home page
  if (session) {
    return { redirect: { destination: '/' } };
  }

  const providers = await getProviders();

  return {
    props: { providers: providers ?? [] },
  };
}
