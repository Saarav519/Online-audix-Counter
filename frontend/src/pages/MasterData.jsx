import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  Package,
  Plus,
  Search,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Users,
  Trash2,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';

const MasterData = () => {
  const { masterProducts, addMasterProduct, importMasterProducts, importAuthorizationUsers, getAuthorizationUsers } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUserImportModal, setShowUserImportModal] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [userImportResult, setUserImportResult] = useState(null);
  const [newProduct, setNewProduct] = useState({
    barcode: '',
    name: '',
    sku: '',
    category: '',
    price: ''
  });
  const fileInputRef = useRef(null);
  const userFileInputRef = useRef(null);

  const filteredProducts = masterProducts.filter(
    p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.includes(searchTerm) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const authorizationUsers = getAuthorizationUsers();

  const handleAddProduct = () => {
    if (newProduct.barcode && newProduct.name) {
      addMasterProduct({
        ...newProduct,
        price: parseFloat(newProduct.price) || 0
      });
      setNewProduct({ barcode: '', name: '', sku: '', category: '', price: '' });
      setShowAddModal(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        // Skip header row
        const dataLines = lines.slice(1);
        const products = dataLines.map(line => {
          const [barcode, name, sku, category, price] = line.split(',').map(s => s.trim().replace(/"/g, ''));
          return {
            barcode,
            name,
            sku: sku || '',
            category: category || 'Uncategorized',
            price: parseFloat(price) || 0
          };
        }).filter(p => p.barcode && p.name);

        if (products.length === 0) {
          setImportResult({ success: false, error: 'No valid products found in CSV file' });
          return;
        }

        // Replace existing master data
        const count = importMasterProducts(products, true);
        setImportResult({ success: true, count, replaced: true });
      } catch (error) {
        setImportResult({ success: false, error: 'Failed to parse CSV file' });
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUserFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        // Skip header row
        const dataLines = lines.slice(1);
        const users = dataLines.map(line => {
          const parts = line.split(',').map(s => s.trim().replace(/"/g, ''));
          return {
            userId: parts[0],
            password: parts[1],
            name: parts[2] || parts[0],
            role: parts[3] || 'scanner'
          };
        }).filter(u => u.userId && u.password);

        if (users.length === 0) {
          setUserImportResult({ success: false, error: 'No valid users found in CSV file' });
          return;
        }

        const count = importAuthorizationUsers(users);
        setUserImportResult({ success: true, count });
      } catch (error) {
        setUserImportResult({ success: false, error: 'Failed to parse CSV file' });
      }
    };
    reader.readAsText(file);
    
    if (userFileInputRef.current) {
      userFileInputRef.current.value = '';
    }
  };

  const handleExport = () => {
    const headers = ['Barcode', 'Name', 'SKU', 'Category', 'Price'];
    const rows = masterProducts.map(p => 
      [p.barcode, p.name, p.sku, p.category, p.price].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'master_products.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadSampleProductCSV = () => {
    const sampleData = `Barcode,Name,SKU,Category,Price
8901234567890,Organic Rice 5kg,ORG-RICE-5K,Food & Groceries,450
8901234567891,Whole Wheat Flour 1kg,WH-FLOUR-1K,Food & Groceries,65
8901234567892,Premium Olive Oil 500ml,OLV-OIL-500,Cooking Oil,850`;
    
    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_products.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadSampleUserCSV = () => {
    const sampleData = `UserID,Password,Name,Role
scanner1,pass123,Scanner User 1,scanner
scanner2,pass456,Scanner User 2,scanner
admin1,admin123,Admin User,admin`;
    
    const blob = new Blob([sampleData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_users.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const categories = [...new Set(masterProducts.map(p => p.category))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Master Data</h1>
          <p className="text-slate-500 mt-1">Manage products and user credentials</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setShowImportModal(true)}
            className="border-slate-200"
          >
            <Upload className="w-4 h-4 mr-2" />
            Import Products
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowUserImportModal(true)}
            className="border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            <Users className="w-4 h-4 mr-2" />
            Import Users
          </Button>
          <Button
            variant="outline"
            onClick={handleExport}
            className="border-slate-200"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 rounded-lg">
                <Package className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{masterProducts.length}</p>
                <p className="text-sm text-slate-500">Total Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{categories.length}</p>
                <p className="text-sm text-slate-500">Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-purple-100 rounded-lg">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{authorizationUsers.length}</p>
                <p className="text-sm text-slate-500">Authorization Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {masterProducts.filter(p => p.isMaster).length}
                </p>
                <p className="text-sm text-slate-500">Master Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          placeholder="Search by name, barcode, SKU, or category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-11 border-slate-200"
        />
      </div>

      {/* Products Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-[150px]">Barcode</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm">{product.barcode}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-slate-500">{product.sku}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-slate-200">
                        {product.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      ₹{product.price?.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-emerald-100 text-emerald-700 border-0">
                        Master
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No products found</p>
        </div>
      )}

      {/* Add Product Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>
              Add a new product to your master database
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode *</Label>
              <Input
                id="barcode"
                placeholder="Enter barcode"
                value={newProduct.barcode}
                onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input
                id="name"
                placeholder="Enter product name"
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                placeholder="Enter SKU"
                value={newProduct.sku}
                onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="Enter category"
                value={newProduct.category}
                onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input
                id="price"
                type="number"
                placeholder="Enter price"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddProduct} 
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!newProduct.barcode || !newProduct.name}
            >
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Products Modal */}
      <Dialog open={showImportModal} onOpenChange={(open) => {
        setShowImportModal(open);
        if (!open) setImportResult(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-emerald-600" />
              Import Master Products
            </DialogTitle>
            <DialogDescription>
              Upload a CSV file to replace existing master data
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* Warning about replacement */}
            <div className="p-3 bg-amber-50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                <strong>Warning:</strong> Importing a new file will replace ALL existing master products. 
                The old data will be permanently deleted.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">CSV Format:</p>
              <code className="text-xs text-slate-500 block bg-white p-2 rounded border">
                Barcode,Name,SKU,Category,Price
              </code>
              <Button
                variant="link"
                size="sm"
                onClick={downloadSampleProductCSV}
                className="text-emerald-600 p-0 h-auto mt-2"
              >
                <Download className="w-3 h-3 mr-1" />
                Download Sample CSV
              </Button>
            </div>
            
            <div className="relative">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-emerald-400 transition-colors cursor-pointer">
                <Upload className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-sm text-slate-500 mb-2">Click to upload or drag and drop</p>
                <p className="text-xs text-slate-400">CSV files only</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {importResult && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {importResult.success ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span className="text-sm">
                  {importResult.success 
                    ? `Successfully imported ${importResult.count} products (old data replaced)`
                    : importResult.error}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Users Modal */}
      <Dialog open={showUserImportModal} onOpenChange={(open) => {
        setShowUserImportModal(open);
        if (!open) setUserImportResult(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Import User Credentials
            </DialogTitle>
            <DialogDescription>
              Upload user IDs and passwords to avoid manual password changes on each scanner
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">CSV Format:</p>
              <code className="text-xs text-slate-500 block bg-white p-2 rounded border">
                UserID,Password,Name,Role<br />
                scanner1,pass123,Scanner 1,scanner
              </code>
              <Button
                variant="link"
                size="sm"
                onClick={downloadSampleUserCSV}
                className="text-blue-600 p-0 h-auto mt-2"
              >
                <Download className="w-3 h-3 mr-1" />
                Download Sample CSV
              </Button>
            </div>

            {/* Current imported users */}
            {importedUsers.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-700 mb-2">
                  {importedUsers.length} user(s) currently imported:
                </p>
                <div className="flex flex-wrap gap-2">
                  {importedUsers.map(u => (
                    <Badge key={u.id} variant="outline" className="border-blue-200 text-blue-700">
                      {u.userId}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            <div className="relative">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer">
                <Users className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-sm text-slate-500 mb-2">Click to upload user credentials</p>
                <p className="text-xs text-slate-400">CSV files only</p>
                <input
                  ref={userFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleUserFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {userImportResult && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${
                userImportResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {userImportResult.success ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertCircle className="w-5 h-5" />
                )}
                <span className="text-sm">
                  {userImportResult.success 
                    ? `Successfully imported ${userImportResult.count} user(s)`
                    : userImportResult.error}
                </span>
              </div>
            )}

            <div className="p-3 bg-slate-100 rounded-lg">
              <p className="text-xs text-slate-600">
                <strong>Note:</strong> Imported users can log in using their credentials. 
                This avoids the need to manually change passwords on each scanner device.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserImportModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MasterData;
