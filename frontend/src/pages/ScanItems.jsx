import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
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
  Camera,
  Keyboard,
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
    masterProducts,
    addScannedItem, 
    deleteScannedItem,
    updateItemQuantity,
    submitLocation,
    updateSettings,
    login
  } = useApp();

  const [selectedLocationId, setSelectedLocationId] = useState(searchParams.get('location') || '');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [scanMode, setScanMode] = useState('manual'); // 'manual' or 'camera'
  const [lastScanResult, setLastScanResult] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authCredentials, setAuthCredentials] = useState({ userId: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [editQuantity, setEditQuantity] = useState('');
  
  const barcodeInputRef = useRef(null);

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const locationItems = scannedItems[selectedLocationId] || [];
  const isLocationLocked = selectedLocation?.isSubmitted;

  useEffect(() => {
    if (barcodeInputRef.current && !isLocationLocked) {
      barcodeInputRef.current.focus();
    }
  }, [selectedLocationId, isLocationLocked]);

  const handleScan = () => {
    if (!barcodeInput.trim() || !selectedLocationId) return;
    
    const quantity = parseInt(quantityInput) || 1;
    const result = addScannedItem(selectedLocationId, barcodeInput.trim(), quantity);
    
    setLastScanResult({
      barcode: barcodeInput,
      ...result
    });
    
    setBarcodeInput('');
    setQuantityInput('1');
    
    // Clear result after 3 seconds
    setTimeout(() => setLastScanResult(null), 3000);
    
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleScan();
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

  const handleSubmitLocation = () => {
    setShowSubmitModal(true);
  };

  const confirmSubmit = () => {
    submitLocation(selectedLocationId);
    setShowSubmitModal(false);
    navigate('/locations');
  };

  const totalQuantity = locationItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-slate-800">Scan Items</h1>
          <p className="text-slate-500 mt-1">Scan barcodes to count inventory</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scanner Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Location Selection */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-600" />
                Select Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.filter(l => !l.isSubmitted).map((loc) => (
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

          {/* Scan Settings */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Scan Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="single-sku" className="text-sm">Single SKU Mode</Label>
                <Switch
                  id="single-sku"
                  checked={settings.singleSkuScanning}
                  onCheckedChange={(checked) => updateSettings({ singleSkuScanning: checked })}
                />
              </div>
              <p className="text-xs text-slate-500">
                {settings.singleSkuScanning 
                  ? "Each scan creates a new entry" 
                  : "Duplicate scans increase quantity"}
              </p>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="non-master" className="text-sm">Allow Non-Master Products</Label>
                <Switch
                  id="non-master"
                  checked={settings.allowNonMasterProducts}
                  onCheckedChange={(checked) => updateSettings({ allowNonMasterProducts: checked })}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="sound" className="text-sm">Sound Feedback</Label>
                <Switch
                  id="sound"
                  checked={settings.soundEnabled}
                  onCheckedChange={(checked) => updateSettings({ soundEnabled: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Barcode Input */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ScanBarcode className="w-4 h-4 text-emerald-600" />
                Barcode Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Scan Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={scanMode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScanMode('manual')}
                  className={scanMode === 'manual' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                >
                  <Keyboard className="w-4 h-4 mr-2" />
                  Manual
                </Button>
                <Button
                  variant={scanMode === 'camera' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setScanMode('camera')}
                  className={scanMode === 'camera' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Camera
                </Button>
              </div>

              {scanMode === 'camera' ? (
                <div className="aspect-video bg-slate-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Camera className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Camera scanner</p>
                    <p className="text-xs text-slate-400">Coming soon</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="barcode">Barcode</Label>
                    <Input
                      id="barcode"
                      ref={barcodeInputRef}
                      placeholder="Scan or enter barcode"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      disabled={!selectedLocationId || isLocationLocked}
                      className="h-12 text-lg font-mono"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Quantity</Label>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantityInput(String(Math.max(1, parseInt(quantityInput) - 1)))}
                        disabled={!selectedLocationId || isLocationLocked}
                      >
                        <Minus className="w-4 h-4" />
                      </Button>
                      <Input
                        id="quantity"
                        type="number"
                        min="1"
                        value={quantityInput}
                        onChange={(e) => setQuantityInput(e.target.value)}
                        disabled={!selectedLocationId || isLocationLocked}
                        className="text-center text-lg"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setQuantityInput(String(parseInt(quantityInput) + 1))}
                        disabled={!selectedLocationId || isLocationLocked}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    onClick={handleScan}
                    disabled={!selectedLocationId || !barcodeInput.trim() || isLocationLocked}
                    className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <ScanBarcode className="w-5 h-5 mr-2" />
                    Add Item
                  </Button>
                </>
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
                          ? 'Item added successfully' 
                          : 'Non-master item added'
                        : lastScanResult.error}
                    </p>
                    <p className="text-xs opacity-75">{lastScanResult.barcode}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Scanned Items List */}
        <div className="lg:col-span-2">
          <Card className="border-0 shadow-sm h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Package className="w-4 h-4 text-emerald-600" />
                  Scanned Items
                  <Badge variant="secondary" className="ml-2">
                    {locationItems.length} items • {totalQuantity} qty
                  </Badge>
                </CardTitle>
                
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
            </CardHeader>
            <CardContent>
              {!selectedLocationId ? (
                <div className="text-center py-12">
                  <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">Select a location to start scanning</p>
                </div>
              ) : locationItems.length === 0 ? (
                <div className="text-center py-12">
                  <ScanBarcode className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No items scanned yet</p>
                  <p className="text-sm text-slate-400 mt-1">Start scanning to add items</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Barcode</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-center w-[120px]">Quantity</TableHead>
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
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min="1"
                                  value={editQuantity}
                                  onChange={(e) => setEditQuantity(e.target.value)}
                                  className="w-20 h-8 text-center"
                                  autoFocus
                                  onKeyPress={(e) => e.key === 'Enter' && handleQuantityUpdate(item.id)}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => handleQuantityUpdate(item.id)}
                                >
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                </Button>
                              </div>
                            ) : (
                              <div 
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ${!isLocationLocked ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                                onClick={() => {
                                  if (!isLocationLocked) {
                                    setEditingItemId(item.id);
                                    setEditQuantity(String(item.quantity));
                                  }
                                }}
                              >
                                <span className="font-medium">{item.quantity}</span>
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
        </div>
      </div>

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
