import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Plus, Trash2, Save, X, RefreshCw, Upload } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

const ALL_LOCATIONS = [
  'Allen', 'Bixby', 'Broken Arrow', 'Carrollton', 'Edmond',
  'Frisco #1', 'Frisco #2', 'Frisco #3', 'Hillcrest Village',
  'Lake Highlands', 'Lakeland', 'Norman', 'Owasso', 'Penn',
  'Prosper', 'Sanford', 'The Colony', 'Treat Truck', 'Warr Acres', 'Yale'
];

export default function AdminUsers() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ accessType: 'none', locations: [] });

  useEffect(() => {
    if (status === 'authenticated') {
      if (session.user.email !== ADMIN_EMAIL) {
        router.push('/');
      } else {
        loadUsers();
      }
    }
  }, [status, session]);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/update-pl-access');
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!newEmail || !newEmail.includes('@')) {
      alert('Please enter a valid email');
      return;
    }

    try {
      const res = await fetch('/api/admin/update-pl-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          accessType: 'none',
          locations: []
        })
      });

      if (res.ok) {
        setNewEmail('');
        loadUsers();
      }
    } catch (err) {
      console.error('Error adding user:', err);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser(user.email);
    setEditForm({
      accessType: user.plAccess?.type || 'none',
      locations: user.plAccess?.locations || []
    });
  };

  const handleSaveUser = async (email) => {
    try {
      const res = await fetch('/api/admin/update-pl-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          accessType: editForm.accessType,
          locations: editForm.locations
        })
      });

      if (res.ok) {
        setEditingUser(null);
        loadUsers();
      }
    } catch (err) {
      console.error('Error saving user:', err);
    }
  };

  const handleDeleteUser = async (email) => {
    if (!confirm(`Remove ${email}?`)) return;

    try {
      const res = await fetch(`/api/admin/update-pl-access?email=${encodeURIComponent(email)}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        loadUsers();
      }
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  const toggleLocation = (location) => {
    setEditForm(prev => ({
      ...prev,
      locations: prev.locations.includes(location)
        ? prev.locations.filter(l => l !== location)
        : [...prev.locations, location]
    }));
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
        <title>User Management - Andy's Dashboard</title>
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-2 md:p-4">
        <div className="max-w-[1400px] mx-auto">
          
          {/* Main Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 md:p-4 mb-3 shadow-2xl">
            <div className="hidden md:flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img 
                  src="https://i.imgur.com/kkJMVz0.png" 
                  alt="Andy's Frozen Custard" 
                  className="h-16"
                />
                <h1 className="text-2xl font-bold text-white">R365 Dashboards</h1>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-slate-400 whitespace-nowrap">Select Dashboard:</label>
                <select
                  value="pl"
                  onChange={(e) => {
                    if (e.target.value === 'pl') {
                      router.push('/pl');
                    } else {
                      router.push('/');
                      if (typeof window !== 'undefined') {
                        sessionStorage.setItem('pendingTab', e.target.value);
                      }
                    }
                  }}
                  className="px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="sales">Weekly Sales & Labor</option>
                  <option value="daily-sales">Daily Sales</option>
                  <option value="daily-labor">Daily Labor</option>
                  <option value="clockouts">Auto-Clockouts</option>
                  <option value="call-offs">Call-Offs</option>
                  <option value="scheduled-today">Scheduled Today</option>
                  <option value="pl">Profit & Loss</option>
                </select>
                
                <button
                  onClick={loadUsers}
                  className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={16} className="text-white" />
                </button>

                <button
                  onClick={() => router.push('/pl-upload')}
                  className="p-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  title="Upload P&L"
                >
                  <Upload size={16} className="text-white" />
                </button>

                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden flex items-center justify-between mb-3">
              <img 
                src="https://i.imgur.com/kkJMVz0.png" 
                alt="Andy's Frozen Custard" 
                className="h-12"
              />
              <button
                onClick={() => signOut()}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>

            <div className="md:hidden flex items-center gap-2">
              <select
                value="pl"
                onChange={(e) => {
                  if (e.target.value === 'pl') {
                    router.push('/pl');
                  } else {
                    router.push('/');
                  }
                }}
                className="flex-1 px-4 py-2 text-sm bg-slate-700 border border-slate-600 rounded-lg text-white"
              >
                <option value="sales">Weekly Sales & Labor</option>
                <option value="daily-sales">Daily Sales</option>
                <option value="daily-labor">Daily Labor</option>
                <option value="clockouts">Auto-Clockouts</option>
                <option value="call-offs">Call-Offs</option>
                <option value="scheduled-today">Scheduled Today</option>
                <option value="pl">Profit & Loss</option>
              </select>
              
              <button
                onClick={loadUsers}
                className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <RefreshCw size={16} className="text-white" />
              </button>
            </div>
          </div>

          {/* Sub Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-3 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">User Management - P&L Access</h2>
              <button
                onClick={() => router.push('/pl')}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
              >
                View P&L Dashboard
              </button>
            </div>
          </div>

          {/* Add User */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
            <h3 className="font-semibold text-white mb-3">Add User</h3>
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="user@rancherscustard.com"
                className="flex-1 px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                onClick={handleAddUser}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-2 text-white"
              >
                <Plus size={18} />
                Add
              </button>
            </div>
          </div>

          {/* Users List */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700">
              <h3 className="font-semibold text-white">Users ({users.length})</h3>
            </div>
            
            {users.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No users configured yet
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {users.map((user) => (
                  <div key={user.email} className="p-4">
                    {editingUser === user.email ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{user.email}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleSaveUser(user.email)}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm flex items-center gap-1 text-white"
                            >
                              <Save size={14} />
                              Save
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm flex items-center gap-1 text-white"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">Access Level</label>
                          <div className="flex gap-2 flex-wrap">
                            {['none', 'specific', 'all'].map(type => (
                              <button
                                key={type}
                                onClick={() => setEditForm(prev => ({ ...prev, accessType: type }))}
                                className={`px-4 py-2 rounded-lg text-sm ${
                                  editForm.accessType === type
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}
                              >
                                {type === 'none' ? 'No Access' : type === 'specific' ? 'Specific Locations' : 'All Locations'}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        {editForm.accessType === 'specific' && (
                          <div>
                            <label className="block text-sm text-slate-400 mb-2">Select Locations</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {ALL_LOCATIONS.map(loc => (
                                <label
                                  key={loc}
                                  className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm ${
                                    editForm.locations.includes(loc)
                                      ? 'bg-blue-600/20 border border-blue-500 text-white'
                                      : 'bg-slate-700 border border-slate-600 text-slate-300 hover:border-slate-500'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={editForm.locations.includes(loc)}
                                    onChange={() => toggleLocation(loc)}
                                    className="rounded border-slate-500"
                                  />
                                  {loc}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{user.email}</div>
                          <div className="text-sm text-slate-400 mt-1">
                            {user.plAccess?.type === 'all' && (
                              <span className="inline-block px-2 py-0.5 bg-green-900/50 text-green-400 rounded text-xs">
                                All Locations
                              </span>
                            )}
                            {user.plAccess?.type === 'specific' && (
                              <span className="inline-block px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded text-xs">
                                {user.plAccess.locations?.length || 0} Locations
                              </span>
                            )}
                            {(!user.plAccess?.type || user.plAccess?.type === 'none') && (
                              <span className="inline-block px-2 py-0.5 bg-slate-700 text-slate-400 rounded text-xs">
                                No Access
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditUser(user)}
                            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-white"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.email)}
                            className="p-1 text-red-400 hover:bg-red-900/30 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
