import { useState, useEffect } from 'react';
import { Users, Shield, Save, X, ChevronDown } from 'lucide-react';

export default function MessagingPermissions({ onClose }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all'); // all, managers, users

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/messages/permissions');
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

  const updatePermission = async (userId, permission) => {
    setSaving(userId);
    try {
      const res = await fetch('/api/messages/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          messagingPermission: permission === 'reset' ? null : permission 
        })
      });

      if (res.ok) {
        // Reload to get updated effective permissions
        await loadUsers();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to update permission');
    }
    setSaving(null);
  };

  const updateTitle = async (userId, title) => {
    setSaving(userId);
    try {
      const res = await fetch('/api/messages/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          employeeTitle: title === '' ? null : title 
        })
      });

      if (res.ok) {
        await loadUsers();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to update title');
    }
    setSaving(null);
  };

  const getPermissionBadge = (user) => {
    const colors = {
      admin: 'bg-purple-600',
      manager: 'bg-blue-600',
      user: 'bg-slate-600'
    };
    
    return (
      <span className={`px-2 py-0.5 text-xs font-semibold text-white rounded ${colors[user.effectivePermission]}`}>
        {user.effectivePermission.toUpperCase()}
      </span>
    );
  };

  const getTitleBadge = (title) => {
    if (!title) return null;
    
    const colors = {
      'GM': 'bg-purple-600',
      'AGM': 'bg-blue-600',
      'SL': 'bg-green-600'
    };
    
    return (
      <span className={`px-1.5 py-0.5 text-[10px] font-semibold text-white rounded ${colors[title] || 'bg-slate-600'}`}>
        {title}
      </span>
    );
  };

  const filteredUsers = users.filter(u => {
    if (filter === 'managers') return u.effectivePermission === 'manager' || u.effectivePermission === 'admin';
    if (filter === 'users') return u.effectivePermission === 'user';
    return true;
  });

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-white">Messaging Permissions</h3>
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
          <p className="text-slate-300 mb-2">Permission levels:</p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span><span className="text-purple-400 font-semibold">Admin</span> - Can post all types + pin</span>
            <span><span className="text-blue-400 font-semibold">Manager</span> - Can post normal & important</span>
            <span><span className="text-slate-400 font-semibold">User</span> - Can reply only</span>
          </div>
          <p className="text-slate-500 text-xs mt-2">
            GM/AGM titles automatically grant Manager permissions unless overridden.
          </p>
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
            <option value="managers">Managers ({users.filter(u => u.effectivePermission === 'manager' || u.effectivePermission === 'admin').length})</option>
            <option value="users">Users Only ({users.filter(u => u.effectivePermission === 'user').length})</option>
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
                      {getTitleBadge(user.employeeTitle)}
                      {getPermissionBadge(user)}
                      {user.permissionSource === 'manual' && (
                        <span className="text-[10px] text-slate-500">(override)</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{user.email}</p>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Title Selector */}
                    <select
                      value={user.employeeTitle || ''}
                      onChange={(e) => updateTitle(user._id, e.target.value)}
                      disabled={saving === user._id}
                      className="px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-white w-20"
                    >
                      <option value="">No Title</option>
                      <option value="GM">GM</option>
                      <option value="AGM">AGM</option>
                      <option value="SL">SL</option>
                    </select>

                    {/* Permission Selector */}
                    <select
                      value={user.messagingPermission || 'auto'}
                      onChange={(e) => updatePermission(user._id, e.target.value === 'auto' ? 'reset' : e.target.value)}
                      disabled={saving === user._id}
                      className="px-2 py-1 text-xs bg-slate-600 border border-slate-500 rounded text-white w-24"
                    >
                      <option value="auto">Auto (Title)</option>
                      <option value="user">User</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </select>

                    {saving === user._id && (
                      <span className="text-xs text-blue-400">Saving...</span>
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
