import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Trash2, Save, X, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

const ALL_LOCATIONS = [
  'Allen', 'Bixby', 'Broken Arrow', 'Carrollton', 'Edmond',
  'Frisco #1', 'Frisco #2', 'Frisco #3', 'Hillcrest Village',
  "Hunter's Creek", 'Lake Highlands', 'Lakeland', 'Norman', 'Owasso', 'Penn',
  'Prosper', 'Sanford', 'The Colony', 'Treat Truck', 'Warr Acres', 'Yale'
];

export default function AdminUsers() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    dashboardAccess: { type: 'none', locations: [] },
    plAccess: { type: 'none', locations: [] },
    bonusAccess: { type: 'none', locations: [] }
  });
  const [expandedSection, setExpandedSection] = useState(null); // 'dashboard' or 'pl'

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

  const handleEditUser = (user) => {
    setEditingUser(user.email);
    setEditForm({
      dashboardAccess: user.dashboardAccess || { type: 'none', locations: [] },
      plAccess: user.plAccess || { type: 'none', locations: [] },
      bonusAccess: user.bonusAccess || { type: 'none', locations: [] }
    });
    setExpandedSection(null);
  };

  const handleSaveUser = async (email) => {
    try {
      const res = await fetch('/api/admin/update-pl-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          dashboardAccess: editForm.dashboardAccess,
          plAccess: editForm.plAccess,
          bonusAccess: editForm.bonusAccess
        })
      });

      if (res.ok) {
        setEditingUser(null);
        setExpandedSection(null);
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

  const toggleLocation = (accessKey, location) => {
    setEditForm(prev => ({
      ...prev,
      [accessKey]: {
        ...prev[accessKey],
        locations: prev[accessKey].locations.includes(location)
          ? prev[accessKey].locations.filter(l => l !== location)
          : [...prev[accessKey].locations, location]
      }
    }));
  };

  const setAccessType = (accessKey, type) => {
    setEditForm(prev => ({
      ...prev,
      [accessKey]: {
        ...prev[accessKey],
        type
      }
    }));
  };

  const formatLastLogin = (date) => {
    if (!date) return 'Never';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getAccessBadge = (access, type) => {
    const colors = type === 'dashboard' 
      ? { all: 'bg-green-900/50 text-green-400', specific: 'bg-blue-900/50 text-blue-400', none: 'bg-slate-700 text-slate-400' }
      : type === 'bonus'
      ? { all: 'bg-emerald-900/50 text-emerald-400', specific: 'bg-teal-900/50 text-teal-400', none: 'bg-slate-700 text-slate-400' }
      : { all: 'bg-purple-900/50 text-purple-400', specific: 'bg-orange-900/50 text-orange-400', none: 'bg-slate-700 text-slate-400' };

    if (access?.type === 'all') {
      return <span className={`inline-block px-2 py-0.5 ${colors.all} rounded text-xs`}>All</span>;
    }
    if (access?.type === 'specific') {
      return <span className={`inline-block px-2 py-0.5 ${colors.specific} rounded text-xs`}>{access.locations?.length || 0} Loc</span>;
    }
    return <span className={`inline-block px-2 py-0.5 ${colors.none} rounded text-xs`}>None</span>;
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
                <h1 className="text-2xl font-bold text-white">User Management</h1>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Dashboards
                </button>
                <button
                  onClick={() => router.push('/pl')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  P&L
                </button>
                <button
                  onClick={loadUsers}
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
                    onClick={loadUsers}
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
              <div className="flex gap-2">
                <button
                  onClick={() => router.push('/')}
                  className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  Dashboards
                </button>
                <button
                  onClick={() => router.push('/pl')}
                  className="flex-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  P&L
                </button>
              </div>
            </div>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-3 mb-3 text-sm text-blue-300">
            Users automatically appear here after their first login. Edit to grant access.
          </div>

          {/* Users Table - Desktop */}
          <div className="hidden md:block bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">User</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Last Login</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">Dashboard Access</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">P&L Access</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-slate-300">Bonus Access</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-slate-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                      No users yet. Users will appear after their first login.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.email} className="hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {user.image ? (
                            <img src={user.image} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 text-sm font-medium">
                              {(user.name || user.email)[0].toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-white">{user.name || user.email.split('@')[0]}</div>
                            <div className="text-xs text-slate-400">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatLastLogin(user.lastLogin)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getAccessBadge(user.dashboardAccess, 'dashboard')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getAccessBadge(user.plAccess, 'pl')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {getAccessBadge(user.bonusAccess, 'bonus')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
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
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Users List - Mobile */}
          <div className="md:hidden bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-700 bg-slate-700/50">
              <span className="font-semibold text-white text-sm">Users ({users.length})</span>
            </div>
            {users.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-sm">
                No users yet. Users will appear after their first login.
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {users.map((user) => (
                  <div key={user.email} className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {user.image ? (
                          <img src={user.image} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-slate-300 text-sm font-medium">
                            {(user.name || user.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white text-sm">{user.name || user.email.split('@')[0]}</div>
                          <div className="text-xs text-slate-400">{user.email}</div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleEditUser(user)}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs text-white"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.email)}
                          className="p-1 text-red-400 hover:bg-red-900/30 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2 text-xs flex-wrap">
                      <span className="text-slate-500">Dashboard:</span>
                      {getAccessBadge(user.dashboardAccess, 'dashboard')}
                      <span className="text-slate-500 ml-2">P&L:</span>
                      {getAccessBadge(user.plAccess, 'pl')}
                      <span className="text-slate-500 ml-2">Bonus:</span>
                      {getAccessBadge(user.bonusAccess, 'bonus')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edit Modal */}
          {editingUser && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
              <div className="bg-slate-800 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
                  <h3 className="font-semibold text-white">Edit Access: {editingUser}</h3>
                  <button
                    onClick={() => { setEditingUser(null); setExpandedSection(null); }}
                    className="p-1 text-slate-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-4 space-y-4">
                  {/* Dashboard Access */}
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'dashboard' ? null : 'dashboard')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        {expandedSection === 'dashboard' ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                        <span className="font-medium text-white">Dashboard Access</span>
                        <span className="text-xs text-slate-400">(Sales, Labor, Clockouts, etc.)</span>
                      </div>
                      {getAccessBadge(editForm.dashboardAccess, 'dashboard')}
                    </button>
                    
                    {expandedSection === 'dashboard' && (
                      <div className="p-4 space-y-4">
                        <div className="flex gap-2 flex-wrap">
                          {['none', 'specific', 'all'].map(type => (
                            <button
                              key={type}
                              onClick={() => setAccessType('dashboardAccess', type)}
                              className={`px-4 py-2 rounded-lg text-sm ${
                                editForm.dashboardAccess.type === type
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}
                            >
                              {type === 'none' ? 'No Access' : type === 'specific' ? 'Specific Locations' : 'All Locations'}
                            </button>
                          ))}
                        </div>
                        
                        {editForm.dashboardAccess.type === 'specific' && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {ALL_LOCATIONS.map(loc => (
                              <label
                                key={loc}
                                className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm ${
                                  editForm.dashboardAccess.locations.includes(loc)
                                    ? 'bg-blue-600/20 border border-blue-500 text-white'
                                    : 'bg-slate-700 border border-slate-600 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={editForm.dashboardAccess.locations.includes(loc)}
                                  onChange={() => toggleLocation('dashboardAccess', loc)}
                                  className="rounded border-slate-500"
                                />
                                {loc}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* P&L Access */}
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'pl' ? null : 'pl')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        {expandedSection === 'pl' ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                        <span className="font-medium text-white">P&L Access</span>
                        <span className="text-xs text-slate-400">(Profit & Loss reports)</span>
                      </div>
                      {getAccessBadge(editForm.plAccess, 'pl')}
                    </button>
                    
                    {expandedSection === 'pl' && (
                      <div className="p-4 space-y-4">
                        <div className="flex gap-2 flex-wrap">
                          {['none', 'specific', 'all'].map(type => (
                            <button
                              key={type}
                              onClick={() => setAccessType('plAccess', type)}
                              className={`px-4 py-2 rounded-lg text-sm ${
                                editForm.plAccess.type === type
                                  ? 'bg-orange-600 text-white'
                                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}
                            >
                              {type === 'none' ? 'No Access' : type === 'specific' ? 'Specific Locations' : 'All Locations'}
                            </button>
                          ))}
                        </div>
                        
                        {editForm.plAccess.type === 'specific' && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {ALL_LOCATIONS.map(loc => (
                              <label
                                key={loc}
                                className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm ${
                                  editForm.plAccess.locations.includes(loc)
                                    ? 'bg-orange-600/20 border border-orange-500 text-white'
                                    : 'bg-slate-700 border border-slate-600 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={editForm.plAccess.locations.includes(loc)}
                                  onChange={() => toggleLocation('plAccess', loc)}
                                  className="rounded border-slate-500"
                                />
                                {loc}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Bonus Access */}
                  <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedSection(expandedSection === 'bonus' ? null : 'bonus')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 hover:bg-slate-700"
                    >
                      <div className="flex items-center gap-3">
                        {expandedSection === 'bonus' ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                        <span className="font-medium text-white">Bonus Access</span>
                        <span className="text-xs text-slate-400">(Quarterly bonus dashboard)</span>
                      </div>
                      {getAccessBadge(editForm.bonusAccess, 'bonus')}
                    </button>
                    
                    {expandedSection === 'bonus' && (
                      <div className="p-4 space-y-4">
                        <div className="flex gap-2 flex-wrap">
                          {['none', 'specific', 'all'].map(type => (
                            <button
                              key={type}
                              onClick={() => setAccessType('bonusAccess', type)}
                              className={`px-4 py-2 rounded-lg text-sm ${
                                editForm.bonusAccess.type === type
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                              }`}
                            >
                              {type === 'none' ? 'No Access' : type === 'specific' ? 'Specific Locations' : 'All Locations'}
                            </button>
                          ))}
                        </div>
                        
                        {editForm.bonusAccess.type === 'specific' && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {ALL_LOCATIONS.map(loc => (
                              <label
                                key={loc}
                                className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer text-sm ${
                                  editForm.bonusAccess.locations.includes(loc)
                                    ? 'bg-emerald-600/20 border border-emerald-500 text-white'
                                    : 'bg-slate-700 border border-slate-600 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={editForm.bonusAccess.locations.includes(loc)}
                                  onChange={() => toggleLocation('bonusAccess', loc)}
                                  className="rounded border-slate-500"
                                />
                                {loc}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 border-t border-slate-700 flex justify-end gap-2">
                  <button
                    onClick={() => { setEditingUser(null); setExpandedSection(null); }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveUser(editingUser)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white text-sm flex items-center gap-2"
                  >
                    <Save size={16} />
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
