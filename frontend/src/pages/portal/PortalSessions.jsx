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
  ChevronUp
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
        fetch(`${BACKEND_URL}/api/portal/sessions`),
        fetch(`${BACKEND_URL}/api/portal/clients`)
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.client_id || !formData.name) {
      toast.error('Client and Session Name are required');
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/sessions`, {
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
      const response = await fetch(`${BACKEND_URL}/api/portal/sessions/${sessionId}/status?status=${status}`, {
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
      const response = await fetch(`${BACKEND_URL}/api/portal/sessions/${sessionId}`, {
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
        `${BACKEND_URL}/api/portal/sessions/${importingSession.id}/import-expected`,
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
      const response = await fetch(`${BACKEND_URL}/api/portal/sessions/${sessionId}/expected-stock`);
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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Sessions</h1>
          <p className="text-gray-500">Manage audit sessions for your clients</p>
        </div>
        <Button 
          onClick={() => setShowDialog(true)}
          className="bg-emerald-500 hover:bg-emerald-600"
          disabled={clients.length === 0}
        >
          <Plus className="w-4 h-4 mr-2" />
          New Session
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={selectedClient}
          onChange={(e) => setSelectedClient(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">All Clients</option>
          {clients.map(client => (
            <option key={client.id} value={client.id}>{client.name}</option>
          ))}
        </select>
      </div>

      {/* Sessions List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Create a client first to add sessions</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-12">
          <FolderOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No sessions found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSessions.map((session) => {
            const StatusIcon = getStatusIcon(session.status);
            return (
              <div
                key={session.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              >
                {/* Header Row */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getStatusColor(session.status)}`}>
                      <StatusIcon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{session.name}</h3>
                      <p className="text-sm text-gray-500">
                        {getClientName(session.client_id)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {new Date(session.start_date).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(session.status)}`}>
                        {session.status}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                        {session.variance_mode === 'bin-wise' ? 'Bin-wise' : 
                         session.variance_mode === 'barcode-wise' ? 'Barcode-wise' : 
                         session.variance_mode === 'article-wise' ? 'Article-wise' : 'Bin-wise'}
                      </span>
                      {session.expected_stock_imported && (
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {session.stock_snapshot ? 'Stock: Snapshot' : 'Stock Imported'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex gap-2 flex-wrap">
                    {session.client_type !== 'warehouse' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setImportingSession(session);
                          setShowImportDialog(true);
                        }}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        Import Stock
                      </Button>
                    )}
                    
                    {session.expected_stock_imported && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewStock(session)}
                        className="text-blue-600 border-blue-200 hover:bg-blue-50"
                      >
                        {showStockViewer === session.id ? (
                          <><ChevronUp className="w-4 h-4 mr-1" /> Hide Stock</>
                        ) : (
                          <><Eye className="w-4 h-4 mr-1" /> View Stock</>
                        )}
                      </Button>
                    )}
                    
                    {session.status === 'active' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(session.id, 'completed')}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Complete
                      </Button>
                    )}
                    
                    {session.status === 'completed' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange(session.id, 'archived')}
                      >
                        <Archive className="w-4 h-4 mr-1" />
                        Archive
                      </Button>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSession(session.id, session.name)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>

              {/* Imported Stock Viewer - inside session card */}
              {showStockViewer === session.id && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-900">
                      Imported Stock Data
                      <span className="ml-2 text-xs font-normal text-gray-500">
                        ({stockData.length} records)
                      </span>
                    </h4>
                  </div>
                  {stockLoading ? (
                    <div className="text-center py-6 text-gray-400 text-sm">Loading stock data...</div>
                  ) : stockData.length === 0 ? (
                    <div className="text-center py-6 text-gray-400 text-sm">No stock data found</div>
                  ) : (
                    <div className="overflow-x-auto max-h-80 border border-gray-200 rounded-lg">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">Location</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">Barcode</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">Description</th>
                            <th className="text-left py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">Category</th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">MRP</th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">Cost</th>
                            <th className="text-right py-2 px-3 font-semibold text-gray-600 whitespace-nowrap">Qty</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stockData.map((item, idx) => (
                            <tr key={idx} className="border-t border-gray-50 hover:bg-gray-50">
                              <td className="py-1.5 px-3 text-gray-700">{item.location || '-'}</td>
                              <td className="py-1.5 px-3 font-mono text-gray-700">{item.barcode}</td>
                              <td className={`py-1.5 px-3 ${item.description ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                                {item.description || 'Not provided'}
                              </td>
                              <td className={`py-1.5 px-3 ${item.category ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                                {item.category || 'Not provided'}
                              </td>
                              <td className={`py-1.5 px-3 text-right ${item.mrp > 0 ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                                {item.mrp > 0 ? item.mrp.toFixed(2) : '-'}
                              </td>
                              <td className={`py-1.5 px-3 text-right ${item.cost > 0 ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                                {item.cost > 0 ? item.cost.toFixed(2) : '-'}
                              </td>
                              <td className="py-1.5 px-3 text-right font-semibold text-gray-900">{item.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {stockData.length > 0 && stockData.every(s => !s.description && !s.category && !s.mrp && !s.cost) && (
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
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
                      const res = await fetch(`${BACKEND_URL}/api/portal/clients/${clientId}/schema/template?template_type=stock`);
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
              <p className="text-xs text-gray-500 mt-1">
                Download the template to see the exact columns configured for this client's schema.
                <br/>
                <strong>Required:</strong> {(!importingSession?.variance_mode || importingSession?.variance_mode === 'bin-wise') ? 'Location, Barcode, Qty' : 'Barcode, Qty'}
              </p>
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
