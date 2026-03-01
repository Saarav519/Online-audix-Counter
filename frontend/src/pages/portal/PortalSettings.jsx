import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Save,
  Bell,
  Percent,
  Clock
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalSettings() {
  const [settings, setSettings] = useState({
    variance_threshold_percent: 5.0,
    device_inactive_hours: 2,
    auto_generate_alerts: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/settings`);
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      if (response.ok) {
        toast.success('Settings saved!');
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-500">Loading...</div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500">Configure portal preferences and alerts</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-emerald-500 hover:bg-emerald-600">
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Alert Settings */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">Alert Settings</h2>
              <p className="text-sm text-gray-500">Configure when alerts are generated</p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-generate Alerts</Label>
                <p className="text-sm text-gray-500">Automatically create alerts for variance and sync issues</p>
              </div>
              <Switch
                checked={settings.auto_generate_alerts}
                onCheckedChange={(checked) => setSettings({ ...settings, auto_generate_alerts: checked })}
              />
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Percent className="w-4 h-4 text-gray-400" />
                <Label>Variance Threshold (%)</Label>
              </div>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={settings.variance_threshold_percent}
                onChange={(e) => setSettings({ ...settings, variance_threshold_percent: parseFloat(e.target.value) || 0 })}
                className="w-32"
              />
              <p className="text-sm text-gray-500 mt-1">
                Alert when item variance exceeds this percentage
              </p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <Label>Device Inactive Alert (hours)</Label>
              </div>
              <Input
                type="number"
                min="1"
                max="24"
                value={settings.device_inactive_hours}
                onChange={(e) => setSettings({ ...settings, device_inactive_hours: parseInt(e.target.value) || 2 })}
                className="w-32"
              />
              <p className="text-sm text-gray-500 mt-1">
                Alert when device hasn't synced for this many hours
              </p>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900">About Alerts</p>
              <p className="text-sm text-blue-700 mt-1">
                Alerts are generated automatically when synced data is received. 
                High variance alerts are created when the difference between expected 
                and physical stock exceeds the threshold percentage.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
