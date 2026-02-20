import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Separator } from '../components/ui/separator';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
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
  AlertCircle,
  MapPin,
  Sparkles,
  Shield,
  LogIn
} from 'lucide-react';

const Settings = () => {
  const { settings, updateSettings, user, playSound, verifyCredentials, updateUserCredentials } = useApp();
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(true);
  const [authCredentials, setAuthCredentials] = useState({ userId: '', password: '' });
  const [authError, setAuthError] = useState('');
  
  // Pending settings changes
  const [pendingSettings, setPendingSettings] = useState({ ...settings });
  const [hasChanges, setHasChanges] = useState(false);
  
  // Save success feedback
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Password change modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newUserId: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Check for changes
  useEffect(() => {
    const changed = JSON.stringify(pendingSettings) !== JSON.stringify(settings);
    setHasChanges(changed);
  }, [pendingSettings, settings]);

  // Handle initial authentication
  const handleAuthenticate = () => {
    const result = verifyCredentials(authCredentials.userId, authCredentials.password);
    if (result.success) {
      setIsAuthenticated(true);
      setShowAuthModal(false);
      setAuthError('');
      setPendingSettings({ ...settings });
    } else {
      setAuthError('Invalid credentials. Please try again.');
    }
  };

  // Handle pending setting change (not applied yet)
  const handlePendingSettingChange = (key, value) => {
    setPendingSettings(prev => ({ ...prev, [key]: value }));
  };

  // Handle save - directly save since user is already authenticated
  const handleSaveClick = () => {
    updateSettings(pendingSettings);
    setSaveSuccess(true);
    setHasChanges(false);
    // Clear success message after a brief display
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2000);
  };

  const handleCancelChanges = () => {
    setPendingSettings({ ...settings });
    setHasChanges(false);
  };

  const testSound = (isValid) => {
    playSound(isValid);
  };

  const handlePasswordChange = () => {
    setPasswordError('');
    setPasswordSuccess(false);

    // Validate passwords match
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    // Validate minimum password length
    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    // Update credentials using the context function
    const result = updateUserCredentials(
      passwordForm.currentPassword,
      passwordForm.newUserId || user?.userId,
      passwordForm.newPassword
    );

    if (result.success) {
      setPasswordSuccess(true);
      setPasswordForm({
        currentPassword: '',
        newUserId: '',
        newPassword: '',
        confirmPassword: ''
      });
      // Close modal after success
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
      }, 1500);
    } else {
      setPasswordError(result.error || 'Failed to update credentials');
    }
  };

  // Show authentication modal if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Card className="w-full max-w-md border-0 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto p-3 bg-emerald-100 rounded-full w-fit mb-4">
              <Lock className="w-8 h-8 text-emerald-600" />
            </div>
            <CardTitle className="text-xl">Settings Access</CardTitle>
            <CardDescription>
              Enter your credentials to access settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {authError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {authError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-userId">User ID</Label>
              <Input
                id="auth-userId"
                placeholder="Enter your user ID"
                value={authCredentials.userId}
                onChange={(e) => setAuthCredentials({ ...authCredentials, userId: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleAuthenticate()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                placeholder="Enter your password"
                value={authCredentials.password}
                onChange={(e) => setAuthCredentials({ ...authCredentials, password: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleAuthenticate()}
              />
            </div>
            <Button 
              onClick={handleAuthenticate} 
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Access Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header with Save Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Settings</h1>
          <p className="text-slate-500 mt-1">Configure your scanning preferences</p>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleCancelChanges}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveClick}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Unsaved Changes Warning */}
      {hasChanges && (
        <div className="p-3 bg-amber-50 rounded-lg flex items-center gap-2 text-amber-700">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">You have unsaved changes. Click "Save Changes" to apply.</span>
        </div>
      )}

      {/* Save Success Message */}
      {saveSuccess && (
        <div className="p-3 bg-emerald-50 rounded-lg flex items-center gap-2 text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          <span className="text-sm">Settings saved successfully!</span>
        </div>
      )}

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

      {/* Location Scanning Mode */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            Location Scanning Mode
          </CardTitle>
          <CardDescription>Choose how location scanning works</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup 
            value={pendingSettings.locationScanMode} 
            onValueChange={(value) => handlePendingSettingChange('locationScanMode', value)}
            className="space-y-4"
          >
            <div className={`flex items-start space-x-4 p-4 rounded-xl border-2 transition-all ${
              pendingSettings.locationScanMode === 'preassigned' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-slate-200 hover:border-slate-300'
            }`}>
              <RadioGroupItem value="preassigned" id="preassigned" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="preassigned" className="flex items-center gap-2 text-base font-medium cursor-pointer">
                  <Shield className="w-5 h-5 text-blue-600" />
                  Pre-Assigned Location Mode
                </Label>
                <p className="text-sm text-slate-500 mt-1">
                  Only scan locations that are already imported/created in the system.
                </p>
              </div>
            </div>

            <div className={`flex items-start space-x-4 p-4 rounded-xl border-2 transition-all ${
              pendingSettings.locationScanMode === 'dynamic' 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-slate-200 hover:border-slate-300'
            }`}>
              <RadioGroupItem value="dynamic" id="dynamic" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="dynamic" className="flex items-center gap-2 text-base font-medium cursor-pointer">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  Dynamic Location Mode
                </Label>
                <p className="text-sm text-slate-500 mt-1">
                  Scan any location code - new locations created automatically.
                </p>
              </div>
            </div>
          </RadioGroup>
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
                Each scan auto-increments quantity (no manual entry)
              </p>
            </div>
            <Switch
              checked={pendingSettings.singleSkuScanning}
              onCheckedChange={(checked) => handlePendingSettingChange('singleSkuScanning', checked)}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Allow Manual Barcode Entry</Label>
              <p className="text-sm text-slate-500">
                Allow typing barcodes manually (if off, only hardware scanner works)
              </p>
            </div>
            <Switch
              checked={pendingSettings.allowManualBarcodeEntry !== false}
              onCheckedChange={(checked) => handlePendingSettingChange('allowManualBarcodeEntry', checked)}
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
              checked={pendingSettings.allowNonMasterProducts}
              onCheckedChange={(checked) => handlePendingSettingChange('allowNonMasterProducts', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sound Settings */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            {pendingSettings.soundEnabled ? (
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
              checked={pendingSettings.soundEnabled}
              onCheckedChange={(checked) => handlePendingSettingChange('soundEnabled', checked)}
            />
          </div>
          
          {pendingSettings.soundEnabled && (
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
              checked={pendingSettings.requireAuthForEdit}
              onCheckedChange={(checked) => handlePendingSettingChange('requireAuthForEdit', checked)}
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
              checked={pendingSettings.autoSubmitOnComplete}
              onCheckedChange={(checked) => handlePendingSettingChange('autoSubmitOnComplete', checked)}
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
              Update your login credentials (applies to both main login and settings)
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
                Credentials updated successfully! This applies to all logins.
              </div>
            )}
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <strong>Note:</strong> Changing your credentials here will update them for both the main login screen and settings access.
            </div>
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
                placeholder={`Current: ${user?.userId}`}
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
              disabled={!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
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
