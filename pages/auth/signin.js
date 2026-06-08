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

    setSending(true);
    try {
      const result = await signIn('email', {
        email: trimmed,
        callbackUrl: '/messages',
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md surface rounded-2xl shadow-card overflow-hidden">
        {/* Brand accent strip */}
        <div className="h-1 bg-andy-red" />

        <div className="p-8 space-y-6">
          {/* Logo + wordmark */}
          <div className="flex flex-col items-center text-center">
            <Image
              src="/andys-logo.png"
              alt="Andy's Frozen Custard"
              width={160}
              height={160}
              priority
              className="h-20 w-auto object-contain"
            />
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">The Scoop</h1>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Andy&apos;s Operations
            </p>
          </div>

          {/* Guidance */}
          <p className="text-center text-sm text-slate-300 leading-relaxed">
            <span className="font-semibold text-white">Employees:</span> enter your email for a sign-in link.
            <br className="hidden sm:block" />
            {' '}<span className="font-semibold text-white">Managers:</span> use your{' '}
            <span className="font-semibold text-white">@rancherscustard.com</span> Google account.
          </p>

          {/* Email magic-link form */}
          {emailProvider && (
            <div>
              {sent ? (
                <div className="rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30 p-4 text-center">
                  <p className="text-sm font-semibold text-emerald-300">Check your email</p>
                  <p className="text-xs text-emerald-200/80 mt-1">
                    We sent a sign-in link to <span className="font-semibold">{email}</span>. It expires in 24 hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setSent(false); setEmail(''); }}
                    className="mt-3 text-xs font-medium text-emerald-300 hover:text-emerald-100 underline"
                  >
                    Use a different email
                  </button>
                </div>
              ) : (
                <form onSubmit={handleEmailSubmit} className="space-y-2">
                  <label htmlFor="email" className="block text-xs font-medium text-slate-400">
                    Sign in with email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(''); }}
                    disabled={sending}
                    className="w-full px-3 min-h-[44px] bg-slate-800/80 hairline rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                  {emailError && (
                    <p className="text-xs text-rose-400">{emailError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full flex items-center justify-center min-h-[44px] px-6 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {sending ? 'Sending link…' : 'Email me a sign-in link'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Divider */}
          {emailProvider && googleProvider && (
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] uppercase tracking-wide text-slate-500">or</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>
          )}

          {/* Google Sign In Button */}
          {googleProvider && (
            <button
              onClick={() => signIn(googleProvider.id, { callbackUrl: '/' })}
              className="w-full flex items-center justify-center min-h-[44px] px-6 rounded-xl text-sm font-semibold text-white bg-white/5 hover:bg-white/10 hairline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-blue-500 transition-colors"
            >
              <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          )}
        </div>
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
