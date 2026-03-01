import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';
import { LogIn, UserPlus, KeyRound } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalLogin() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // login, register, reset
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.password) {
      toast.error('Please fill all fields');
      return;
    }

    if (mode === 'register' && formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (mode === 'reset' && formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      let endpoint, body;

      if (mode === 'login') {
        endpoint = '/api/audit/portal/login';
        body = { username: formData.username, password: formData.password };
      } else if (mode === 'register') {
        endpoint = '/api/audit/portal/register';
        body = { username: formData.username, password: formData.password, role: 'viewer' };
      } else {
        endpoint = '/api/audit/portal/reset-password';
        body = { username: formData.username, new_password: formData.password };
      }

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Operation failed');
      }

      if (mode === 'login') {
        localStorage.setItem('portalUser', JSON.stringify(data.user));
        localStorage.setItem('portalAuth', btoa(`${formData.username}:${formData.password}`));
        toast.success('Login successful!');
        navigate('/portal/dashboard');
      } else if (mode === 'register') {
        toast.success(data.message || 'Registration successful! Pending admin approval.');
        setMode('login');
        setFormData({ username: '', password: '', confirmPassword: '' });
      } else {
        toast.success(data.message || 'Password reset successful!');
        setMode('login');
        setFormData({ username: formData.username, password: '', confirmPassword: '' });
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getModeTitle = () => {
    if (mode === 'login') return 'Sign In';
    if (mode === 'register') return 'Create Account';
    return 'Reset Password';
  };

  const getModeDescription = () => {
    if (mode === 'login') return 'Sign in to your admin account';
    if (mode === 'register') return 'Register for a new account (requires admin approval)';
    return 'Reset your password using your username';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
              <span className="text-2xl font-bold text-emerald-600">A</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Audix Data Management</h1>
            <p className="text-gray-500 mt-1">Admin Dashboard</p>
          </div>

          {/* Mode Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button
              type="button"
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'
              }`}
              onClick={() => { setMode('login'); setFormData({ ...formData, confirmPassword: '' }); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                mode === 'register' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'
              }`}
              onClick={() => setMode('register')}
            >
              Register
            </button>
            <button
              type="button"
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                mode === 'reset' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'
              }`}
              onClick={() => setMode('reset')}
            >
              Reset
            </button>
          </div>

          {/* Description */}
          <p className="text-xs text-center text-gray-400 mb-4">{getModeDescription()}</p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="password">
                {mode === 'reset' ? 'New Password' : 'Password'}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={mode === 'reset' ? 'Enter new password' : 'Enter password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="mt-1"
              />
            </div>

            {(mode === 'register' || mode === 'reset') && (
              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="mt-1"
                />
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600"
              disabled={loading}
            >
              {loading ? (
                'Please wait...'
              ) : mode === 'login' ? (
                <>
                  <LogIn className="w-4 h-4 mr-2" />
                  Sign In
                </>
              ) : mode === 'register' ? (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Register
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4 mr-2" />
                  Reset Password
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
