import React, { useState, useRef, startTransition } from 'react';
import { useApp } from '../context/AppContext';
import { downloadCSV, getCSVAcceptTypes, isValidCSV } from '../utils/fileDownload';
import { MasterProductsDB, MasterLocationsDB } from '../utils/indexedDB';
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
  Loader2,
  ChevronLeft,
  ChevronRight,
  MapPin
} from 'lucide-react';

const MasterData = () => {
  const { masterProducts, addMasterProduct, setMasterProductsDirect, masterLocations, addMasterLocation, setMasterLocationsDirect, deleteMasterLocation, importAuthorizationUsers, getAuthorizationUsers, clearMasterProducts, clearMasterLocations, clearAuthUsers } = useApp();
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  
  // Progress tracking for large imports
  const [importProgress, setImportProgress] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  
  // Cancel flag ref - survives re-renders
  const cancelImportRef = useRef(false);
  
  const fileInputRef = useRef(null);
  const userFileInputRef = useRef(null);
  const locationFileInputRef = useRef(null);

  // Active tab state
  const [activeTab, setActiveTab] = useState('products');

  // Clear Master Data state
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearOptions, setClearOptions] = useState({
    products: true,
    locations: true,
    authUsers: true,
  });

  const handleClearMasterData = async () => {
    if (clearOptions.products) {
      await clearMasterProducts();
    }
    if (clearOptions.locations) {
      await clearMasterLocations();
    }
    if (clearOptions.authUsers) {
      clearAuthUsers();
    }
    setShowClearModal(false);
    // Reset options for next time
    setClearOptions({ products: true, locations: true, authUsers: true });
  };

  const anyClearSelected = clearOptions.products || clearOptions.locations || clearOptions.authUsers;

  // Location Master state
  const [locSearchTerm, setLocSearchTerm] = useState('');
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [showLocImportModal, setShowLocImportModal] = useState(false);
  const [locImportResult, setLocImportResult] = useState(null);
  const [newLocation, setNewLocation] = useState({ code: '', name: '', description: '' });
  const [locCurrentPage, setLocCurrentPage] = useState(1);
  const [locImportProgress, setLocImportProgress] = useState(null);
  const [isLocImporting, setIsLocImporting] = useState(false);
  const cancelLocImportRef = useRef(false);

  // Filtered products with search
  const filteredProducts = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return masterProducts;
    }
    const search = searchTerm.toLowerCase();
    return masterProducts.filter(
      p => p.name.toLowerCase().includes(search) || p.barcode.includes(searchTerm)
    );
  }, [masterProducts, searchTerm]);

  // Paginated products - only slice what we need to display
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  // Reset to page 1 when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const authorizationUsers = getAuthorizationUsers();

  // ============================================
  // LOCATION MASTER: Filtered & paginated
  // ============================================
  const filteredLocations = React.useMemo(() => {
    if (!locSearchTerm.trim()) return masterLocations;
    const search = locSearchTerm.toLowerCase();
    return masterLocations.filter(
      l => l.name.toLowerCase().includes(search) || l.code.toLowerCase().includes(search)
    );
  }, [masterLocations, locSearchTerm]);

  const locTotalPages = Math.ceil(filteredLocations.length / ITEMS_PER_PAGE);
  const paginatedLocations = React.useMemo(() => {
    const startIndex = (locCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredLocations.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredLocations, locCurrentPage]);

  React.useEffect(() => {
    setLocCurrentPage(1);
  }, [locSearchTerm]);

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

  // ULTRA-FAST Import: Direct to IndexedDB, then load to React once
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset cancel flag
    cancelImportRef.current = false;
    setIsImporting(true);
    setImportProgress({ processed: 0, total: 0, status: 'Reading file...' });
    setImportResult(null);

    try {
      // Read file
      const text = await file.text();
      
      if (cancelImportRef.current) {
        handleCancelComplete();
        return;
      }

      // Import directly to IndexedDB with progress callback
      const result = await MasterProductsDB.importFromCSV(text, (processed, total) => {
        if (!cancelImportRef.current) {
          setImportProgress({ 
            processed, 
            total, 
            status: `Saving: ${processed.toLocaleString()} of ${total.toLocaleString()}` 
          });
        }
      });

      if (cancelImportRef.current) {
        handleCancelComplete();
        return;
      }

      if (!result.success) {
        setImportResult({ success: false, error: result.error });
        setIsImporting(false);
        setImportProgress(null);
        return;
      }

      // Update React state ONCE with all products
      setImportProgress({ processed: result.count, total: result.count, status: 'Updating display...' });
      
      // Use startTransition to make state update non-blocking (keeps UI responsive)
      startTransition(() => {
        setMasterProductsDirect(result.products);
      });
      
      // Show completion after a brief moment
      setTimeout(() => {
        setImportProgress({ processed: result.count, total: result.count, status: 'Complete!' });
        setImportResult({ success: true, count: result.count, replaced: true });
        
        // Clear progress after a delay
        setTimeout(() => {
          setImportProgress(null);
          setIsImporting(false);
        }, 800);
      }, 200);
      
    } catch (error) {
      console.error('Import error:', error);
      setImportResult({ success: false, error: 'Failed to import file' });
      setIsImporting(false);
      setImportProgress(null);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancelComplete = () => {
    setImportResult({ success: false, error: 'Import cancelled by user' });
    setIsImporting(false);
    setImportProgress(null);
    cancelImportRef.current = false;
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

  // ============================================
  // LOCATION MASTER HANDLERS
  // ============================================
  const handleAddLocation = () => {
    if (newLocation.code) {
      addMasterLocation({
        code: newLocation.code.trim(),
        name: newLocation.name.trim() || newLocation.code.trim(),
        description: newLocation.description.trim()
      });
      setNewLocation({ code: '', name: '', description: '' });
      setShowAddLocationModal(false);
    }
  };

  const handleCancelLocImport = () => {
    cancelLocImportRef.current = true;
    setLocImportProgress(prev => prev ? { ...prev, status: 'Cancelling...' } : null);
  };

  const handleLocFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    cancelLocImportRef.current = false;
    setIsLocImporting(true);
    setLocImportProgress({ processed: 0, total: 0, status: 'Reading file...' });
    setLocImportResult(null);

    try {
      const text = await file.text();
      
      if (cancelLocImportRef.current) {
        handleLocCancelComplete();
        return;
      }

      const result = await MasterLocationsDB.importFromCSV(text, (processed, total) => {
        if (!cancelLocImportRef.current) {
          setLocImportProgress({ 
            processed, total, 
            status: `Saving: ${processed.toLocaleString()} of ${total.toLocaleString()}` 
          });
        }
      });

      if (cancelLocImportRef.current) {
        handleLocCancelComplete();
        return;
      }

      if (!result.success) {
        setLocImportResult({ success: false, error: result.error });
        setIsLocImporting(false);
        setLocImportProgress(null);
        return;
      }

      setLocImportProgress({ processed: result.count, total: result.count, status: 'Updating display...' });
      
      startTransition(() => {
        setMasterLocationsDirect(result.locations);
      });
      
      setTimeout(() => {
        setLocImportProgress({ processed: result.count, total: result.count, status: 'Complete!' });
        setLocImportResult({ success: true, count: result.count, replaced: true });
        setTimeout(() => {
          setLocImportProgress(null);
          setIsLocImporting(false);
        }, 800);
      }, 200);
      
    } catch (error) {
      console.error('Location import error:', error);
      setLocImportResult({ success: false, error: 'Failed to import file' });
      setIsLocImporting(false);
      setLocImportProgress(null);
    }
    
    if (locationFileInputRef.current) {
      locationFileInputRef.current.value = '';
    }
  };

  const handleLocCancelComplete = () => {
    setLocImportResult({ success: false, error: 'Import cancelled by user' });
    setIsLocImporting(false);
    setLocImportProgress(null);
    cancelLocImportRef.current = false;
  };

  const handleLocExport = async () => {
    const headers = ['Code', 'Name', 'Description'];
    const rows = masterLocations.map(l => 
      [l.code, `"${l.name}"`, `"${l.description || ''}"`].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    await downloadCSV(csv, 'master_locations.csv');
  };

  const downloadSampleLocationCSV = async () => {
    const sampleData = `Code,Name,Description
WH-A1,Warehouse A Section 1,Main warehouse section 1
WH-A2,Warehouse A Section 2,Main warehouse section 2
WH-B-CS,Warehouse B Cold Storage,Cold storage facility
RT-SF,Retail Store Front,Front retail area`;
    
    await downloadCSV(sampleData, 'sample_locations.csv');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Master Data</h1>
          <p className="text-slate-500 mt-1">Manage products, locations and user credentials</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeTab === 'products' ? (
            <>
              <Button variant="outline" onClick={() => setShowImportModal(true)} className="border-slate-200">
                <Upload className="w-4 h-4 mr-2" />
                Import Products
              </Button>
              <Button variant="outline" onClick={() => setShowUserImportModal(true)} className="border-blue-200 text-blue-700 hover:bg-blue-50">
                <Users className="w-4 h-4 mr-2" />
                Import Users
              </Button>
              <Button variant="outline" onClick={handleExport} className="border-slate-200">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={() => setShowAddModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200">
                <Plus className="w-4 h-4 mr-2" />
                Add Product
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setShowLocImportModal(true)} className="border-slate-200">
                <Upload className="w-4 h-4 mr-2" />
                Import Locations
              </Button>
              <Button variant="outline" onClick={handleLocExport} className="border-slate-200">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={() => setShowAddLocationModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-200">
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setShowClearModal(true)} className="border-red-200 text-red-600 hover:bg-red-50">
            <Trash2 className="w-4 h-4 mr-2" />
            Clear Data
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 rounded-lg">
                <Package className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{masterProducts.length}</p>
                <p className="text-sm text-slate-500">Products</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{masterLocations.length}</p>
                <p className="text-sm text-slate-500">Locations</p>
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
                <p className="text-sm text-slate-500">Auth Users</p>
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
                <p className="text-sm text-slate-500">Master Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Products | Locations */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full grid grid-cols-2 mb-4">
          <TabsTrigger value="products" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Products
          </TabsTrigger>
          <TabsTrigger value="locations" className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            Locations
          </TabsTrigger>
        </TabsList>

        {/* ========== PRODUCTS TAB ========== */}
        <TabsContent value="products" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Search by name or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-11 border-slate-200"
            />
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-[180px]">Barcode</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead className="text-right w-[120px]">Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProducts.map((product) => (
                    <TableRow key={product.barcode} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-sm">{product.barcode}</TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-right">
                        ₹{product.price?.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredProducts.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 px-2">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-slate-600 min-w-[80px] text-center">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 px-2">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No products found</p>
            </div>
          )}
        </TabsContent>

        {/* ========== LOCATIONS TAB ========== */}
        <TabsContent value="locations" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Search by code or name..."
              value={locSearchTerm}
              onChange={(e) => setLocSearchTerm(e.target.value)}
              className="pl-10 h-11 border-slate-200"
            />
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="w-[140px]">Code</TableHead>
                    <TableHead>Location Name</TableHead>
                    <TableHead className="text-right w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedLocations.map((loc) => (
                    <TableRow key={loc.code} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-sm font-bold">{loc.code}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{loc.name}</p>
                          {loc.description && <p className="text-xs text-slate-400">{loc.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-400 hover:text-red-600"
                          onClick={() => deleteMasterLocation(loc.code)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {filteredLocations.length > ITEMS_PER_PAGE && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    Showing {((locCurrentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(locCurrentPage * ITEMS_PER_PAGE, filteredLocations.length)} of {filteredLocations.length.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setLocCurrentPage(p => Math.max(1, p - 1))} disabled={locCurrentPage === 1} className="h-8 px-2">
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm text-slate-600 min-w-[80px] text-center">
                      Page {locCurrentPage} of {locTotalPages}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setLocCurrentPage(p => Math.min(locTotalPages, p + 1))} disabled={locCurrentPage === locTotalPages} className="h-8 px-2">
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {filteredLocations.length === 0 && (
            <div className="text-center py-12">
              <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No master locations found</p>
              <p className="text-xs text-slate-400 mt-1">Import or add locations to get started</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ========== MODALS ========== */}

      {/* Add Product Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
            <DialogDescription>Add a new product to your master database</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode *</Label>
              <Input id="barcode" placeholder="Enter barcode" value={newProduct.barcode} onChange={(e) => setNewProduct({ ...newProduct, barcode: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input id="name" placeholder="Enter product name" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Price</Label>
              <Input id="price" type="number" placeholder="Enter price" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddProduct} className="bg-emerald-600 hover:bg-emerald-700" disabled={!newProduct.barcode || !newProduct.name}>Add Product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Location Modal */}
      <Dialog open={showAddLocationModal} onOpenChange={setShowAddLocationModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-600" />
              Add Master Location
            </DialogTitle>
            <DialogDescription>Add a predefined location to master data</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="loc-code">Location Code *</Label>
              <Input id="loc-code" placeholder="e.g., WH-A1" value={newLocation.code} onChange={(e) => setNewLocation({ ...newLocation, code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-name">Location Name</Label>
              <Input id="loc-name" placeholder="e.g., Warehouse A Section 1" value={newLocation.name} onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-desc">Description</Label>
              <Input id="loc-desc" placeholder="Optional description" value={newLocation.description} onChange={(e) => setNewLocation({ ...newLocation, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddLocationModal(false)}>Cancel</Button>
            <Button onClick={handleAddLocation} className="bg-emerald-600 hover:bg-emerald-700" disabled={!newLocation.code}>
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Products Modal */}
      <Dialog open={showImportModal} onOpenChange={(open) => {
        if (!open) {
          if (isImporting) handleCancelImport();
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
            <DialogDescription>Upload a CSV file to replace existing master data</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-3 bg-amber-50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                <strong>Warning:</strong> Importing will replace ALL existing master products.
              </p>
            </div>
            {importProgress && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    <span className="text-sm font-medium text-blue-700">{importProgress.status}</span>
                  </div>
                  {isImporting && importProgress.status !== 'Cancelling...' && importProgress.status !== 'Complete!' && (
                    <Button variant="outline" size="sm" onClick={handleCancelImport} className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50">Cancel</Button>
                  )}
                </div>
                <Progress value={importProgress.total > 0 ? (importProgress.processed / importProgress.total) * 100 : 0} className="h-2" />
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
                  <code className="text-xs text-slate-500 block bg-white p-2 rounded border">Barcode,Name,Price</code>
                  <Button variant="link" size="sm" onClick={downloadSampleProductCSV} className="text-emerald-600 p-0 h-auto mt-2">
                    <Download className="w-3 h-3 mr-1" />
                    Download Sample CSV
                  </Button>
                </div>
                <div className="relative">
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-emerald-400 transition-colors cursor-pointer">
                    <Upload className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm text-slate-500 mb-2">Click to upload or drag and drop</p>
                    <p className="text-xs text-slate-400">CSV or TXT files</p>
                    <input ref={fileInputRef} type="file" accept={getCSVAcceptTypes()} onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  </div>
                </div>
              </>
            )}
            {importResult && !importProgress && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {importResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm">
                  {importResult.success ? `Successfully imported ${importResult.count.toLocaleString()} products (old data replaced)` : importResult.error}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (isImporting) handleCancelImport(); setShowImportModal(false); }}>
              {isImporting ? 'Close & Cancel' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Locations Modal */}
      <Dialog open={showLocImportModal} onOpenChange={(open) => {
        if (!open) {
          if (isLocImporting) handleCancelLocImport();
          setShowLocImportModal(false);
          setLocImportResult(null);
          setLocImportProgress(null);
        } else {
          setShowLocImportModal(true);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className={`w-5 h-5 text-blue-600 ${isLocImporting ? 'animate-spin' : ''}`} />
              Import Master Locations
            </DialogTitle>
            <DialogDescription>Upload a CSV file to replace existing master locations</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-3 bg-amber-50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                <strong>Warning:</strong> Importing will replace ALL existing master locations.
              </p>
            </div>
            {locImportProgress && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    <span className="text-sm font-medium text-blue-700">{locImportProgress.status}</span>
                  </div>
                  {isLocImporting && locImportProgress.status !== 'Cancelling...' && locImportProgress.status !== 'Complete!' && (
                    <Button variant="outline" size="sm" onClick={handleCancelLocImport} className="h-7 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50">Cancel</Button>
                  )}
                </div>
                <Progress value={locImportProgress.total > 0 ? (locImportProgress.processed / locImportProgress.total) * 100 : 0} className="h-2" />
              </div>
            )}
            {!isLocImporting && (
              <>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-medium text-slate-700 mb-2">CSV Format:</p>
                  <code className="text-xs text-slate-500 block bg-white p-2 rounded border">Code,Name,Description</code>
                  <Button variant="link" size="sm" onClick={downloadSampleLocationCSV} className="text-blue-600 p-0 h-auto mt-2">
                    <Download className="w-3 h-3 mr-1" />
                    Download Sample CSV
                  </Button>
                </div>
                <div className="relative">
                  <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer">
                    <MapPin className="w-10 h-10 text-slate-400 mb-3" />
                    <p className="text-sm text-slate-500 mb-2">Click to upload location master CSV</p>
                    <p className="text-xs text-slate-400">CSV or TXT files</p>
                    <input ref={locationFileInputRef} type="file" accept={getCSVAcceptTypes()} onChange={handleLocFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  </div>
                </div>
              </>
            )}
            {locImportResult && !locImportProgress && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${locImportResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {locImportResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm">
                  {locImportResult.success ? `Successfully imported ${locImportResult.count.toLocaleString()} locations (old data replaced)` : locImportResult.error}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (isLocImporting) handleCancelLocImport(); setShowLocImportModal(false); }}>
              {isLocImporting ? 'Close & Cancel' : 'Close'}
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
            <DialogDescription>Upload User IDs and Passwords for authorization actions only</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Important:</strong> These credentials are used ONLY for authorization actions:
              </p>
              <ul className="text-sm text-blue-600 mt-1 ml-4 list-disc">
                <li>Location deletion</li>
                <li>Reopening scanned/locked locations</li>
                <li>Other protected actions</li>
              </ul>
              <p className="text-xs text-blue-500 mt-2">These credentials will NOT work for main login or settings access.</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">CSV Format (only UserID & Password required):</p>
              <code className="text-xs text-slate-500 block bg-white p-2 rounded border">
                UserID,Password<br />
                auth_user1,pass123<br />
                auth_user2,pass456
              </code>
              <Button variant="link" size="sm" onClick={downloadSampleUserCSV} className="text-blue-600 p-0 h-auto mt-2">
                <Download className="w-3 h-3 mr-1" />
                Download Sample CSV
              </Button>
            </div>
            {authorizationUsers.length > 0 && (
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-sm font-medium text-purple-700 mb-2">
                  {authorizationUsers.length} authorization user(s) configured:
                </p>
                <div className="flex flex-wrap gap-2">
                  {authorizationUsers.map(u => (
                    <Badge key={u.id} variant="outline" className="border-purple-200 text-purple-700">{u.userId}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="relative">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer">
                <Users className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-sm text-slate-500 mb-2">Click to upload authorization credentials</p>
                <p className="text-xs text-slate-400">CSV or TXT files</p>
                <input ref={userFileInputRef} type="file" accept={getCSVAcceptTypes()} onChange={handleUserFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
            </div>
            {userImportResult && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${userImportResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {userImportResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm">
                  {userImportResult.success ? `Successfully imported ${userImportResult.count} authorization user(s)` : userImportResult.error}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserImportModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Master Data Confirmation Modal */}
      <Dialog open={showClearModal} onOpenChange={setShowClearModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Clear Master Data
            </DialogTitle>
            <DialogDescription>Select which master data you want to clear. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="p-3 bg-red-50 rounded-lg">
              <p className="text-sm text-red-700 font-medium">Warning: This will permanently delete the selected data.</p>
            </div>

            {/* Products checkbox */}
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox" 
                checked={clearOptions.products} 
                onChange={(e) => setClearOptions(prev => ({ ...prev, products: e.target.checked }))}
                className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">Products</p>
                <p className="text-xs text-slate-500">{masterProducts.length} product(s)</p>
              </div>
              <Package className="w-5 h-5 text-slate-400" />
            </label>

            {/* Locations checkbox */}
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox" 
                checked={clearOptions.locations} 
                onChange={(e) => setClearOptions(prev => ({ ...prev, locations: e.target.checked }))}
                className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">Locations</p>
                <p className="text-xs text-slate-500">{masterLocations.length} location(s)</p>
              </div>
              <MapPin className="w-5 h-5 text-slate-400" />
            </label>

            {/* Auth Users checkbox */}
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input 
                type="checkbox" 
                checked={clearOptions.authUsers} 
                onChange={(e) => setClearOptions(prev => ({ ...prev, authUsers: e.target.checked }))}
                className="w-5 h-5 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-800">Authorization Users</p>
                <p className="text-xs text-slate-500">{authorizationUsers.length} user(s)</p>
              </div>
              <Users className="w-5 h-5 text-slate-400" />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowClearModal(false)}>Cancel</Button>
            <Button 
              onClick={handleClearMasterData} 
              disabled={!anyClearSelected}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear Selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MasterData;
