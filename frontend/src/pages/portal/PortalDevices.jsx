import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  Wifi, 
  WifiOff,
  Clock,
  Building2
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalDevices() {
  const [devices, setDevices] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [devicesRes, clientsRes, sessionsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/portal/devices`),
        fetch(`${BACKEND_URL}/api/portal/clients`),
        fetch(`${BACKEND_URL}/api/portal/sessions`)
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
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Devices</h1>
        <p className="text-gray-500">Monitor connected scanner devices</p>
      </div>

      {/* Device List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : devices.length === 0 ? (
        <div className="text-center py-12">
          <Smartphone className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500 mb-2">No devices registered yet</p>
          <p className="text-sm text-gray-400">
            Devices will appear here when they sync data from the scanner app
          </p>
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
