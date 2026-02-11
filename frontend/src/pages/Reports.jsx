import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { downloadCSV } from '../utils/fileDownload';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
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
  Lock
} from 'lucide-react';

const Reports = () => {
  const { locations, scannedItems, currentSession, masterProducts, deleteLocationData, deleteLocationFromReports, verifyAuthorizationCredentials } = useApp();
  const [selectedLocations, setSelectedLocations] = useState(['all']);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [deleteType, setDeleteType] = useState('items'); // 'items' or 'location'

  const isAllSelected = selectedLocations.includes('all');

  const handleLocationToggle = (locationId) => {
    if (locationId === 'all') {
      if (isAllSelected) {
        if (locations.length > 0) {
          setSelectedLocations([locations[0].id]);
        }
      } else {
        setSelectedLocations(['all']);
      }
    } else {
      setSelectedLocations(prev => {
        const newSelection = prev.filter(id => id !== 'all');
        if (newSelection.includes(locationId)) {
          const filtered = newSelection.filter(id => id !== locationId);
          return filtered.length === 0 ? ['all'] : filtered;
        } else {
          return [...newSelection, locationId];
        }
      });
    }
  };

  const selectAllLocations = () => {
    setSelectedLocations(['all']);
  };

  const clearSelections = () => {
    if (locations.length > 0) {
      setSelectedLocations([locations[0].id]);
    }
  };

  // Get items for selected locations
  const getLocationItems = useMemo(() => {
    if (isAllSelected) {
      return Object.entries(scannedItems).flatMap(([locId, items]) => {
        const loc = locations.find(l => l.id === locId);
        return items.map(item => ({ ...item, locationName: loc?.name || 'Unknown', locationId: locId }));
      });
    }
    if (selectedLocations.length === 0) return [];
    return selectedLocations.flatMap(locId => {
      const loc = locations.find(l => l.id === locId);
      return (scannedItems[locId] || []).map(item => ({ 
        ...item, locationName: loc?.name || 'Unknown', locationId: locId 
      }));
    });
  }, [selectedLocations, scannedItems, locations, isAllSelected]);

  const reportItems = getLocationItems;
  const totalQuantity = reportItems.reduce((sum, item) => sum + item.quantity, 0);
  const uniqueProducts = new Set(reportItems.map(item => item.barcode)).size;

  const getMasterProductDetails = (barcode) => masterProducts.find(p => p.barcode === barcode) || null;

  const getSelectionDisplayText = () => {
    if (isAllSelected) return 'All Locations';
    if (selectedLocations.length === 0) return 'No locations selected';
    if (selectedLocations.length === 1) {
      const loc = locations.find(l => l.id === selectedLocations[0]);
      return loc?.name || '1 location';
    }
    return `${selectedLocations.length} locations selected`;
  };

  // Get locations to delete
  const getLocationsToDelete = () => {
    if (isAllSelected) return locations.map(l => l.id);
    return selectedLocations;
  };

  // Handle delete button click - show confirmation first
  const handleDeleteClick = () => {
    if (reportItems.length === 0) return;
    setShowDeleteModal(true);
  };

  // Handle delete confirmation - show auth modal
  const handleDeleteConfirm = () => {
    setShowDeleteModal(false);
    setShowAuthModal(true);
    setAuthUsername('');
    setAuthPassword('');
    setAuthError('');
  };

  // Handle authentication and delete
  const handleAuthSubmit = () => {
    const result = verifyAuthorizationCredentials(authUsername, authPassword);
    if (result.success) {
      const locationsToDelete = getLocationsToDelete();
      
      if (deleteType === 'location') {
        // Delete locations completely (from both Reports and Locations)
        locationsToDelete.forEach(locId => {
          deleteLocationFromReports(locId);
        });
      } else {
        // Delete only the scanned items (keep locations)
        deleteLocationData(locationsToDelete);
      }
      
      setShowAuthModal(false);
      setDeleteSuccess(true);
      setTimeout(() => setDeleteSuccess(false), 3000);
      // Reset to all locations after delete
      setSelectedLocations(['all']);
    } else {
      setAuthError('Invalid credentials. Please try again.');
    }
  };

  const handleExportCSV = async () => {
    if (reportItems.length === 0) return;
    
    const headers = ['Location', 'Barcode', 'Product Name', 'SKU', 'Category', 'Price', 'Quantity', 'Scanned At', 'Status'];
    const rows = reportItems.map(item => {
      const masterProduct = getMasterProductDetails(item.barcode);
      return [
        `"${item.locationName}"`,
        item.barcode,
        `"${item.productName}"`,
        masterProduct?.sku || '',
        `"${masterProduct?.category || 'Unknown'}"`,
        masterProduct?.price?.toFixed(2) || '0.00',
        item.quantity,
        `"${new Date(item.scannedAt).toLocaleString()}"`,
        item.isMaster !== false ? 'Master' : 'Non-Master'
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-sm text-slate-500">Select locations to export or delete</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleExportCSV}
            className="border-slate-200"
            disabled={reportItems.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            onClick={handleEmailReport}
            className="border-slate-200"
            disabled={reportItems.length === 0}
          >
            <Mail className="w-4 h-4 mr-2" />
            Email
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeleteClick}
            disabled={reportItems.length === 0}
            className="bg-red-600 hover:bg-red-700"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Success Message */}
      {deleteSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">Data deleted successfully!</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <MapPin className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">
                  {isAllSelected ? locations.length : selectedLocations.length}
                </p>
                <p className="text-xs text-slate-500">{isAllSelected ? 'Total' : 'Selected'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{reportItems.length}</p>
                <p className="text-xs text-slate-500">Items</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <BarChart3 className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{totalQuantity}</p>
                <p className="text-xs text-slate-500">Quantity</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-teal-100 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-800">{uniqueProducts}</p>
                <p className="text-xs text-slate-500">Unique</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selection Info Bar */}
      <div className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-700">{getSelectionDisplayText()}</span>
          {!isAllSelected && selectedLocations.length > 0 && (
            <Badge variant="secondary" className="text-xs">{selectedLocations.length} of {locations.length}</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {!isAllSelected && (
            <Button variant="ghost" size="sm" onClick={selectAllLocations} className="h-7 text-xs text-emerald-600">
              <Check className="w-3 h-3 mr-1" />Select All
            </Button>
          )}
          {!isAllSelected && selectedLocations.length > 1 && (
            <Button variant="ghost" size="sm" onClick={clearSelections} className="h-7 text-xs text-slate-500">
              <X className="w-3 h-3 mr-1" />Clear
            </Button>
          )}
        </div>
      </div>

      {/* Location List */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: '200px' }}>
        <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* All Locations */}
          <div 
            className={`sticky top-0 z-10 flex items-center gap-3 p-4 border-b-2 border-slate-200 cursor-pointer transition-colors ${
              isAllSelected ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
            }`}
            onClick={() => handleLocationToggle('all')}
          >
            <Checkbox checked={isAllSelected} className="pointer-events-none h-5 w-5" />
            <div className="flex-1">
              <span className="text-base font-semibold text-slate-800">All Locations</span>
              <p className="text-xs text-slate-500">Select all {locations.length} locations</p>
            </div>
            <Badge className="bg-emerald-100 text-emerald-700 border-0">
              {Object.values(scannedItems).flat().length} items
            </Badge>
          </div>

          {/* Individual Locations */}
          <div className="divide-y divide-slate-100">
            {locations.map((loc) => {
              const itemCount = (scannedItems[loc.id] || []).length;
              const locQuantity = (scannedItems[loc.id] || []).reduce((sum, item) => sum + item.quantity, 0);
              const isSelected = selectedLocations.includes(loc.id);
              const isDisabled = isAllSelected;
              
              return (
                <div 
                  key={loc.id}
                  className={`flex items-center gap-3 p-4 cursor-pointer transition-colors ${
                    isDisabled ? 'opacity-50 cursor-not-allowed bg-slate-50' 
                      : isSelected ? 'bg-blue-50 hover:bg-blue-100' : 'bg-white hover:bg-slate-50'
                  }`}
                  onClick={() => !isDisabled && handleLocationToggle(loc.id)}
                >
                  <Checkbox checked={isSelected || isAllSelected} disabled={isDisabled} className="pointer-events-none h-5 w-5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-medium truncate ${isSelected ? 'text-blue-700' : 'text-slate-800'}`}>
                        {loc.name}
                      </span>
                      {loc.isSubmitted && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                          <CheckCircle2 className="w-3 h-3 mr-1" />Submitted
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{loc.code}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-700">{itemCount} items</p>
                    <p className="text-xs text-slate-500">{locQuantity} qty</p>
                  </div>
                </div>
              );
            })}
          </div>

          {locations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <MapPin className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-slate-500 font-medium">No locations available</p>
            </div>
          )}
        </div>
      </div>

      {/* Selected Locations Summary */}
      {!isAllSelected && selectedLocations.length > 0 && (
        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-700 mb-2 font-medium">Selected for Export/Delete:</p>
          <div className="flex flex-wrap gap-1">
            {selectedLocations.map(locId => {
              const loc = locations.find(l => l.id === locId);
              return (
                <Badge key={locId} variant="secondary" className="text-xs bg-white border border-blue-200 pr-1">
                  {loc?.name}
                  <button onClick={(e) => { e.stopPropagation(); handleLocationToggle(locId); }} className="ml-1 hover:bg-blue-200 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Choose what to delete for the selected locations.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {/* Delete Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Delete Option:</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
                  <input
                    type="radio"
                    name="deleteType"
                    value="items"
                    checked={deleteType === 'items'}
                    onChange={() => setDeleteType('items')}
                    className="w-4 h-4 text-red-600"
                  />
                  <div>
                    <p className="font-medium text-sm">Delete Scanned Items Only</p>
                    <p className="text-xs text-slate-500">Keep locations, remove scanned data</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50 border-red-200 bg-red-50">
                  <input
                    type="radio"
                    name="deleteType"
                    value="location"
                    checked={deleteType === 'location'}
                    onChange={() => setDeleteType('location')}
                    className="w-4 h-4 text-red-600"
                  />
                  <div>
                    <p className="font-medium text-sm text-red-700">Delete Locations Completely</p>
                    <p className="text-xs text-red-600">Remove locations from both Reports AND Locations list</p>
                  </div>
                </label>
              </div>
            </div>
            
            {/* Summary */}
            <div className="bg-slate-50 rounded-lg p-3 space-y-1">
              <p className="text-sm"><strong>Locations:</strong> {isAllSelected ? 'All Locations' : `${selectedLocations.length} selected`}</p>
              <p className="text-sm"><strong>Items to delete:</strong> {reportItems.length}</p>
              <p className="text-sm"><strong>Total quantity:</strong> {totalQuantity}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Authentication Modal */}
      <Dialog open={showAuthModal} onOpenChange={setShowAuthModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              Authorization Required
            </DialogTitle>
            <DialogDescription>
              Enter your credentials to confirm this delete action.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="auth-username">User ID</Label>
              <Input
                id="auth-username"
                type="text"
                value={authUsername}
                onChange={(e) => { setAuthUsername(e.target.value); setAuthError(''); }}
                placeholder="Enter your user ID"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                value={authPassword}
                onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                placeholder="Enter your password"
                className="mt-1"
                onKeyPress={(e) => e.key === 'Enter' && handleAuthSubmit()}
              />
            </div>
            {authError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                {authError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAuthModal(false)}>Cancel</Button>
            <Button onClick={handleAuthSubmit} disabled={!authUsername || !authPassword} className="bg-red-600 hover:bg-red-700">
              Delete Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reports;
