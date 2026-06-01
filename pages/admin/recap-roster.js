import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { RefreshCw, X, Save } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default function RecapRoster() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [locations, setLocations] = useState([]);          // [{location, recipients:[{email,name}]}]
  const [availableUsers, setAvailableUsers] = useState([]); // [{email,name}]
  const [persisted, setPersisted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

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
    setError(null);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/recap-roster');
      const data = await res.json();
      if (res.ok) {
        setLocations(data.locations || []);
        setAvailableUsers(data.availableUsers || []);
        setPersisted(data.persisted !== false);
      } else {
        setError(data?.error || 'Failed to load roster.');
      }
    } catch (err) {
      console.error('Error loading recap roster:', err);
      setError('Failed to load roster.');
    } finally {
      setLoading(false);
    }
  };

  const userName = (email) => {
    const u = availableUsers.find((x) => x.email === email);
    return u ? u.name : '';
  };

  const addRecipient = (location, email) => {
    if (!email) return;
    setLocations((prev) => prev.map((l) => {
      if (l.location !== location) return l;
      if (l.recipients.some((r) => r.email === email)) return l;
      return { ...l, recipients: [...l.recipients, { email, name: userName(email) }] };
    }));
    setSaveMsg(null);
  };

  const addFreeRecipient = (location, email, name) => {
    const e = (email || '').trim();
    if (!e) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(e)) { setError(`"${e}" is not a valid email.`); return false; }
    let added = true;
    setLocations((prev) => prev.map((l) => {
      if (l.location !== location) return l;
      if (l.recipients.some((r) => r.email === e)) { added = false; return l; }
      return { ...l, recipients: [...l.recipients, { email: e, name: (name || '').trim() }] };
    }));
    setError(null);
    setSaveMsg(null);
    return added;
  };

  const removeRecipient = (location, email) => {
    setLocations((prev) => prev.map((l) =>
      l.location === location
        ? { ...l, recipients: l.recipients.filter((r) => r.email !== email) }
        : l
    ));
    setSaveMsg(null);
  };

  const saveRoster = async () => {
    setSaving(true);
    setError(null);
    setSaveMsg(null);
    try {
      const res = await fetch('/api/admin/recap-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
      });
      const data = await res.json();
      if (res.ok) {
        setPersisted(true);
        setSaveMsg('Saved.');
      } else if (Array.isArray(data?.invalid) && data.invalid.length) {
        setError(`Unknown recipient(s): ${data.invalid.join(', ')}`);
      } else {
        setError(data?.error || 'Failed to save.');
      }
    } catch (err) {
      console.error('Error saving recap roster:', err);
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const totalRecipients = locations.reduce((n, l) => n + l.recipients.length, 0);

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

          {/* Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-4 mb-2 md:mb-3 shadow-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-white">Recap Roster</h1>
                <p className="text-xs md:text-sm text-slate-400">Set who each store's morning recap email goes to</p>
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
                  className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
                  title="Reload"
                  aria-label="Reload"
                >
                  <RefreshCw size={16} className="text-white" />
                </button>
                <button
                  onClick={saveRoster}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Save size={16} />
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Status banners */}
          {!persisted && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3 mb-3 text-sm text-amber-300">
              Showing suggested recipients from current dashboard access. Edit and Save to lock in the roster.
            </div>
          )}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-3 text-sm text-blue-300">
            {locations.length} location{locations.length !== 1 ? 's' : ''} &middot; {totalRecipients} recipient{totalRecipients !== 1 ? 's' : ''}
          </div>
          {error && (
            <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 mb-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {saveMsg && (
            <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-3 mb-3 text-sm text-green-300">
              {saveMsg}
            </div>
          )}

          {/* Editable list */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 bg-slate-700/50">
              <span className="font-semibold text-white text-sm">Locations ({locations.length})</span>
            </div>
            <div className="divide-y divide-slate-700">
              {locations.map(({ location, recipients }) => {
                const remaining = availableUsers.filter((u) => !recipients.some((r) => r.email === u.email));
                return (
                  <RosterRow
                    key={location}
                    location={location}
                    recipients={recipients}
                    remaining={remaining}
                    onAddUser={addRecipient}
                    onAddFree={addFreeRecipient}
                    onRemove={removeRecipient}
                  />
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-500 text-center">
            Add recipients from existing app users or by typing any email address. Changes take effect after you Save.
          </p>

        </div>
      </div>
    </>
  );
}

function RosterRow({ location, recipients, remaining, onAddUser, onAddFree, onRemove }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');

  const submitFree = () => {
    if (onAddFree(location, email, name)) { setEmail(''); setName(''); }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-white">{location}</span>
        <span className="inline-flex items-center px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">
          {recipients.length} {recipients.length === 1 ? 'recipient' : 'recipients'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 mb-2">
        {recipients.length === 0 && (
          <span className="text-xs text-slate-500 italic">No recipients</span>
        )}
        {recipients.map((r) => (
          <span
            key={r.email}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 text-slate-200 rounded text-xs"
          >
            <span>{r.name ? `${r.name} ` : ''}<span className="font-mono text-slate-400">{r.email}</span></span>
            <button
              onClick={() => onRemove(location, r.email)}
              className="text-slate-400 hover:text-red-400"
              aria-label={`Remove ${r.email} from ${location}`}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value=""
          onChange={(e) => { onAddUser(location, e.target.value); }}
          className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="">+ Add app user…</option>
          {remaining.map((u) => (
            <option key={u.email} value={u.email}>
              {u.name ? `${u.name} (${u.email})` : u.email}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">or</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitFree(); }}
          placeholder="email@address.com"
          className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitFree(); }}
          placeholder="name (optional)"
          className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={submitFree}
          className="px-2.5 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
