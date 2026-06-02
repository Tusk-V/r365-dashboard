import { useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Users, BookOpen, Receipt, Settings, ChevronRight } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

// Admin tools surfaced as cards. Add new entries here as admin features grow.
const ADMIN_TOOLS = [
  {
    title: 'User Management',
    description: 'Grant or revoke dashboard, P&L, and bonus access for each user.',
    href: '/admin/users',
    Icon: Users,
    accent: 'text-blue-400',
  },
  {
    title: 'Recap Roster',
    description: 'Manage the manager roster used for quarterly recap emails.',
    href: '/admin/recap-roster',
    Icon: BookOpen,
    accent: 'text-purple-400',
  },
  {
    title: 'P&L Upload',
    description: 'Upload the latest R365 P&L export to refresh the P&L dashboard.',
    href: '/pl-upload',
    Icon: Receipt,
    accent: 'text-green-400',
  },
];

export default function AdminHub() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.email !== ADMIN_EMAIL) {
      router.push('/');
    }
  }, [status, session, router]);

  if (status === 'loading') {
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
        <title>Admin - Andy's Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">

          {/* Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-4 mb-3 md:mb-4 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="https://i.imgur.com/kkJMVz0.png"
                  alt="Andy's Frozen Custard"
                  className="h-10 md:h-16"
                />
                <div className="flex items-center gap-2">
                  <Settings size={20} className="text-slate-400" />
                  <h1 className="text-xl md:text-2xl font-bold text-white">Admin</h1>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  Dashboards
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Tool cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {ADMIN_TOOLS.map(({ title, description, href, Icon, accent }) => (
              <button
                key={href}
                onClick={() => router.push(href)}
                className="group bg-slate-800 border border-slate-700 hover:border-blue-600 rounded-lg p-4 md:p-5 shadow-lg text-left transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-slate-900">
                    <Icon size={20} className={accent} />
                  </div>
                  <ChevronRight size={18} className="text-slate-600 group-hover:text-blue-400 transition-colors" />
                </div>
                <h2 className="text-base md:text-lg font-bold text-white mb-1">{title}</h2>
                <p className="text-sm text-slate-400">{description}</p>
              </button>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}
