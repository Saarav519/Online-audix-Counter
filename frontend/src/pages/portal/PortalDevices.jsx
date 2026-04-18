import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Wifi, 
  WifiOff,
  Clock,
  Building2,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '../../components/portal/PageHeader';
import EmptyState from '../../components/portal/EmptyState';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalDevices() {
  const [devices, setDevices] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const fetchData = async () => {
    try {
      const [devicesRes, clientsRes, sessionsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/audit/portal/devices`),
        fetch(`${BACKEND_URL}/api/audit/portal/clients`),
        fetch(`${BACKEND_URL}/api/audit/portal/sessions`)
      ]);
      
      if (devicesRes.ok) setDevices(await devicesRes.json());
      if (clientsRes.ok) setClients(await clientsRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleDeleteDevice = async (deviceId, deviceName) => {
    if (!window.confirm(`Are you sure you want to delete "${deviceName}"?`)) return;
    setDeleting(deviceId);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/devices/${deviceId}`, { method: 'DELETE' });
      if (res.ok) {
        setDevices(prev => prev.filter(d => d.id !== deviceId));
        toast.success(`Device "${deviceName}" deleted`);
      } else {
        toast.error('Failed to delete device');
      }
    } catch { toast.error('Failed to delete device'); }
    finally { setDeleting(null); }
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.name : '-';
  };

  const getSessionName = (sessionId) => {
    const session = sessions.find(s => s.id === sessionId);
    return session ? session.name : '-';
  };

  const formatTime = (isoString) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const isOnline = (lastSync) => {
    if (!lastSync) return false;
    const diff = new Date() - new Date(lastSync);
    return diff < 3600000; // Online if synced within last hour
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <PageHeader
        title="Devices"
        subtitle="Monitor connected scanner devices in real time"
        breadcrumbs={[{ label: 'Devices' }]}
        liveLabel={devices.length > 0 ? `${devices.filter(d => isOnline(d.last_sync_at)).length} online` : null}
      />

      {/* Device List */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <EmptyState
            icon={Smartphone}
            title="No devices registered yet"
            description="Devices will appear here automatically when they sync data from the scanner app."
            color="violet"
            tip="💡 Register a device from the mobile scanner app login screen."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => {
            const online = isOnline(device.last_sync_at);
            return (
              <div
                key={device.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      online ? 'bg-emerald-100' : 'bg-gray-100'
                    }`}>
                      <Smartphone className={`w-6 h-6 ${online ? 'text-emerald-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{device.device_name}</h3>
                      <div className="flex items-center gap-1 text-sm">
                        {online ? (
                          <>
                            <Wifi className="w-3 h-3 text-emerald-500" />
                            <span className="text-emerald-600">Online</span>
                          </>
                        ) : (
                          <>
                            <WifiOff className="w-3 h-3 text-gray-400" />
                            <span className="text-gray-500">Offline</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    data-testid={`delete-device-${device.id}`}
                    onClick={() => handleDeleteDevice(device.id, device.device_name)}
                    disabled={deleting === device.id}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete device"
                  >
                    <Trash2 className={`w-4 h-4 ${deleting === device.id ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <span>Client: {getClientName(device.client_id)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>Session: {getSessionName(device.session_id)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Last Sync</span>
                    <span className={online ? 'text-emerald-600 font-medium' : 'text-gray-600'}>
                      {formatTime(device.last_sync_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
