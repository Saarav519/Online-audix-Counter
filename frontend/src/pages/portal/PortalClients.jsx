import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Building2, 
  Edit, 
  Trash2,
  Phone,
  User
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
    if (!window.confirm('Are you sure you want to delete this client?')) return;

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

              <div className="mt-4 pt-4 border-t border-gray-100">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  client.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {client.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
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
    </div>
  );
}
