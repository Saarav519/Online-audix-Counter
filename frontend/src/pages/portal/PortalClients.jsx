import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  Building2, 
  Edit, 
  Trash2,
  Phone,
  User,
  Upload,
  Package,
  FileSpreadsheet,
  X,
  CheckCircle,
  AlertCircle,
  Download,
  Settings,
  GripVertical,
  ToggleLeft,
  ToggleRight,
  Eye,
  MapPin
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

export default function PortalClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    client_type: 'store',
    address: '',
    contact_person: '',
    contact_phone: ''
  });

  // Master upload state
  const [showMasterDialog, setShowMasterDialog] = useState(false);
  const [masterClient, setMasterClient] = useState(null);
  const [masterSchemaFields, setMasterSchemaFields] = useState([]);
  const [masterSchemaLoading, setMasterSchemaLoading] = useState(false);
  const [masterStats, setMasterStats] = useState(null);
  const [masterUploading, setMasterUploading] = useState(false);
  const [showMasterViewDialog, setShowMasterViewDialog] = useState(false);
  const [masterProducts, setMasterProducts] = useState([]);
  const [masterProductsTotal, setMasterProductsTotal] = useState(0);
  const [masterViewLoading, setMasterViewLoading] = useState(false);
  const masterFileRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadPhase, setUploadPhase] = useState(''); // 'uploading' | 'processing' | ''

  // Schema Builder state
  const [showSchemaDialog, setShowSchemaDialog] = useState(false);
  const [schemaClient, setSchemaClient] = useState(null);
  const [schemaFields, setSchemaFields] = useState([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [masterExtraColumns, setMasterExtraColumns] = useState([]);
  const [masterViewSchemaFields, setMasterViewSchemaFields] = useState(null); // schema fields for master view table

  // Stock upload state (warehouse clients)
  const [showStockDialog, setShowStockDialog] = useState(false);
  const [stockClient, setStockClient] = useState(null);
  const [stockSchemaFields, setStockSchemaFields] = useState([]);
  const [stockSchemaLoading, setStockSchemaLoading] = useState(false);
  const [stockUploading, setStockUploading] = useState(false);
  const [showStockViewDialog, setShowStockViewDialog] = useState(false);
  const [stockRecords, setStockRecords] = useState([]);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockViewLoading, setStockViewLoading] = useState(false);
  const [stockExtraColumns, setStockExtraColumns] = useState([]);
  const stockFileRef = useRef(null);

  // Location Master state
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  const [locationClient, setLocationClient] = useState(null);
  const [locationStats, setLocationStats] = useState(null);
  const [locationUploading, setLocationUploading] = useState(false);
  const [showLocationViewDialog, setShowLocationViewDialog] = useState(false);
  const [locationRecords, setLocationRecords] = useState([]);
  const [locationTotal, setLocationTotal] = useState(0);
  const [locationViewLoading, setLocationViewLoading] = useState(false);
  const locationFileRef = useRef(null);

  const fetchClients = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/clients`);
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.code) {
      toast.error('Name and Code are required');
      return;
    }

    try {
      const url = editingClient
        ? `${BACKEND_URL}/api/audit/portal/clients/${editingClient.id}`
        : `${BACKEND_URL}/api/audit/portal/clients`;
      
      const response = await fetch(url, {
        method: editingClient ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Operation failed');
      }

      toast.success(editingClient ? 'Client updated!' : 'Client created!');
      setShowDialog(false);
      setEditingClient(null);
      setFormData({ name: '', code: '', client_type: 'store', address: '', contact_person: '', contact_phone: '' });
      fetchClients();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleEdit = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name,
      code: client.code,
      client_type: client.client_type || 'store',
      address: client.address || '',
      contact_person: client.contact_person || '',
      contact_phone: client.contact_phone || ''
    });
    setShowDialog(true);
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('Are you sure you want to delete this client? This will also delete all master products.')) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${clientId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete');

      toast.success('Client deleted!');
      fetchClients();
    } catch (error) {
      toast.error(error.message);
    }
  };

  // ========== SCHEMA BUILDER FUNCTIONS ==========
  
  const openSchemaBuilder = async (client) => {
    setSchemaClient(client);
    setSchemaLoading(true);
    setShowSchemaDialog(true);
    setNewFieldName('');
    setNewFieldType('text');
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/schema`);
      if (res.ok) {
        const data = await res.json();
        setSchemaFields(data.fields || []);
      }
    } catch (err) {
      toast.error('Failed to load schema');
    } finally {
      setSchemaLoading(false);
    }
  };
  
  const toggleField = (index) => {
    setSchemaFields(prev => prev.map((f, i) => i === index ? { ...f, enabled: !f.enabled } : f));
  };
  
  const addCustomField = () => {
    const name = newFieldName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name) return;
    if (schemaFields.some(f => f.name === name)) {
      toast.error('Field already exists');
      return;
    }
    setSchemaFields(prev => [...prev, {
      name, label: newFieldName.trim(), type: newFieldType, required: false, is_standard: false, enabled: true
    }]);
    setNewFieldName('');
    setNewFieldType('text');
  };
  
  const removeCustomField = (index) => {
    const field = schemaFields[index];
    if (field.is_standard) return;
    setSchemaFields(prev => prev.filter((_, i) => i !== index));
  };
  
  const saveSchema = async () => {
    setSchemaSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${schemaClient.id}/schema`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: schemaFields })
      });
      if (!res.ok) throw new Error('Failed to save');
      toast.success('Schema saved successfully');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSchemaSaving(false);
    }
  };
  
  const downloadSchemaTemplate = async (templateType = 'master') => {
    if (!schemaClient) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${schemaClient.id}/schema/template?template_type=${templateType}`);
      if (!res.ok) throw new Error('Failed to download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${templateType}_template_${schemaClient.code}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${templateType} template downloaded!`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ========== MASTER PRODUCT FUNCTIONS ==========

  // ========== STOCK FUNCTIONS (WAREHOUSE) ==========
  
  const openStockUpload = async (client) => {
    setStockClient(client);
    setShowStockDialog(true);
    setStockSchemaFields([]);
    setStockSchemaLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/schema`);
      if (res.ok) {
        const data = await res.json();
        const enabledFields = (data.fields || []).filter(f => f.enabled);
        setStockSchemaFields(enabledFields);
      }
    } catch (err) {
      console.error('Failed to fetch schema for stock:', err);
    } finally {
      setStockSchemaLoading(false);
    }
  };

  const handleStockUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !stockClient) return;

    const fd = new FormData();
    fd.append('file', file);
    setStockUploading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${stockClient.id}/import-stock`, {
        method: 'POST',
        body: fd
      });
      if (!res.ok) {
        let msg = 'Import failed';
        try { const data = await res.json(); msg = data.detail || msg; } catch (_) {}
        throw new Error(msg);
      }
      const result = await res.json();
      toast.success(result.message);
      setShowStockDialog(false);
      setStockClient(null);
      fetchClients();
    } catch (err) {
      const msg = typeof err?.message === 'string' ? err.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setStockUploading(false);
      if (stockFileRef.current) stockFileRef.current.value = '';
    }
  };

  const openStockView = async (client) => {
    setStockClient(client);
    setStockViewLoading(true);
    setShowStockViewDialog(true);
    setStockRecords([]);
    setStockExtraColumns([]);

    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/stock?limit=200`);
      if (res.ok) {
        const data = await res.json();
        setStockRecords(data.records);
        setStockTotal(data.total);
        setStockExtraColumns(data.extra_columns || []);
      }
    } catch (err) {
      console.error('Failed to fetch stock:', err);
    } finally {
      setStockViewLoading(false);
    }
  };

  const downloadStockTemplate = async (client) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/schema/template?template_type=stock`);
      if (!res.ok) throw new Error('Failed to download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock_template_${client.code}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Stock template downloaded!');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const openMasterUpload = async (client) => {
    setMasterClient(client);
    setMasterStats(null);
    setShowMasterDialog(true);
    setMasterSchemaFields([]);
    setMasterSchemaLoading(true);

    // Fetch stats and schema in parallel
    try {
      const [statsRes, schemaRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/master-products/stats`),
        fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/schema`)
      ]);
      if (statsRes.ok) {
        setMasterStats(await statsRes.json());
      }
      if (schemaRes.ok) {
        const schemaData = await schemaRes.json();
        const enabledFields = (schemaData.fields || []).filter(f => f.enabled);
        setMasterSchemaFields(enabledFields);
      }
    } catch (err) {
      console.error('Failed to fetch master stats/schema:', err);
    } finally {
      setMasterSchemaLoading(false);
    }
  };

  const handleMasterUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setMasterUploading(true);
    setUploadProgress(0);
    setUploadPhase('uploading');
    const fd = new FormData();
    fd.append('file', file);

    try {
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${BACKEND_URL}/api/audit/portal/clients/${masterClient.id}/import-master`);
        
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(pct);
            if (pct >= 100) setUploadPhase('processing');
          }
        };
        
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); } catch (_) { reject(new Error('Invalid response')); }
          } else {
            let msg = 'Import failed';
            try { msg = JSON.parse(xhr.responseText).detail || msg; } catch (_) {}
            reject(new Error(msg));
          }
        };
        
        xhr.onerror = () => reject(new Error('Upload failed - network error'));
        xhr.send(fd);
      });

      toast.success(result.message);
      try {
        const statsRes = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${masterClient.id}/master-products/stats`);
        if (statsRes.ok) setMasterStats(await statsRes.json());
      } catch (_) {}
      fetchClients();
    } catch (error) {
      const msg = typeof error?.message === 'string' ? error.message : 'Upload failed';
      toast.error(msg);
    } finally {
      setMasterUploading(false);
      setUploadProgress(0);
      setUploadPhase('');
      if (masterFileRef.current) masterFileRef.current.value = '';
    }
  };

  const handleClearMaster = async () => {
    if (!window.confirm(`Clear ALL master products for ${masterClient.name}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${masterClient.id}/master-products`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to clear');
      const result = await res.json();
      toast.success(result.message);
      setMasterStats({ total_products: 0, unique_categories: 0, categories: [], unique_articles: 0 });
      fetchClients();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const openMasterView = async (client) => {
    setMasterClient(client);
    setMasterViewLoading(true);
    setShowMasterViewDialog(true);
    setMasterProducts([]);
    setMasterExtraColumns([]);
    setMasterViewSchemaFields(null);

    try {
      const [res, schemaRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/master-products?limit=200`),
        fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/schema`)
      ]);
      if (res.ok) {
        const data = await res.json();
        setMasterProducts(data.products);
        setMasterProductsTotal(data.total);
        setMasterExtraColumns(data.extra_columns || []);
      }
      if (schemaRes.ok) {
        const schemaData = await schemaRes.json();
        const enabledFields = (schemaData.fields || []).filter(f => f.enabled);
        setMasterViewSchemaFields(enabledFields);
      }
    } catch (err) {
      console.error('Failed to fetch master products:', err);
    } finally {
      setMasterViewLoading(false);
    }
  };

  const downloadSampleMasterCSV = async () => {
    if (!masterClient) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${masterClient.id}/schema/template?template_type=master`);
      if (!res.ok) throw new Error('Failed to download');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `master_template_${masterClient.code}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Template downloaded!');
    } catch (err) {
      toast.error('Failed to download template');
    }
  };

  // ==================== LOCATION MASTER FUNCTIONS ====================
  const openLocationUpload = async (client) => {
    setLocationClient(client);
    setShowLocationDialog(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/location-master/stats`);
      if (res.ok) setLocationStats(await res.json());
      else setLocationStats(null);
    } catch { setLocationStats(null); }
  };

  const handleLocationUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !locationClient) return;
    setLocationUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${locationClient.id}/import-location-master`, {
        method: 'POST', body: formData
      });
      const text = await res.text();
      const data = JSON.parse(text);
      if (res.ok) {
        toast.success(data.message);
        fetchClients();
        const statsRes = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${locationClient.id}/location-master/stats`);
        if (statsRes.ok) setLocationStats(await statsRes.json());
      } else {
        toast.error(data.detail || 'Upload failed');
      }
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setLocationUploading(false);
      if (locationFileRef.current) locationFileRef.current.value = '';
    }
  };

  const handleClearLocations = async () => {
    if (!locationClient || !window.confirm('Clear all locations for this client?')) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${locationClient.id}/location-master`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Locations cleared');
        setLocationStats(null);
        fetchClients();
      }
    } catch { toast.error('Failed to clear locations'); }
  };

  const openLocationView = async (client) => {
    setLocationClient(client);
    setShowLocationViewDialog(true);
    setLocationViewLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit/portal/clients/${client.id}/location-master?limit=500`);
      if (res.ok) {
        const data = await res.json();
        setLocationRecords(data.locations || []);
        setLocationTotal(data.total || 0);
      }
    } catch { toast.error('Failed to load locations'); }
    finally { setLocationViewLoading(false); }
  };

  const downloadLocationTemplate = () => {
    const csv = 'Location Code,Location Name,Zone,Floor,Area,Type\nLOC-A1,Aisle A Rack 1,Zone-A,Ground,Front,Rack\nLOC-B2,Aisle B Rack 2,Zone-B,First,Back,Shelf';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `location_template_${locationClient?.code || 'client'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Location template downloaded!');
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    client.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-gray-500">Manage your client companies</p>
        </div>
        <Button 
          onClick={() => {
            setEditingClient(null);
            setFormData({ name: '', code: '', client_type: 'store', address: '', contact_person: '', contact_phone: '' });
            setShowDialog(true);
          }}
          className="bg-emerald-500 hover:bg-emerald-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search clients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Client Cards */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-12">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">No clients found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => (
            <div
              key={client.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{client.name}</h3>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500">Code: {client.code}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        client.client_type === 'warehouse' 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-teal-100 text-teal-700'
                      }`} data-testid={`client-type-badge-${client.code}`}>
                        {client.client_type === 'warehouse' ? 'Warehouse' : 'Store'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(client)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(client.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {client.address && (
                <p className="text-sm text-gray-600 mb-2">{client.address}</p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                {client.contact_person && (
                  <div className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {client.contact_person}
                  </div>
                )}
                {client.contact_phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-4 h-4" />
                    {client.contact_phone}
                  </div>
                )}
              </div>

              {/* Master Products Status */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center flex-wrap gap-2 mb-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    client.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {client.is_active ? 'Active' : 'Inactive'}
                  </span>
                  {client.master_imported ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Master: {client.master_product_count || 0} products
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      No Master
                    </span>
                  )}
                  {client.client_type === 'warehouse' && (
                    client.stock_imported ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Stock: {client.stock_record_count || 0} records
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        No Stock
                      </span>
                    )
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 border-purple-200 text-xs"
                    onClick={() => openSchemaBuilder(client)}
                    data-testid={`schema-btn-${client.code}`}
                  >
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    Schema
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 text-xs"
                    onClick={() => openMasterUpload(client)}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Upload Master
                  </Button>
                  {client.master_imported && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gray-600 hover:text-gray-700 text-xs"
                      onClick={() => openMasterView(client)}
                    >
                      <Package className="w-3.5 h-3.5 mr-1" />
                      View Master
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200 text-xs"
                    onClick={() => openLocationUpload(client)}
                    data-testid={`upload-location-btn-${client.code}`}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Location Master
                  </Button>
                  {client.location_master_imported && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gray-600 hover:text-gray-700 text-xs"
                      onClick={() => openLocationView(client)}
                      data-testid={`view-location-btn-${client.code}`}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      View Locations ({client.location_count || 0})
                    </Button>
                  )}
                </div>
                {/* Warehouse: Stock Upload/View */}
                {client.client_type === 'warehouse' && (
                  <div className="flex gap-2 mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 flex-1"
                      onClick={() => openStockUpload(client)}
                      data-testid={`upload-stock-btn-${client.code}`}
                    >
                      <Upload className="w-3.5 h-3.5 mr-1" />
                      Upload Stock
                    </Button>
                    {client.stock_imported && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-gray-600 hover:text-gray-700 flex-1"
                        onClick={() => openStockView(client)}
                        data-testid={`view-stock-btn-${client.code}`}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        View Stock
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Client Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingClient ? 'Edit Client' : 'Add New Client'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Client Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ABC Retail Pvt Ltd"
              />
            </div>
            <div>
              <Label htmlFor="code">Client Code *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="ABC"
                disabled={!!editingClient}
              />
            </div>
            <div>
              <Label htmlFor="client_type">Client Type *</Label>
              <select
                id="client_type"
                value={formData.client_type}
                onChange={(e) => setFormData({ ...formData, client_type: e.target.value })}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                disabled={!!editingClient}
                data-testid="client-type-select"
              >
                <option value="store">Store — Stock uploaded per session</option>
                <option value="warehouse">Warehouse — Stock uploaded once, shared across sessions</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {formData.client_type === 'warehouse' 
                  ? 'Stock is uploaded at client level. Sessions auto-import a snapshot on creation.'
                  : 'Stock is uploaded individually inside each session.'}
              </p>
            </div>
            <div>
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Business Street, City"
              />
            </div>
            <div>
              <Label htmlFor="contact_person">Contact Person</Label>
              <Input
                id="contact_person"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div>
              <Label htmlFor="contact_phone">Contact Phone</Label>
              <Input
                id="contact_phone"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="+91 9876543210"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-500 hover:bg-emerald-600">
                {editingClient ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upload Master Products Dialog */}
      <Dialog open={showMasterDialog} onOpenChange={setShowMasterDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Master Products — {masterClient?.name}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Current Stats */}
            {masterStats && (
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Current Master Data</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{masterStats.total_products}</p>
                    <p className="text-xs text-blue-600">Products</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{masterStats.unique_categories}</p>
                    <p className="text-xs text-blue-600">Categories</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{masterStats.unique_articles}</p>
                    <p className="text-xs text-blue-600">Articles</p>
                  </div>
                </div>
                {masterStats.categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 items-center">
                    {masterStats.categories.slice(0, 5).map(cat => (
                      <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{cat}</span>
                    ))}
                    {masterStats.categories.length > 5 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">+{masterStats.categories.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">CSV Template:</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={downloadSampleMasterCSV}
                    className="text-blue-600 hover:text-blue-700"
                    data-testid="download-master-template-btn"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download Template
                  </Button>
                </div>
              </div>

              {/* Dynamic Schema Columns Display */}
              {masterSchemaLoading ? (
                <p className="text-xs text-gray-400 mt-2">Loading schema...</p>
              ) : masterSchemaFields.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Expected Columns (from Schema):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {masterSchemaFields.map(f => (
                      <span key={f.name} className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.required ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}`}>
                        {f.label || f.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        {f.required && ' *'}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    * = required. Use the Schema button on the client card to configure fields.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Download the template to see the exact columns configured for this client's schema.
                  Use the Schema button on the client card to configure fields.
                </p>
              )}
            </div>

            {/* Upload Area */}
            <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 text-center bg-blue-50/30">
              {masterUploading ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent"></div>
                    <p className="text-sm font-medium text-blue-700">
                      {uploadPhase === 'uploading' ? `Uploading... ${uploadProgress}%` : 'Processing records...'}
                    </p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${uploadPhase === 'processing' ? 'bg-amber-500 animate-pulse w-full' : 'bg-blue-600'}`}
                      style={uploadPhase === 'uploading' ? { width: `${uploadProgress}%` } : {}}
                    ></div>
                  </div>
                  <p className="text-xs text-gray-500">
                    {uploadPhase === 'processing' ? 'File uploaded, server is importing records...' : 'Uploading file to server...'}
                  </p>
                </div>
              ) : (
                <>
                  <Package className="w-10 h-10 mx-auto mb-3 text-blue-400" />
                  <p className="text-sm text-gray-600 mb-3">Select your master product catalog CSV</p>
                  <input
                    ref={masterFileRef}
                    type="file"
                    accept=".csv"
                    onChange={handleMasterUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => masterFileRef.current?.click()}
                    className="border-blue-300 text-blue-600 hover:bg-blue-50"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Select CSV File
                  </Button>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-between">
              {masterStats && masterStats.total_products > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClearMaster}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Clear Master
                </Button>
              )}
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={() => setShowMasterDialog(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Master Products Dialog */}
      <Dialog open={showMasterViewDialog} onOpenChange={setShowMasterViewDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-600" />
                Master Products — {masterClient?.name}
                <span className="text-sm font-normal text-gray-500">
                  ({masterProductsTotal} total)
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            {masterViewLoading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : masterProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No master products found</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">#</th>
                    {(!masterViewSchemaFields || masterViewSchemaFields.some(f => f.name === 'barcode')) && (
                      <th className="text-left p-2 font-medium text-gray-600">Barcode</th>
                    )}
                    {(!masterViewSchemaFields || masterViewSchemaFields.some(f => f.name === 'description')) && (
                      <th className="text-left p-2 font-medium text-gray-600">Description</th>
                    )}
                    {(!masterViewSchemaFields || masterViewSchemaFields.some(f => f.name === 'category')) && (
                      <th className="text-left p-2 font-medium text-gray-600">Category</th>
                    )}
                    {masterViewSchemaFields && masterViewSchemaFields.some(f => f.name === 'mrp') && (
                      <th className="text-right p-2 font-medium text-gray-600">MRP</th>
                    )}
                    {(!masterViewSchemaFields) && (
                      <th className="text-right p-2 font-medium text-gray-600">MRP</th>
                    )}
                    {masterViewSchemaFields && masterViewSchemaFields.some(f => f.name === 'cost') && (
                      <th className="text-right p-2 font-medium text-gray-600">Cost</th>
                    )}
                    {(!masterViewSchemaFields) && (
                      <th className="text-right p-2 font-medium text-gray-600">Cost</th>
                    )}
                    {masterViewSchemaFields && masterViewSchemaFields.some(f => f.name === 'article_code') && (
                      <th className="text-left p-2 font-medium text-gray-600">Article Code</th>
                    )}
                    {masterViewSchemaFields && masterViewSchemaFields.some(f => f.name === 'article_name') && (
                      <th className="text-left p-2 font-medium text-gray-600">Article Name</th>
                    )}
                    {masterExtraColumns.map(col => (
                      <th key={col.name} className="text-left p-2 font-medium text-purple-600">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {masterProducts.map((product, idx) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="p-2 text-gray-400">{idx + 1}</td>
                      {(!masterViewSchemaFields || masterViewSchemaFields.some(f => f.name === 'barcode')) && (
                        <td className="p-2 font-mono text-xs">{product.barcode}</td>
                      )}
                      {(!masterViewSchemaFields || masterViewSchemaFields.some(f => f.name === 'description')) && (
                        <td className="p-2">{product.description}</td>
                      )}
                      {(!masterViewSchemaFields || masterViewSchemaFields.some(f => f.name === 'category')) && (
                        <td className="p-2">
                          {product.category && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{product.category}</span>
                          )}
                        </td>
                      )}
                      {(masterViewSchemaFields ? masterViewSchemaFields.some(f => f.name === 'mrp') : true) && (
                        <td className="p-2 text-right">{product.mrp > 0 ? product.mrp.toFixed(2) : '-'}</td>
                      )}
                      {(masterViewSchemaFields ? masterViewSchemaFields.some(f => f.name === 'cost') : true) && (
                        <td className="p-2 text-right">{product.cost > 0 ? product.cost.toFixed(2) : '-'}</td>
                      )}
                      {masterViewSchemaFields && masterViewSchemaFields.some(f => f.name === 'article_code') && (
                        <td className="p-2 text-xs">{product.article_code || '-'}</td>
                      )}
                      {masterViewSchemaFields && masterViewSchemaFields.some(f => f.name === 'article_name') && (
                        <td className="p-2 text-xs">{product.article_name || '-'}</td>
                      )}
                      {masterExtraColumns.map(col => (
                        <td key={col.name} className="p-2 text-xs text-purple-700">{product.custom_fields?.[col.name] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {masterProductsTotal > 200 && (
              <p className="text-center text-xs text-gray-500 py-2">
                Showing first 200 of {masterProductsTotal} products
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Schema Builder Dialog */}

      {/* Location Master Upload Dialog */}
      <Dialog open={showLocationDialog} onOpenChange={setShowLocationDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                Location Master — {locationClient?.name}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {locationStats && locationStats.total_locations > 0 && (
              <div className="bg-orange-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-orange-900 mb-2">Current Location Data</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-700">{locationStats.total_locations}</p>
                    <p className="text-xs text-orange-600">Locations</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-700">{locationStats.unique_zones}</p>
                    <p className="text-xs text-orange-600">Zones</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-700">{locationStats.unique_floors}</p>
                    <p className="text-xs text-orange-600">Floors</p>
                  </div>
                </div>
                {locationStats.zones.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1 items-center">
                    {locationStats.zones.slice(0, 8).map(z => (
                      <span key={z} className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">{z}</span>
                    ))}
                    {locationStats.zones.length > 8 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">+{locationStats.zones.length - 8} more</span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">CSV Template:</p>
                <Button type="button" variant="outline" size="sm" onClick={downloadLocationTemplate} className="text-orange-600 hover:text-orange-700" data-testid="download-location-template-btn">
                  <Download className="w-4 h-4 mr-1" /> Download Template
                </Button>
              </div>
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-600 mb-1.5">Expected Columns:</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Location Code *', 'Location Name', 'Zone', 'Floor', 'Area', 'Type'].map(f => (
                    <span key={f} className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.includes('*') ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}`}>{f}</span>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">* = required. Location Code must be unique per row.</p>
              </div>
            </div>

            <div className="border-2 border-dashed border-orange-200 rounded-lg p-6 text-center bg-orange-50/30">
              {locationUploading ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-orange-500 border-t-transparent"></div>
                    <p className="text-sm font-medium text-orange-700">Uploading & Processing...</p>
                  </div>
                </div>
              ) : (
                <>
                  <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 text-orange-400" />
                  <p className="text-sm text-gray-600 mb-3">Select your location master CSV</p>
                  <input ref={locationFileRef} type="file" accept=".csv" onChange={handleLocationUpload} className="hidden" />
                  <Button type="button" variant="outline" onClick={() => locationFileRef.current?.click()} className="border-orange-300 text-orange-600 hover:bg-orange-50" data-testid="select-location-csv-btn">
                    <Upload className="w-4 h-4 mr-2" /> Select CSV File
                  </Button>
                </>
              )}
            </div>

            <div className="flex gap-2 justify-between">
              {locationStats && locationStats.total_locations > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={handleClearLocations} className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                  <Trash2 className="w-4 h-4 mr-1" /> Clear Locations
                </Button>
              )}
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={() => setShowLocationDialog(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Locations Dialog */}
      <Dialog open={showLocationViewDialog} onOpenChange={setShowLocationViewDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-orange-600" />
                Location Master — {locationClient?.name}
                <span className="text-sm font-normal text-gray-500">({locationTotal} total)</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh] border rounded-lg">
            {locationViewLoading ? (
              <div className="text-center py-8 text-gray-500">Loading locations...</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Location Code</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Location Name</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Zone</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Floor</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Area</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {locationRecords.map((loc, i) => (
                    <tr key={loc.id || i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-1.5 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono font-medium">{loc.location_code}</td>
                      <td className="px-3 py-1.5">{loc.location_name}</td>
                      <td className="px-3 py-1.5">{loc.zone || '-'}</td>
                      <td className="px-3 py-1.5">{loc.floor || '-'}</td>
                      <td className="px-3 py-1.5">{loc.area || '-'}</td>
                      <td className="px-3 py-1.5">{loc.location_type || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {locationTotal > 500 && <p className="text-xs text-gray-400 mt-2">Showing first 500 of {locationTotal} locations</p>}
        </DialogContent>
      </Dialog>

      {/* Schema Builder Dialog (existing) */}
      <Dialog open={showSchemaDialog} onOpenChange={setShowSchemaDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" data-testid="schema-builder-dialog">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-purple-600" />
                Schema Builder — {schemaClient?.name}
              </div>
            </DialogTitle>
            <p className="text-xs text-gray-500 mt-1">
              Configure which fields are included in master/stock uploads and reports.
            </p>
          </DialogHeader>
          {schemaLoading ? (
            <div className="text-center py-8 text-gray-500">Loading schema...</div>
          ) : (
            <div className="flex flex-col flex-1 overflow-hidden gap-4 pt-2">
              {/* Field List - Scrollable */}
              <div className="border rounded-lg flex-1 overflow-y-auto min-h-0">
                {schemaFields.map((field, idx) => (
                  <div key={field.name} className={`flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 ${field.enabled ? 'bg-white' : 'bg-gray-50 opacity-60'}`} data-testid={`schema-field-${field.name}`}>
                    <button onClick={() => toggleField(idx)} className="flex-shrink-0" data-testid={`toggle-field-${field.name}`}>
                      {field.enabled ? (
                        <ToggleRight className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{field.label}</span>
                      <span className="ml-2 text-xs text-gray-400 font-mono">({field.name})</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded ${field.type === 'number' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {field.type}
                      </span>
                      {field.required && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">req</span>
                      )}
                      {!field.is_standard && (
                        <button onClick={() => removeCustomField(idx)} className="text-red-400 hover:text-red-600 ml-1" data-testid={`remove-field-${field.name}`}>
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Custom Field */}
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs font-medium text-purple-900 mb-2">Add Custom Field</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Input
                      value={newFieldName}
                      onChange={e => setNewFieldName(e.target.value)}
                      placeholder="e.g. Brand, Supplier Code"
                      className="h-8 text-sm"
                      data-testid="new-field-name-input"
                      onKeyDown={e => e.key === 'Enter' && addCustomField()}
                    />
                  </div>
                  <select
                    value={newFieldType}
                    onChange={e => setNewFieldType(e.target.value)}
                    className="h-8 px-2 rounded-md border border-gray-200 text-sm bg-white w-24"
                    data-testid="new-field-type-select"
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addCustomField}
                    className="bg-purple-600 hover:bg-purple-700 h-8 px-3"
                    data-testid="add-custom-field-btn"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Footer: Templates + Actions */}
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => downloadSchemaTemplate('master')} className="text-blue-600 h-8 text-xs" data-testid="download-master-template-schema">
                    <Download className="w-3.5 h-3.5 mr-1" /> Master Template
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => downloadSchemaTemplate('stock')} className="text-emerald-600 h-8 text-xs" data-testid="download-stock-template-schema">
                    <Download className="w-3.5 h-3.5 mr-1" /> Stock Template
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowSchemaDialog(false)} className="h-8">
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveSchema}
                    disabled={schemaSaving}
                    className="bg-purple-600 hover:bg-purple-700 h-8"
                    data-testid="save-schema-btn"
                  >
                    {schemaSaving ? 'Saving...' : 'Save Schema'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Stock Dialog (Warehouse) */}
      <Dialog open={showStockDialog} onOpenChange={setShowStockDialog}>
        <DialogContent className="max-w-lg" data-testid="stock-upload-dialog">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Upload Stock — {stockClient?.name}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-xs text-emerald-800">
                <strong>Warehouse Mode:</strong> Stock uploaded here is shared across all sessions. 
                When a new session is created, this stock data is <strong>automatically snapshot</strong> into it.
                Re-uploading stock only affects <strong>future</strong> sessions.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">CSV Template:</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => stockClient && downloadStockTemplate(stockClient)}
                  className="text-emerald-600 hover:text-emerald-700"
                  data-testid="download-stock-template-btn"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download Template
                </Button>
              </div>

              {/* Dynamic Schema Columns Display */}
              {stockSchemaLoading ? (
                <p className="text-xs text-gray-400 mt-2">Loading schema...</p>
              ) : stockSchemaFields.length > 0 ? (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Expected Columns (from Schema):</p>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Location</span>
                    {stockSchemaFields.map(f => (
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
                <p className="text-xs text-gray-500">
                  Download the template to see the exact columns configured for this client's schema.
                </p>
              )}
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p className="text-sm text-gray-600 mb-4">
                {stockUploading ? 'Uploading...' : 'Select your stock CSV file'}
              </p>
              <input
                ref={stockFileRef}
                type="file"
                accept=".csv"
                onChange={handleStockUpload}
                className="hidden"
                disabled={stockUploading}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => stockFileRef.current?.click()}
                disabled={stockUploading}
                data-testid="select-stock-file-btn"
              >
                <Upload className="w-4 h-4 mr-2" />
                {stockUploading ? 'Uploading...' : 'Select CSV File'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Stock Dialog (Warehouse) */}
      <Dialog open={showStockViewDialog} onOpenChange={setShowStockViewDialog}>
        <DialogContent className="max-w-5xl max-h-[85vh]" data-testid="stock-view-dialog">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  Warehouse Stock — {stockClient?.name}
                </div>
                <span className="text-sm font-normal text-gray-500">
                  {stockTotal} total records
                  {stockTotal > 200 && ' (showing first 200)'}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
          {stockViewLoading ? (
            <div className="text-center py-8 text-gray-500">Loading stock data...</div>
          ) : stockRecords.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No stock data found</div>
          ) : (
            <div className="overflow-auto max-h-[60vh] border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-2 font-medium text-gray-600">#</th>
                    <th className="text-left p-2 font-medium text-gray-600">Location</th>
                    <th className="text-left p-2 font-medium text-gray-600">Barcode</th>
                    <th className="text-left p-2 font-medium text-gray-600">Description</th>
                    <th className="text-left p-2 font-medium text-gray-600">Category</th>
                    <th className="text-right p-2 font-medium text-gray-600">MRP</th>
                    <th className="text-right p-2 font-medium text-gray-600">Cost</th>
                    <th className="text-right p-2 font-medium text-gray-600">Qty</th>
                    {stockExtraColumns.map(col => (
                      <th key={col.name} className="text-left p-2 font-medium text-purple-600">{col.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stockRecords.map((rec, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="p-2 text-gray-400">{idx + 1}</td>
                      <td className="p-2">{rec.location || '-'}</td>
                      <td className="p-2 font-mono text-xs">{rec.barcode}</td>
                      <td className="p-2">{rec.description || '-'}</td>
                      <td className="p-2">
                        {rec.category ? <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{rec.category}</span> : '-'}
                      </td>
                      <td className="p-2 text-right">{rec.mrp > 0 ? rec.mrp.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right">{rec.cost > 0 ? rec.cost.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right font-semibold">{rec.qty}</td>
                      {stockExtraColumns.map(col => (
                        <td key={col.name} className="p-2 text-xs text-purple-700">{rec.custom_fields?.[col.name] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
