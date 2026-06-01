import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { RefreshCw } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default function RecapRoster() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [locations, setLocations] = useState([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [locationCount, setLocationCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'authenticated') {
      if (session.user.email !== ADMIN_EMAIL) {
        router.push('/');
      } else {
        loadRoster();
      }
    }
  }, [status, session]);

  const loadRoster = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/recap-roster');
      const data = await res.json();
      if (res.ok) {
        setLocations(data.locations || []);
        setRecipientCount(data.recipientCount || 0);
        setLocationCount(data.locationCount || 0);
      }
    } catch (err) {
      console.error('Error loading recap roster:', err);
    } finally {
      setLoading(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <button
          onClick={() => signIn('google')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (session?.user?.email !== ADMIN_EMAIL) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Recap Roster - Andy's Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">

          {/* Main Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-4 mb-2 md:mb-3 shadow-2xl">
            {/* Desktop Header */}
            <div className="hidden md:flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="https://i.imgur.com/kkJMVz0.png"
                  alt="Andy's Frozen Custard"
                  className="h-16"
                />
                <div>
                  <h1 className="text-2xl font-bold text-white">Recap Roster</h1>
                  <p className="text-sm text-slate-400">Who each store's morning recap email goes to</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Dashboards
                </button>
                <button
                  onClick={() => router.push('/admin/users')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Users
                </button>
                <button
                  onClick={loadRoster}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={16} className="text-white" />
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden">
              <div className="flex items-center justify-between mb-2">
                <img
                  src="https://i.imgur.com/kkJMVz0.png"
                  alt="Andy's Frozen Custard"
                  className="h-10"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={loadRoster}
                    className="p-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  >
                    <RefreshCw size={14} className="text-white" />
                  </button>
                  <button
                    onClick={() => signOut()}
                    className="px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
              <div className="mb-1">
                <h1 className="text-lg font-bold text-white">Recap Roster</h1>
                <p className="text-xs text-slate-400">Who each store's morning recap email goes to</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Dashboards
                </button>
                <button
                  onClick={() => router.push('/admin/users')}
                  className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Users
                </button>
              </div>
            </div>
          </div>

          {/* Summary line */}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-3 text-sm text-blue-300">
            {locationCount} location{locationCount !== 1 ? 's' : ''} &middot; {recipientCount} recipient{recipientCount !== 1 ? 's' : ''}
          </div>

          {/* Roster list */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 bg-slate-700/50">
              <span className="font-semibold text-white text-sm">
                Locations ({locationCount})
              </span>
            </div>

            {locations.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No managers assigned yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {locations.map(({ location, emails }) => (
                  <div key={location} className="px-4 py-3 hover:bg-slate-700/30">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-medium text-white">{location}</span>
                      <span className="inline-flex items-center px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">
                        {emails.length} {emails.length === 1 ? 'recipient' : 'recipients'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {emails.map((email) => (
                        <span
                          key={email}
                          className="inline-block px-2.5 py-1 bg-slate-700 text-slate-300 rounded text-xs font-mono"
                        >
                          {email}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer note */}
          <p className="mt-3 text-xs text-slate-500 text-center">
            Recipients are managed on the Users page (dashboard location access).
          </p>

        </div>
      </div>
    </>
  );
}
