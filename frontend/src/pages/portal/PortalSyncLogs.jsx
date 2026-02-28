import React, { useState, useEffect, useCallback } from 'react';
import { 
  Database, RefreshCw, ChevronDown, ChevronRight, Smartphone, Clock,
  MapPin, Package, Download, Building2, Calendar, Filter, ArrowRight,
  CheckCircle2, AlertTriangle, Inbox, History, Layers
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalSyncLogs() {
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedSession, setSelectedSession] = useState('');
  const [activeTab, setActiveTab] = useState('inbox');

  // Inbox state
  const [inboxSummary, setInboxSummary] = useState(null);
  const [forwarding, setForwarding] = useState(false);

  // Sync logs state (grouped)
  const [groupedData, setGroupedData] = useState([]);

  // Forward batches state
  const [forwardBatches, setForwardBatches] = useState([]);

  const [loading, setLoading] = useState(false);
  const [expandedScanner, setExpandedScanner] = useState(null);
  const [expandedClient, setExpandedClient] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);

  useEffect(() => {
    fetchClients();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      fetchSessions(selectedClient);
    } else {
      setSessions([]);
      setSelectedSession('');
    }
  }, [selectedClient]);

  const fetchData = useCallback(() => {
    if (activeTab === 'inbox' && selectedSession) {
      fetchInboxSummary();
      fetchForwardBatches();
    } else if (activeTab === 'logs') {
      fetchGroupedLogs();
    }
  }, [activeTab, selectedSession, selectedClient]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
        if (data.length > 0 && !selectedSession) {
          setSelectedSession(data[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const fetchInboxSummary = async () => {
    if (!selectedSession) return;
    setLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/sync-inbox/summary?session_id=${selectedSession}`);
      if (response.ok) setInboxSummary(await response.json());
    } catch (error) {
      console.error('Failed to fetch inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchForwardBatches = async () => {
    if (!selectedSession) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/forward-batches?session_id=${selectedSession}`);
      if (response.ok) setForwardBatches(await response.json());
    } catch (error) {
      console.error('Failed to fetch batches:', error);
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
        if (data.length === 1) setExpandedClient(data[0].client_id);
      }
    } catch (error) {
      console.error('Failed to fetch sync logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleForwardAll = async () => {
    if (!selectedSession || !selectedClient) {
      toast.error('Select a client and session first');
      return;
    }
    if (!inboxSummary || inboxSummary.total_pending === 0) {
      toast.error('No pending data to forward');
      return;
    }
    setForwarding(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/forward-to-variance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: selectedSession,
          client_id: selectedClient,
          forwarded_by: 'admin'
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Forward failed');
      }
      const result = await response.json();
      toast.success(`Forwarded! ${result.locations_forwarded} locations to variance, ${result.conflicts_created} conflicts detected`);
      fetchInboxSummary();
      fetchForwardBatches();
    } catch (error) {
      toast.error(`Forward failed: ${error.message}`);
    } finally {
      setForwarding(false);
    }
  };

  const handleExportDayLogs = async (clientId, date, clientName) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/sync-logs/export?client_id=${clientId}&date=${date}`);
      if (!response.ok) throw new Error('Export failed');
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
    }
  };

  const handleExportSingleLog = async (logId, deviceName, syncDate) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/sync-logs/${logId}/export`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sync_${deviceName}_${syncDate}_${logId.substring(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Sync log exported!');
    } catch (error) {
      toast.error('Failed to export log');
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

  const totalLogs = groupedData.reduce((sum, cg) =>
    sum + cg.dates.reduce((ds, d) => ds + d.sync_count, 0), 0
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sync & Forward</h1>
          <p className="text-gray-500">Manage scanner data — review, forward to variance, track batches</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" data-testid="refresh-sync-logs">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Building2 className="w-3.5 h-3.5 inline mr-1" />Client
            </label>
            <select data-testid="sync-client-filter" value={selectedClient} onChange={(e) => { setSelectedClient(e.target.value); setSelectedSession(''); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="">Select Client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Layers className="w-3.5 h-3.5 inline mr-1" />Session
            </label>
            <select data-testid="sync-session-filter" value={selectedSession} onChange={(e) => setSelectedSession(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" disabled={!selectedClient}>
              <option value="">Select Session</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            {['inbox', 'logs', 'batches'].map(tab => (
              <button key={tab} data-testid={`tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {tab === 'inbox' ? 'Sync Inbox' : tab === 'logs' ? 'Raw Logs' : 'Batches'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TAB: Sync Inbox */}
      {activeTab === 'inbox' && (
        <>
          {!selectedSession ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Inbox className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Select a client and session to view the sync inbox</p>
            </div>
          ) : loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading inbox...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Inbox Dashboard */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Inbox className="w-5 h-5 text-blue-500" />
                    Pending Sync Data
                  </h2>
                  <div className="flex items-center gap-3">
                    <span data-testid="inbox-pending-count" className="px-3 py-1 bg-amber-50 text-amber-700 rounded-full text-sm font-medium">
                      {inboxSummary?.total_pending || 0} locations pending
                    </span>
                    <span data-testid="inbox-scanner-count" className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                      {inboxSummary?.scanner_count || 0} scanner{(inboxSummary?.scanner_count || 0) !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Scanner Cards */}
                {inboxSummary && inboxSummary.scanners.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    {inboxSummary.scanners.map((scanner) => (
                      <div key={scanner.device_name}
                        data-testid={`inbox-scanner-${scanner.device_name}`}
                        className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedScanner(expandedScanner === scanner.device_name ? null : scanner.device_name)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                              <Smartphone className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">{scanner.device_name}</p>
                              <p className="text-xs text-gray-400">Last sync: {formatDate(scanner.last_synced_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span><MapPin className="w-3 h-3 inline mr-0.5" />{scanner.location_count} loc</span>
                            <span><Package className="w-3 h-3 inline mr-0.5" />{scanner.total_items} items</span>
                            <span className="font-medium text-gray-700">{scanner.total_quantity} qty</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <Inbox className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p>No pending sync data</p>
                    <p className="text-xs mt-1">Data will appear here when scanners sync</p>
                  </div>
                )}

                {/* Forward Button */}
                {inboxSummary && inboxSummary.total_pending > 0 && (
                  <div className="border-t border-gray-200 pt-4 mt-4">
                    <Button
                      data-testid="forward-to-variance-btn"
                      onClick={handleForwardAll}
                      disabled={forwarding}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3"
                    >
                      {forwarding ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Forwarding...</>
                      ) : (
                        <><ArrowRight className="w-4 h-4 mr-2" />
                          Forward All to Variance ({inboxSummary.total_pending} locations from {inboxSummary.scanner_count} scanner{inboxSummary.scanner_count !== 1 ? 's' : ''})
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-gray-400 text-center mt-2">
                      Conflict detection will run automatically during forward
                    </p>
                  </div>
                )}
              </div>

              {/* Recent Forward Batches */}
              {forwardBatches.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
                    <History className="w-5 h-5 text-emerald-500" />
                    Recent Forward Batches
                  </h2>
                  <div className="space-y-2">
                    {forwardBatches.slice(0, 5).map((batch) => (
                      <div key={batch.id} data-testid={`forward-batch-${batch.id}`}
                        className="border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              Batch #{batch.id.substring(0, 8)}
                            </p>
                            <p className="text-xs text-gray-400">{formatDate(batch.forwarded_at)} by {batch.forwarded_by}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-gray-500"><Smartphone className="w-3 h-3 inline mr-0.5" />{batch.scanner_count} scanners</span>
                          <span className="text-gray-500"><MapPin className="w-3 h-3 inline mr-0.5" />{batch.location_count} loc</span>
                          <span className="text-gray-500"><Package className="w-3 h-3 inline mr-0.5" />{batch.item_count} items</span>
                          {batch.conflicts_created > 0 && (
                            <span className="text-amber-600 font-medium"><AlertTriangle className="w-3 h-3 inline mr-0.5" />{batch.conflicts_created} conflicts</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB: Raw Logs */}
      {activeTab === 'logs' && (
        <>
          {loading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500">Loading sync logs...</p>
            </div>
          ) : groupedData.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Database className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No sync logs found</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
                  {groupedData.length} client{groupedData.length !== 1 ? 's' : ''}
                </span>
                <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                  {totalLogs} sync log{totalLogs !== 1 ? 's' : ''}
                </span>
              </div>
              {groupedData.map((clientGroup) => (
                <div key={clientGroup.client_id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between border-b border-gray-100"
                    onClick={() => setExpandedClient(expandedClient === clientGroup.client_id ? null : clientGroup.client_id)}>
                    <div className="flex items-center gap-3">
                      {expandedClient === clientGroup.client_id ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
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
                  {expandedClient === clientGroup.client_id && (
                    <div className="divide-y divide-gray-100">
                      {clientGroup.dates.map((dateGroup) => {
                        const dateKey = `${clientGroup.client_id}|${dateGroup.date}`;
                        return (
                          <div key={dateKey}>
                            <div className="px-5 py-3 cursor-pointer hover:bg-emerald-50/30 flex items-center justify-between bg-gray-50/50"
                              onClick={() => setExpandedDate(expandedDate === dateKey ? null : dateKey)}>
                              <div className="flex items-center gap-3 pl-8">
                                {expandedDate === dateKey ? <ChevronDown className="w-4 h-4 text-emerald-500" /> : <ChevronRight className="w-4 h-4 text-emerald-500" />}
                                <Calendar className="w-4 h-4 text-emerald-500" />
                                <span className="font-medium text-gray-800 text-sm">{formatDateShort(dateGroup.date)}</span>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-gray-500">{dateGroup.sync_count} sync{dateGroup.sync_count !== 1 ? 's' : ''}</span>
                                <span className="text-gray-400">|</span>
                                <span className="text-gray-500"><MapPin className="w-3 h-3 inline mr-0.5" />{dateGroup.total_locations} loc</span>
                                <span className="text-gray-400">|</span>
                                <span className="text-gray-500"><Package className="w-3 h-3 inline mr-0.5" />{dateGroup.total_items} items / {dateGroup.total_quantity} qty</span>
                                <Button variant="outline" size="sm"
                                  className="ml-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 h-7 text-xs"
                                  onClick={(e) => { e.stopPropagation(); handleExportDayLogs(clientGroup.client_id, dateGroup.date, clientGroup.client_name); }}>
                                  <Download className="w-3 h-3 mr-1" />Export Day
                                </Button>
                              </div>
                            </div>
                            {expandedDate === dateKey && (
                              <div className="pl-16 pr-5 py-2 space-y-2 bg-white">
                                {dateGroup.logs.map((log) => (
                                  <div key={log.id} className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50">
                                      <div className="flex items-center gap-3">
                                        <Smartphone className="w-4 h-4 text-blue-500" />
                                        <div>
                                          <p className="font-medium text-gray-800 text-sm">{log.device_name}</p>
                                          <p className="text-xs text-gray-400">Session: {log.session_id?.substring(0, 8)}... &middot; ID: {log.id?.substring(0, 8)}...</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 text-xs text-gray-500">
                                        <span><MapPin className="w-3 h-3 inline mr-0.5" />{log.location_count} loc</span>
                                        <span><Package className="w-3 h-3 inline mr-0.5" />{log.total_items} items / {log.total_quantity} qty</span>
                                        <span className="text-gray-400"><Clock className="w-3 h-3 inline mr-0.5" />{formatDate(log.synced_at)}</span>
                                        <Button variant="outline" size="sm"
                                          className="ml-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 h-7 text-xs"
                                          onClick={() => handleExportSingleLog(log.id, log.device_name, log.sync_date)}>
                                          <Download className="w-3 h-3 mr-1" />Export
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
        </>
      )}

      {/* TAB: Forward Batches */}
      {activeTab === 'batches' && (
        <>
          {!selectedSession ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <History className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Select a client and session to view forward batch history</p>
            </div>
          ) : forwardBatches.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <History className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">No forward batches yet</p>
              <p className="text-sm text-gray-400 mt-1">Batches will appear here when you forward sync data to variance</p>
            </div>
          ) : (
            <div className="space-y-3">
              {forwardBatches.map((batch, idx) => (
                <div key={batch.id} data-testid={`batch-history-${batch.id}`}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <span className="text-emerald-700 font-bold text-lg">#{forwardBatches.length - idx}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">Forward Batch</p>
                        <p className="text-xs text-gray-400">{formatDate(batch.forwarded_at)} &middot; By {batch.forwarded_by}</p>
                        <p className="text-xs text-gray-400 mt-0.5">ID: {batch.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{batch.scanner_count}</p>
                        <p className="text-xs text-gray-400">Scanners</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{batch.location_count}</p>
                        <p className="text-xs text-gray-400">Locations</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{batch.item_count}</p>
                        <p className="text-xs text-gray-400">Items</p>
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-900">{batch.quantity_count}</p>
                        <p className="text-xs text-gray-400">Qty</p>
                      </div>
                      {batch.conflicts_created > 0 && (
                        <div className="text-center">
                          <p className="font-bold text-amber-600">{batch.conflicts_created}</p>
                          <p className="text-xs text-amber-500">Conflicts</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {batch.scanners && batch.scanners.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                      {batch.scanners.map(s => (
                        <span key={s} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          <Smartphone className="w-3 h-3 inline mr-1" />{s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
