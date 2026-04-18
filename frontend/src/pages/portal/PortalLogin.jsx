import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import {
  LogIn, UserPlus, KeyRound, LayoutDashboard, Building2,
  FolderOpen, FileBarChart, Database, Users,
  AlertTriangle, Upload, ScanBarcode, Wifi,
  Shield, BarChart3, ArrowRight, CheckCircle2,
  ClipboardList, IndianRupee, Clock, UserCheck,
  ChevronRight, Layers, Wrench
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

/* ─── PRODUCTS LIST ─── */
const products = [
  {
    id: 'audit',
    name: 'Audix Data Management',
    tagline: 'Stock Audit, Simplified.',
    desc: 'End-to-end physical stock verification platform. Barcode scanning, real-time sync, variance reports — manage your entire audit workflow.',
    color: 'emerald',
    icon: ScanBarcode,
    features: [
      { icon: LayoutDashboard, title: 'Real-Time Dashboard', desc: 'Live overview of sessions, devices, sync status and key metrics.' },
      { icon: Building2, title: 'Client Management', desc: 'Multiple clients with custom schemas and master data import.' },
      { icon: FolderOpen, title: 'Audit Sessions', desc: 'Bin-wise, barcode-wise or article-wise variance modes.' },
      { icon: ScanBarcode, title: 'Scanner App', desc: 'Android app for offline barcode scanning with auto-sync.' },
      { icon: Database, title: 'Sync & Data Inbox', desc: 'Chunked sync for large datasets. Review before forwarding.' },
      { icon: BarChart3, title: 'Variance Reports', desc: 'Expected vs actual stock reconciliation. Export to CSV.' },
      { icon: AlertTriangle, title: 'Conflict Detection', desc: 'Auto-detect duplicate scans and data conflicts.' },
      { icon: Users, title: 'User Management', desc: 'Role-based access with admin approval workflow.' },
      { icon: Upload, title: 'CSV Import/Export', desc: 'Import master products, stock data. Download templates.' },
    ],
    highlights: ['Multi-client audit management', 'Offline-capable scanner app', 'Real-time data synchronization', 'Detailed variance & reconciliation', 'Role-based access control', 'CSV import & export support'],
    stats: [{ value: '9+', label: 'Core Modules' }, { value: '3', label: 'Variance Modes' }, { value: '100%', label: 'Offline Capable' }],
    howItWorks: [
      { step: '01', title: 'Setup Client', desc: 'Create client, configure schema, import master data', icon: Building2 },
      { step: '02', title: 'Create Session', desc: 'Start audit session, import expected stock, assign devices', icon: FolderOpen },
      { step: '03', title: 'Scan & Sync', desc: 'Field team scans barcodes. Data auto-syncs to portal', icon: Wifi },
      { step: '04', title: 'Generate Report', desc: 'Review variance, resolve conflicts, export report', icon: FileBarChart },
    ],
  },
  {
    id: 'staff',
    name: 'Staff Attendance & Payroll',
    tagline: 'Workforce Management, Automated.',
    desc: 'Complete HR solution — time-sensitive attendance, payroll computation, expense tracking, manpower management for daily-wage workers.',
    color: 'blue',
    icon: ClipboardList,
    features: [
      { icon: Clock, title: 'Smart Attendance', desc: 'Time-sensitive punch system with shift rules and OT calculation.' },
      { icon: IndianRupee, title: 'Payroll & Salary', desc: 'Auto salary computation with advances, deductions and cashbook.' },
      { icon: FileBarChart, title: 'Bills & Expenses', desc: 'Submit, approve and track employee bills and reimbursements.' },
      { icon: UserCheck, title: 'Role-Based Access', desc: 'Admin, Team Lead, Employee — each with specific permissions.' },
      { icon: Users, title: 'Manpower Tracking', desc: 'Daily-wage worker management with per-site attendance.' },
      { icon: BarChart3, title: 'Reports & Export', desc: 'Attendance reports, salary slips, export to PDF & Excel.' },
    ],
    highlights: ['Time-sensitive attendance system', 'Automatic payroll computation', 'Bill & advance management', 'Manpower tracking for daily-wage', 'Role-based access (Admin/TL/Emp)', 'PDF & Excel export'],
    stats: [{ value: '6+', label: 'HR Modules' }, { value: '3', label: 'User Roles' }, { value: '24/7', label: 'Cloud Access' }],
    howItWorks: null,
  },
  {
    id: 'audixrm',
    name: 'Audix R&M',
    tagline: 'Repairs & Maintenance, Tracked.',
    desc: 'Complete repair management for retail stores — ticket creation, vendor assignment, rate negotiation, OTP verification, and real-time tracking.',
    color: 'amber',
    icon: Wrench,
    features: [
      { icon: ClipboardList, title: 'Ticket Management', desc: 'Create, track and manage repair tickets with photo/video evidence.' },
      { icon: UserCheck, title: 'Approval Workflow', desc: 'Multi-level approval — store creates, admin approves, vendor executes.' },
      { icon: Building2, title: 'Store Management', desc: 'Manage multiple retail locations across states with contact details.' },
      { icon: Users, title: 'Vendor Management', desc: 'AMC & Non-AMC vendors with ratings, specializations and job history.' },
      { icon: IndianRupee, title: 'Rate Negotiation', desc: 'Quote, counter and finalize repair rates with full history.' },
      { icon: Shield, title: 'OTP Verification', desc: 'Secure vendor verification via OTP before work completion.' },
    ],
    highlights: ['Multi-store ticket management', 'Admin approval workflow', 'Vendor assignment & tracking', 'Rate negotiation system', 'OTP-based vendor verification', 'Photo/video evidence support'],
    stats: [{ value: '4', label: 'User Roles' }, { value: '16+', label: 'Issue Types' }, { value: 'SLA', label: 'Based Tracking' }],
    howItWorks: null,
  },
];

const colorMap = {
  emerald: { bg: 'bg-emerald-500', bgLight: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', gradient: 'from-emerald-400 to-cyan-400', shadow: 'shadow-emerald-500/25', activeBg: 'bg-emerald-500' },
  blue: { bg: 'bg-blue-500', bgLight: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', gradient: 'from-blue-400 to-indigo-400', shadow: 'shadow-blue-500/25', activeBg: 'bg-blue-500' },
  amber: { bg: 'bg-amber-500', bgLight: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', gradient: 'from-amber-400 to-orange-400', shadow: 'shadow-amber-500/25', activeBg: 'bg-amber-500' },
};

/* ─── LOGIN PANELS ─── */

function AuditLoginPanel({ loading, setLoading, colors }) {
  const [mode, setMode] = useState('login');
  const [formData, setFormData] = useState({ username: '', password: '', confirmPassword: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.username || !formData.password) { toast.error('Please fill all fields'); return; }
    if ((mode === 'register' || mode === 'reset') && formData.password !== formData.confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      let endpoint = mode === 'login' ? '/api/audit/portal/login' : mode === 'register' ? '/api/audit/portal/register' : '/api/audit/portal/reset-password';
      let body = mode === 'login' ? { username: formData.username, password: formData.password } : mode === 'register' ? { username: formData.username, password: formData.password, role: 'viewer' } : { username: formData.username, new_password: formData.password };
      const response = await fetch(`${BACKEND_URL}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Operation failed');
      if (mode === 'login') {
        localStorage.setItem('auditPortalUser', JSON.stringify(data.user));
        localStorage.setItem('portalUser', JSON.stringify(data.user));
        localStorage.setItem('portalAuth', btoa(`${formData.username}:${formData.password}`));
        toast.success('Login successful!');
        window.location.href = '/portal/dashboard';
      } else if (mode === 'register') {
        toast.success(data.message || 'Registration successful! Pending admin approval.');
        setMode('login');
        setFormData({ username: '', password: '', confirmPassword: '' });
      } else {
        toast.success(data.message || 'Password reset successful!');
        setMode('login');
      }
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const handleQuickLogin = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
      const data = await response.json();
      if (response.ok) {
        localStorage.setItem('auditPortalUser', JSON.stringify(data.user));
        localStorage.setItem('portalUser', JSON.stringify(data.user));
        localStorage.setItem('portalAuth', btoa('admin:admin123'));
        toast.success('Login successful!');
        window.location.href = '/portal/dashboard';
      } else { toast.error(data.detail || 'Login failed'); }
    } catch { toast.error('Login failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5" data-testid="audit-login-panel">
      <div className="text-center mb-4">
        <h3 className="text-white font-bold text-base">Audit Admin Portal</h3>
        <p className="text-gray-500 text-xs mt-1">Sign in to manage your audits</p>
      </div>
      <div className="flex bg-white/5 rounded-lg p-1 mb-4">
        {['login', 'register', 'reset'].map((m) => (
          <button key={m} type="button" className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${mode === m ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'text-gray-400 hover:text-white'}`} onClick={() => setMode(m)}>
            {m === 'login' ? 'Sign In' : m === 'register' ? 'Register' : 'Reset'}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div>
          <Label className="text-gray-400 text-xs">Username</Label>
          <Input data-testid="audit-username" placeholder="Enter username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-emerald-500 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-gray-400 text-xs">{mode === 'reset' ? 'New Password' : 'Password'}</Label>
          <Input data-testid="audit-password" type="password" placeholder={mode === 'reset' ? 'New password' : 'Enter password'} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-emerald-500 h-9 text-sm" />
        </div>
        {(mode === 'register' || mode === 'reset') && (
          <div>
            <Label className="text-gray-400 text-xs">Confirm Password</Label>
            <Input data-testid="audit-confirm-password" type="password" placeholder="Confirm password" value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-emerald-500 h-9 text-sm" />
          </div>
        )}
        <Button type="submit" data-testid="audit-submit-btn" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold shadow-lg shadow-emerald-500/25 h-9 text-sm" disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? <><LogIn className="w-3.5 h-3.5 mr-1.5" />Sign In</> : mode === 'register' ? <><UserPlus className="w-3.5 h-3.5 mr-1.5" />Register</> : <><KeyRound className="w-3.5 h-3.5 mr-1.5" />Reset Password</>}
        </Button>
        {mode === 'login' && (
          <></>
        )}
      </form>
    </div>
  );
}

function StaffLoginPanel({ loading, setLoading }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetUserId, setResetUserId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userId || !password) { toast.error('Please fill all fields'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: userId, password }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Invalid credentials');
      const userData = { ...data.user, isAdmin: data.user.role === 'admin', isTeamLead: data.user.role === 'teamlead', isEmployee: data.user.role === 'employee' };
      localStorage.setItem('supermanage_user', JSON.stringify(userData));
      localStorage.setItem('supermanage_token', data.token);
      toast.success(`Welcome, ${data.user.name}!`);
      window.location.href = '/attendance';
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const handlePasswordReset = async () => {
    if (!resetUserId.trim()) { toast.error('Please enter your User ID'); return; }
    if (!newPassword || newPassword.length < 4) { toast.error('Password must be at least 4 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setResetLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/self-reset-password`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: resetUserId, new_password: newPassword }) });
      const data = await response.json();
      if (response.ok) {
        toast.success('Password reset successfully! Please login with new password.');
        setShowReset(false);
        setResetUserId(''); setNewPassword(''); setConfirmPassword('');
        setUserId(resetUserId);
      } else { toast.error(data.detail || 'Failed to reset password'); }
    } catch { toast.error('Failed to reset password'); }
    finally { setResetLoading(false); }
  };

  if (showReset) {
    return (
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5" data-testid="staff-reset-panel">
        <div className="text-center mb-4">
          <KeyRound className="w-8 h-8 text-blue-400 mx-auto mb-2" />
          <h3 className="text-white font-bold text-base">Reset Password</h3>
          <p className="text-gray-500 text-xs mt-1">Enter your User ID and new password</p>
        </div>
        <div className="space-y-2.5">
          <div>
            <Label className="text-gray-400 text-xs">User ID</Label>
            <Input data-testid="staff-reset-userid" placeholder="e.g. EMP001" value={resetUserId} onChange={(e) => setResetUserId(e.target.value.toUpperCase())} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">New Password</Label>
            <Input data-testid="staff-reset-newpass" type="password" placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500 h-9 text-sm" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Confirm Password</Label>
            <Input data-testid="staff-reset-confirm" type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500 h-9 text-sm" />
          </div>
          <Button data-testid="staff-reset-submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold h-9 text-sm" onClick={handlePasswordReset} disabled={resetLoading}>
            {resetLoading ? 'Resetting...' : <><KeyRound className="w-3.5 h-3.5 mr-1.5" />Reset Password</>}
          </Button>
          <button type="button" onClick={() => setShowReset(false)} className="w-full text-center text-xs text-gray-400 hover:text-white mt-1" data-testid="staff-back-to-login">
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5" data-testid="staff-login-panel">
      <div className="text-center mb-4">
        <h3 className="text-white font-bold text-base">Staff Portal Login</h3>
        <p className="text-gray-500 text-xs mt-1">Employee ID & password to continue</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div>
          <Label className="text-gray-400 text-xs">Employee ID</Label>
          <Input data-testid="staff-userid" placeholder="e.g. ADMIN001" value={userId} onChange={(e) => setUserId(e.target.value)} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500 h-9 text-sm" />
        </div>
        <div>
          <Label className="text-gray-400 text-xs">Password</Label>
          <Input data-testid="staff-password" type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-blue-500 h-9 text-sm" />
        </div>
        <Button type="submit" data-testid="staff-submit-btn" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold shadow-lg shadow-blue-500/25 h-9 text-sm" disabled={loading}>
          {loading ? 'Please wait...' : <><LogIn className="w-3.5 h-3.5 mr-1.5" />Sign In</>}
        </Button>
        <button type="button" onClick={() => setShowReset(true)} className="w-full text-center text-xs text-blue-400 hover:text-blue-300 mt-1" data-testid="staff-forgot-password">
          Forgot Password?
        </button>
      </form>
    </div>
  );
}

function AudixRMLoginPanel({ loading, setLoading }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ clientCode: '', clientName: '', role: '', email: '', contactNo: '', password: '', confirmPassword: '' });
  const u = (k, v) => setForm({ ...form, [k]: v });

  const roleOptions = [
    { value: 'store', label: 'Store' },
    { value: 'admin', label: 'Area Manager' },
    { value: 'vendor', label: 'Vendor' },
    { value: 'superadmin', label: 'R&M Manager' },
  ];

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!form.clientCode || !form.email || !form.password) { toast.error('Please fill all fields'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/nicobar/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email, password: form.password }) });
      const data = await response.json();
      if (!data.success) throw new Error(data.detail || 'Invalid credentials');
      const userData = { ...data.user, clientCode: form.clientCode, clientName: data.user.clientName || form.clientCode };
      localStorage.setItem('nicobar_user', JSON.stringify(userData));
      localStorage.setItem('nicobar_client_name', userData.clientName);
      localStorage.setItem('nicobar_client_code', form.clientCode);
      toast.success(`Welcome!`);
      window.location.href = '/nicobar/dashboard';
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!form.clientCode || !form.clientName || !form.role || !form.email || !form.password) { toast.error('Please fill all required fields'); return; }
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/nicobar/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientCode: form.clientCode, clientName: form.clientName, role: form.role, email: form.email, contactNo: form.contactNo, password: form.password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Registration failed');
      toast.success('Registration successful! You can now login.');
      setMode('login');
      setForm({ ...form, password: '', confirmPassword: '', role: '', contactNo: '' });
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password || !form.confirmPassword) { toast.error('Please fill all fields'); return; }
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/nicobar/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: form.email, newPassword: form.password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Reset failed');
      toast.success('Password reset successful!');
      setMode('login');
      setForm({ ...form, password: '', confirmPassword: '' });
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  };

  const inputCls = "mt-1 bg-white/5 border-white/10 text-white placeholder:text-gray-600 focus:border-amber-500 h-9 text-sm";

  return (
    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-5" data-testid="rm-login-panel">
      <div className="text-center mb-4">
        <h3 className="text-white font-bold text-base">Audix R&M Portal</h3>
        <p className="text-gray-500 text-xs mt-1">Repair & Maintenance</p>
      </div>
      {/* Mode Tabs */}
      <div className="flex bg-white/5 rounded-lg p-1 mb-4">
        {[{ k: 'login', l: 'Sign In' }, { k: 'register', l: 'Register' }, { k: 'reset', l: 'Reset' }].map(({ k, l }) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${mode === k ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'text-gray-400 hover:text-white'}`}>{l}</button>
        ))}
      </div>

      {/* LOGIN */}
      {mode === 'login' && (
        <form onSubmit={handleLogin} className="space-y-2.5">
          <div>
            <Label className="text-gray-400 text-xs">Client Code</Label>
            <Input data-testid="rm-clientcode" placeholder="e.g. NIC-001" value={form.clientCode} onChange={(e) => u('clientCode', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Email</Label>
            <Input data-testid="rm-email" type="email" placeholder="you@company.com" value={form.email} onChange={(e) => u('email', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Password</Label>
            <Input data-testid="rm-password" type="password" placeholder="Enter password" value={form.password} onChange={(e) => u('password', e.target.value)} className={inputCls} />
          </div>
          <Button type="submit" data-testid="rm-submit-btn" className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/25 h-9 text-sm" disabled={loading}>
            {loading ? 'Please wait...' : <><LogIn className="w-3.5 h-3.5 mr-1.5" />Sign In</>}
          </Button>
          <div className="pt-2 border-t border-white/5">
            <p className="text-xs text-gray-500 mb-2 text-center">Quick demo</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { l: 'Area Manager', e: 'admin@nicobar.com', p: 'admin123', c: 'DEMO-001' },
                { l: 'Store User', e: 'store@nicobar.com', p: 'store123', c: 'DEMO-001' },
                { l: 'Vendor', e: 'vendor@nicobar.com', p: 'vendor123', c: 'DEMO-001' },
                { l: 'R&M Manager', e: 'superadmin@nicobar.com', p: 'super123', c: 'DEMO-001' },
              ].map(a => (
                <button key={a.l} type="button" data-testid={`rm-demo-${a.l.toLowerCase().replace(/[^a-z]/g, '-')}`} onClick={() => setForm({ ...form, clientCode: a.c, email: a.e, password: a.p })} className="bg-white/5 hover:bg-white/10 text-gray-300 text-xs py-1.5 px-2 rounded-lg transition-colors">{a.l}</button>
              ))}
            </div>
          </div>
        </form>
      )}

      {/* REGISTER */}
      {mode === 'register' && (
        <form onSubmit={handleRegister} className="space-y-2.5">
          <div>
            <Label className="text-gray-400 text-xs">Client Code *</Label>
            <Input data-testid="rm-reg-clientcode" placeholder="e.g. NIC-001" value={form.clientCode} onChange={(e) => u('clientCode', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Client / Company Name *</Label>
            <Input data-testid="rm-reg-clientname" placeholder="Your company name" value={form.clientName} onChange={(e) => u('clientName', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Role *</Label>
            <select data-testid="rm-reg-role" value={form.role} onChange={(e) => u('role', e.target.value)} className="w-full mt-1 bg-white/5 border border-white/10 text-white h-9 text-sm rounded-md px-3 focus:border-amber-500 focus:outline-none">
              <option value="" className="bg-slate-800">Select role</option>
              {roleOptions.map(r => <option key={r.value} value={r.value} className="bg-slate-800">{r.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Official Email *</Label>
            <Input data-testid="rm-reg-email" type="email" placeholder="you@company.com" value={form.email} onChange={(e) => u('email', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Contact No</Label>
            <Input data-testid="rm-reg-contact" type="tel" placeholder="98765xxxxx" value={form.contactNo} onChange={(e) => u('contactNo', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Password *</Label>
            <Input data-testid="rm-reg-password" type="password" placeholder="Create password" value={form.password} onChange={(e) => u('password', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Confirm Password *</Label>
            <Input data-testid="rm-reg-confirm" type="password" placeholder="Confirm password" value={form.confirmPassword} onChange={(e) => u('confirmPassword', e.target.value)} className={inputCls} />
          </div>
          <Button type="submit" data-testid="rm-register-btn" className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/25 h-9 text-sm" disabled={loading}>
            {loading ? 'Please wait...' : <><UserPlus className="w-3.5 h-3.5 mr-1.5" />Register</>}
          </Button>
        </form>
      )}

      {/* RESET PASSWORD */}
      {mode === 'reset' && (
        <form onSubmit={handleReset} className="space-y-2.5">
          <div>
            <Label className="text-gray-400 text-xs">Email</Label>
            <Input data-testid="rm-reset-email" type="email" placeholder="you@company.com" value={form.email} onChange={(e) => u('email', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">New Password</Label>
            <Input data-testid="rm-reset-password" type="password" placeholder="New password" value={form.password} onChange={(e) => u('password', e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Confirm Password</Label>
            <Input data-testid="rm-reset-confirm" type="password" placeholder="Confirm new password" value={form.confirmPassword} onChange={(e) => u('confirmPassword', e.target.value)} className={inputCls} />
          </div>
          <Button type="submit" data-testid="rm-reset-btn" className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/25 h-9 text-sm" disabled={loading}>
            {loading ? 'Please wait...' : <><KeyRound className="w-3.5 h-3.5 mr-1.5" />Reset Password</>}
          </Button>
        </form>
      )}
    </div>
  );
}

/* ─── MAIN COMPONENT ─── */
export default function PortalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const initialTab = searchParams.get('tab') || 'audit';
  const [activeProduct, setActiveProduct] = useState(
    products.find(p => p.id === initialTab) ? initialTab : 'audit'
  );

  const currentProduct = products.find(p => p.id === activeProduct);
  const colors = colorMap[currentProduct.color];

  return (
    <div className="min-h-screen bg-[#0f172a]">
      {/* Navigation */}
      <nav className="border-b border-white/10 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <span className="text-base sm:text-lg font-black text-white">A</span>
            </div>
            <div>
              <h1 className="text-white font-bold text-sm sm:text-lg leading-tight">AudiX Solutions & Co.</h1>
              <p className="text-emerald-400 text-[10px] sm:text-xs">Chartered Accountants</p>
            </div>
          </div>
          <a href="/" className="text-xs sm:text-sm text-gray-400 hover:text-white transition-colors">Home</a>
        </div>
      </nav>

      {/* Products Selector Bar */}
      <div className="border-b border-white/5 bg-white/[0.02] overflow-x-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-1.5 sm:gap-2 py-2.5 sm:py-3 min-w-max">
            <Layers className="w-4 h-4 text-gray-500 mr-1 hidden sm:block" />
            <span className="text-xs text-gray-500 mr-2 hidden sm:inline">Our Products:</span>
            {products.map((p) => {
              const isActive = activeProduct === p.id;
              const c = colorMap[p.color];
              return (
                <button key={p.id} onClick={() => setActiveProduct(p.id)} data-testid={`product-tab-${p.id}`}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${isActive ? `${c.activeBg} text-white shadow-lg ${c.shadow}` : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
                  <p.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">{p.name}</span>
                  <span className="sm:hidden">{p.id === 'audit' ? 'Data Mgmt' : p.id === 'staff' ? 'Staff' : 'R&M'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14 pb-6 sm:pb-10">
        <div className="grid lg:grid-cols-5 gap-8 sm:gap-12 items-start">
          {/* Left: Product Info */}
          <div className="lg:col-span-3 space-y-5 sm:space-y-7">
            <div>
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 ${colors.bgLight} border ${colors.border} rounded-full mb-4 sm:mb-5`}>
                <Shield className={`w-3.5 h-3.5 ${colors.text}`} />
                <span className={`${colors.text} text-xs font-medium`}>Enterprise-Grade Platform</span>
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
                {currentProduct.tagline.split(',').map((part, i) => (
                  <span key={i}>
                    {i === 0 ? part + ',' : <span className={`text-transparent bg-clip-text bg-gradient-to-r ${colors.gradient}`}>{part}</span>}
                  </span>
                ))}
              </h2>
              <p className="mt-3 sm:mt-4 text-base sm:text-lg text-gray-400 max-w-xl leading-relaxed">{currentProduct.desc}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {currentProduct.highlights.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${colors.text} shrink-0`} />
                  <span className="text-xs sm:text-sm text-gray-300">{item}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-6 sm:gap-8 pt-2">
              {currentProduct.stats.map((stat, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <div className="w-px bg-white/10" />}
                  <div>
                    <p className="text-2xl sm:text-3xl font-black text-white">{stat.value}</p>
                    <p className="text-[10px] sm:text-xs text-gray-500 mt-1">{stat.label}</p>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Right: Login Panel */}
          <div className="lg:col-span-2">
            {activeProduct === 'audit' && <AuditLoginPanel loading={loading} setLoading={setLoading} colors={colors} />}
            {activeProduct === 'staff' && <StaffLoginPanel loading={loading} setLoading={setLoading} />}
            {activeProduct === 'audixrm' && <AudixRMLoginPanel loading={loading} setLoading={setLoading} />}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center mb-8 sm:mb-10">
          <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-white">
            Features of <span className={`text-transparent bg-clip-text bg-gradient-to-r ${colors.gradient}`}>{currentProduct.name}</span>
          </h3>
          <p className="text-gray-500 mt-2 sm:mt-3 text-sm sm:text-base max-w-2xl mx-auto">Explore the complete toolkit built into this module.</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {currentProduct.features.map((feature, i) => {
            const featureColors = ['bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500', 'bg-cyan-500', 'bg-rose-500', 'bg-amber-500', 'bg-indigo-500', 'bg-teal-500'];
            return (
              <div key={i} className="group bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/10 rounded-xl p-3 sm:p-5 transition-all duration-300" data-testid={`feature-card-${i}`}>
                <div className={`w-8 h-8 sm:w-10 sm:h-10 ${featureColors[i % featureColors.length]} rounded-lg flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <h4 className="text-white font-semibold text-sm sm:text-base mb-1">{feature.title}</h4>
                <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">{feature.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      {currentProduct.howItWorks && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-t border-white/5">
          <div className="text-center mb-8 sm:mb-10">
            <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-white">How It Works</h3>
            <p className="text-gray-500 mt-2 sm:mt-3 text-sm sm:text-base">Simple {currentProduct.howItWorks.length}-step workflow</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {currentProduct.howItWorks.map((item, i) => (
              <div key={i} className="relative">
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 sm:p-6 text-center">
                  <span className={`text-2xl sm:text-3xl font-black ${colors.text} opacity-20`}>{item.step}</span>
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 ${colors.bgLight} rounded-xl flex items-center justify-center mx-auto mt-2 mb-2 sm:mb-3`}>
                    <item.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${colors.text}`} />
                  </div>
                  <h4 className="text-white font-semibold text-sm sm:text-base mb-1">{item.title}</h4>
                  <p className="text-gray-500 text-xs sm:text-sm">{item.desc}</p>
                </div>
                {i < currentProduct.howItWorks.length - 1 && (
                  <ArrowRight className={`hidden lg:block absolute top-1/2 -right-3 w-6 h-6 ${colors.text} opacity-30 -translate-y-1/2`} />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-white/5 py-6 sm:py-8 mt-6 sm:mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-gray-600 text-xs sm:text-sm">AudiX Solutions & Co. — Chartered Accountants</p>
          <a href="/" className="text-gray-500 hover:text-emerald-400 text-xs sm:text-sm transition-colors">Home</a>
        </div>
      </footer>
    </div>
  );
}
