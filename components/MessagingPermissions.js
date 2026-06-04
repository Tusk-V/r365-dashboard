import { useState, useEffect } from 'react';
import { Users, Shield, Save, X, ChevronDown, Trash2 } from 'lucide-react';

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default function MessagingPermissions({ onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat/permissions');
      const data = await res.json();
      
      if (res.ok) {
        setUsers(data.users || []);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load users');
    }
    setLoading(false);
  };

  const updateRole = async (userId, role) => {
    setSaving(userId);
    try {
      const res = await fetch('/api/chat/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role })
      });

      if (res.ok) {
        await loadUsers();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to update role');
    }
    setSaving(null);
  };

  const deleteUser = async (userId, userName) => {
    if (!confirm(`Delete ${userName}? This will remove their dashboard access and message history.`)) {
      return;
    }

    setSaving(userId);
    try {
      const res = await fetch(`/api/chat/permissions?userId=${userId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        await loadUsers();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to delete user');
    }
    setSaving(null);
  };

  const getRoleBadge = (role) => {
    const colors = {
      Admin: 'bg-red-600',
      FOM: 'bg-blue-600',
      Manager: 'bg-green-600',
      User: 'bg-slate-600'
    };
    
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold text-white rounded ${colors[role] || colors.User}`}>
        {role || 'User'}
      </span>
    );
  };

  const filteredUsers = users.filter(u => {
    if (filter === 'admins') return u.role === 'Admin' || u.role === 'FOM';
    if (filter === 'managers') return u.role === 'Manager';
    if (filter === 'users') return !u.role || u.role === 'User';
    return true;
  });

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-lg w-full max-h-[90vh] overflow-hidden shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-white">User Roles</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Legend */}
        <div className="bg-slate-700/50 rounded-lg p-3 mb-4 text-sm">
          <p className="text-slate-300 mb-2">Role permissions:</p>
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
            <span><span className="text-red-400 font-semibold">Admin</span> - Delete & Pin</span>
            <span><span className="text-blue-400 font-semibold">FOM</span> - Delete & Pin</span>
            <span><span className="text-green-400 font-semibold">Manager</span> - Post & Reply</span>
            <span><span className="text-slate-400 font-semibold">User</span> - Post & Reply</span>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-slate-400">Show:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-1 text-sm bg-slate-700 border border-slate-600 rounded text-white"
          >
            <option value="all">All Users ({users.length})</option>
            <option value="admins">Admin/FOM ({users.filter(u => u.role === 'Admin' || u.role === 'FOM').length})</option>
            <option value="managers">Managers ({users.filter(u => u.role === 'Manager').length})</option>
            <option value="users">Users ({users.filter(u => !u.role || u.role === 'User').length})</option>
          </select>
        </div>

        {/* Users List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center text-slate-400 py-8">Loading users...</div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">{error}</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center text-slate-400 py-8">No users found</div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map(user => (
                <div 
                  key={user._id}
                  className="bg-slate-700/50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3"
                >
                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white truncate">{user.name || user.email}</span>
                      {getRoleBadge(user.role)}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                  </div>

                  {/* Role Selector */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={user.role || 'User'}
                      onChange={(e) => updateRole(user._id, e.target.value)}
                      disabled={saving === user._id}
                      className="px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-white w-24"
                    >
                      <option value="User">User</option>
                      <option value="Manager">Manager</option>
                      <option value="FOM">FOM</option>
                      <option value="Admin">Admin</option>
                    </select>

                    {/* Don't show delete for admin user */}
                    {user.email !== ADMIN_EMAIL && (
                      <button
                        onClick={() => deleteUser(user._id, user.name || user.email)}
                        disabled={saving === user._id}
                        className="p-1 text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Delete user"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}

                    {saving === user._id && (
                      <span className="text-xs text-blue-400">...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-700">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
