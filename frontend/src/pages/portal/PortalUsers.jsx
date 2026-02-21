import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Shield, 
  Trash2,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all, pending, active, disabled
  const currentUser = JSON.parse(localStorage.getItem('portalUser') || '{}');

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/users`);
      if (response.ok) {
        setUsers(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (userId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/users/${userId}/approve`, {
        method: 'PUT'
      });
      if (response.ok) {
        toast.success('User approved');
        fetchUsers();
      }
    } catch (error) {
      toast.error('Failed to approve user');
    }
  };

  const handleReject = async (userId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/users/${userId}/reject`, {
        method: 'PUT'
      });
      if (response.ok) {
        toast.success('User rejected');
        fetchUsers();
      }
    } catch (error) {
      toast.error('Failed to reject user');
    }
  };

  const handleToggleActive = async (userId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/users/${userId}/toggle-active`, {
        method: 'PUT'
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(data.message);
        fetchUsers();
      }
    } catch (error) {
      toast.error('Failed to toggle user status');
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (response.ok) {
        toast.success(`Role changed to ${newRole}`);
        fetchUsers();
      }
    } catch (error) {
      toast.error('Failed to change role');
    }
  };

  const handleDelete = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/users/${userId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        toast.success('User deleted');
        fetchUsers();
      } else {
        const data = await response.json();
        toast.error(data.detail || 'Failed to delete user');
      }
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(search.toLowerCase());
    if (filter === 'pending') return matchesSearch && !user.is_approved;
    if (filter === 'active') return matchesSearch && user.is_active && user.is_approved;
    if (filter === 'disabled') return matchesSearch && !user.is_active;
    return matchesSearch;
  });

  const pendingCount = users.filter(u => u.is_approved === false).length;
  const activeCount = users.filter(u => u.is_active !== false && u.is_approved !== false).length;
  const disabledCount = users.filter(u => u.is_active === false).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500">Manage portal access and authorization</p>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{users.length}</p>
            <p className="text-xs text-gray-500">Total Users</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{pendingCount}</p>
            <p className="text-xs text-gray-500">Pending Approval</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{activeCount}</p>
            <p className="text-xs text-gray-500">Active Users</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900">{disabledCount}</p>
            <p className="text-xs text-gray-500">Disabled</p>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'pending', label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            { key: 'active', label: 'Active' },
            { key: 'disabled', label: 'Disabled' },
          ].map(f => (
            <button
              key={f.key}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                filter === f.key ? 'bg-white shadow text-emerald-600' : 'text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No users found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">User</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Last Login</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Registered</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map((user) => {
                  const isCurrentUser = user.id === currentUser.id;
                  const isPending = user.is_approved === false;
                  const isDisabled = user.is_active === false;
                  const isAdmin = user.role === 'admin';

                  return (
                    <tr key={user.id} className={`hover:bg-gray-50 ${isPending ? 'bg-amber-50/50' : ''} ${isDisabled ? 'bg-red-50/30' : ''}`}>
                      {/* User */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
                            isAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {user.username}
                              {isCurrentUser && <span className="ml-2 text-xs text-emerald-600">(You)</span>}
                            </p>
                            <p className="text-xs text-gray-400">{user.id.substring(0, 8)}...</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        {isCurrentUser || user.username === 'admin' ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            isAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {isAdmin && <Shield className="w-3 h-3" />}
                            {user.role}
                          </span>
                        ) : (
                          <select
                            value={user.role}
                            onChange={(e) => handleChangeRole(user.id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
                          >
                            <option value="viewer">viewer</option>
                            <option value="admin">admin</option>
                          </select>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <AlertCircle className="w-3 h-3" />
                            Pending
                          </span>
                        ) : isDisabled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3" />
                            Disabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </td>

                      {/* Last Login */}
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(user.last_login)}
                      </td>

                      {/* Registered */}
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(user.created_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {isPending && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleApprove(user.id)}
                                className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                title="Approve"
                              >
                                <UserCheck className="w-4 h-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReject(user.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                title="Reject"
                              >
                                <UserX className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                          {!isPending && !isCurrentUser && user.username !== 'admin' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleToggleActive(user.id)}
                              className={isDisabled 
                                ? "text-emerald-600 hover:bg-emerald-50" 
                                : "text-amber-600 hover:bg-amber-50"
                              }
                              title={isDisabled ? 'Enable' : 'Disable'}
                            >
                              {isDisabled ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                            </Button>
                          )}
                          {!isCurrentUser && user.username !== 'admin' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(user.id, user.username)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
