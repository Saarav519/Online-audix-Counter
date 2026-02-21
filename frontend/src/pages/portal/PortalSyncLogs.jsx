import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight,
  Smartphone,
  Clock,
  MapPin,
  Package
} from 'lucide-react';
import { Button } from '../../components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalSyncLogs() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [logs, setLogs] = useState([]);
  const [expandedLog, setExpandedLog] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchSessions(selectedClient);
    }
  }, [selectedClient]);

  useEffect(() => {
    fetchLogs();
  }, [selectedClient, selectedSession]);

  const fetchClients = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/clients`);
      if (response.ok) setClients(await response.json());
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchSessions = async (clientId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/sessions?client_id=${clientId}`);
      if (response.ok) setSessions(await response.json());
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let url = `${BACKEND_URL}/api/portal/sync-logs?limit=200`;
      if (selectedClient) url += `&client_id=${selectedClient}`;
      if (selectedSession) url += `&session_id=${selectedSession}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error('Failed to fetch sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', { 
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sync Logs</h1>
          <p className="text-gray-500">Raw data audit trail — every sync request stored as-is</p>
        </div>
        <Button onClick={fetchLogs} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select
              value={selectedClient}
              onChange={(e) => {
                setSelectedClient(e.target.value);
                setSelectedSession('');
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">All Clients</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session</label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              disabled={!selectedClient}
            >
              <option value="">All Sessions</option>
              {sessions.map(session => (
                <option key={session.id} value={session.id}>{session.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div className="px-4 py-2 bg-gray-50 rounded-lg text-sm text-gray-600 w-full text-center">
              {logs.length} log{logs.length !== 1 ? 's' : ''} found
            </div>
          </div>
        </div>
      </div>

      {/* Logs List */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading sync logs...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No sync logs found</p>
          <p className="text-sm text-gray-400 mt-1">Sync logs will appear here when devices sync data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Log Header */}
              <div 
                className="p-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    {expandedLog === log.id ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <Smartphone className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{log.device_name}</p>
                    <p className="text-xs text-gray-500">Session: {log.session_id?.substring(0, 8)}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <MapPin className="w-4 h-4" />
                    <span>{log.location_count} location{log.location_count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-600">
                    <Package className="w-4 h-4" />
                    <span>{log.total_items} items / {log.total_quantity} qty</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">{formatDate(log.synced_at)}</span>
                  </div>
                </div>
              </div>

              {/* Expanded Raw Data */}
              {expandedLog === log.id && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                    <div>
                      <span className="text-gray-500 text-xs">Log ID:</span>
                      <p className="font-mono text-xs text-gray-700">{log.id}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Client ID:</span>
                      <p className="font-mono text-xs text-gray-700">{log.client_id || '-'}</p>
                    </div>
                    <div>
                      <span className="text-gray-500 text-xs">Sync Date:</span>
                      <p className="text-xs text-gray-700">{log.sync_date}</p>
                    </div>
                  </div>

                  <h4 className="text-sm font-medium text-gray-700 mb-2">Raw Payload — Locations:</h4>
                  {(log.raw_payload?.locations || []).map((loc, locIdx) => (
                    <div key={locIdx} className="mb-3 bg-white rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm text-gray-800">
                          {loc.name || loc.location_name || `Location ${locIdx + 1}`}
                        </span>
                        <span className="text-xs text-gray-500">
                          {(loc.items || []).length} items
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="text-left py-1 px-2 font-medium text-gray-500">Barcode</th>
                              <th className="text-left py-1 px-2 font-medium text-gray-500">Product Name</th>
                              <th className="text-right py-1 px-2 font-medium text-gray-500">Qty</th>
                              <th className="text-left py-1 px-2 font-medium text-gray-500">Scanned At</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(loc.items || []).map((item, itemIdx) => (
                              <tr key={itemIdx} className="border-b border-gray-50">
                                <td className="py-1 px-2 font-mono">{item.barcode}</td>
                                <td className="py-1 px-2">{item.product_name || item.productName || '-'}</td>
                                <td className="py-1 px-2 text-right font-medium">{item.quantity}</td>
                                <td className="py-1 px-2 text-gray-400">{item.scanned_at || item.scannedAt || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
