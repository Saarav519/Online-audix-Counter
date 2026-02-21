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
  Trash2
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

  const getClientName = (clientId) => {
    const client = clients.find(c => c.id === clientId);
    return client ? client.name : 'Unknown';
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
                          Stock Imported
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex gap-2 flex-wrap">
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
            <DialogTitle>Import Master / Expected Stock</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Upload CSV for: <strong>{importingSession?.name}</strong>
              {importingSession?.variance_mode && (
                <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  {importingSession.variance_mode === 'bin-wise' ? 'Bin-wise' : 
                   importingSession.variance_mode === 'barcode-wise' ? 'Barcode-wise' : 'Article-wise'}
                </span>
              )}
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">CSV Format:</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const mode = importingSession?.variance_mode || 'bin-wise';
                    let sampleCSV = '';
                    let filename = '';
                    
                    if (mode === 'bin-wise') {
                      sampleCSV = `Location,Barcode,Description,Category,MRP,Cost,Qty
Bin-A01,8901234567890,Rice 5kg,Grocery,280,250,100
Bin-A01,8901234567891,Oil 1L,Grocery,180,150,50
Bin-A02,8901234567892,Sugar 1kg,Grocery,55,45,75
Warehouse-B,8901234567893,Flour 10kg,Grocery,520,480,200
Cold-Storage,8901234567895,Butter 500g,Dairy,280,240,80`;
                      filename = 'sample_binwise_stock.csv';
                    } else if (mode === 'barcode-wise') {
                      sampleCSV = `Barcode,Description,Category,MRP,Cost,Qty
8901234567890,Rice 5kg,Grocery,280,250,100
8901234567891,Oil 1L,Grocery,180,150,50
8901234567892,Sugar 1kg,Grocery,55,45,75
8901234567893,Flour 10kg,Grocery,520,480,200
8901234567895,Butter 500g,Dairy,280,240,0`;
                      filename = 'sample_barcodewise_stock.csv';
                    } else {
                      sampleCSV = `Article_Code,Article_Name,Barcode,Description,Category,MRP,Cost,Qty
ART001,Red T-Shirt,8901234567890,Red T-Shirt Size M,Clothing,499,250,10
ART001,Red T-Shirt,8901234567891,Red T-Shirt Size L,Clothing,499,250,8
ART002,Blue Jeans,8901234567892,Blue Jeans 32,Bottoms,999,500,5
ART003,White Shirt,8901234567893,White Shirt XL,Clothing,699,350,0`;
                      filename = 'sample_articlewise_stock.csv';
                    }
                    
                    const blob = new Blob([sampleCSV], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success('Sample file downloaded!');
                  }}
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-1" />
                  Download Sample
                </Button>
              </div>
              <code className="text-xs text-gray-600 block bg-white p-2 rounded border">
                {(!importingSession?.variance_mode || importingSession?.variance_mode === 'bin-wise') && 'Location, Barcode, Description, Category, MRP, Cost, Qty'}
                {importingSession?.variance_mode === 'barcode-wise' && 'Barcode, Description, Category, MRP, Cost, Qty'}
                {importingSession?.variance_mode === 'article-wise' && 'Article_Code, Article_Name, Barcode, Description, Category, MRP, Cost, Qty'}
              </code>
              <p className="text-xs text-gray-500 mt-2">
                {(!importingSession?.variance_mode || importingSession?.variance_mode === 'bin-wise') && 'Include all items per location/bin. Items not in master will be flagged as extra.'}
                {importingSession?.variance_mode === 'barcode-wise' && 'One row per barcode. Qty=0 for items in master but not in stock.'}
                {importingSession?.variance_mode === 'article-wise' && 'Multiple barcodes per article. Qty=0 for items in master but not in stock.'}
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
