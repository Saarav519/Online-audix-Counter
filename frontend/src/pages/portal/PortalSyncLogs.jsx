import React, { useState, useEffect } from 'react';
import { 
  Database, 
  RefreshCw, 
  ChevronDown, 
  ChevronRight,
  Smartphone,
  Clock,
  MapPin,
  Package,
  Download,
  Building2,
  Calendar,
  Filter
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalSyncLogs() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [groupedData, setGroupedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedClient, setExpandedClient] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);
  const [expandedLog, setExpandedLog] = useState(null);

  useEffect(() => {
    fetchClients();
    fetchGroupedLogs();
  }, []);

  useEffect(() => {
    fetchGroupedLogs();
  }, [selectedClient]);

  const fetchClients = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/clients`);
      if (response.ok) setClients(await response.json());
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    }
  };

  const fetchGroupedLogs = async () => {
    setLoading(true);
    try {
      let url = `${BACKEND_URL}/api/portal/sync-logs/grouped`;
      if (selectedClient) url += `?client_id=${selectedClient}`;
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setGroupedData(data);
        // Auto-expand first client if only one
        if (data.length === 1) {
          setExpandedClient(data[0].client_id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExportDayLogs = async (clientId, date, clientName) => {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/portal/sync-logs/export?client_id=${clientId}&date=${date}`
      );
      if (!response.ok) {
        throw new Error('Export failed');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync_logs_${clientName}_${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported logs for ${date}`);
    } catch (error) {
      toast.error('Failed to export logs');
      console.error(error);
    }
  };

  const handleExportSingleLog = (log, clientName) => {
    try {
      const locations = log.raw_payload?.locations || [];
      let csvRows = ['Log ID,Device,Session ID,Sync Time,Location,Barcode,Product Name,Quantity,Scanned At'];
      
      for (const loc of locations) {
        const locName = loc.name || loc.location_name || 'Unknown';
        for (const item of (loc.items || [])) {
          csvRows.push([
            log.id || '',
            log.device_name || '',
            log.session_id || '',
            log.synced_at || '',
            locName,
            item.barcode || '',
            item.product_name || item.productName || '',
            item.quantity || 0,
            item.scanned_at || item.scannedAt || ''
          ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        }
      }
      
      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync_${log.device_name}_${log.sync_date}_${log.id.substring(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported sync log (${log.total_items} items)`);
    } catch (error) {
      toast.error('Failed to export log');
      console.error(error);
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

  const formatDateShort = (dateStr) => {
    if (!dateStr || dateStr === 'unknown') return 'Unknown Date';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { 
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
  };

  // Count totals
  const totalLogs = groupedData.reduce((sum, cg) => 
    sum + cg.dates.reduce((ds, d) => ds + d.sync_count, 0), 0
  );
  const totalClients = groupedData.length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sync Logs</h1>
          <p className="text-gray-500">Raw data audit trail — grouped by client & date</p>
        </div>
        <Button onClick={fetchGroupedLogs} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="w-3.5 h-3.5 inline mr-1" />
              Filter by Client
            </label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">All Clients</option>
              {clients.map(client => (
                <option key={client.id} value={client.id}>{client.name} ({client.code})</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <div className="px-4 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700 w-full text-center">
              <Building2 className="w-4 h-4 inline mr-1" />
              {totalClients} client{totalClients !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-end">
            <div className="px-4 py-2 bg-blue-50 rounded-lg text-sm text-blue-700 w-full text-center">
              <Database className="w-4 h-4 inline mr-1" />
              {totalLogs} sync log{totalLogs !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Logs */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading sync logs...</p>
        </div>
      ) : groupedData.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No sync logs found</p>
          <p className="text-sm text-gray-400 mt-1">Sync logs will appear here when devices sync data</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedData.map((clientGroup) => (
            <div key={clientGroup.client_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              
              {/* Client Header */}
              <div 
                className="px-5 py-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between border-b border-gray-100"
                onClick={() => setExpandedClient(expandedClient === clientGroup.client_id ? null : clientGroup.client_id)}
              >
                <div className="flex items-center gap-3">
                  {expandedClient === clientGroup.client_id ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{clientGroup.client_name}</p>
                    <p className="text-xs text-gray-500">Code: {clientGroup.client_code || clientGroup.client_id.substring(0, 8)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                    {clientGroup.dates.length} day{clientGroup.dates.length !== 1 ? 's' : ''}
                  </span>
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    {clientGroup.dates.reduce((sum, d) => sum + d.sync_count, 0)} syncs
                  </span>
                </div>
              </div>

              {/* Date Groups (inside client) */}
              {expandedClient === clientGroup.client_id && (
                <div className="divide-y divide-gray-100">
                  {clientGroup.dates.map((dateGroup) => {
                    const dateKey = `${clientGroup.client_id}|${dateGroup.date}`;
                    return (
                      <div key={dateKey}>
                        {/* Date Header */}
                        <div 
                          className="px-5 py-3 cursor-pointer hover:bg-emerald-50/30 flex items-center justify-between bg-gray-50/50"
                          onClick={() => setExpandedDate(expandedDate === dateKey ? null : dateKey)}
                        >
                          <div className="flex items-center gap-3 pl-8">
                            {expandedDate === dateKey ? (
                              <ChevronDown className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-emerald-500" />
                            )}
                            <Calendar className="w-4 h-4 text-emerald-500" />
                            <span className="font-medium text-gray-800 text-sm">{formatDateShort(dateGroup.date)}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="text-gray-500">
                              {dateGroup.sync_count} sync{dateGroup.sync_count !== 1 ? 's' : ''}
                            </span>
                            <span className="text-gray-400">|</span>
                            <span className="text-gray-500">
                              <MapPin className="w-3 h-3 inline mr-0.5" />
                              {dateGroup.total_locations} loc
                            </span>
                            <span className="text-gray-400">|</span>
                            <span className="text-gray-500">
                              <Package className="w-3 h-3 inline mr-0.5" />
                              {dateGroup.total_items} items / {dateGroup.total_quantity} qty
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="ml-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportDayLogs(clientGroup.client_id, dateGroup.date, clientGroup.client_name);
                              }}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Export Day
                            </Button>
                          </div>
                        </div>

                        {/* Individual Logs (inside date) — summary only, no inline data */}
                        {expandedDate === dateKey && (
                          <div className="pl-16 pr-5 py-2 space-y-2 bg-white">
                            {dateGroup.logs.map((log) => (
                              <div key={log.id} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50">
                                  <div className="flex items-center gap-3">
                                    <Smartphone className="w-4 h-4 text-blue-500" />
                                    <div>
                                      <p className="font-medium text-gray-800 text-sm">{log.device_name}</p>
                                      <p className="text-xs text-gray-400">
                                        Session: {log.session_id?.substring(0, 8)}... &nbsp;·&nbsp; ID: {log.id?.substring(0, 8)}...
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-gray-500">
                                    <span><MapPin className="w-3 h-3 inline mr-0.5" />{log.location_count} loc</span>
                                    <span><Package className="w-3 h-3 inline mr-0.5" />{log.total_items} items / {log.total_quantity} qty</span>
                                    <span className="text-gray-400"><Clock className="w-3 h-3 inline mr-0.5" />{formatDate(log.synced_at)}</span>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="ml-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 h-7 text-xs"
                                      onClick={() => handleExportSingleLog(log, clientGroup.client_name)}
                                    >
                                      <Download className="w-3 h-3 mr-1" />
                                      Export
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
