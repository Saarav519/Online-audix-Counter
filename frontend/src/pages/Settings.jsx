import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Settings as SettingsIcon,
  Volume2,
  VolumeX,
  Package,
  ScanBarcode,
  Lock,
  Key,
  User,
  Save,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const Settings = () => {
  const { settings, updateSettings, user, playSound } = useApp();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newUserId: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleSettingChange = (key, value) => {
    updateSettings({ [key]: value });
  };

  const testSound = (isValid) => {
    playSound(isValid);
  };

  const handlePasswordChange = () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    // Mock password change
    setTimeout(() => {
      setPasswordSuccess(true);
      setPasswordForm({
        currentPassword: '',
        newUserId: '',
        newPassword: '',
        confirmPassword: ''
      });
    }, 500);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 mt-1">Configure your scanning preferences</p>
      </div>

      {/* User Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-emerald-600" />
            User Account
          </CardTitle>
          <CardDescription>Manage your login credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <p className="font-medium text-slate-800">{user?.name}</p>
              <p className="text-sm text-slate-500">User ID: {user?.userId}</p>
              <p className="text-xs text-slate-400 capitalize">Role: {user?.role}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowPasswordModal(true)}
              className="border-slate-200"
            >
              <Key className="w-4 h-4 mr-2" />
              Change Credentials
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Scanning Settings */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-emerald-600" />
            Scanning Options
          </CardTitle>
          <CardDescription>Configure how barcode scanning works</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Single SKU Scanning Mode</Label>
              <p className="text-sm text-slate-500">
                Each scan creates a new entry instead of incrementing quantity
              </p>
            </div>
            <Switch
              checked={settings.singleSkuScanning}
              onCheckedChange={(checked) => handleSettingChange('singleSkuScanning', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Allow Non-Master Products</Label>
              <p className="text-sm text-slate-500">
                Accept barcodes not in the master product list
              </p>
            </div>
            <Switch
              checked={settings.allowNonMasterProducts}
              onCheckedChange={(checked) => handleSettingChange('allowNonMasterProducts', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sound Settings */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            {settings.soundEnabled ? (
              <Volume2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <VolumeX className="w-5 h-5 text-slate-400" />
            )}
            Sound Feedback
          </CardTitle>
          <CardDescription>Audio alerts for scan results</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Enable Sound</Label>
              <p className="text-sm text-slate-500">
                Play different sounds for valid and invalid scans
              </p>
            </div>
            <Switch
              checked={settings.soundEnabled}
              onCheckedChange={(checked) => handleSettingChange('soundEnabled', checked)}
            />
          </div>
          
          {settings.soundEnabled && (
            <div className="p-4 bg-slate-50 rounded-xl space-y-3">
              <p className="text-sm font-medium text-slate-700">Test Sounds</p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testSound(true)}
                  className="flex-1 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Valid Scan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testSound(false)}
                  className="flex-1 border-red-200 text-red-700 hover:bg-red-50"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Invalid Scan
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Settings */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600" />
            Security
          </CardTitle>
          <CardDescription>Authentication and access control</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Require Auth for Editing</Label>
              <p className="text-sm text-slate-500">
                Require authentication to edit submitted locations
              </p>
            </div>
            <Switch
              checked={settings.requireAuthForEdit}
              onCheckedChange={(checked) => handleSettingChange('requireAuthForEdit', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Auto-Submit on Complete</Label>
              <p className="text-sm text-slate-500">
                Automatically lock locations when marked complete
              </p>
            </div>
            <Switch
              checked={settings.autoSubmitOnComplete}
              onCheckedChange={(checked) => handleSettingChange('autoSubmitOnComplete', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Change Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={(open) => {
        setShowPasswordModal(open);
        if (!open) {
          setPasswordError('');
          setPasswordSuccess(false);
          setPasswordForm({
            currentPassword: '',
            newUserId: '',
            newPassword: '',
            confirmPassword: ''
          });
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Credentials</DialogTitle>
            <DialogDescription>
              Update your user ID and password
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {passwordError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 text-emerald-600 text-sm rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Credentials updated successfully!
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="Enter current password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              />
            </div>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="newUserId">New User ID (optional)</Label>
              <Input
                id="newUserId"
                placeholder="Enter new user ID"
                value={passwordForm.newUserId}
                onChange={(e) => setPasswordForm({ ...passwordForm, newUserId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Enter new password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Confirm new password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handlePasswordChange} 
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Update Credentials
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
