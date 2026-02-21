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
  Download
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
    address: '',
    contact_person: '',
    contact_phone: ''
  });

  // Master upload state
  const [showMasterDialog, setShowMasterDialog] = useState(false);
  const [masterClient, setMasterClient] = useState(null);
  const [masterStats, setMasterStats] = useState(null);
  const [masterUploading, setMasterUploading] = useState(false);
  const [showMasterViewDialog, setShowMasterViewDialog] = useState(false);
  const [masterProducts, setMasterProducts] = useState([]);
  const [masterProductsTotal, setMasterProductsTotal] = useState(0);
  const [masterViewLoading, setMasterViewLoading] = useState(false);
  const masterFileRef = useRef(null);

  const fetchClients = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/clients`);
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
        ? `${BACKEND_URL}/api/portal/clients/${editingClient.id}`
        : `${BACKEND_URL}/api/portal/clients`;
      
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
      setFormData({ name: '', code: '', address: '', contact_person: '', contact_phone: '' });
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
      address: client.address || '',
      contact_person: client.contact_person || '',
      contact_phone: client.contact_phone || ''
    });
    setShowDialog(true);
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('Are you sure you want to delete this client? This will also delete all master products.')) return;

    try {
      const response = await fetch(`${BACKEND_URL}/api/portal/clients/${clientId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Failed to delete');

      toast.success('Client deleted!');
      fetchClients();
    } catch (error) {
      toast.error(error.message);
    }
  };

  // ========== MASTER PRODUCT FUNCTIONS ==========

  const openMasterUpload = async (client) => {
    setMasterClient(client);
    setMasterStats(null);
    setShowMasterDialog(true);

    // Fetch stats
    try {
      const res = await fetch(`${BACKEND_URL}/api/portal/clients/${client.id}/master-products/stats`);
      if (res.ok) {
        setMasterStats(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch master stats:', err);
    }
  };

  const handleMasterUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setMasterUploading(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/portal/clients/${masterClient.id}/import-master`,
        { method: 'POST', body: fd }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Import failed');
      }

      const result = await response.json();
      toast.success(`${result.message}`);

      // Refresh stats
      const statsRes = await fetch(`${BACKEND_URL}/api/portal/clients/${masterClient.id}/master-products/stats`);
      if (statsRes.ok) setMasterStats(await statsRes.json());

      // Refresh clients list
      fetchClients();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setMasterUploading(false);
      if (masterFileRef.current) masterFileRef.current.value = '';
    }
  };

  const handleClearMaster = async () => {
    if (!window.confirm(`Clear ALL master products for ${masterClient.name}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/portal/clients/${masterClient.id}/master-products`, { method: 'DELETE' });
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

    try {
      const res = await fetch(`${BACKEND_URL}/api/portal/clients/${client.id}/master-products?limit=200`);
      if (res.ok) {
        const data = await res.json();
        setMasterProducts(data.products);
        setMasterProductsTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch master products:', err);
    } finally {
      setMasterViewLoading(false);
    }
  };

  const downloadSampleMasterCSV = () => {
    const sampleCSV = `Barcode,Description,Category,MRP,Cost,Article_Code,Article_Name
8901234567890,Rice 5kg,Grocery,280,250,ART001,Rice Products
8901234567891,Oil 1L,Grocery,180,150,ART002,Cooking Oil
8901234567892,Sugar 1kg,Grocery,55,45,ART003,Sugar
8901234567893,Flour 10kg,Grocery,520,480,ART004,Flour Products
8901234567895,Butter 500g,Dairy,280,240,ART005,Dairy Items
8901234567896,Milk 1L,Dairy,65,55,ART006,Dairy Items`;
    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_master_products.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Sample file downloaded!');
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
            setFormData({ name: '', code: '', address: '', contact_person: '', contact_phone: '' });
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
                    <p className="text-sm text-gray-500">Code: {client.code}</p>
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
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
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
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200 flex-1"
                    onClick={() => openMasterUpload(client)}
                  >
                    <Upload className="w-3.5 h-3.5 mr-1" />
                    Upload Master
                  </Button>
                  {client.master_imported && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-gray-600 hover:text-gray-700 flex-1"
                      onClick={() => openMasterView(client)}
                    >
                      <Package className="w-3.5 h-3.5 mr-1" />
                      View Master
                    </Button>
                  )}
                </div>
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
                  <div className="mt-2 flex flex-wrap gap-1">
                    {masterStats.categories.map(cat => (
                      <span key={cat} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{cat}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">CSV Format (Product Catalog):</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadSampleMasterCSV}
                  className="text-blue-600 hover:text-blue-700"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Sample CSV
                </Button>
              </div>
              <code className="text-xs text-gray-600 block bg-white p-2 rounded border">
                Barcode, Description, Category, MRP, Cost, Article_Code, Article_Name
              </code>
              <p className="text-xs text-gray-500 mt-2">
                Upload ALL products in your catalog. Article_Code and Article_Name are optional (used for article-wise variance).
                Re-upload replaces the existing master.
              </p>
            </div>

            {/* Upload Area */}
            <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 text-center bg-blue-50/30">
              <Package className="w-10 h-10 mx-auto mb-3 text-blue-400" />
              <p className="text-sm text-gray-600 mb-3">
                {masterUploading ? 'Uploading...' : 'Select your master product catalog CSV'}
              </p>
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
                disabled={masterUploading}
                className="border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                <Upload className="w-4 h-4 mr-2" />
                {masterUploading ? 'Uploading...' : 'Select CSV File'}
              </Button>
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
                    <th className="text-left p-2 font-medium text-gray-600">Barcode</th>
                    <th className="text-left p-2 font-medium text-gray-600">Description</th>
                    <th className="text-left p-2 font-medium text-gray-600">Category</th>
                    <th className="text-right p-2 font-medium text-gray-600">MRP</th>
                    <th className="text-right p-2 font-medium text-gray-600">Cost</th>
                    <th className="text-left p-2 font-medium text-gray-600">Article Code</th>
                    <th className="text-left p-2 font-medium text-gray-600">Article Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {masterProducts.map((product, idx) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="p-2 text-gray-400">{idx + 1}</td>
                      <td className="p-2 font-mono text-xs">{product.barcode}</td>
                      <td className="p-2">{product.description}</td>
                      <td className="p-2">
                        {product.category && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{product.category}</span>
                        )}
                      </td>
                      <td className="p-2 text-right">{product.mrp > 0 ? product.mrp.toFixed(2) : '-'}</td>
                      <td className="p-2 text-right">{product.cost > 0 ? product.cost.toFixed(2) : '-'}</td>
                      <td className="p-2 text-xs">{product.article_code || '-'}</td>
                      <td className="p-2 text-xs">{product.article_name || '-'}</td>
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
    </div>
  );
}
