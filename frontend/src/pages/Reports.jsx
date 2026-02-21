import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { downloadCSV, getCSVAcceptTypes } from '../utils/fileDownload';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  Download,
  Mail,
  MapPin,
  Package,
  CheckCircle2,
  BarChart3,
  Check,
  X,
  Trash2,
  AlertTriangle,
  Lock,
  Unlock,
  Clock,
  Plus,
  Search,
  ScanBarcode,
  Upload,
  FileSpreadsheet,
  UserCheck,
  AlertCircle,
  MoreVertical,
  Edit3
} from 'lucide-react';

const Reports = () => {
  const navigate = useNavigate();
  const {
    locations,
    scannedItems,
    currentSession,
    masterProducts,
    settings,
    addLocation,
    deleteLocation,
    deleteLocationData,
    deleteLocationFromReports,
    submitLocation,
    reopenLocation,
    importAssignedLocations,
    clearAssignedLocations,
    verifyAuthorizationCredentials,
    renameLocation
  } = useApp();

  // ---- Search ----
  const [searchTerm, setSearchTerm] = useState('');

  // ---- Selection (for bulk export/delete) ----
  const [selectedLocations, setSelectedLocations] = useState(['all']);
  const isAllSelected = selectedLocations.includes('all');

  // ---- Add Location Modal (Dynamic mode) ----
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', code: '' });

  // ---- Import Locations Modal (Pre-Assigned mode) ----
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  // ---- Rename Modal ----
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [newLocationName, setNewLocationName] = useState('');

  // ---- Delete Modal ----
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSingleDeleteModal, setShowSingleDeleteModal] = useState(false);
  const [deleteType, setDeleteType] = useState('items');

  // ---- Reopen Modal ----
  const [showReopenModal, setShowReopenModal] = useState(false);

  // ---- Auth Modal ----
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCredentials, setAuthCredentials] = useState({ userId: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [pendingAction, setPendingAction] = useState(null);

  // ---- Success ----
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const isPreAssignedMode = settings.locationScanMode === 'preassigned';

  // ============ MODE-FILTERED & SORTED LOCATIONS ============
  const modeFilteredLocations = useMemo(() => {
    return locations.filter(loc => {
      if (isPreAssignedMode) {
        return loc.isAssigned === true;
      } else {
        return loc.autoCreated === true || loc.isAssigned === false;
      }
    });
  }, [locations, isPreAssignedMode]);

  const sortedLocations = useMemo(() => {
    return [...modeFilteredLocations].sort((a, b) => {
      const dateA = new Date(a.lastUpdated || 0);
      const dateB = new Date(b.lastUpdated || 0);
      return dateB - dateA;
    });
  }, [modeFilteredLocations]);

  const filteredLocations = useMemo(() => {
    if (!searchTerm.trim()) return sortedLocations;
    const term = searchTerm.toLowerCase();
    return sortedLocations.filter(
      loc =>
        loc.name.toLowerCase().includes(term) ||
        loc.code.toLowerCase().includes(term)
    );
  }, [sortedLocations, searchTerm]);

  // ============ STATS ============
  const getLocationStats = (locationId) => {
    const items = scannedItems[locationId] || [];
    return {
      totalItems: items.length,
      totalQuantity: items.reduce((sum, i) => sum + i.quantity, 0)
    };
  };

  // Items for selected locations (for export)
  const reportItems = useMemo(() => {
    const locsToUse = isAllSelected ? filteredLocations : filteredLocations.filter(l => selectedLocations.includes(l.id));
    return locsToUse.flatMap(loc => {
      return (scannedItems[loc.id] || []).map(item => ({
        ...item,
        locationName: loc.name || 'Unknown',
        locationId: loc.id
      }));
    });
  }, [selectedLocations, scannedItems, filteredLocations, isAllSelected]);

  const totalQuantity = reportItems.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueProducts = new Set(reportItems.map(item => item.barcode)).size;
  const totalItems = reportItems.length;

  const assignedLocationsCount = locations.filter(loc => loc.isAssigned).length;

  // ============ SELECTION HANDLERS ============
  const handleLocationToggle = (locationId) => {
    if (locationId === 'all') {
      if (isAllSelected) {
        setSelectedLocations([]);
      } else {
        setSelectedLocations(['all']);
      }
    } else {
      setSelectedLocations(prev => {
        const newSelection = prev.filter(id => id !== 'all');
        if (newSelection.includes(locationId)) {
          return newSelection.filter(id => id !== locationId);
        } else {
          return [...newSelection, locationId];
        }
      });
    }
  };

  // ============ LOCATION ACTIONS ============
  const handleOpenLocation = (location) => {
    if (location.isSubmitted) {
      handleReopenRequest(location);
    } else {
      navigate(`/scan?location=${location.id}`);
    }
  };

  const handleReopenRequest = (location) => {
    setSelectedLocation(location);
    setShowReopenModal(true);
  };

  const handleReopenConfirm = () => {
    setShowReopenModal(false);
    setPendingAction({ type: 'reopen', locationId: selectedLocation.id });
    setShowAuthModal(true);
  };

  const handleRenameRequest = (location) => {
    setSelectedLocation(location);
    setNewLocationName(location.name);
    setShowRenameModal(true);
  };

  const handleRenameConfirm = () => {
    if (newLocationName.trim()) {
      renameLocation(selectedLocation.id, newLocationName.trim());
      setShowRenameModal(false);
      setSelectedLocation(null);
      setNewLocationName('');
    }
  };

  const handleSingleDeleteRequest = (location) => {
    setSelectedLocation(location);
    setShowSingleDeleteModal(true);
  };

  const handleSingleDeleteConfirm = () => {
    deleteLocation(selectedLocation.id);
    setShowSingleDeleteModal(false);
    setSelectedLocation(null);
  };

  // ============ ADD LOCATION (Dynamic) ============
  const handleAddLocation = () => {
    if (newLocation.name && newLocation.code) {
      addLocation(newLocation);
      setNewLocation({ name: '', code: '' });
      setShowAddModal(false);
    }
  };

  // ============ IMPORT LOCATIONS (Pre-Assigned) ============
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('code') || firstLine.includes('name') || firstLine.includes('location');
        const dataLines = hasHeader ? lines.slice(1) : lines;
        const locationsData = dataLines.map(line => {
          const parts = line.split(',').map(s => s.trim().replace(/"/g, ''));
          if (parts.length >= 2) {
            return { code: parts[0], name: parts[1] };
          } else {
            return { code: parts[0], name: parts[0] };
          }
        }).filter(loc => loc.code);
        if (locationsData.length === 0) {
          setImportResult({ success: false, error: 'No valid locations found in CSV file' });
          return;
        }
        const count = importAssignedLocations(locationsData);
        setImportResult({ success: true, count });
      } catch (error) {
        setImportResult({ success: false, error: 'Failed to parse CSV file' });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearAssigned = () => {
    clearAssignedLocations();
    setImportResult(null);
  };

  const downloadSampleCSV = async () => {
    const sampleData = `Location Code,Location Name
WH-A1,Warehouse A - Section 1
WH-A2,Warehouse A - Section 2
WH-B1,Warehouse B - Section 1
STORE-01,Retail Store Front
COLD-01,Cold Storage Unit 1`;
    await downloadCSV(sampleData, 'sample_locations.csv');
  };

  // ============ BULK DELETE ============
  const handleBulkDeleteClick = () => {
    if (reportItems.length === 0) return;
    setShowDeleteModal(true);
  };

  const handleBulkDeleteConfirm = () => {
    setShowDeleteModal(false);
    setPendingAction({ type: 'bulkDelete' });
    setShowAuthModal(true);
  };

  // ============ AUTH HANDLER ============
  const handleAuthSubmit = () => {
    const result = verifyAuthorizationCredentials(authCredentials.userId, authCredentials.password);
    if (result.success) {
      setAuthError('');
      setShowAuthModal(false);

      if (pendingAction?.type === 'reopen') {
        reopenLocation(pendingAction.locationId);
      } else if (pendingAction?.type === 'bulkDelete') {
        const locsToDelete = isAllSelected
          ? filteredLocations.map(l => l.id)
          : selectedLocations;
        if (deleteType === 'location') {
          locsToDelete.forEach(locId => deleteLocationFromReports(locId));
        } else {
          deleteLocationData(locsToDelete);
        }
        setDeleteSuccess(true);
        setTimeout(() => setDeleteSuccess(false), 3000);
        setSelectedLocations(['all']);
      }

      setPendingAction(null);
      setAuthCredentials({ userId: '', password: '' });
    } else {
      setAuthError('Invalid credentials. Please try again.');
    }
  };

  // ============ EXPORT ============
  const getMasterProductDetails = (barcode) => masterProducts.find(p => p.barcode === barcode) || null;

  const handleExportCSV = async () => {
    if (reportItems.length === 0) return;
    const headers = ['Location', 'Barcode', 'Product Name', 'Price', 'Quantity', 'Scanned At'];
    const rows = reportItems.map(item => {
      const masterProduct = getMasterProductDetails(item.barcode);
      return [
        `"${item.locationName}"`,
        item.barcode,
        `"${item.productName}"`,
        masterProduct?.price?.toFixed(2) || '0.00',
        item.quantity,
        `"${new Date(item.scannedAt).toLocaleString()}"`
      ];
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const selectionSuffix = isAllSelected ? 'all_locations' : `${selectedLocations.length}_locations`;
    const filename = `stock_report_${selectionSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
    await downloadCSV(csv, filename);
  };

  const handleEmailReport = () => {
    const locationInfo = isAllSelected ? 'All Locations' : `${selectedLocations.length} Selected Locations`;
    const subject = encodeURIComponent(`Stock Count Report - ${currentSession?.name || 'Audix'}`);
    const body = encodeURIComponent(
      `Stock Count Report\n\nSession: ${currentSession?.name}\nLocations: ${locationInfo}\nTotal Items: ${reportItems.length}\nTotal Quantity: ${totalQuantity}\nUnique Products: ${uniqueProducts}\n\nPlease find the detailed report attached.`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  // ============ RENDER ============
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Reports</h1>
            <p className="text-xs text-slate-500">Manage locations, export & scan</p>
          </div>
          <Badge variant="outline" className="text-xs">
            {isPreAssignedMode ? 'Pre-Assigned' : 'Dynamic'}
          </Badge>
        </div>

        {/* Action Buttons Row 1: Add/Import */}
        <div className="flex gap-2 flex-wrap">
          {isPreAssignedMode ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportModal(true)}
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <Upload className="w-4 h-4 mr-1" />
              Import
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setShowAddModal(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Location
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={reportItems.length === 0}
          >
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleEmailReport}
            disabled={reportItems.length === 0}
          >
            <Mail className="w-4 h-4 mr-1" />
            Email
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDeleteClick}
            disabled={reportItems.length === 0}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Success Message */}
      {deleteSuccess && (
        <div className="mb-3 p-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          <span className="font-medium">Data deleted successfully!</span>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2 text-center">
            <p className="text-lg font-bold text-slate-800">{filteredLocations.length}</p>
            <p className="text-[10px] text-slate-500">Locations</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2 text-center">
            <p className="text-lg font-bold text-slate-800">{totalItems}</p>
            <p className="text-[10px] text-slate-500">Items</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2 text-center">
            <p className="text-lg font-bold text-slate-800">{totalQuantity}</p>
            <p className="text-[10px] text-slate-500">Quantity</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-2 text-center">
            <p className="text-lg font-bold text-slate-800">{uniqueProducts}</p>
            <p className="text-[10px] text-slate-500">Unique</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search locations..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 h-9 text-sm border-slate-200"
        />
      </div>

      {/* Selection Bar */}
      <div className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5 mb-2">
        <span className="text-xs font-medium text-slate-600">
          {isAllSelected ? `All ${filteredLocations.length} locations` : `${selectedLocations.filter(id => id !== 'all').length} selected`}
        </span>
        <div className="flex gap-1">
          {!isAllSelected ? (
            <Button variant="ghost" size="sm" onClick={() => setSelectedLocations(['all'])} className="h-6 text-xs text-emerald-600 px-2">
              <Check className="w-3 h-3 mr-1" />All
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => {
              if (filteredLocations.length > 0) setSelectedLocations([filteredLocations[0].id]);
            }} className="h-6 text-xs text-slate-500 px-2">
              <X className="w-3 h-3 mr-1" />Clear
            </Button>
          )}
        </div>
      </div>

      {/* Location List */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
          {filteredLocations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <MapPin className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500 font-medium">No locations found</p>
              <p className="text-xs text-slate-400 mt-1">
                {isPreAssignedMode ? 'Import locations to get started' : 'Add a location or scan to create one'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredLocations.map((loc) => {
                const stats = getLocationStats(loc.id);
                const isSelected = isAllSelected || selectedLocations.includes(loc.id);

                return (
                  <div
                    key={loc.id}
                    className={`flex items-center gap-2 px-3 py-3 transition-colors ${
                      isSelected ? 'bg-emerald-50/40' : 'bg-white'
                    }`}
                  >
                    {/* Checkbox */}
                    <div
                      className="flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleLocationToggle(loc.id); }}
                    >
                      <Checkbox
                        checked={isSelected}
                        className="pointer-events-none h-5 w-5"
                      />
                    </div>

                    {/* Status Icon */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      loc.isSubmitted
                        ? 'bg-emerald-100'
                        : stats.totalItems > 0
                          ? 'bg-amber-100'
                          : 'bg-slate-100'
                    }`}>
                      {loc.isSubmitted ? (
                        <Lock className="w-4 h-4 text-emerald-600" />
                      ) : stats.totalItems > 0 ? (
                        <Clock className="w-4 h-4 text-amber-600" />
                      ) : (
                        <MapPin className="w-4 h-4 text-slate-400" />
                      )}
                    </div>

                    {/* Location Info */}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-slate-800 text-sm truncate block">
                        {loc.name || loc.code}
                      </span>
                      <div className="flex items-center gap-1">
                        {loc.isSubmitted && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px] px-1 py-0">
                            Submitted
                          </Badge>
                        )}
                        {loc.autoCreated && !loc.isSubmitted && (
                          <span className="text-[10px] text-purple-500 font-medium">Dynamic</span>
                        )}
                        {loc.isAssigned && !loc.isSubmitted && (
                          <span className="text-[10px] text-blue-500 font-medium">Assigned</span>
                        )}
                        {!loc.isSubmitted && !loc.autoCreated && !loc.isAssigned && (
                          <span className="text-[10px] text-slate-400 font-mono">{loc.code}</span>
                        )}
                      </div>
                    </div>

                    {/* Quantity */}
                    <div className="text-center min-w-[40px] flex-shrink-0">
                      <p className="text-base font-bold text-slate-700">{stats.totalQuantity}</p>
                      <p className="text-[10px] text-slate-400">Qty</p>
                    </div>

                    {/* Three Dots Menu */}
                    <div className="flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-5 h-5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {/* Scan / Open / Reopen */}
                          <DropdownMenuItem
                            onClick={() => handleOpenLocation(loc)}
                            className={loc.isSubmitted
                              ? "text-amber-600 focus:text-amber-600 focus:bg-amber-50"
                              : "text-emerald-600 focus:text-emerald-600 focus:bg-emerald-50"
                            }
                          >
                            {loc.isSubmitted ? (
                              <><Unlock className="w-4 h-4 mr-2" />Reopen</>
                            ) : (
                              <><ScanBarcode className="w-4 h-4 mr-2" />Scan</>
                            )}
                          </DropdownMenuItem>
                          {/* Rename */}
                          <DropdownMenuItem
                            onClick={() => handleRenameRequest(loc)}
                            className="text-blue-600 focus:text-blue-600 focus:bg-blue-50"
                          >
                            <Edit3 className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {/* Submit & Lock */}
                          {!loc.isSubmitted && stats.totalItems > 0 && (
                            <>
                              <DropdownMenuItem onClick={() => submitLocation(loc.id)}>
                                <Lock className="w-4 h-4 mr-2" />
                                Submit & Lock
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          {/* Delete */}
                          <DropdownMenuItem
                            onClick={() => handleSingleDeleteRequest(loc)}
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ============ MODALS ============ */}

      {/* Add Location Modal (Dynamic mode) */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Location</DialogTitle>
            <DialogDescription>Create a new counting zone or area</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Location Name</Label>
              <Input
                id="name"
                placeholder="e.g., Warehouse A - Section 1"
                value={newLocation.name}
                onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Location Code (for scanning)</Label>
              <Input
                id="code"
                placeholder="e.g., WH-A1"
                value={newLocation.code}
                onChange={(e) => setNewLocation({ ...newLocation, code: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAddLocation} className="bg-emerald-600 hover:bg-emerald-700">Add Location</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Locations Modal (Pre-Assigned mode) */}
      <Dialog open={showImportModal} onOpenChange={(open) => {
        setShowImportModal(open);
        if (!open) setImportResult(null);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              Import Assigned Locations
            </DialogTitle>
            <DialogDescription>Import locations from CSV file for scanning</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {assignedLocationsCount > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-2 text-blue-700">
                  <UserCheck className="w-4 h-4" />
                  <span className="text-sm font-medium">{assignedLocationsCount} locations assigned</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleClearAssigned} className="text-red-600 border-red-200 hover:bg-red-50">
                  <Trash2 className="w-3 h-3 mr-1" />Clear All
                </Button>
              </div>
            )}
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm font-medium text-slate-700 mb-2">CSV Format:</p>
              <code className="text-xs text-slate-500 block bg-white p-2 rounded border">Location Code,Location Name</code>
              <Button variant="link" size="sm" onClick={downloadSampleCSV} className="text-blue-600 p-0 h-auto mt-2">
                <Download className="w-3 h-3 mr-1" />Download Sample CSV
              </Button>
            </div>
            <div className="relative">
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-lg hover:border-blue-400 transition-colors cursor-pointer">
                <FileSpreadsheet className="w-10 h-10 text-slate-400 mb-3" />
                <p className="text-sm text-slate-500 mb-2">Click to upload</p>
                <p className="text-xs text-slate-400">CSV or TXT files</p>
                <input ref={fileInputRef} type="file" accept={getCSVAcceptTypes()} onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
            </div>
            {importResult && (
              <div className={`p-3 rounded-lg flex items-center gap-2 ${importResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                {importResult.success ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                <span className="text-sm">
                  {importResult.success ? `Successfully imported ${importResult.count} location(s)` : importResult.error}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportModal(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Location Modal */}
      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-blue-600" />Rename Location
            </DialogTitle>
            <DialogDescription>Enter a new name for this location</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Current Name</p>
              <p className="font-medium text-slate-800">{selectedLocation?.name}</p>
              <p className="text-xs text-slate-400 mt-1">Code: {selectedLocation?.code}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">New Location Name</Label>
              <Input
                id="new-name"
                placeholder="Enter new location name"
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleRenameConfirm()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRenameModal(false); setSelectedLocation(null); setNewLocationName(''); }}>Cancel</Button>
            <Button onClick={handleRenameConfirm} className="bg-blue-600 hover:bg-blue-700 text-white" disabled={!newLocationName.trim() || newLocationName.trim() === selectedLocation?.name}>
              <Edit3 className="w-4 h-4 mr-2" />Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Location Delete Modal */}
      <Dialog open={showSingleDeleteModal} onOpenChange={setShowSingleDeleteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />Delete Location?
            </DialogTitle>
            <DialogDescription>This will permanently delete the location and all its scanned items.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="font-medium text-slate-800">{selectedLocation?.name}</p>
              <p className="text-sm text-slate-500">Code: {selectedLocation?.code}</p>
              {selectedLocation && (
                <p className="text-sm text-red-600 mt-2">
                  {getLocationStats(selectedLocation.id).totalItems} items will be deleted
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSingleDeleteModal(false)}>Cancel</Button>
            <Button onClick={handleSingleDeleteConfirm} className="bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-4 h-4 mr-2" />Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Location Modal */}
      <Dialog open={showReopenModal} onOpenChange={setShowReopenModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />Reopen Location?
            </DialogTitle>
            <DialogDescription>This location has been completed. Reopening will allow editing.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600"><strong>Location:</strong> {selectedLocation?.name}</p>
            <p className="text-sm text-slate-500 mt-2">You will need to authenticate to proceed.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopenModal(false)}>Cancel</Button>
            <Button onClick={handleReopenConfirm} className="bg-amber-500 hover:bg-amber-600">Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />Confirm Delete
            </DialogTitle>
            <DialogDescription>Choose what to delete for the selected locations.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Delete Option:</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <input type="radio" name="deleteType" value="items" checked={deleteType === 'items'} onChange={() => setDeleteType('items')} className="w-4 h-4 text-red-600" />
                  <div>
                    <p className="font-medium text-sm">Delete Scanned Items Only</p>
                    <p className="text-xs text-slate-500">Keep locations, remove scanned data</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 border-red-200 bg-red-50">
                  <input type="radio" name="deleteType" value="location" checked={deleteType === 'location'} onChange={() => setDeleteType('location')} className="w-4 h-4 text-red-600" />
                  <div>
                    <p className="font-medium text-sm text-red-700">Delete Locations Completely</p>
                    <p className="text-xs text-red-600">Remove locations and all their data permanently</p>
                  </div>
                </label>
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3 space-y-1">
              <p className="text-sm"><strong>Locations:</strong> {isAllSelected ? 'All' : `${selectedLocations.filter(id => id !== 'all').length} selected`}</p>
              <p className="text-sm"><strong>Items:</strong> {reportItems.length}</p>
              <p className="text-sm"><strong>Quantity:</strong> {totalQuantity}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDeleteConfirm} className="bg-red-600 hover:bg-red-700">Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Authentication Modal */}
      <Dialog open={showAuthModal} onOpenChange={(open) => {
        setShowAuthModal(open);
        if (!open) {
          setAuthCredentials({ userId: '', password: '' });
          setAuthError('');
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />Authorization Required
            </DialogTitle>
            <DialogDescription>Enter your credentials to proceed.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {authError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />{authError}
              </p>
            )}
            <div>
              <Label htmlFor="auth-userId">User ID</Label>
              <Input id="auth-userId" type="text" value={authCredentials.userId} onChange={(e) => { setAuthCredentials({ ...authCredentials, userId: e.target.value }); setAuthError(''); }} placeholder="Enter user ID" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="auth-password">Password</Label>
              <Input id="auth-password" type="password" value={authCredentials.password} onChange={(e) => { setAuthCredentials({ ...authCredentials, password: e.target.value }); setAuthError(''); }} placeholder="Enter password" className="mt-1" onKeyPress={(e) => e.key === 'Enter' && handleAuthSubmit()} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAuthModal(false)}>Cancel</Button>
            <Button onClick={handleAuthSubmit} disabled={!authCredentials.userId || !authCredentials.password} className="bg-emerald-600 hover:bg-emerald-700">
              Authorize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reports;
