import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
  Save
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
    submitLocation
  } = useApp();

  const [selectedLocationId, setSelectedLocationId] = useState(searchParams.get('location') || '');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastScanResult, setLastScanResult] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editQuantity, setEditQuantity] = useState('');
  
  const barcodeInputRef = useRef(null);

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const locationItems = scannedItems[selectedLocationId] || [];
  const isLocationLocked = selectedLocation?.isSubmitted;

  // Auto-focus barcode input when location is selected
  useEffect(() => {
    if (barcodeInputRef.current && selectedLocationId && !isLocationLocked) {
      barcodeInputRef.current.focus();
    }
  }, [selectedLocationId, isLocationLocked]);

  // Auto-submit barcode on Enter or when barcode is complete (for scanner)
  const handleBarcodeChange = (e) => {
    const value = e.target.value;
    setBarcodeInput(value);
  };

  // Handle barcode scan - auto-add when Enter is pressed or scanner sends complete barcode
  const handleBarcodeKeyDown = (e) => {
    if (e.key === 'Enter' && barcodeInput.trim()) {
      handleScan();
    }
  };

  const handleScan = () => {
    if (!barcodeInput.trim() || !selectedLocationId) return;
    
    const result = addScannedItem(selectedLocationId, barcodeInput.trim(), 1);
    
    setLastScanResult({
      barcode: barcodeInput,
      ...result
    });
    
    // Clear barcode input immediately after scan
    setBarcodeInput('');
    
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
    const newQty = parseInt(editQuantity);
    if (newQty > 0) {
      updateItemQuantity(selectedLocationId, itemId, newQty);
    }
    setEditingItemId(null);
    setEditQuantity('');
  };

  const handleQuantityIncrement = (itemId, currentQty) => {
    updateItemQuantity(selectedLocationId, itemId, currentQty + 1);
  };

  const handleQuantityDecrement = (itemId, currentQty) => {
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
    navigate('/locations');
  };

  // Handle location change - always allowed
  const handleLocationChange = (newLocationId) => {
    setSelectedLocationId(newLocationId);
    setBarcodeInput('');
    setLastScanResult(null);
  };

  const totalQuantity = locationItems.reduce((sum, item) => sum + item.quantity, 0);

  // Filter out submitted locations from dropdown
  const availableLocations = locations.filter(l => !l.isSubmitted);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Scan Items</h1>
          <p className="text-slate-500 mt-1">Scan barcodes to count inventory</p>
        </div>
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

      {/* Location Selection & Barcode Input */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Location Selection */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              Select Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedLocationId} onValueChange={handleLocationChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a location" />
              </SelectTrigger>
              <SelectContent>
                {availableLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedLocation?.isSubmitted && (
              <div className="mt-3 p-3 bg-amber-50 rounded-lg flex items-center gap-2 text-sm text-amber-700">
                <Lock className="w-4 h-4" />
                This location is locked
              </div>
            )}
          </CardContent>
        </Card>

        {/* Barcode Input - Auto Entry */}
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ScanBarcode className="w-4 h-4 text-emerald-600" />
              Barcode Scanner
              {selectedLocationId && (
                <Badge variant="secondary" className="ml-2">
                  Ready to scan
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="barcode" className="text-sm text-slate-600 mb-1.5 block">
                  Scan or type barcode (Press Enter to add)
                </Label>
                <Input
                  id="barcode"
                  ref={barcodeInputRef}
                  placeholder="Scan barcode here..."
                  value={barcodeInput}
                  onChange={handleBarcodeChange}
                  onKeyDown={handleBarcodeKeyDown}
                  disabled={!selectedLocationId || isLocationLocked}
                  className="h-14 text-xl font-mono tracking-wider"
                  autoComplete="off"
                />
              </div>
              <Button
                onClick={handleScan}
                disabled={!selectedLocationId || !barcodeInput.trim() || isLocationLocked}
                className="h-14 px-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add
              </Button>
            </div>

            {/* Last Scan Result */}
            {lastScanResult && (
              <div className={`mt-4 p-3 rounded-lg flex items-center gap-2 ${
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
                        ? 'Item added successfully' 
                        : 'Non-master item added'
                      : lastScanResult.error}
                  </p>
                  <p className="text-xs opacity-75 font-mono">{lastScanResult.barcode}</p>
                </div>
              </div>
            )}

            {!selectedLocationId && (
              <p className="mt-3 text-sm text-slate-500">
                Please select a location first to start scanning
              </p>
            )}
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
              <p className="text-slate-500">Select a location to view scanned items</p>
            </div>
          ) : locationItems.length === 0 ? (
            <div className="text-center py-12">
              <ScanBarcode className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No items scanned yet</p>
              <p className="text-sm text-slate-400 mt-1">Scan a barcode to add items</p>
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
                        {editingItemId === item.id ? (
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
                              className={`font-medium min-w-[40px] text-center ${!isLocationLocked ? 'cursor-pointer hover:text-emerald-600' : ''}`}
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
