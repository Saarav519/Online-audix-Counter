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
  AlertCircle,
  Lock,
  X,
  UserPlus
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import PageHeader from '../../components/portal/PageHeader';
import { useAudit } from '../AuditApp';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  // Role-aware UI gating — supervisors see read-only list, no admin actions.
  const { portalUser: currentUserCtx, isAdmin, authHeaders } = useAudit();
  const currentUser = currentUserCtx || JSON.parse(localStorage.getItem('portalUser') || '{}');

  // Auth confirmation state
  const [authDialog, setAuthDialog] = useState(null); // { action, userId, username, label }
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Create-user state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'supervisor' });
  const [createLoading, setCreateLoading] = useState(false);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/users`);
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

  // ---- Verify admin password before sensitive actions ----
  const verifyAdminAndExecute = async () => {
    if (!authPassword) {
      toast.error('Please enter your admin password');
      return;
    }

    setAuthLoading(true);
    try {
      // Verify admin credentials
      const verifyRes = await fetch(`${BACKEND_URL}/api/audit/portal/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser.username, password: authPassword })
      });

      if (!verifyRes.ok) {
        toast.error('Incorrect admin password');
        setAuthLoading(false);
        return;
      }

      // Execute the action
      const { action, userId } = authDialog;
      let response;

      if (action === 'delete') {
        response = await fetch(`${BACKEND_URL}/api/audit/portal/users/${userId}`, { method: 'DELETE', headers: authHeaders() });
      } else if (action === 'disable') {
        response = await fetch(`${BACKEND_URL}/api/audit/portal/users/${userId}/toggle-active`, { method: 'PUT', headers: authHeaders() });
      } else if (action === 'enable') {
        response = await fetch(`${BACKEND_URL}/api/audit/portal/users/${userId}/toggle-active`, { method: 'PUT', headers: authHeaders() });
      } else if (action === 'reject') {
        response = await fetch(`${BACKEND_URL}/api/audit/portal/users/${userId}/reject`, { method: 'PUT', headers: authHeaders() });
      }

      if (response && response.ok) {
        const data = await response.json();
        toast.success(data.message || 'Action completed');
        fetchUsers();
      } else if (response) {
        const data = await response.json();
        toast.error(data.detail || 'Action failed');
      }

      setAuthDialog(null);
      setAuthPassword('');
    } catch (error) {
      toast.error('Action failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // ---- Create a user outright, so an admin does not have to walk every new
  // supervisor through the self-registration + approval flow before they can
  // be picked as an assignee. ----
  const handleCreateUser = async () => {
    const username = createForm.username.trim();
    if (!username) {
      toast.error('Enter a username');
      return;
    }
    if (createForm.password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }

    setCreateLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ username, password: createForm.password, role: createForm.role })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        toast.success(data.message || 'User created');
        setCreateOpen(false);
        setCreateForm({ username: '', password: '', role: 'supervisor' });
        fetchUsers();
      } else {
        toast.error(data.detail || 'Failed to create user');
      }
    } catch (error) {
      toast.error('Failed to create user');
    } finally {
      setCreateLoading(false);
    }
  };

  const requestAuth = (action, userId, username, label) => {
    setAuthDialog({ action, userId, username, label });
    setAuthPassword('');
  };

  // ---- Actions that don't need auth ----
  const handleApprove = async (userId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/users/${userId}/approve`, { method: 'PUT', headers: authHeaders() });
      if (response.ok) {
        toast.success('User approved — they can now login');
        fetchUsers();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.detail || 'Failed to approve user');
      }
    } catch (error) {
      toast.error('Failed to approve user');
    }
  };

  const handleChangeRole = async (userId, newRole) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ role: newRole })
      });
      if (response.ok) {
        toast.success(`Role changed to ${newRole}`);
        fetchUsers();
      } else {
        const data = await response.json().catch(() => ({}));
        toast.error(data.detail || 'Failed to change role');
      }
    } catch (error) {
      toast.error('Failed to change role');
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(search.toLowerCase());
    if (filter === 'pending') return matchesSearch && !user.is_approved;
    if (filter === 'active') return matchesSearch && user.is_active !== false && user.is_approved !== false;
    if (filter === 'disabled') return matchesSearch && user.is_active === false;
    return matchesSearch;
  });

  const pendingCount = users.filter(u => u.is_approved === false).length;
  const activeCount = users.filter(u => u.is_active !== false && u.is_approved !== false).length;
  const disabledCount = users.filter(u => u.is_active === false).length;

  return (
    <div className="p-3 md:p-4 lg:p-5">
      {/* Auth Confirmation Dialog */}
      {authDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  authDialog.action === 'delete' ? 'bg-red-100' : 'bg-amber-100'
                }`}>
                  <Lock className={`w-5 h-5 ${
                    authDialog.action === 'delete' ? 'text-red-600' : 'text-amber-600'
                  }`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Authorization Required</h3>
                  <p className="text-sm text-gray-500">Enter admin password to confirm</p>
                </div>
              </div>
              <button onClick={() => { setAuthDialog(null); setAuthPassword(''); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`p-3 rounded-lg mb-4 ${
              authDialog.action === 'delete' ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
            }`}>
              <p className={`text-sm font-medium ${
                authDialog.action === 'delete' ? 'text-red-800' : 'text-amber-800'
              }`}>
                {authDialog.label}
              </p>
              <p className={`text-xs mt-1 ${
                authDialog.action === 'delete' ? 'text-red-600' : 'text-amber-600'
              }`}>
                User: <strong>{authDialog.username}</strong>
              </p>
            </div>

            <div className="mb-4">
              <Label htmlFor="auth-password">Admin Password</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="Enter your admin password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verifyAdminAndExecute()}
                className="mt-1"
                autoFocus
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => { setAuthDialog(null); setAuthPassword(''); }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={verifyAdminAndExecute}
                disabled={authLoading || !authPassword}
                className={`flex-1 ${
                  authDialog.action === 'delete' 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                {authLoading ? 'Verifying...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Dialog */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Add User</h3>
                  <p className="text-xs text-gray-500">Created users are approved and can be assigned right away</p>
                </div>
              </div>
              <button onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="new-username" className="text-xs">Username</Label>
                <Input
                  id="new-username"
                  value={createForm.username}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="e.g. ravi.supervisor"
                  autoComplete="off"
                  data-testid="new-user-username"
                />
              </div>
              <div>
                <Label htmlFor="new-password" className="text-xs">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="At least 4 characters"
                  autoComplete="new-password"
                  data-testid="new-user-password"
                />
                <p className="text-[11px] text-gray-400 mt-1">Share this with the user — they can change it from the login page.</p>
              </div>
              <div>
                <Label htmlFor="new-role" className="text-xs">Role</Label>
                <select
                  id="new-role"
                  value={createForm.role}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  data-testid="new-user-role"
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleCreateUser}
                disabled={createLoading}
                data-testid="create-user-submit"
              >
                {createLoading ? 'Creating...' : 'Create User'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="User Management"
        subtitle="Manage portal access and authorization"
        breadcrumbs={[{ label: 'Users' }]}
        liveLabel={pendingCount > 0 ? `${pendingCount} pending approval` : null}
        accentColor="blue"
        actions={isAdmin ? (
          <Button
            size="sm"
            onClick={() => { setCreateForm({ username: '', password: '', role: 'supervisor' }); setCreateOpen(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="add-user-btn"
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Add User
          </Button>
        ) : null}
      />

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
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
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
                  const userIsAdmin = user.role === 'admin';
                  const isDefaultAdmin = user.username === 'admin';

                  return (
                    <tr key={user.id} className={`hover:bg-gray-50 ${isPending ? 'bg-amber-50/50' : ''} ${isDisabled ? 'bg-red-50/30' : ''}`}>
                      {/* User */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
                            userIsAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 flex items-center gap-2">
                              <span>{user.username}</span>
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                  userIsAdmin
                                    ? 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
                                    : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
                                }`}
                                data-testid={`user-role-badge-${user.username}`}
                              >
                                {userIsAdmin && <Shield className="w-2.5 h-2.5" />}
                                {userIsAdmin ? 'Admin' : 'Supervisor'}
                              </span>
                              {isCurrentUser && <span className="text-xs text-emerald-600">(You)</span>}
                              {isDefaultAdmin && <span className="text-xs text-blue-500">(Default)</span>}
                            </p>
                            <p className="text-xs text-gray-400">{user.id.substring(0, 8)}...</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        {(!isAdmin || isCurrentUser || isDefaultAdmin) ? (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            userIsAdmin ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {userIsAdmin && <Shield className="w-3 h-3" />}
                            {user.role}
                          </span>
                        ) : (
                          <select
                            value={user.role === 'viewer' ? 'supervisor' : user.role}
                            onChange={(e) => handleChangeRole(user.id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white cursor-pointer"
                            data-testid={`role-select-${user.username}`}
                          >
                            <option value="supervisor">supervisor</option>
                            <option value="admin">admin</option>
                          </select>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            <AlertCircle className="w-3 h-3" />
                            Pending
                          </span>
                        ) : isDisabled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3" />
                            Disabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
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

                      {/* Actions - admin-only; supervisors see read-only state */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2" data-testid={`user-actions-${user.username}`}>
                          {!isAdmin && (
                            <span className="text-xs text-slate-400 italic" data-testid={`user-actions-readonly-${user.username}`}>
                              Read-only
                            </span>
                          )}
                          {isAdmin && isPending && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleApprove(user.id)}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs h-8 px-3"
                                data-testid={`approve-btn-${user.username}`}
                              >
                                <UserCheck className="w-3.5 h-3.5 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => requestAuth('reject', user.id, user.username, `Reject user "${user.username}"? They will not be able to login.`)}
                                className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8 px-3"
                                data-testid={`reject-btn-${user.username}`}
                              >
                                <UserX className="w-3.5 h-3.5 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}

                          {/* Active/Disabled user actions */}
                          {isAdmin && !isPending && !isCurrentUser && !isDefaultAdmin && (
                            <>
                              {isDisabled ? (
                                <Button
                                  size="sm"
                                  onClick={() => requestAuth('enable', user.id, user.username, `Enable user "${user.username}"? They will be able to login again.`)}
                                  className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs h-8 px-3"
                                >
                                  <UserCheck className="w-3.5 h-3.5 mr-1" />
                                  Enable
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => requestAuth('disable', user.id, user.username, `Disable user "${user.username}"? They will not be able to login.`)}
                                  className="border-amber-200 text-amber-600 hover:bg-amber-50 text-xs h-8 px-3"
                                >
                                  <UserX className="w-3.5 h-3.5 mr-1" />
                                  Disable
                                </Button>
                              )}
                            </>
                          )}

                          {/* Delete - admin only, non-self, non-default */}
                          {isAdmin && !isCurrentUser && !isDefaultAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => requestAuth('delete', user.id, user.username, `Permanently delete user "${user.username}"? This action cannot be undone.`)}
                              className="border-red-200 text-red-600 hover:bg-red-50 text-xs h-8 px-3"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-1" />
                              Delete
                            </Button>
                          )}

                          {/* Protected user - no actions */}
                          {isAdmin && (isCurrentUser || isDefaultAdmin) && !isPending && (
                            <span className="text-xs text-gray-400 italic">Protected</span>
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
