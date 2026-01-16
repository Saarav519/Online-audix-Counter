import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Package,
  MapPin,
  Save,
  X,
  Sparkles,
  Hash
} from 'lucide-react';
import { ScrollArea } from '../components/ui/scroll-area';

const ScanItems = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { 
    locations, 
    scannedItems, 
    settings,
    addScannedItem, 
    deleteScannedItem,
    updateItemQuantity,
    submitLocation,
    scanLocation,
    playSound,
    getNextPendingLocation
  } = useApp();

  const [selectedLocationId, setSelectedLocationId] = useState(searchParams.get('location') || '');
  const [locationInput, setLocationInput] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [lastScanResult, setLastScanResult] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locationSuccess, setLocationSuccess] = useState(null);
  
  const locationInputRef = useRef(null);
  const barcodeInputRef = useRef(null);
  const quantityInputRef = useRef(null);

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const locationItems = scannedItems[selectedLocationId] || [];
  const isLocationLocked = selectedLocation?.isSubmitted;

  // Single SKU mode: scanning only, no manual qty
  // Non-Single SKU mode: manual qty entry allowed
  const isSingleSkuMode = settings.singleSkuScanning;

  // In Pre-Assigned mode, redirect to Locations page if no location is selected
  // Scan Items should only be accessed by opening a location from the Locations page
  useEffect(() => {
    if (settings.locationScanMode === 'preassigned' && !searchParams.get('location')) {
      navigate('/locations');
    }
  }, [settings.locationScanMode, searchParams, navigate]);

  // Auto-focus location input on mount if no location selected
  useEffect(() => {
    if (!selectedLocationId && locationInputRef.current) {
      locationInputRef.current.focus();
    }
  }, []);

  // Auto-focus barcode input when location is selected
  useEffect(() => {
    if (selectedLocationId && barcodeInputRef.current && !isLocationLocked) {
      barcodeInputRef.current.focus();
    }
  }, [selectedLocationId, isLocationLocked]);

  // Update location input display when location is selected
  useEffect(() => {
    if (selectedLocation) {
      setLocationInput(selectedLocation.code);
    }
  }, [selectedLocation]);

  // Reset quantity input when mode changes
  useEffect(() => {
    if (isSingleSkuMode) {
      setQuantityInput('1');
    }
  }, [isSingleSkuMode]);

  // Handle location scan/input
  const handleLocationKeyDown = (e) => {
    if (e.key === 'Enter' && locationInput.trim()) {
      handleLocationScan();
    }
  };

  const handleLocationScan = () => {
    const input = locationInput.trim();
    if (!input) return;

    const result = scanLocation(input);
    
    if (result.success) {
      setSelectedLocationId(result.location.id);
      setLocationInput(result.location.code);
      setLocationError('');
      playSound(true);
      
      if (result.isNew) {
        setLocationSuccess(`New location "${input}" created automatically`);
        setTimeout(() => setLocationSuccess(null), 4000);
      } else {
        setLocationSuccess(null);
      }
      
      // Focus barcode input after location is selected
      setTimeout(() => {
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
      }, 100);
    } else {
      // Check if it's a locked location error
      if (result.isLocked) {
        setLocationError(result.error);
      } else {
        setLocationError(result.error);
      }
      setLocationSuccess(null);
      playSound(false);
      // Clear the input for locked/error cases
      setLocationInput('');
    }
  };

  // Clear selected location
  const clearLocation = () => {
    setSelectedLocationId('');
    setLocationInput('');
    setLocationError('');
    setLocationSuccess(null);
    if (locationInputRef.current) {
      locationInputRef.current.focus();
    }
  };

  // Handle barcode scan - auto-add when Enter is pressed
  const handleBarcodeKeyDown = (e) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      handleScan();
    }
  };

  const handleScan = () => {
    if (!barcodeInput.trim() || !selectedLocationId) return;
    
    // In Single SKU mode, always add quantity of 1
    // In Non-Single SKU mode, use the quantity input value
    const qty = isSingleSkuMode ? 1 : (parseInt(quantityInput) || 1);
    
    const result = addScannedItem(selectedLocationId, barcodeInput.trim(), qty);
    
    setLastScanResult({
      barcode: barcodeInput,
      quantity: qty,
      ...result
    });
    
    // Clear barcode input immediately after scan
    setBarcodeInput('');
    
    // Reset quantity to 1 after adding (for non-single SKU mode)
    if (!isSingleSkuMode) {
      setQuantityInput('1');
    }
    
    // Clear result after 3 seconds
    setTimeout(() => setLastScanResult(null), 3000);
    
    // Keep focus on barcode input for continuous scanning
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const handleDelete = (itemId) => {
    if (isLocationLocked) return;
    deleteScannedItem(selectedLocationId, itemId);
  };

  const handleQuantityUpdate = (itemId) => {
    if (isSingleSkuMode) return; // No manual editing in single SKU mode
    
    const newQty = parseInt(editQuantity);
    if (newQty > 0) {
      updateItemQuantity(selectedLocationId, itemId, newQty);
    }
    setEditingItemId(null);
    setEditQuantity('');
  };

  const handleQuantityIncrement = (itemId, currentQty) => {
    if (isSingleSkuMode) return; // No manual editing in single SKU mode
    updateItemQuantity(selectedLocationId, itemId, currentQty + 1);
  };

  const handleQuantityDecrement = (itemId, currentQty) => {
    if (isSingleSkuMode) return; // No manual editing in single SKU mode
    if (currentQty > 1) {
      updateItemQuantity(selectedLocationId, itemId, currentQty - 1);
    }
  };

  const handleSubmitLocation = () => {
    setShowSubmitModal(true);
  };

  const confirmSubmit = () => {
    submitLocation(selectedLocationId);
    setShowSubmitModal(false);
    
    // Check if we're in Pre-Assigned mode
    if (settings.locationScanMode === 'preassigned') {
      // In Pre-Assigned mode, navigate back to Locations page
      // This will show the list view with next pending location ready to open
      navigate('/locations');
      return;
    }
    
    // Dynamic mode - stay on scan page and auto-navigate to next pending location
    const nextLocation = getNextPendingLocation();
    
    if (nextLocation) {
      // Auto-navigate to next pending location
      setSelectedLocationId(nextLocation.id);
      setLocationInput(nextLocation.code);
      setBarcodeInput('');
      setLastScanResult(null);
      setLocationSuccess(`Location submitted! Now scanning: ${nextLocation.name}`);
      playSound(true);
      
      // Focus barcode input for next scan
      setTimeout(() => {
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
        setTimeout(() => setLocationSuccess(null), 4000);
      }, 100);
    } else {
      // No more pending locations
      setSelectedLocationId('');
      setLocationInput('');
      setBarcodeInput('');
      setLastScanResult(null);
      setLocationSuccess('All locations completed! No more pending locations.');
      
      setTimeout(() => {
        if (locationInputRef.current) {
          locationInputRef.current.focus();
        }
        setTimeout(() => setLocationSuccess(null), 4000);
      }, 100);
    }
  };

  const totalQuantity = locationItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Scan Items</h1>
          <p className="text-slate-500 mt-1">
            {settings.locationScanMode === 'dynamic' 
              ? 'Scan any location code - new locations will be created automatically'
              : 'Scan pre-assigned location codes only'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge 
            variant="outline" 
            className={`${settings.locationScanMode === 'dynamic' 
              ? 'bg-purple-50 text-purple-700 border-purple-200' 
              : 'bg-blue-50 text-blue-700 border-blue-200'}`}
          >
            {settings.locationScanMode === 'dynamic' ? 'Dynamic Mode' : 'Pre-Assigned Mode'}
          </Badge>
          <Badge 
            variant="outline" 
            className={`${isSingleSkuMode 
              ? 'bg-orange-50 text-orange-700 border-orange-200' 
              : 'bg-teal-50 text-teal-700 border-teal-200'}`}
          >
            {isSingleSkuMode ? 'Single SKU (Scan Only)' : 'Manual Qty Entry'}
          </Badge>
          {selectedLocationId && !isLocationLocked && locationItems.length > 0 && (
            <Button
              onClick={handleSubmitLocation}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Save className="w-4 h-4 mr-2" />
              Submit Location
            </Button>
          )}
        </div>
      </div>

      {/* Location & Barcode Scanner */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Location Scanner */}
        <Card className={`border-0 shadow-sm ${selectedLocationId ? 'bg-emerald-50/50' : ''}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              Scan Location
              {selectedLocationId && (
                <Badge className="bg-emerald-100 text-emerald-700 border-0 ml-2">
                  Selected
                </Badge>
              )}
              {selectedLocation?.autoCreated && (
                <Badge className="bg-purple-100 text-purple-700 border-0 ml-1">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Auto-Created
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Label className="text-sm text-slate-600 mb-1.5 block">
              {settings.locationScanMode === 'dynamic' 
                ? 'Scan any location code (auto-creates if new)'
                : 'Scan pre-assigned location code'}
            </Label>
            <div className="relative">
              <Input
                ref={locationInputRef}
                placeholder="Scan location code here..."
                value={locationInput}
                onChange={(e) => {
                  setLocationInput(e.target.value);
                  setLocationError('');
                }}
                onKeyDown={handleLocationKeyDown}
                className={`h-12 text-lg font-mono pr-10 ${selectedLocationId ? 'bg-emerald-50 border-emerald-300' : ''}`}
                autoComplete="off"
              />
              {selectedLocationId && (
                <button
                  onClick={clearLocation}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {locationError && (
              <div className="mt-2 p-2 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {locationError}
              </div>
            )}
            
            {locationSuccess && (
              <div className="mt-2 p-2 bg-purple-50 text-purple-700 text-sm rounded-lg flex items-center gap-2">
                <Sparkles className="w-4 h-4 flex-shrink-0" />
                {locationSuccess}
              </div>
            )}
            
            {selectedLocation && (
              <div className="mt-3 p-3 bg-emerald-100 rounded-lg">
                <p className="font-medium text-emerald-800">{selectedLocation.name}</p>
                <p className="text-sm text-emerald-600">Code: {selectedLocation.code}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Barcode Scanner */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ScanBarcode className="w-4 h-4 text-emerald-600" />
              Scan Barcode
              {selectedLocationId && (
                <Badge variant="secondary" className="ml-2">
                  Ready
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Barcode Input */}
              <div>
                <Label className="text-sm text-slate-600 mb-1.5 block">
                  {isSingleSkuMode 
                    ? 'Scan barcode (each scan = 1 unit)'
                    : 'Scan barcode, then enter quantity'}
                </Label>
                <div className="flex gap-2">
                  <Input
                    ref={barcodeInputRef}
                    placeholder={selectedLocationId ? "Scan barcode here..." : "Select location first"}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    onKeyDown={handleBarcodeKeyDown}
                    disabled={!selectedLocationId || isLocationLocked}
                    className="h-12 text-lg font-mono flex-1"
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Quantity Input - Only shown when Single SKU mode is OFF */}
              {!isSingleSkuMode && (
                <div className={`p-4 rounded-xl border-2 border-dashed ${
                  selectedLocationId && barcodeInput 
                    ? 'border-teal-300 bg-teal-50' 
                    : 'border-slate-200 bg-slate-50'
                }`}>
                  <Label className="text-sm font-medium text-slate-700 mb-2 block flex items-center gap-2">
                    <Hash className="w-4 h-4" />
                    Enter Quantity (Manual Entry)
                  </Label>
                  <div className="flex gap-2 items-center">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantityInput(String(Math.max(1, parseInt(quantityInput) - 1)))}
                      disabled={!selectedLocationId || isLocationLocked}
                      className="h-10 w-10"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Input
                      ref={quantityInputRef}
                      type="number"
                      min="1"
                      value={quantityInput}
                      onChange={(e) => setQuantityInput(e.target.value)}
                      disabled={!selectedLocationId || isLocationLocked}
                      className="h-10 text-center text-lg font-bold w-24"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantityInput(String(parseInt(quantityInput) + 1))}
                      disabled={!selectedLocationId || isLocationLocked}
                      className="h-10 w-10"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      onClick={handleScan}
                      disabled={!selectedLocationId || !barcodeInput.trim() || isLocationLocked}
                      className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white ml-2"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Scan barcode once, enter quantity, then click Add
                  </p>
                </div>
              )}

              {/* Add button for Single SKU mode */}
              {isSingleSkuMode && (
                <div className="flex gap-2">
                  <Button
                    onClick={handleScan}
                    disabled={!selectedLocationId || !barcodeInput.trim() || isLocationLocked}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <ScanBarcode className="w-5 h-5 mr-2" />
                    Add (Qty: 1)
                  </Button>
                </div>
              )}

              {/* Mode Info */}
              {isSingleSkuMode && (
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-sm text-orange-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <strong>Single SKU Mode:</strong> Each scan adds exactly 1 unit. Manual quantity entry is disabled.
                  </p>
                </div>
              )}

              {/* Last Scan Result */}
              {lastScanResult && (
                <div className={`p-3 rounded-lg flex items-center gap-2 ${
                  lastScanResult.success 
                    ? lastScanResult.isValid 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : 'bg-amber-50 text-amber-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {lastScanResult.success ? (
                    lastScanResult.isValid ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <AlertCircle className="w-5 h-5" />
                    )
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {lastScanResult.success 
                        ? lastScanResult.isValid 
                          ? `Added ${lastScanResult.quantity} unit(s) successfully` 
                          : `Non-master item added (${lastScanResult.quantity} unit(s))`
                        : lastScanResult.error}
                    </p>
                    <p className="text-xs opacity-75 font-mono">{lastScanResult.barcode}</p>
                  </div>
                </div>
              )}

              {isLocationLocked && (
                <div className="p-3 bg-amber-50 rounded-lg flex items-center gap-2 text-sm text-amber-700">
                  <Lock className="w-4 h-4" />
                  This location is submitted and locked
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Scanned Items List */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              Scanned Items
              {selectedLocationId && (
                <Badge variant="secondary" className="ml-2">
                  {locationItems.length} items • {totalQuantity} qty
                </Badge>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedLocationId ? (
            <div className="text-center py-12">
              <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">Scan a location code to view items</p>
              <p className="text-sm text-slate-400 mt-1">
                {settings.locationScanMode === 'dynamic' 
                  ? 'Any location code will work - new ones are created automatically'
                  : 'Only pre-assigned location codes are allowed'}
              </p>
            </div>
          ) : locationItems.length === 0 ? (
            <div className="text-center py-12">
              <ScanBarcode className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No items scanned yet</p>
              <p className="text-sm text-slate-400 mt-1">
                {isSingleSkuMode 
                  ? 'Scan a barcode to add 1 unit at a time'
                  : 'Scan a barcode and enter quantity to add items'}
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Barcode</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center w-[180px]">Quantity</TableHead>
                    <TableHead className="text-center w-[100px]">Status</TableHead>
                    <TableHead className="text-right w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locationItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.barcode}</TableCell>
                      <TableCell>
                        <p className="font-medium">{item.productName}</p>
                      </TableCell>
                      <TableCell className="text-center">
                        {/* In Single SKU mode, show quantity as read-only */}
                        {isSingleSkuMode ? (
                          <span className="font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded">
                            {item.quantity}
                          </span>
                        ) : (
                          // In Non-Single SKU mode, allow editing
                          editingItemId === item.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="number"
                                min="1"
                                value={editQuantity}
                                onChange={(e) => setEditQuantity(e.target.value)}
                                className="w-20 h-8 text-center"
                                autoFocus
                                onKeyPress={(e) => e.key === 'Enter' && handleQuantityUpdate(item.id)}
                                onBlur={() => handleQuantityUpdate(item.id)}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              {!isLocationLocked && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleQuantityDecrement(item.id, item.quantity)}
                                  disabled={item.quantity <= 1}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                              )}
                              <span 
                                className={`font-medium min-w-[40px] text-center ${!isLocationLocked ? 'cursor-pointer hover:text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded' : ''}`}
                                onClick={() => {
                                  if (!isLocationLocked) {
                                    setEditingItemId(item.id);
                                    setEditQuantity(String(item.quantity));
                                  }
                                }}
                              >
                                {item.quantity}
                              </span>
                              {!isLocationLocked && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => handleQuantityIncrement(item.id, item.quantity)}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          )
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {item.isMaster !== false ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0">Master</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-0">Non-Master</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!isLocationLocked && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Submit Confirmation Modal */}
      <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-600" />
              Submit Location?
            </DialogTitle>
            <DialogDescription>
              Once submitted, this location will be locked and no further edits can be made without authentication.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <p className="text-sm"><strong>Location:</strong> {selectedLocation?.name}</p>
            <p className="text-sm"><strong>Total Items:</strong> {locationItems.length}</p>
            <p className="text-sm"><strong>Total Quantity:</strong> {totalQuantity}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitModal(false)}>
              Cancel
            </Button>
            <Button onClick={confirmSubmit} className="bg-emerald-600 hover:bg-emerald-700">
              Submit & Lock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScanItems;
