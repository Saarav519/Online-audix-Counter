import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  FolderOpen, 
  Smartphone, 
  Users,
  RefreshCw,
  Activity
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    stats: { clients: 0, active_sessions: 0, devices: 0, unread_alerts: 0 },
    recent_syncs: [],
    devices: []
  });

  const fetchDashboard = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/dashboard`);
      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    // Auto-refresh every 10 seconds for live updates
    const interval = setInterval(fetchDashboard, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    fetchDashboard();
    toast.success('Dashboard refreshed');
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Real-time overview of your stock audits</p>
        </div>
        <Button onClick={handleRefresh} variant="outline" disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatsCard
          icon={Building2}
          label="Clients"
          value={dashboardData.stats.clients}
          color="blue"
        />
        <StatsCard
          icon={FolderOpen}
          label="Active Sessions"
          value={dashboardData.stats.active_sessions}
          color="emerald"
        />
        <StatsCard
          icon={Smartphone}
          label="Devices"
          value={dashboardData.stats.devices}
          color="purple"
        />
        <StatsCard
          icon={Bell}
          label="Unread Alerts"
          value={dashboardData.stats.unread_alerts}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Status */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Device Status</h2>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          
          {dashboardData.devices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Smartphone className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No devices registered yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.devices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      device.last_sync_at && 
                      (new Date() - new Date(device.last_sync_at)) < 3600000
                        ? 'bg-emerald-500'
                        : 'bg-gray-300'
                    }`} />
                    <div>
                      <p className="font-medium text-gray-900">{device.device_name}</p>
                      <p className="text-xs text-gray-500">
                        Last sync: {formatTime(device.last_sync_at)}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    device.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {device.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Syncs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Recent Syncs</h2>
            <RefreshCw className="w-5 h-5 text-blue-500" />
          </div>
          
          {dashboardData.recent_syncs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No syncs yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dashboardData.recent_syncs.slice(0, 5).map((sync, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{sync.location_name}</p>
                    <p className="text-xs text-gray-500">
                      {sync.device_name} • {sync.total_items} items • {sync.total_quantity} qty
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTime(sync.synced_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatsCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
}
