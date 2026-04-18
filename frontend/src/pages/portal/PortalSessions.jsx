import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  FolderOpen, 
  Upload,
  Play,
  CheckCircle,
  Archive,
  FileSpreadsheet,
  Calendar,
  Trash2,
  Eye,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { toast } from 'sonner';
import PageHeader from '../../components/portal/PageHeader';
import EmptyState from '../../components/portal/EmptyState';
import SessionProgressBar from '../../components/portal/SessionProgressBar';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export default function PortalSessions() {
  const [sessions, setSessions] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importingSession, setImportingSession] = useState(null);
  const [showStockViewer, setShowStockViewer] = useState(null);
  const [stockData, setStockData] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [schemaFields, setSchemaFields] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [formData, setFormData] = useState({
    client_id: '',
    name: '',
    variance_mode: 'bin-wise',
    start_date: new Date().toISOString().split('T')[0]
  });
  const fileInputRef = useRef(null);

  const fetchData = async () => {
    try {
      const [sessionsRes, clientsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/audit/portal/sessions`),
        fetch(`${BACKEND_URL}/api/audit/portal/clients`)
      ]);
      
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (clientsRes.ok) setClients(await clientsRes.json());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch schema when Import Stock dialog opens
  const fetchSchemaForSession = async (session) => {
    if (!session?.client_id) return;
    setSchemaLoading(true);
    setSchemaFields([]);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${session.client_id}/schema`);
      if (res.ok) {
        const data = await res.json();
        const enabledFields = (data.fields || []).filter(f => f.enabled);
        setSchemaFields(enabledFields);
      }
    } catch (err) {
      console.error('Failed to fetch schema:', err);
    } finally {
      setSchemaLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.client_id || !formData.name) {
      toast.error('Client and Session Name are required');
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          start_date: new Date(formData.start_date).toISOString()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Failed to create session');
      }

      toast.success('Session created!');
      setShowDialog(false);
      setFormData({ client_id: '', name: '', variance_mode: 'bin-wise', start_date: new Date().toISOString().split('T')[0] });
      fetchData();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleStatusChange = async (sessionId, status) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/sessions/${sessionId}/status?status=${status}`, {
        method: 'PUT'
      });

      if (!response.ok) throw new Error('Failed to update status');

      toast.success(`Session marked as ${status}`);
      fetchData();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDeleteSession = async (sessionId, sessionName) => {
    if (!window.confirm(`Are you sure you want to delete "${sessionName}"?\n\nThis will also delete all synced data, expected stock, and alerts for this session.`)) {
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete session');

      toast.success('Session deleted!');
      fetchData();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleImportExpected = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/audit/portal/sessions/${importingSession.id}/import-expected`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Import failed');
      }

      const result = await response.json();
      toast.success(result.message);
      setShowImportDialog(false);
      setImportingSession(null);
      fetchData();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const fetchStockData = async (sessionId) => {
    setStockLoading(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/sessions/${sessionId}/expected-stock`);
      if (response.ok) {
        const data = await response.json();
        setStockData(data);
      }
    } catch (error) {
      console.error('Failed to fetch stock data:', error);
      toast.error('Failed to load imported stock');
    } finally {
      setStockLoading(false);
    }
  };

  const handleViewStock = (session) => {
    if (showStockViewer === session.id) {
      setShowStockViewer(null);
      setStockData([]);
    } else {
      setShowStockViewer(session.id);
      fetchStockData(session.id);
    }
  };

  const [refreshingStock, setRefreshingStock] = useState(null);
  const handleRefreshStock = async (session) => {
    if (!window.confirm(`Refresh stock for "${session.name}"?\n\nThis will re-import the latest warehouse stock into this session, replacing the current snapshot.`)) return;
    setRefreshingStock(session.id);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/sessions/${session.id}/refresh-stock`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message);
        fetchData();
        if (showStockViewer === session.id) fetchStockData(session.id);
      } else {
        const err = await res.json();
        toast.error(err.detail || 'Failed to refresh stock');
      }
    } catch (err) {
      toast.error('Failed to refresh stock');
    } finally {
      setRefreshingStock(null);
    }
  };

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.name : 'Unknown';
  };

  const getClientType = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client?.client_type || 'store';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'archived': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active': return Play;
      case 'completed': return CheckCircle;
      case 'archived': return Archive;
      default: return FolderOpen;
    }
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClient = !selectedClient || session.client_id === selectedClient;
    return matchesSearch && matchesClient;
  });

  return (
    <div className="p-3 md:p-4 lg:p-5">
      <PageHeader
        title="Audit Sessions"
        subtitle="Manage audit sessions for your clients"
        breadcrumbs={[{ label: 'Sessions' }]}
        actions={
          <Button 
            onClick={() => setShowDialog(true)}
            className="bg-emerald-500 hover:bg-emerald-600 gap-1"
            disabled={clients.length === 0}
            data-testid="new-session-btn"
          >
            <Plus className="w-4 h-4" />
            New Session
          </Button>
        }
      />

      {/* Compact Filter Bar */}
      <div className="flex flex-wrap items-end gap-2 mb-3 pb-3 border-b border-slate-200">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Search</label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-7 pr-2 border border-slate-200 rounded-md text-[13px] bg-white hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
            />
          </div>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Client</label>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full h-8 px-2 border border-slate-200 rounded-md text-[13px] bg-white hover:border-slate-300 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
          >
            <option value="">All Clients</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sessions List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <EmptyState
            icon={FolderOpen}
            title="No clients yet"
            description="Create a client first before adding audit sessions."
            color="emerald"
            tip="💡 Head to the Clients page to add your first client."
          />
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm">
          <EmptyState
            icon={FolderOpen}
            title={searchQuery ? 'No matching sessions' : 'No sessions yet'}
            description={searchQuery ? 'Try a different search term or client filter.' : 'Create your first audit session to begin scanning and variance tracking.'}
            color="blue"
            action={!searchQuery && clients.length > 0 && (
              <Button onClick={() => setShowDialog(true)} className="bg-emerald-500 hover:bg-emerald-600 gap-1">
                <Plus className="w-4 h-4" /> Create Session
              </Button>
            )}
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          {filteredSessions.map((session, idx) => {
            const StatusIcon = getStatusIcon(session.status);
            const isLast = idx === filteredSessions.length - 1;
            return (
              <div
                key={session.id}
                className={`${isLast && showStockViewer !== session.id ? '' : 'border-b border-slate-100'}`}
              >
                {/* Compact Row (~60px) */}
                <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50/60 transition-colors">
                  {/* Status icon + name + client */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${getStatusColor(session.status)}`}>
                      <StatusIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-[13px] text-slate-900 truncate">{session.name}</h3>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${getStatusColor(session.status)}`}>
                          {session.status}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-100 text-purple-700">
                          {session.variance_mode === 'bin-wise' ? 'Bin' :
                           session.variance_mode === 'barcode-wise' ? 'Barcode' :
                           session.variance_mode === 'article-wise' ? 'Article' : 'Bin'}
                        </span>
                        {session.expected_stock_imported && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">
                            {session.client_type === 'warehouse' ? 'Snapshot' : 'Stock'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="truncate">{getClientName(session.client_id)}</span>
                        <span className="text-slate-300">•</span>
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Calendar className="w-3 h-3" />
                          {new Date(session.start_date).toLocaleDateString('en-IN')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Compact progress */}
                  <div className="hidden md:block w-[200px] shrink-0">
                    <SessionProgressBar sessionId={session.id} varianceMode={session.variance_mode} compact />
                  </div>

                  {/* Action buttons (h-7) */}
                  <div className="flex items-center gap-1 shrink-0">
                    {session.client_type !== 'warehouse' && (
                      <button
                        title="Import Stock"
                        onClick={() => {
                          setImportingSession(session);
                          setShowImportDialog(true);
                          fetchSchemaForSession(session);
                        }}
                        className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span className="hidden lg:inline">Import</span>
                      </button>
                    )}

                    {session.client_type === 'warehouse' && (
                      <button
                        title="Refresh Stock"
                        onClick={() => handleRefreshStock(session)}
                        disabled={refreshingStock === session.id}
                        className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        data-testid={`refresh-stock-${session.id}`}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshingStock === session.id ? 'animate-spin' : ''}`} />
                        <span className="hidden lg:inline">{refreshingStock === session.id ? 'Refreshing' : 'Refresh'}</span>
                      </button>
                    )}

                    {session.expected_stock_imported && (
                      <button
                        title={showStockViewer === session.id ? 'Hide Stock' : 'View Stock'}
                        onClick={() => handleViewStock(session)}
                        className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        {showStockViewer === session.id ? <ChevronUp className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span className="hidden lg:inline">Stock</span>
                      </button>
                    )}

                    {session.status === 'active' && (
                      <button
                        title="Complete Session"
                        onClick={() => handleStatusChange(session.id, 'completed')}
                        className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span className="hidden lg:inline">Complete</span>
                      </button>
                    )}

                    {session.status === 'completed' && (
                      <button
                        title="Archive Session"
                        onClick={() => handleStatusChange(session.id, 'archived')}
                        className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span className="hidden lg:inline">Archive</span>
                      </button>
                    )}

                    <button
                      title="Delete Session"
                      onClick={() => handleDeleteSession(session.id, session.name)}
                      className="h-7 w-7 inline-flex items-center justify-center rounded border border-red-200 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Imported Stock Viewer - expanded */}
                {showStockViewer === session.id && (
                  <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-slate-700">
                        Imported Stock Data
                        <span className="ml-2 text-[11px] font-normal text-slate-500">
                          ({stockData.length} records)
                        </span>
                      </h4>
                    </div>
                    {stockLoading ? (
                      <div className="text-center py-6 text-slate-400 text-xs">Loading stock data...</div>
                    ) : stockData.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-xs">No stock data found</div>
                    ) : (
                      <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-md bg-white">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 sticky top-0 z-10">
                            <tr>
                              {(!session.variance_mode || session.variance_mode === 'bin-wise') && (
                                <th className="text-left py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Location</th>
                              )}
                              <th className="text-left py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Barcode</th>
                              <th className="text-left py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Description</th>
                              <th className="text-left py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Category</th>
                              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">MRP</th>
                              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Cost</th>
                              <th className="text-right py-2 px-3 font-semibold text-slate-600 whitespace-nowrap">Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stockData.map((item, i) => (
                              <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                                {(!session.variance_mode || session.variance_mode === 'bin-wise') && (
                                  <td className="py-1.5 px-3 text-slate-700">{item.location || '-'}</td>
                                )}
                                <td className="py-1.5 px-3 font-mono text-slate-700">{item.barcode}</td>
                                <td className={`py-1.5 px-3 ${item.description ? 'text-slate-700' : 'text-slate-300 italic'}`}>
                                  {item.description || 'Not provided'}
                                </td>
                                <td className={`py-1.5 px-3 ${item.category ? 'text-slate-700' : 'text-slate-300 italic'}`}>
                                  {item.category || 'Not provided'}
                                </td>
                                <td className={`py-1.5 px-3 text-right ${item.mrp > 0 ? 'text-slate-700' : 'text-slate-300 italic'}`}>
                                  {item.mrp > 0 ? item.mrp.toFixed(2) : '-'}
                                </td>
                                <td className={`py-1.5 px-3 text-right ${item.cost > 0 ? 'text-slate-700' : 'text-slate-300 italic'}`}>
                                  {item.cost > 0 ? item.cost.toFixed(2) : '-'}
                                </td>
                                <td className="py-1.5 px-3 text-right font-semibold text-slate-900">{item.qty}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {stockData.length > 0 && stockData.every(s => !s.description && !s.category && !s.mrp && !s.cost) && (
                      <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md p-2.5">
                        <p className="text-xs text-amber-700">
                          <strong>Missing fields:</strong> Description, Category, MRP, and Cost are empty.
                          Re-import with these columns to include them in variance reports.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Session Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Audit Session</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="client">Client *</Label>
              <select
                id="client"
                value={formData.client_id}
                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">Select Client</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="name">Session Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="July 2026 Stock Count"
              />
            </div>
            <div>
              <Label htmlFor="variance_mode">Variance Mode *</Label>
              <select
                id="variance_mode"
                value={formData.variance_mode}
                onChange={(e) => setFormData({ ...formData, variance_mode: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
              >
                <option value="bin-wise">Bin-wise (Location + Barcode)</option>
                <option value="barcode-wise">Barcode-wise (No Bins)</option>
                <option value="article-wise">Article-wise (Article grouping)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.variance_mode === 'bin-wise' && 'Variance calculated per location/bin with barcode detail'}
                {formData.variance_mode === 'barcode-wise' && 'Variance calculated per barcode, aggregated across all locations'}
                {formData.variance_mode === 'article-wise' && 'Multiple barcodes grouped by article, variance at article level'}
              </p>
            </div>
            <div>
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600">
                Create Session
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import Expected Stock Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import Expected Stock (Quantities)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload expected stock quantities for: <strong>{importingSession?.name}</strong>
              {importingSession?.variance_mode && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  {importingSession.variance_mode === 'bin-wise' ? 'Bin-wise' : 
                   importingSession.variance_mode === 'barcode-wise' ? 'Barcode-wise' : 'Article-wise'}
                </span>
              )}
            </p>
            
            {/* Info box explaining separation */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <strong>Priority Rule:</strong> Description, Category, MRP, and Cost from this <strong>Imported Stock</strong> file 
                take <strong>first priority</strong> in variance reports. Only for items not found here, the system falls back 
                to the <strong>Master Product Catalog</strong>.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">CSV Format:</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!importingSession) return;
                    const clientId = importingSession.client_id;
                    try {
                      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${clientId}/schema/template?template_type=stock&variance_mode=${importingSession.variance_mode || 'bin-wise'}`);
                      if (!res.ok) throw new Error('Failed');
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `stock_template_${importingSession.name.replace(/\s+/g, '_')}.csv`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                      toast.success('Template downloaded!');
                    } catch {
                      toast.error('Failed to download template');
                    }
                  }}
                  className="text-emerald-600 hover:text-emerald-700"
                  data-testid="download-session-stock-template"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Download Template
                </Button>
              </div>

              {/* Dynamic Schema Columns Display */}
              {schemaLoading ? (
                <p className="text-xs text-gray-400 mt-2">Loading schema...</p>
              ) : schemaFields.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Expected Columns (from Schema):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(!importingSession?.variance_mode || importingSession?.variance_mode === 'bin-wise') && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Location</span>
                    )}
                    {schemaFields.map(f => (
                      <span key={f.name} className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.required ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}`}>
                        {f.label || f.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        {f.required && ' *'}
                      </span>
                    ))}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Qty</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    * = required. These columns match the schema configured for this client.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Download the template to see the exact columns configured for this client's schema.
                  <br/>
                  <strong>Required:</strong> {(!importingSession?.variance_mode || importingSession?.variance_mode === 'bin-wise') ? 'Location, Barcode, Qty' : 'Barcode, Qty'}
                </p>
              )}
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-sm text-gray-600 mb-4">
                Drag & drop your CSV file here, or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportExpected}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Select CSV File
              </Button>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowImportDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
