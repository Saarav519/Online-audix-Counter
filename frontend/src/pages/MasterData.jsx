import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { downloadCSV, getCSVAcceptTypes, isValidCSV } from '../utils/fileDownload';
import { MasterProductsDB } from '../utils/indexedDB';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Progress } from '../components/ui/progress';
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
  RefreshCw,
  Loader2
} from 'lucide-react';

const MasterData = () => {
  const { masterProducts, addMasterProduct, setMasterProductsDirect, importAuthorizationUsers, getAuthorizationUsers } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUserImportModal, setShowUserImportModal] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showUserImportModal, setShowUserImportModal] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [userImportResult, setUserImportResult] = useState(null);
  const [newProduct, setNewProduct] = useState({
    barcode: '',
    name: '',
    price: ''
  });
  
  // Progress tracking for large imports
  const [importProgress, setImportProgress] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  
  // Cancel flag ref - survives re-renders
  const cancelImportRef = useRef(false);
  const importDataRef = useRef(null);
  
  const fileInputRef = useRef(null);
  const userFileInputRef = useRef(null);

  const filteredProducts = masterProducts.filter(
    p =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.includes(searchTerm)
  );

  const authorizationUsers = getAuthorizationUsers();

  const handleAddProduct = () => {
    if (newProduct.barcode && newProduct.name) {
      addMasterProduct({
        ...newProduct,
        price: parseFloat(newProduct.price) || 0
      });
      setNewProduct({ barcode: '', name: '', price: '' });
      setShowAddModal(false);
    }
  };

  // Cancel import function
  const handleCancelImport = () => {
    cancelImportRef.current = true;
    setImportProgress(prev => prev ? { ...prev, status: 'Cancelling...' } : null);
  };

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset cancel flag
    cancelImportRef.current = false;
    setIsImporting(true);
    setImportProgress({ processed: 0, total: 0, status: 'Reading file...' });
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header row
      const dataLines = lines.slice(1);
      const totalProducts = dataLines.length;
      
      if (totalProducts === 0) {
        setImportResult({ success: false, error: 'No data found in CSV file' });
        setIsImporting(false);
        setImportProgress(null);
        return;
      }

      setImportProgress({ processed: 0, total: totalProducts, status: 'Processing products...' });
      
      // Store data lines for processing
      importDataRef.current = dataLines;
      
      // Process in chunks using requestIdleCallback or setTimeout for non-blocking
      processInChunks(dataLines, totalProducts);
    };
    
    reader.onerror = () => {
      setImportResult({ success: false, error: 'Failed to read file' });
      setIsImporting(false);
      setImportProgress(null);
    };
    
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Non-blocking chunk processing
  const processInChunks = async (dataLines, totalProducts) => {
    const CHUNK_SIZE = 500; // Process 500 lines per chunk
    const products = [];
    let processedCount = 0;
    
    const processChunk = async (startIndex) => {
      // Check for cancellation
      if (cancelImportRef.current) {
        setImportResult({ success: false, error: 'Import cancelled by user' });
        setIsImporting(false);
        setImportProgress(null);
        cancelImportRef.current = false;
        return;
      }
      
      const endIndex = Math.min(startIndex + CHUNK_SIZE, dataLines.length);
      
      // Process this chunk
      for (let i = startIndex; i < endIndex; i++) {
        const line = dataLines[i];
        const [barcode, name, price] = line.split(',').map(s => s.trim().replace(/"/g, ''));
        
        if (barcode && name) {
          products.push({
            barcode,
            name,
            price: parseFloat(price) || 0
          });
        }
      }
      
      processedCount = endIndex;
      
      // Update progress
      setImportProgress({ 
        processed: processedCount, 
        total: totalProducts, 
        status: `Processing: ${processedCount.toLocaleString()} of ${totalProducts.toLocaleString()}` 
      });
      
      // Continue with next chunk or finish
      if (endIndex < dataLines.length) {
        // Use setTimeout to yield to main thread (prevents freezing)
        setTimeout(() => processChunk(endIndex), 0);
      } else {
        // All chunks processed - now save
        finishImport(products);
      }
    };
    
    // Start processing first chunk
    setTimeout(() => processChunk(0), 0);
  };

  // Final save step
  const finishImport = (products) => {
    // Check for cancellation one more time
    if (cancelImportRef.current) {
      setImportResult({ success: false, error: 'Import cancelled by user' });
      setIsImporting(false);
      setImportProgress(null);
      cancelImportRef.current = false;
      return;
    }
    
    if (products.length === 0) {
      setImportResult({ success: false, error: 'No valid products found in CSV file' });
      setIsImporting(false);
      setImportProgress(null);
      return;
    }

    setImportProgress({ 
      processed: products.length, 
      total: products.length, 
      status: 'Saving to database...' 
    });
    
    // Use setTimeout to let UI update before heavy save operation
    setTimeout(() => {
      try {
        const count = importMasterProducts(products, true);
        
        setImportProgress({ processed: count, total: count, status: 'Complete!' });
        setImportResult({ success: true, count, replaced: true });
        
        // Clear progress after a delay
        setTimeout(() => {
          setImportProgress(null);
          setIsImporting(false);
        }, 1500);
      } catch (error) {
        setImportResult({ success: false, error: 'Failed to save products' });
        setIsImporting(false);
        setImportProgress(null);
      }
    }, 50);
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

  const handleExport = async () => {
    const headers = ['Barcode', 'Name', 'Price'];
    const rows = masterProducts.map(p => 
      [p.barcode, `"${p.name}"`, p.price].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    await downloadCSV(csv, 'master_products.csv');
  };

  const downloadSampleProductCSV = async () => {
    const sampleData = `Barcode,Name,Price
8901234567890,Organic Rice 5kg,450
8901234567891,Whole Wheat Flour 1kg,65
8901234567892,Premium Olive Oil 500ml,850`;
    
    await downloadCSV(sampleData, 'sample_products.csv');
  };

  const downloadSampleUserCSV = async () => {
    const sampleData = `UserID,Password
auth_user1,pass123
auth_user2,pass456
supervisor1,super789`;
    
    await downloadCSV(sampleData, 'sample_authorization_users.csv');
  };

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          placeholder="Search by name or barcode..."
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
                  <TableHead className="w-[180px]">Barcode</TableHead>
                  <TableHead>Product Name</TableHead>
                  <TableHead className="text-right w-[120px]">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm">{product.barcode}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">
                      ₹{product.price?.toFixed(2)}
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
        if (!open) {
          // User is closing the dialog
          if (isImporting) {
            handleCancelImport();
          }
          setShowImportModal(false);
          setImportResult(null);
          setImportProgress(null);
        } else {
          setShowImportModal(true);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className={`w-5 h-5 text-emerald-600 ${isImporting ? 'animate-spin' : ''}`} />
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

            {/* Progress Display */}
            {importProgress && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    <span className="text-sm font-medium text-blue-700">{importProgress.status}</span>
                  </div>
                  {isImporting && importProgress.status !== 'Cancelling...' && importProgress.status !== 'Complete!' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelImport}
                      className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                    >
                      Cancel
                    </Button>
                  )}
                </div>
                <Progress 
                  value={importProgress.total > 0 ? (importProgress.processed / importProgress.total) * 100 : 0} 
                  className="h-2"
                />
                <div className="flex justify-between text-xs text-blue-600">
                  <span>{importProgress.processed.toLocaleString()} processed</span>
                  <span>{importProgress.total.toLocaleString()} total</span>
                </div>
              </div>
            )}

            {!isImporting && (
              <>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-slate-700 mb-2">CSV Format:</p>
                  <code className="text-xs text-slate-500 block bg-white p-2 rounded border">
                    Barcode,Name,Price
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
                    <p className="text-xs text-slate-400">CSV or TXT files</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={getCSVAcceptTypes()}
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
              </>
            )}

            {importResult && !importProgress && (
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
                    ? `Successfully imported ${importResult.count.toLocaleString()} products (old data replaced)`
                    : importResult.error}
                </span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {isImporting && importProgress?.status !== 'Complete!' && importProgress?.status !== 'Cancelling...' && (
              <Button 
                variant="outline"
                onClick={handleCancelImport}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                Cancel Import
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => {
                if (isImporting) {
                  handleCancelImport();
                }
                setShowImportModal(false);
              }}
            >
              {isImporting ? 'Close & Cancel' : 'Close'}
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
              Import Authorization Users
            </DialogTitle>
            <DialogDescription>
              Upload User IDs and Passwords for authorization actions only
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {/* Important Notice */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Important:</strong> These credentials are used ONLY for authorization actions:
              </p>
              <ul className="text-sm text-blue-600 mt-1 ml-4 list-disc">
                <li>Location deletion</li>
                <li>Reopening scanned/locked locations</li>
                <li>Other protected actions</li>
              </ul>
              <p className="text-xs text-blue-500 mt-2">
                These credentials will NOT work for main login or settings access.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">CSV Format (only UserID & Password required):</p>
              <code className="text-xs text-slate-500 block bg-white p-2 rounded border">
                UserID,Password<br />
                auth_user1,pass123<br />
                auth_user2,pass456
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

            {/* Current authorization users */}
            {authorizationUsers.length > 0 && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-sm font-medium text-purple-700 mb-2">
                  {authorizationUsers.length} authorization user(s) configured:
                </p>
                <div className="flex flex-wrap gap-2">
                  {authorizationUsers.map(u => (
                    <Badge key={u.id} variant="outline" className="border-purple-200 text-purple-700">
                      {u.userId}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            <div className="relative">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer">
                <Users className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-sm text-slate-500 mb-2">Click to upload authorization credentials</p>
                <p className="text-xs text-slate-400">CSV or TXT files</p>
                <input
                  ref={userFileInputRef}
                  type="file"
                  accept={getCSVAcceptTypes()}
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
                    ? `Successfully imported ${userImportResult.count} authorization user(s)`
                    : userImportResult.error}
                </span>
              </div>
            )}
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
