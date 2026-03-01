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
  LogIn,
  Cloud,
  RefreshCw,
  Smartphone,
  Building2,
  FolderOpen,
  Wifi,
  WifiOff,
  Download,
  Database
} from 'lucide-react';

const Settings = () => {
  const { settings, updateSettings, user, playSound, verifyCredentials, updateUserCredentials, locations, scannedItems, deleteLocationData, masterProducts, setMasterProductsDirect, setMasterLocationsDirect, masterLocations } = useApp();
  
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

  // Sync configuration state
  const [syncConfig, setSyncConfig] = useState({
    deviceName: localStorage.getItem('audix_device_name') || '',
    clientId: localStorage.getItem('audix_client_id') || '',
    sessionId: localStorage.getItem('audix_session_id') || '',
    autoSync: localStorage.getItem('audix_auto_sync') === 'true',
    clearAfterSync: localStorage.getItem('audix_clear_after_sync') === 'true'
  });
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0, phase: '' });
  const [showSyncPasswordModal, setShowSyncPasswordModal] = useState(false);
  const [manualSyncPassword, setManualSyncPassword] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState(localStorage.getItem('audix_last_sync') || null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Import from Portal state
  const [portalImportType, setPortalImportType] = useState('master'); // 'master' or 'pending'
  const [portalImporting, setPortalImporting] = useState(false);
  const [portalImportResult, setPortalImportResult] = useState(null);

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

  // Fetch sync config on mount
  useEffect(() => {
    fetchSyncConfig();
    
    // Online/offline listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-sync when online
  useEffect(() => {
    const storedSyncPwd = localStorage.getItem('audix_sync_password') || '';
    if (isOnline && syncConfig.autoSync && syncConfig.deviceName && syncConfig.sessionId && storedSyncPwd) {
      // Auto sync in background (no password prompt)
      performSync(false, storedSyncPwd);
    }
  }, [isOnline]);

  // Fetch sessions when client changes
  useEffect(() => {
    if (syncConfig.clientId) {
      fetchSessions(syncConfig.clientId);
    }
  }, [syncConfig.clientId]);

  const fetchSyncConfig = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/sync/config`);
      if (response.ok) {
        const data = await response.json();
        setClients(data.clients || []);
        if (syncConfig.clientId) {
          const clientSessions = (data.sessions || []).filter(s => s.client_id === syncConfig.clientId);
          setSessions(clientSessions);
        }
      }
    } catch (error) {
      console.error('Failed to fetch sync config:', error);
    }
  };

  const fetchSessions = async (clientId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/sessions?client_id=${clientId}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.filter(s => s.status === 'active'));
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const handleSyncConfigChange = (key, value) => {
    setSyncConfig(prev => {
      const newConfig = { ...prev, [key]: value };
      localStorage.setItem(`audix_${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`, value.toString());
      return newConfig;
    });
  };

  // Import Master/Locations from Portal
  const handlePortalImport = async () => {
    if (!syncConfig.clientId) { setPortalImportResult({ success: false, msg: 'Select a client first' }); return; }
    if (portalImportType === 'pending' && !syncConfig.deviceName) { setPortalImportResult({ success: false, msg: 'Set device name first' }); return; }
    
    setPortalImporting(true);
    setPortalImportResult(null);
    
    try {
      if (portalImportType === 'master') {
        // Fetch product master from portal
        const res = await fetch(`${BACKEND_URL}/api/sync/master-products?client_id=${syncConfig.clientId}`);
        if (!res.ok) throw new Error('Failed to fetch master products');
        const data = await res.json();
        const products = (data.products || []).map((p, idx) => ({
          id: `portal_prod_${Date.now()}_${idx}`,
          barcode: p.barcode,
          name: p.name,
          price: p.price,
          isMaster: true
        }));
        setMasterProductsDirect(products);
        setPortalImportResult({ success: true, msg: `Imported ${products.length} products from portal` });
      } else {
        // Fetch assigned pending locations
        const url = `${BACKEND_URL}/api/sync/my-locations?device_name=${encodeURIComponent(syncConfig.deviceName)}&client_id=${encodeURIComponent(syncConfig.clientId)}${syncConfig.sessionId ? `&session_id=${encodeURIComponent(syncConfig.sessionId)}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch assigned locations');
        const data = await res.json();
        const locs = (data.locations || []).map(locName => ({
          code: locName,
          name: locName,
          description: '',
          isMaster: true
        }));
        if (locs.length === 0) {
          setPortalImportResult({ success: false, msg: 'No locations assigned to this device. Ask admin to assign from Portal → Pending Locations.' });
        } else {
          setMasterLocationsDirect(locs);
          setPortalImportResult({ success: true, msg: `Imported ${locs.length} assigned locations` });
        }
      }
    } catch (e) {
      setPortalImportResult({ success: false, msg: e.message || 'Import failed' });
    }
    setPortalImporting(false);
  };

  // Get next backup number for today
  const getNextBackupNumber = () => {
    const today = new Date().toISOString().split('T')[0];
    const backupKey = `audix_backup_count_${today}`;
    const currentCount = parseInt(localStorage.getItem(backupKey) || '0', 10);
    const nextCount = currentCount + 1;
    localStorage.setItem(backupKey, nextCount.toString());
    return nextCount;
  };

  // Get ordinal suffix (1st, 2nd, 3rd, etc.)
  const getOrdinalSuffix = (num) => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  };

  // Create backup CSV file
  const createBackupFile = (locationsToSync) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const backupNum = getNextBackupNumber();
      const ordinal = getOrdinalSuffix(backupNum);
      const filename = `${today}_${backupNum}${ordinal}_Backup.csv`;

      // Build CSV content (same format as export)
      let csvContent = 'Location,Barcode,Product Name,Price,Quantity,Scanned At\n';
      
      locationsToSync.forEach(location => {
        location.items.forEach(item => {
          // Get product name from master if available
          const masterProduct = masterProducts?.find(p => p.barcode === item.barcode);
          const productName = item.productName || masterProduct?.name || '';
          const price = item.price || masterProduct?.price || '';
          
          // Format barcode to preserve in Excel
          const formattedBarcode = `="${item.barcode}"`;
          
          csvContent += `"${location.name}",${formattedBarcode},"${productName}",${price},${item.quantity},"${item.scannedAt}"\n`;
        });
      });

      // Create and download the file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`Backup created: ${filename}`);
    } catch (error) {
      console.error('Failed to create backup:', error);
    }
  };

  const handleManualSync = () => {
    setManualSyncPassword('');
    setShowSyncPasswordModal(true);
  };

  const confirmManualSync = () => {
    if (!manualSyncPassword) {
      alert('Please enter sync password');
      return;
    }
    setShowSyncPasswordModal(false);
    // Store password for auto-sync use
    localStorage.setItem('audix_sync_password', manualSyncPassword);
    performSync(true, manualSyncPassword);
  };

  const CHUNK_SIZE = 10;

  const performSync = async (isManual = false, syncPassword = '') => {
    if (!syncConfig.deviceName || !syncConfig.sessionId || !syncPassword) {
      if (isManual) alert('Please configure device name, client, and session first');
      return;
    }

    if (!isOnline) {
      if (isManual) alert('No internet connection');
      return;
    }

    setSyncing(true);
    setSyncProgress({ current: 0, total: 0, phase: 'Preparing...' });

    try {
      // Filter locations by current scan mode
      const isPreAssigned = settings.locationScanMode === 'preassigned';
      const modeLocations = locations.filter(loc => {
        if (isPreAssigned) return loc.isAssigned === true;
        return loc.autoCreated === true || loc.isAssigned === false;
      });

      const locationsToSync = modeLocations.map(loc => {
        const items = scannedItems && scannedItems[loc.id] ? scannedItems[loc.id] : [];
        return {
          id: loc.id,
          name: loc.name,
          is_empty: loc.isEmpty || false,
          empty_remarks: loc.emptyRemarks || '',
          items: items.map(item => ({
            barcode: item.barcode,
            productName: item.productName,
            price: item.price,
            quantity: item.quantity,
            scannedAt: item.scannedAt
          }))
        };
      }).filter(loc => loc.items.length > 0 || loc.is_empty);

      if (locationsToSync.length === 0) {
        if (isManual) alert('No data to sync');
        setSyncing(false);
        setSyncProgress({ current: 0, total: 0, phase: '' });
        return;
      }

      // --- Chunked Upload ---
      const batchId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const totalLocations = locationsToSync.length;
      const chunks = [];
      for (let i = 0; i < totalLocations; i += CHUNK_SIZE) {
        chunks.push(locationsToSync.slice(i, i + CHUNK_SIZE));
      }
      const totalChunks = chunks.length;

      setSyncProgress({ current: 0, total: totalLocations, phase: 'Uploading...' });

      // Upload each chunk
      for (let idx = 0; idx < totalChunks; idx++) {
        const chunk = chunks[idx];
        const response = await fetch(`${BACKEND_URL}/api/sync/chunk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_id: batchId,
            device_name: syncConfig.deviceName,
            sync_password: syncPassword,
            client_id: syncConfig.clientId,
            session_id: syncConfig.sessionId,
            chunk_index: idx,
            total_chunks: totalChunks,
            locations: chunk
          })
        });

        if (!response.ok) {
          const error = await response.json();
          // Clean up staged data on failure
          await fetch(`${BACKEND_URL}/api/sync/staging/${batchId}`, { method: 'DELETE' }).catch(() => {});
          throw new Error(error.detail || `Chunk ${idx + 1} upload failed`);
        }

        // Update progress after each chunk
        const uploadedSoFar = Math.min((idx + 1) * CHUNK_SIZE, totalLocations);
        setSyncProgress({ current: uploadedSoFar, total: totalLocations, phase: 'Uploading...' });
      }

      // --- Finalize ---
      setSyncProgress({ current: totalLocations, total: totalLocations, phase: 'Finalizing...' });

      const finalizeResponse = await fetch(`${BACKEND_URL}/api/sync/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_id: batchId,
          device_name: syncConfig.deviceName,
          sync_password: syncPassword,
          client_id: syncConfig.clientId,
          session_id: syncConfig.sessionId,
          total_locations: totalLocations
        })
      });

      if (!finalizeResponse.ok) {
        const error = await finalizeResponse.json();
        throw new Error(error.detail || 'Finalization failed');
      }

      const result = await finalizeResponse.json();

      // --- SUCCESS: Only now create backup and clear data ---
      setSyncProgress({ current: totalLocations, total: totalLocations, phase: 'Complete!' });

      const now = new Date().toISOString();
      setLastSyncTime(now);
      localStorage.setItem('audix_last_sync', now);

      createBackupFile(locationsToSync);

      const syncedLocationIds = locationsToSync.map(loc => loc.id);
      deleteLocationData(syncedLocationIds);

      if (isManual) {
        alert(`Sync successful! ${result.locations_synced} locations synced.\n\nBackup file created and data cleared from Reports.`);
      }

    } catch (error) {
      console.error('Sync failed:', error);
      setSyncProgress(prev => ({ ...prev, phase: 'Failed' }));
      if (isManual) alert(`Sync failed: ${error.message}\n\nYour data is safe on the device. Please retry.`);
    } finally {
      setTimeout(() => {
        setSyncing(false);
        setSyncProgress({ current: 0, total: 0, phase: '' });
      }, 2000);
    }
  };

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
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-600" />
            User Account
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div className="min-w-0">
              <p className="font-medium text-sm text-slate-800">{user?.name}</p>
              <p className="text-xs text-slate-500">ID: {user?.userId} · <span className="capitalize">{user?.role}</span></p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordModal(true)}
              className="border-slate-200 text-xs shrink-0 ml-2"
            >
              <Key className="w-3.5 h-3.5 mr-1" />
              Change
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Location Scanning Mode */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-600" />
            Location Scanning Mode
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-1">
          <RadioGroup 
            value={pendingSettings.locationScanMode} 
            onValueChange={(value) => handlePendingSettingChange('locationScanMode', value)}
            className="space-y-2"
          >
            <div className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-all ${
              pendingSettings.locationScanMode === 'preassigned' 
                ? 'border-blue-500 bg-blue-50' 
                : 'border-slate-200 hover:border-slate-300'
            }`}>
              <RadioGroupItem value="preassigned" id="preassigned" />
              <div className="flex-1 min-w-0">
                <Label htmlFor="preassigned" className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                  <Shield className="w-4 h-4 text-blue-600 shrink-0" />
                  Pre-Assigned Mode
                </Label>
                <p className="text-xs text-slate-500 mt-0.5">
                  Only scan imported/created locations
                </p>
              </div>
            </div>

            <div className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-all ${
              pendingSettings.locationScanMode === 'dynamic' 
                ? 'border-purple-500 bg-purple-50' 
                : 'border-slate-200 hover:border-slate-300'
            }`}>
              <RadioGroupItem value="dynamic" id="dynamic" />
              <div className="flex-1 min-w-0">
                <Label htmlFor="dynamic" className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  Dynamic Mode
                </Label>
                <p className="text-xs text-slate-500 mt-0.5">
                  New locations created automatically on scan
                </p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Location Validation */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            Location Validation
          </CardTitle>
          <CardDescription>Control which locations can be scanned</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base">Allow Non-Master Locations</Label>
              <p className="text-sm text-slate-500">
                {pendingSettings.allowNonMasterLocations 
                  ? 'Any scanned location is accepted'
                  : 'Only locations in Location Master are accepted'}
              </p>
            </div>
            <Switch
              checked={pendingSettings.allowNonMasterLocations || false}
              onCheckedChange={(checked) => handlePendingSettingChange('allowNonMasterLocations', checked)}
            />
          </div>
          <div className={`p-3 rounded-lg text-sm ${
            pendingSettings.allowNonMasterLocations 
              ? 'bg-amber-50 text-amber-700' 
              : 'bg-blue-50 text-blue-700'
          }`}>
            {pendingSettings.allowNonMasterLocations 
              ? '⚠️ All scanned locations will be accepted regardless of master data.'
              : '🔒 Only locations defined in Location Master (Master Data) will be accepted. Unknown locations will be rejected.'}
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

      {/* Cloud Sync Configuration */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Cloud className="w-5 h-5 text-emerald-600" />
            Cloud Sync
            {isOnline ? (
              <span className="ml-2 flex items-center gap-1 text-xs text-emerald-600">
                <Wifi className="w-3 h-3" /> Online
              </span>
            ) : (
              <span className="ml-2 flex items-center gap-1 text-xs text-red-500">
                <WifiOff className="w-3 h-3" /> Offline
              </span>
            )}
          </CardTitle>
          <CardDescription>Sync data to admin portal for reporting</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Device Name */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-slate-500" />
              Device Name
            </Label>
            <Input
              placeholder="e.g., Scanner-01"
              value={syncConfig.deviceName}
              onChange={(e) => handleSyncConfigChange('deviceName', e.target.value)}
            />
            <p className="text-xs text-slate-500">Unique name to identify this device in the portal</p>
          </div>

          {/* Client Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              Client
            </Label>
            <select
              value={syncConfig.clientId}
              onChange={(e) => {
                handleSyncConfigChange('clientId', e.target.value);
                handleSyncConfigChange('sessionId', ''); // Reset session when client changes
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">Select Client</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>

          {/* Session Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-slate-500" />
              Audit Session
            </Label>
            <select
              value={syncConfig.sessionId}
              onChange={(e) => handleSyncConfigChange('sessionId', e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              disabled={!syncConfig.clientId}
            >
              <option value="">Select Session</option>
              {sessions.map(session => (
                <option key={session.id} value={session.id}>{session.name}</option>
              ))}
            </select>
          </div>

          <Separator />

          {/* Sync Info */}
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>After sync:</strong> A backup CSV file will be downloaded automatically and synced data will be removed from Reports.
            </p>
          </div>

          {/* Pending Sync Count */}
          {(() => {
            // Filter locations by current scan mode (matching Reports page logic)
            const isPreAssigned = settings.locationScanMode === 'preassigned';
            const modeLocations = locations.filter(loc => {
              if (isPreAssigned) return loc.isAssigned === true;
              return loc.autoCreated === true || loc.isAssigned === false;
            });
            // Only count items from mode-relevant locations with data
            const pendingLocations = modeLocations.filter(loc => 
              (scannedItems && scannedItems[loc.id] && scannedItems[loc.id].length > 0) || loc.isEmpty
            );
            // Derive items ONLY from valid mode-filtered locations
            const allItems = pendingLocations.flatMap(loc => scannedItems[loc.id] || []);
            const pendingItems = allItems.length;
            const pendingQty = allItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
            
            if (pendingLocations.length > 0) {
              const emptyBinCount = pendingLocations.filter(loc => loc.isEmpty).length;
              return (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-800">Ready to sync:</p>
                  <p className="text-sm text-amber-700">
                    {pendingLocations.length} location{pendingLocations.length !== 1 ? 's' : ''} • {pendingItems} item{pendingItems !== 1 ? 's' : ''} • {pendingQty} qty
                    {emptyBinCount > 0 && ` • ${emptyBinCount} empty bin${emptyBinCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
              );
            }
            return (
              <div className="p-3 bg-slate-100 rounded-lg">
                <p className="text-sm text-slate-500">No data to sync</p>
              </div>
            );
          })()}

          {/* Last Sync & Manual Sync Button */}
          <div className="p-4 bg-slate-50 rounded-xl space-y-3">
            {lastSyncTime && (
              <p className="text-sm text-slate-600">
                Last sync: {new Date(lastSyncTime).toLocaleString()}
              </p>
            )}

            {/* Progress Bar */}
            {syncing && syncProgress.total > 0 && (
              <div data-testid="sync-progress-container" className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium" data-testid="sync-progress-phase">{syncProgress.phase}</span>
                  <span className="text-slate-500" data-testid="sync-progress-count">
                    {syncProgress.current}/{syncProgress.total} locations
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    data-testid="sync-progress-bar"
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      syncProgress.phase === 'Failed' ? 'bg-red-500' :
                      syncProgress.phase === 'Complete!' ? 'bg-emerald-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${Math.round((syncProgress.current / syncProgress.total) * 100)}%` }}
                  />
                </div>
                <p className="text-center text-xs font-semibold text-slate-700" data-testid="sync-progress-pct">
                  {Math.round((syncProgress.current / syncProgress.total) * 100)}%
                </p>
              </div>
            )}

            <Button
              data-testid="sync-now-button"
              onClick={handleManualSync}
              disabled={syncing || !syncConfig.deviceName || !syncConfig.sessionId}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  {syncProgress.phase || 'Syncing...'}
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4 mr-2" />
                  Sync Now
                </>
              )}
            </Button>
            {syncing && (
              <p className="text-xs text-blue-600 text-center font-medium">
                Data is safe on your device until sync completes 100%
              </p>
            )}
            {(!syncConfig.deviceName || !syncConfig.sessionId) && (
              <p className="text-xs text-amber-600 text-center">
                Configure device name, client, and session to enable sync
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Import Master from Session Data */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600" />
            Import from Portal
          </CardTitle>
          <CardDescription className="text-xs">Sync master data or assigned locations from the admin portal</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-1 space-y-3">
          {(!syncConfig.clientId) ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700">Configure Client in Cloud Sync above to enable portal import</p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-600">Import Type</Label>
                <select
                  value={portalImportType}
                  onChange={(e) => { setPortalImportType(e.target.value); setPortalImportResult(null); }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="master">Master Sync (Products)</option>
                  <option value="pending">Pending Location Sync</option>
                </select>
              </div>

              {portalImportType === 'master' && (
                <div className="p-2.5 bg-blue-50 rounded-lg">
                  <p className="text-xs text-blue-700">Fetches product master (Barcode, Name, Price) from the selected client's uploaded stock data.</p>
                  <p className="text-xs text-blue-600 mt-1">Current: <strong>{masterProducts.length}</strong> products loaded</p>
                </div>
              )}

              {portalImportType === 'pending' && (
                <div className="p-2.5 bg-purple-50 rounded-lg">
                  <p className="text-xs text-purple-700">Fetches locations assigned to <strong>{syncConfig.deviceName || 'this device'}</strong> by the admin from Pending Locations.</p>
                  <p className="text-xs text-purple-600 mt-1">Current: <strong>{masterLocations.length}</strong> locations loaded</p>
                  {!syncConfig.deviceName && (
                    <p className="text-xs text-red-500 mt-1">⚠ Set Device Name in Cloud Sync above first</p>
                  )}
                </div>
              )}

              {portalImportResult && (
                <div className={`p-2.5 rounded-lg flex items-center gap-2 ${portalImportResult.success ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                  {portalImportResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                  <span className={`text-xs ${portalImportResult.success ? 'text-emerald-700' : 'text-red-700'}`}>{portalImportResult.msg}</span>
                </div>
              )}

              <Button
                onClick={handlePortalImport}
                disabled={portalImporting || !syncConfig.clientId || (portalImportType === 'pending' && !syncConfig.deviceName)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
              >
                {portalImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    {portalImportType === 'master' ? 'Import Products from Portal' : 'Import Assigned Locations'}
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Sync Password Modal */}
      <Dialog open={showSyncPasswordModal} onOpenChange={setShowSyncPasswordModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Sync Password</DialogTitle>
            <DialogDescription>
              Confirm your sync password to upload data to the portal
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="syncPassword">Sync Password</Label>
              <Input
                id="syncPassword"
                type="password"
                placeholder="Enter sync password"
                value={manualSyncPassword}
                onChange={(e) => setManualSyncPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && confirmManualSync()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSyncPasswordModal(false)}>
              Cancel
            </Button>
            <Button onClick={confirmManualSync} className="bg-emerald-600 hover:bg-emerald-700">
              <Cloud className="w-4 h-4 mr-2" />
              Sync Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
