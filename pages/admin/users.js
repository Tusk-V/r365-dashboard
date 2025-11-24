// pages/admin/users.js
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useState, useEffect } from 'react';
import { Users, Edit, Save, X, Plus, Trash2 } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

const ALL_LOCATIONS = [
  'Allen', 'Bixby', 'Broken Arrow', 'Carrollton', 'Edmond',
  'Frisco #1', 'Frisco #2', 'Frisco #3', 'Hillcrest Village',
  'Lake Highlands', 'Lakeland', 'Norman', 'Owasso', 'Penn',
  'Prosper', 'Sanford', 'The Colony', 'Warr Acres', 'Yale'
];

export default function AdminUsers() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    } else if (status === "authenticated") {
      if (session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        router.push("/");
      } else {
        loadUsers();
      }
    }
  }, [status, session, router]);

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/admin/update-pl-access');
      const data = await response.json();
      if (response.ok) {
        setUsers(data.users || []);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEditUser = (user) => {
    setEditingUser({
      ...user,
      plAccess: user.plAccess || { type: 'none', locations: [] }
    });
  };

  const handleSaveUser = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/update-pl-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: editingUser.email,
          plAccess: editingUser.plAccess
        })
      });

      if (response.ok) {
        setEditingUser(null);
        loadUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail || !newUserEmail.includes('@')) {
      alert('Please enter a valid email');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/update-pl-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          plAccess: { type: 'none', locations: [] }
        })
      });

      if (response.ok) {
        setShowAddUser(false);
        setNewUserEmail('');
        loadUsers();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to add user');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAccessTypeChange = (type) => {
    setEditingUser({
      ...editingUser,
      plAccess: {
        type,
        locations: type === 'specific' ? editingUser.plAccess?.locations || [] : []
      }
    });
  };

  const handleLocationToggle = (location) => {
    const currentLocations = editingUser.plAccess?.locations || [];
    const newLocations = currentLocations.includes(location)
      ? currentLocations.filter(l => l !== location)
      : [...currentLocations, location];
    
    setEditingUser({
      ...editingUser,
      plAccess: {
        ...editingUser.plAccess,
        locations: newLocations
      }
    });
  };

  const getAccessBadge = (user) => {
    const access = user.plAccess;
    if (!access || access.type === 'none') {
      return <span className="px-2 py-1 bg-slate-700 text-slate-400 text-xs rounded">No Access</span>;
    }
    if (access.type === 'all') {
      return <span className="px-2 py-1 bg-green-900 text-green-400 text-xs rounded">All Locations</span>;
    }
    if (access.type === 'specific') {
      const count = access.locations?.length || 0;
      return <span className="px-2 py-1 bg-blue-900 text-blue-400 text-xs rounded">{count} Location{count !== 1 ? 's' : ''}</span>;
    }
    return null;
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  if (!session || session.user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return null;
  }

  return (
    <>
      <Head>
        <title>User Management - Andy's Dashboard</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="text-blue-400" size={24} />
                <div>
                  <h1 className="text-xl font-bold text-white">User Management</h1>
                  <p className="text-sm text-slate-400">Manage P&L access for users</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push('/pl-upload')}
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                >
                  P&L Upload
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => signOut()}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Add User Button */}
          <div className="mb-4">
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={18} />
              Add User
            </button>
          </div>

          {/* Add User Form */}
          {showAddUser && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-4">
              <h3 className="text-white font-semibold mb-3">Add New User</h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@rancherscustard.com"
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  onClick={handleAddUser}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Adding...' : 'Add'}
                </button>
                <button
                  onClick={() => { setShowAddUser(false); setNewUserEmail(''); }}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Users List */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold text-white">Users ({users.length})</h2>
            </div>
            
            {users.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No users found. Add a user to get started.
              </div>
            ) : (
              <div className="divide-y divide-slate-700">
                {users.map((user, idx) => (
                  <div key={idx} className="p-4 hover:bg-slate-750">
                    {editingUser?.email === user.email ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-white font-medium">{user.email}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveUser}
                              disabled={saving}
                              className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors disabled:opacity-50"
                            >
                              <Save size={14} />
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded transition-colors"
                            >
                              <X size={14} />
                              Cancel
                            </button>
                          </div>
                        </div>

                        {/* Access Type Selection */}
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">P&L Access Level</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAccessTypeChange('none')}
                              className={`px-3 py-2 rounded text-sm transition-colors ${
                                editingUser.plAccess?.type === 'none'
                                  ? 'bg-slate-600 text-white'
                                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                              }`}
                            >
                              No Access
                            </button>
                            <button
                              onClick={() => handleAccessTypeChange('specific')}
                              className={`px-3 py-2 rounded text-sm transition-colors ${
                                editingUser.plAccess?.type === 'specific'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                              }`}
                            >
                              Specific Locations
                            </button>
                            <button
                              onClick={() => handleAccessTypeChange('all')}
                              className={`px-3 py-2 rounded text-sm transition-colors ${
                                editingUser.plAccess?.type === 'all'
                                  ? 'bg-green-600 text-white'
                                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                              }`}
                            >
                              All Locations
                            </button>
                          </div>
                        </div>

                        {/* Location Selection (only for specific) */}
                        {editingUser.plAccess?.type === 'specific' && (
                          <div>
                            <label className="block text-sm text-slate-400 mb-2">
                              Select Locations ({editingUser.plAccess?.locations?.length || 0} selected)
                            </label>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-900 rounded-lg">
                              {ALL_LOCATIONS.map(location => (
                                <label
                                  key={location}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-800 p-1 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    checked={editingUser.plAccess?.locations?.includes(location) || false}
                                    onChange={() => handleLocationToggle(location)}
                                    className="rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-600"
                                  />
                                  <span className="text-white text-sm">{location}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white font-medium">{user.email}</p>
                          {user.plAccess?.type === 'specific' && user.plAccess?.locations?.length > 0 && (
                            <p className="text-slate-400 text-xs mt-1">
                              {user.plAccess.locations.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {getAccessBadge(user)}
                          <button
                            onClick={() => handleEditUser(user)}
                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit size={16} />
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
