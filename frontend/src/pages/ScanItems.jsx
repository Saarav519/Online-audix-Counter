import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useDeviceDetection, useHardwareScanner } from '../hooks/useDeviceDetection';
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
  Hash,
  Send,
  ArrowLeft
} from 'lucide-react';

// Memoized ScannedItem component for better performance with large lists
const ScannedItemRow = memo(({ 
  item, 
  isEditing, 
  editQuantity, 
  setEditQuantity, 
  onQuantityUpdate, 
  onDelete,
  isSingleSkuMode,
  isLocationLocked,
  onStartEdit
}) => {
  return (
    <div 
      className="flex items-center justify-between p-2 bg-slate-50 rounded-lg gap-2"
    >
      {/* Barcode & Description - LARGER FONT SIZE */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-base text-slate-800 font-mono font-bold truncate">{item.barcode}</p>
        <p className="text-xs text-slate-500 truncate">{item.productName}</p>
      </div>
      {/* Quantity & Delete */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isEditing ? (
          <Input
            type="number"
            min="1"
            value={editQuantity}
            onChange={(e) => setEditQuantity(e.target.value)}
            className="w-14 h-7 text-center text-sm font-bold p-1"
            autoFocus
            onKeyPress={(e) => e.key === 'Enter' && onQuantityUpdate(item.id)}
            onBlur={() => onQuantityUpdate(item.id)}
          />
        ) : (
          <span 
            className={`font-bold text-sm min-w-[32px] text-center px-2 py-1 rounded ${
              !isSingleSkuMode && !isLocationLocked 
                ? 'bg-emerald-100 text-emerald-700 cursor-pointer active:bg-emerald-200' 
                : 'bg-slate-100 text-slate-700'
            }`}
            onClick={() => {
              if (!isSingleSkuMode && !isLocationLocked) {
                onStartEdit(item.id, String(item.quantity));
              }
            }}
          >
            {item.quantity}
          </span>
        )}
        {!isLocationLocked && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
            onClick={() => onDelete(item.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
});

ScannedItemRow.displayName = 'ScannedItemRow';

const ScanItems = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isScanner, isSmallScreen } = useDeviceDetection();
  const showScannerMode = isScanner || isSmallScreen;
  
  const { 
    locations, 
    scannedItems, 
    settings,
    addScannedItem, 
    deleteScannedItem,
    updateItemQuantity,
    submitLocation,
    scanLocation,
    saveTempLocation,
    playSound,
    getNextPendingLocation,
    clearLocationItems,
    getProductByBarcode
  } = useApp();

  // Initialize selectedLocationId from URL param or localStorage
  const [selectedLocationId, setSelectedLocationId] = useState(() => {
    const urlLocation = searchParams.get('location');
    if (urlLocation) return urlLocation;
    // Restore from localStorage if no URL param
    const savedLocation = localStorage.getItem('audix_current_scan_location');
    return savedLocation || '';
  });
  const [locationInput, setLocationInput] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [quantityInput, setQuantityInput] = useState('1');
  const [lastScanResult, setLastScanResult] = useState(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editQuantity, setEditQuantity] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locationSuccess, setLocationSuccess] = useState(null);
  const [waitingForLocationScan, setWaitingForLocationScan] = useState(() => {
    const urlLocation = searchParams.get('location');
    if (urlLocation) return false;
    const savedLocation = localStorage.getItem('audix_current_scan_location');
    return !savedLocation;
  });
  const [scanCount, setScanCount] = useState(0); // Track successful scans for feedback
  const [showBackConfirmDialog, setShowBackConfirmDialog] = useState(false); // Back confirmation dialog
  
  // ============================================
  // TEMPORARY SCANNED ITEMS - Auto-saved to localStorage for persistence
  // Final save to context happens when user clicks "Submit Location"
  // ============================================
  const [tempScannedItems, setTempScannedItems] = useState([]);
  
  // Temporary location for Dynamic mode - only saved when items are submitted
  const [tempLocation, setTempLocation] = useState(null);
  
  // ============================================
  // AUTO-SAVE: Persist temp items to localStorage whenever they change
  // This prevents data loss when navigating away
  // ============================================
  useEffect(() => {
    if (selectedLocationId && tempScannedItems.length > 0) {
      const key = `audix_temp_items_${selectedLocationId}`;
      localStorage.setItem(key, JSON.stringify(tempScannedItems));
      console.log(`💾 Auto-saved ${tempScannedItems.length} items (${tempScannedItems.reduce((s, i) => s + i.quantity, 0)} qty) for location ${selectedLocationId}`);
    }
  }, [tempScannedItems, selectedLocationId]);
  
  // Track if we've loaded items for current location to prevent re-loading
  const loadedLocationRef = useRef(null);
  
  // ============================================
  // LOAD: Load existing temp items when a location is selected
  // Only loads once per location selection
  // ============================================
  useEffect(() => {
    // Skip if already loaded for this location or no location selected
    if (!selectedLocationId || loadedLocationRef.current === selectedLocationId) {
      return;
    }
    
    console.log(`🔄 Location changed to: ${selectedLocationId}, loading items...`);
    
    // First, try to load temp items from localStorage (unsaved scanning session)
    const key = `audix_temp_items_${selectedLocationId}`;
    const savedTempItems = localStorage.getItem(key);
    
    if (savedTempItems) {
      try {
        const items = JSON.parse(savedTempItems);
        if (Array.isArray(items) && items.length > 0) {
          setTempScannedItems(items);
          loadedLocationRef.current = selectedLocationId;
          console.log(`📥 Loaded ${items.length} temp items (${items.reduce((s, i) => s + i.quantity, 0)} qty) from localStorage`);
          return;
        }
      } catch (e) {
        console.warn('Failed to parse saved temp items:', e);
      }
    }
    
    // If no temp items, check if this location has submitted items in context
    // and load them for editing (if location is not locked)
    const existingItems = scannedItems[selectedLocationId];
    const location = locations.find(l => l.id === selectedLocationId);
    
    if (existingItems && existingItems.length > 0 && !location?.isSubmitted) {
      // Convert context items to temp format for editing
      const tempFormat = existingItems.map(item => ({
        id: item.id || `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        barcode: item.barcode,
        productName: item.productName || `Unknown (${item.barcode.slice(-6)})`,
        quantity: item.quantity,
        scannedAt: item.scannedAt || new Date().toISOString(),
        isMaster: item.isMaster
      }));
      setTempScannedItems(tempFormat);
      loadedLocationRef.current = selectedLocationId;
      console.log(`📥 Loaded ${tempFormat.length} existing items from context`);
    } else {
      // No items to load - start fresh
      setTempScannedItems([]);
      loadedLocationRef.current = selectedLocationId;
      console.log(`📥 No items found for location, starting fresh`);
    }
  }, [selectedLocationId, scannedItems, locations]);
  
  // Reset loaded location when location is deselected
  useEffect(() => {
    if (!selectedLocationId) {
      loadedLocationRef.current = null;
      setTempScannedItems([]);
    }
  }, [selectedLocationId]);
  
  const locationInputRef = useRef(null);
  const barcodeInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const itemsListRef = useRef(null); // Ref for auto-scrolling to last item
  const itemsListDesktopRef = useRef(null); // Ref for desktop items list
  
  // Refs for fast scanning - avoid re-renders during rapid scanning
  const selectedLocationIdRef = useRef(selectedLocationId);
  const waitingForLocationScanRef = useRef(waitingForLocationScan);
  const isSingleSkuModeRef = useRef(settings.singleSkuScanning);
  const quantityInputRef2 = useRef(quantityInput);
  const lastScanTimeRef = useRef(0);
  const scanResultTimeoutRef = useRef(null);
  
  // Ref to track if input is from hardware scanner (fast input)
  const lastInputTimeRef = useRef(0);
  const inputBufferRef = useRef('');
  const scannerInputTimeoutRef = useRef(null);

  // Persist current location to localStorage whenever it changes
  useEffect(() => {
    if (selectedLocationId) {
      localStorage.setItem('audix_current_scan_location', selectedLocationId);
    } else {
      localStorage.removeItem('audix_current_scan_location');
    }
  }, [selectedLocationId]);

  // Keep refs in sync with state
  useEffect(() => {
    selectedLocationIdRef.current = selectedLocationId;
  }, [selectedLocationId]);
  
  useEffect(() => {
    waitingForLocationScanRef.current = waitingForLocationScan;
  }, [waitingForLocationScan]);
  
  useEffect(() => {
    isSingleSkuModeRef.current = settings.singleSkuScanning;
  }, [settings.singleSkuScanning]);
  
  useEffect(() => {
    quantityInputRef2.current = quantityInput;
  }, [quantityInput]);

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const isLocationLocked = selectedLocation?.isSubmitted;

  // Single SKU mode: scanning only, no manual qty
  // Non-Single SKU mode: manual qty entry allowed
  const isSingleSkuMode = settings.singleSkuScanning;

  // ============================================
  // USE TEMPORARY ITEMS - Not saved until Submit
  // locationItems now uses tempScannedItems (local state)
  // ============================================
  const locationItems = tempScannedItems;

  // Memoize reversed items to prevent unnecessary re-renders during fast scanning
  const reversedItems = useMemo(() => {
    return [...locationItems].reverse();
  }, [locationItems]);

  // Memoize total quantity calculation
  const totalQuantity = useMemo(() => {
    return locationItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [locationItems]);

  // ============================================
  // LOCAL ITEM MANAGEMENT - Items stored in temp state
  // Only saved to context when "Submit Location" is clicked
  // ============================================
  
  // Add item to temporary state (not saved until submit)
  const addTempItem = useCallback((barcode, quantity = 1) => {
    const product = getProductByBarcode ? getProductByBarcode(barcode) : null;
    const isValidBarcode = product !== undefined && product !== null;
    
    // Check if non-master products are allowed
    if (!isValidBarcode && !settings.allowNonMasterProducts) {
      return { success: false, error: 'Barcode not in master list', isValid: false };
    }
    
    let newItem = null;
    
    setTempScannedItems(prev => {
      const existingIndex = prev.findIndex(item => item.barcode === barcode);
      
      if (settings.singleSkuScanning) {
        // Single SKU Mode: same barcode increments qty, moves to end
        if (existingIndex !== -1) {
          const existingItem = prev[existingIndex];
          const filteredItems = prev.filter((_, idx) => idx !== existingIndex);
          newItem = {
            ...existingItem,
            quantity: existingItem.quantity + 1,
            scannedAt: new Date().toISOString()
          };
          return [...filteredItems, newItem];
        } else {
          newItem = {
            id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            barcode,
            productName: product ? product.name : `Unknown (${barcode.slice(-6)})`,
            quantity: 1,
            scannedAt: new Date().toISOString(),
            isMaster: !!product
          };
          return [...prev, newItem];
        }
      } else {
        // Non-Single SKU Mode
        if (existingIndex !== -1) {
          const existingItem = prev[existingIndex];
          const filteredItems = prev.filter((_, idx) => idx !== existingIndex);
          newItem = {
            ...existingItem,
            quantity: existingItem.quantity + quantity,
            scannedAt: new Date().toISOString()
          };
          return [...filteredItems, newItem];
        } else {
          newItem = {
            id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            barcode,
            productName: product ? product.name : `Unknown (${barcode.slice(-6)})`,
            quantity,
            scannedAt: new Date().toISOString(),
            isMaster: !!product
          };
          return [...prev, newItem];
        }
      }
    });
    
    return { success: true, isValid: isValidBarcode, product, item: newItem };
  }, [getProductByBarcode, settings.allowNonMasterProducts, settings.singleSkuScanning]);
  
  // Delete item from temp state
  const deleteTempItem = useCallback((itemId) => {
    setTempScannedItems(prev => prev.filter(item => item.id !== itemId));
  }, []);
  
  // Update item quantity in temp state
  const updateTempItemQuantity = useCallback((itemId, newQuantity) => {
    setTempScannedItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, quantity: newQuantity } : item
    ));
  }, []);
  
  // Clear all temp items (including from localStorage)
  const clearTempItems = useCallback(() => {
    if (selectedLocationId) {
      const key = `audix_temp_items_${selectedLocationId}`;
      localStorage.removeItem(key);
      console.log(`🗑️ Cleared temp items for location ${selectedLocationId}`);
    }
    setTempScannedItems([]);
  }, [selectedLocationId]);

  // HIGH-PERFORMANCE Hardware scanner callback
  // Uses refs instead of state to avoid re-render delays during fast scanning
  const handleHardwareScan = useCallback((scannedValue) => {
    if (!scannedValue) return;
    
    const currentTime = Date.now();
    const timeSinceLastScan = currentTime - lastScanTimeRef.current;
    lastScanTimeRef.current = currentTime;
    
    // If no location selected, treat scan as location code
    if (!selectedLocationIdRef.current || waitingForLocationScanRef.current) {
      setLocationInput(scannedValue);
      const result = scanLocation(scannedValue);
      if (result.success) {
        setSelectedLocationId(result.location.id);
        // Store temp location if it's a new dynamic location
        if (result.isTemp) {
          setTempLocation(result.location);
        } else {
          setTempLocation(null);
        }
        setLocationError('');
        setLocationSuccess(`Location: ${result.location.name}`);
        setWaitingForLocationScan(false);
        playSound(true);
        setTimeout(() => setLocationSuccess(null), 3000);
      } else {
        setLocationError(result.error);
        playSound(false);
      }
    } else {
      // FAST BARCODE PROCESSING - Add to TEMP state (not saved until submit)
      const qty = isSingleSkuModeRef.current ? 1 : (parseInt(quantityInputRef2.current) || 1);
      const result = addTempItem(scannedValue, qty);
      
      if (result.success) {
        // Update scan count for feedback
        setScanCount(prev => prev + 1);
        
        // Show brief feedback (shorter timeout for rapid scanning)
        // Clear any pending timeout to avoid stale results
        if (scanResultTimeoutRef.current) {
          clearTimeout(scanResultTimeoutRef.current);
        }
        
        setLastScanResult({ 
          success: true, 
          message: `✓ ${result.item?.productName || scannedValue}`, 
          item: result.item,
          isValid: result.isValid,
          barcode: scannedValue,
          quantity: qty,
          scanTime: timeSinceLastScan
        });
        
        // Clear barcode input immediately for next scan
        setBarcodeInput('');
        
        // Play sound (non-blocking)
        requestAnimationFrame(() => playSound(true));
        
        // Clear result after short delay (faster for rapid scanning)
        scanResultTimeoutRef.current = setTimeout(() => {
          setLastScanResult(null);
        }, timeSinceLastScan < 500 ? 1000 : 2000);
      } else {
        setLastScanResult({ 
          success: false, 
          message: result.error,
          barcode: scannedValue
        });
        playSound(false);
        
        scanResultTimeoutRef.current = setTimeout(() => {
          setLastScanResult(null);
        }, 3000);
      }
    }
  }, [scanLocation, addTempItem, playSound]);

  // Enable hardware scanner hook
  useHardwareScanner(handleHardwareScan, !isLocationLocked);

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

  // Auto-scroll to TOP when items are added (newest items appear at top)
  useEffect(() => {
    if (locationItems.length > 0) {
      // Auto-scroll mobile list to top
      const mobileList = itemsListRef.current;
      if (mobileList) {
        setTimeout(() => {
          if (mobileList) {
            mobileList.scrollTop = 0;
          }
        }, 100);
      }
      // Auto-scroll desktop list to top
      const desktopList = itemsListDesktopRef.current;
      if (desktopList) {
        setTimeout(() => {
          if (desktopList) {
            desktopList.scrollTop = 0;
          }
        }, 100);
      }
    }
  }, [locationItems.length]);

  // Keep focus on barcode input - prevent focus loss on touch (Mobile only)
  useEffect(() => {
    if (!showScannerMode || !selectedLocationId || isLocationLocked) return;
    
    const keepFocusOnBarcode = (e) => {
      // Don't interfere if user is editing quantity or clicking buttons
      const target = e.target;
      const isButton = target.closest('button');
      const isInput = target.tagName === 'INPUT';
      const isQuantityEdit = editingItemId !== null;
      
      // If user clicked on a button or is editing quantity, allow it
      if (isButton || isQuantityEdit) return;
      
      // If user clicked on another input (like quantity), allow it
      if (isInput && target !== barcodeInputRef.current) return;
      
      // Otherwise, refocus barcode input after a short delay
      setTimeout(() => {
        if (barcodeInputRef.current && !isLocationLocked && selectedLocationId) {
          barcodeInputRef.current.focus();
        }
      }, 50);
    };

    // Add touchend listener to refocus after touch
    document.addEventListener('touchend', keepFocusOnBarcode);
    
    return () => {
      document.removeEventListener('touchend', keepFocusOnBarcode);
    };
  }, [showScannerMode, selectedLocationId, isLocationLocked, editingItemId]);

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
      
      // Store temp location if it's a new dynamic location
      if (result.isTemp) {
        setTempLocation(result.location);
        setLocationSuccess(`Location "${input}" ready for scanning`);
        setTimeout(() => setLocationSuccess(null), 4000);
      } else if (result.isNew) {
        setTempLocation(null);
        setLocationSuccess(`New location "${input}" created automatically`);
        setTimeout(() => setLocationSuccess(null), 4000);
      } else {
        setTempLocation(null);
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
      // Allow scan if manual entry is enabled OR if it came from hardware scanner
      if (settings.allowManualBarcodeEntry !== false || inputBufferRef.current.length > 0) {
        handleScan();
      }
    }
  };
  
  // Detect fast input (likely from hardware scanner) and process it
  // This handles scanners that inject text directly into input fields
  const handleBarcodeInputChange = (e) => {
    const newValue = e.target.value;
    const currentTime = Date.now();
    const timeSinceLastInput = currentTime - lastInputTimeRef.current;
    lastInputTimeRef.current = currentTime;
    
    // If manual entry is allowed, always accept input
    if (settings.allowManualBarcodeEntry !== false) {
      setBarcodeInput(newValue);
      return;
    }
    
    // Manual entry is DISABLED - only accept FAST input (from hardware scanner)
    // Hardware scanners typically send characters < 50ms apart
    if (timeSinceLastInput < 50 || inputBufferRef.current.length > 0) {
      // This is likely scanner input - accept it
      inputBufferRef.current = newValue;
      setBarcodeInput(newValue);
      
      // Clear buffer after a brief delay (scanner input ends)
      if (scannerInputTimeoutRef.current) {
        clearTimeout(scannerInputTimeoutRef.current);
      }
      scannerInputTimeoutRef.current = setTimeout(() => {
        inputBufferRef.current = '';
      }, 200);
    }
    // Slow input (manual typing) - reject when manual entry is disabled
  };

  const handleScan = () => {
    if (!barcodeInput.trim() || !selectedLocationId) return;
    
    // In Single SKU mode, always add quantity of 1
    // In Non-Single SKU mode, use the quantity input value
    const qty = isSingleSkuMode ? 1 : (parseInt(quantityInput) || 1);
    
    // Add to TEMP state (not saved until submit)
    const result = addTempItem(barcodeInput.trim(), qty);
    
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
    
    // Play success/error sound
    playSound(result.success);
    
    // Clear result after 3 seconds
    setTimeout(() => setLastScanResult(null), 3000);
    
    // Keep focus on barcode input for continuous scanning
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  // Delete from TEMP state (not from context)
  const handleDelete = (itemId) => {
    if (isLocationLocked) return;
    deleteTempItem(itemId);
    
    // Keep focus on barcode input after deletion (mobile)
    if (showScannerMode && barcodeInputRef.current) {
      setTimeout(() => {
        barcodeInputRef.current.focus();
      }, 50);
    }
  };

  // Update quantity in TEMP state
  const handleQuantityUpdate = (itemId) => {
    if (isSingleSkuMode) return; // No manual editing in single SKU mode
    
    const newQty = parseInt(editQuantity);
    if (newQty > 0) {
      updateTempItemQuantity(itemId, newQty);
    }
    setEditingItemId(null);
    setEditQuantity('');
  };

  const handleQuantityIncrement = (itemId, currentQty) => {
    if (isSingleSkuMode) return; // No manual editing in single SKU mode
    updateTempItemQuantity(itemId, currentQty + 1);
  };

  const handleQuantityDecrement = (itemId, currentQty) => {
    if (isSingleSkuMode) return; // No manual editing in single SKU mode
    if (currentQty > 1) {
      updateTempItemQuantity(itemId, currentQty - 1);
    }
  };

  const handleSubmitLocation = () => {
    setShowSubmitModal(true);
  };

  // ============================================
  // SUBMIT - This is when data gets SAVED to context
  // ============================================
  const confirmSubmit = () => {
    let finalLocationId = selectedLocationId;
    
    // If this is a temp location (Dynamic mode), save it permanently first
    if (tempLocation && tempLocation.isTemp) {
      const savedLocation = saveTempLocation(tempLocation);
      if (savedLocation) {
        finalLocationId = savedLocation.id;
      }
    }
    
    // Save all temp items to context (this persists to localStorage)
    if (tempScannedItems.length > 0) {
      tempScannedItems.forEach(item => {
        addScannedItem(finalLocationId, item.barcode, item.quantity);
      });
    }
    
    // Submit and lock the location
    submitLocation(finalLocationId);
    setShowSubmitModal(false);
    
    // Clear temp items and temp location
    clearTempItems();
    setTempLocation(null);
    
    // Clear the current scan location from localStorage since it's submitted
    localStorage.removeItem('audix_current_scan_location');
    
    // Check if we're in Pre-Assigned mode
    if (settings.locationScanMode === 'preassigned') {
      // In Pre-Assigned mode, navigate back to Locations page
      // This will show the list view with next pending location ready to open
      navigate('/locations');
      return;
    }
    
    // Dynamic mode - ALWAYS clear the location after submission
    // User should start fresh with a new location scan
    setSelectedLocationId('');
    setLocationInput('');
    setBarcodeInput('');
    setLastScanResult(null);
    setLocationSuccess('Location submitted successfully! Scan a new location to continue.');
    playSound(true);
    
    // Focus location input for next scan
    setTimeout(() => {
      if (locationInputRef.current) {
        locationInputRef.current.focus();
      }
      setTimeout(() => setLocationSuccess(null), 4000);
    }, 100);
  };

  // Handle Back button click - shows confirmation dialog
  const handleBackClick = () => {
    setShowBackConfirmDialog(true);
  };

  // Handle Back confirmation - discard temp data and go to location selection
  const handleBackConfirm = () => {
    // Clear all temp scanned items (NOT saved to context)
    clearTempItems();
    
    // Clear temp location (not saved since user pressed back)
    setTempLocation(null);
    
    // Clear the current location selection - go back to location selection screen
    setSelectedLocationId('');
    selectedLocationIdRef.current = ''; // Update ref as well
    localStorage.removeItem('audix_current_scan_location');
    setWaitingForLocationScan(true);
    waitingForLocationScanRef.current = true; // Update ref
    setLastScanResult(null);
    setLocationInput('');
    setBarcodeInput('');
    setQuantityInput('1');
    setShowBackConfirmDialog(false);
    
    // Focus location input for next scan
    setTimeout(() => {
      if (locationInputRef.current) {
        locationInputRef.current.focus();
      }
    }, 100);
  };

  // Handle Back cancel - close dialog and stay
  const handleBackCancel = () => {
    setShowBackConfirmDialog(false);
  };

  // Scanner Mode UI - Optimized for handheld devices
  // TWO-STEP FLOW: Step 1 = Location Selection, Step 2 = Barcode Scanning
  if (showScannerMode) {
    // STEP 1: Location Selection Screen (Mobile)
    if (!selectedLocationId) {
      return (
        <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)', minHeight: '400px' }}>
          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Header */}
            <div className="text-center pt-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-xl font-bold text-slate-800">Select Location</h1>
              <p className="text-slate-500 text-sm mt-1">
                {settings.locationScanMode === 'dynamic' 
                  ? 'Scan or enter any location code'
                  : 'Scan pre-assigned location code'}
              </p>
              <div className="flex gap-2 justify-center mt-3">
                <Badge 
                  variant="outline" 
                  className={`text-xs ${settings.locationScanMode === 'dynamic' 
                    ? 'bg-purple-50 text-purple-700 border-purple-200' 
                    : 'bg-blue-50 text-blue-700 border-blue-200'}`}
                >
                  {settings.locationScanMode === 'dynamic' ? 'Dynamic Mode' : 'Pre-Assigned Mode'}
                </Badge>
              </div>
            </div>

            {/* Location Scanner Card */}
            <Card className="border-0 shadow-md mx-2">
              <CardContent className="p-4">
                <Label className="text-sm text-slate-600 mb-2 block font-medium">
                  <MapPin className="w-4 h-4 inline mr-2" />
                  Location Code
                </Label>
                <Input
                  ref={locationInputRef}
                  placeholder="Scan or type location code..."
                  value={locationInput}
                  onChange={(e) => {
                    setLocationInput(e.target.value);
                    setLocationError('');
                  }}
                  onKeyDown={handleLocationKeyDown}
                  className="h-14 text-lg font-mono text-center"
                  autoComplete="off"
                  autoFocus
                />
                
                {/* Confirm Button */}
                <Button
                  onClick={handleLocationScan}
                  disabled={!locationInput.trim()}
                  className="w-full h-14 mt-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold"
                >
                  <CheckCircle2 className="w-6 h-6 mr-2" />
                  Confirm Location
                </Button>
                
                {locationError && (
                  <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {locationError}
                  </div>
                )}
                
                {locationSuccess && (
                  <div className="mt-3 p-3 bg-purple-50 text-purple-700 text-sm rounded-lg flex items-center gap-2">
                    <Sparkles className="w-4 h-4 flex-shrink-0" />
                    {locationSuccess}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Help Text */}
            <div className="text-center px-4">
              <p className="text-xs text-slate-400">
                {settings.locationScanMode === 'dynamic' 
                  ? 'New location codes will be created automatically'
                  : 'Only pre-imported locations are allowed'}
              </p>
            </div>
          </div>
        </div>
      );
    }

    // STEP 2: Barcode Scanning Screen (Mobile) - Only shown after location is selected
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)', minHeight: '400px' }}>
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-4 space-y-3" style={{ WebkitOverflowScrolling: 'touch' }}>
          {/* Location Info Header - Shows selected location with change option */}
          <Card className="border-0 shadow-sm bg-emerald-50">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium">Current Location</p>
                    <p className="text-base font-bold text-emerald-800">{selectedLocation?.name}</p>
                    <p className="text-xs text-emerald-600 font-mono">{selectedLocation?.code}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackClick}
                  className="text-slate-700 border-slate-300 hover:bg-slate-100"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Back Confirmation Dialog */}
          <Dialog open={showBackConfirmDialog} onOpenChange={setShowBackConfirmDialog}>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                  Are you sure you want to go back?
                </DialogTitle>
                <DialogDescription>
                  All scanned items for this location will be discarded and not saved.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={handleBackCancel}
                  className="flex-1"
                >
                  No, Stay
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBackConfirm}
                  className="flex-1"
                >
                  Yes, Go Back
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Mode Badges */}
          <div className="flex gap-2 px-1">
            <Badge 
              variant="outline" 
              className={`text-xs ${settings.locationScanMode === 'dynamic' 
                ? 'bg-purple-50 text-purple-700 border-purple-200' 
                : 'bg-blue-50 text-blue-700 border-blue-200'}`}
            >
              {settings.locationScanMode === 'dynamic' ? 'Dynamic' : 'Pre-Assigned'}
            </Badge>
            <Badge 
              variant="outline" 
              className={`text-xs ${isSingleSkuMode 
                ? 'bg-orange-50 text-orange-700 border-orange-200' 
                : 'bg-teal-50 text-teal-700 border-teal-200'}`}
            >
              {isSingleSkuMode ? 'Single SKU' : 'Manual Qty'}
            </Badge>
          </div>

          {/* Barcode Scanner */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-3">
              <Label className="text-xs text-slate-600 mb-1 block font-medium">
                <ScanBarcode className="w-3 h-3 inline mr-1" />
                Scan Barcode
                {settings.allowManualBarcodeEntry === false && (
                  <span className="text-amber-600 ml-1">(Scanner only)</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  ref={barcodeInputRef}
                  placeholder={settings.allowManualBarcodeEntry === false ? "Use scanner..." : "Scan barcode..."}
                  value={barcodeInput}
                  onChange={handleBarcodeInputChange}
                  onKeyDown={handleBarcodeKeyDown}
                  disabled={isLocationLocked}
                  className={`h-11 text-base font-mono flex-1 ${settings.allowManualBarcodeEntry === false ? 'bg-slate-50' : ''}`}
                  autoComplete="off"
                  autoFocus
                />
                {!isSingleSkuMode && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantityInput(String(Math.max(1, parseInt(quantityInput) - 1)))}
                      disabled={isLocationLocked}
                      className="h-11 w-10"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      value={quantityInput}
                      onChange={(e) => setQuantityInput(e.target.value)}
                      disabled={isLocationLocked}
                      className="h-11 text-center text-base font-bold w-14"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantityInput(String(parseInt(quantityInput) + 1))}
                      disabled={isLocationLocked}
                      className="h-11 w-10"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Add Button - Only show if manual entry is allowed */}
              {settings.allowManualBarcodeEntry !== false && (
                <Button
                  onClick={handleScan}
                  disabled={!barcodeInput.trim() || isLocationLocked}
                  className="w-full h-12 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  Add {isSingleSkuMode ? '(Qty: 1)' : `(Qty: ${quantityInput})`}
                </Button>
              )}

              {/* Last Scan Result */}
              {lastScanResult && (
                <div className={`mt-2 p-2 rounded-lg flex items-center gap-2 text-sm ${
                  lastScanResult.success 
                    ? lastScanResult.isValid 
                      ? 'bg-emerald-50 text-emerald-700' 
                      : 'bg-amber-50 text-amber-700'
                    : 'bg-red-50 text-red-700'
                }`}>
                  {lastScanResult.success ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="flex-1 text-xs">
                    {lastScanResult.success 
                      ? `Added ${lastScanResult.quantity} unit(s)` 
                      : lastScanResult.error}
                  </span>
                </div>
              )}

              {isLocationLocked && (
                <div className="mt-2 p-2 bg-amber-50 rounded-lg flex items-center gap-2 text-xs text-amber-700">
                  <Lock className="w-3 h-3" />
                  Location is submitted and locked
                </div>
              )}
            </CardContent>
          </Card>

          {/* Scanned Items List */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-600" />
                Scanned Items
                <Badge variant="secondary" className="ml-auto text-xs">
                  {locationItems.length} items • {totalQuantity} qty
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {locationItems.length === 0 ? (
                <div className="text-center py-6">
                  <ScanBarcode className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No items scanned yet</p>
                  <p className="text-slate-400 text-xs mt-1">Start scanning barcodes</p>
                </div>
              ) : (
                <div 
                  ref={itemsListRef}
                  className="space-y-2 overflow-y-auto" 
                  style={{ 
                    maxHeight: '220px', 
                    paddingBottom: '60px',
                    WebkitOverflowScrolling: 'touch',
                    scrollBehavior: 'smooth'
                  }}
                >
                  {/* Reverse order - newest items at TOP - Using memoized component for performance */}
                  {reversedItems.map((item) => (
                    <ScannedItemRow
                      key={item.id}
                      item={item}
                      isEditing={editingItemId === item.id}
                      editQuantity={editQuantity}
                      setEditQuantity={setEditQuantity}
                      onQuantityUpdate={handleQuantityUpdate}
                      onDelete={handleDelete}
                      isSingleSkuMode={isSingleSkuMode}
                      isLocationLocked={isLocationLocked}
                      onStartEdit={(id, qty) => {
                        setEditingItemId(id);
                        setEditQuantity(qty);
                      }}
                    />
                  ))}
                  <div style={{ height: '20px', minHeight: '20px' }}></div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-slate-200 p-3 shadow-lg z-40">
          <div className="flex gap-2">
            {/* Submit Button - Main action */}
            <Button
              onClick={handleSubmitLocation}
              disabled={isLocationLocked || locationItems.length === 0}
              className={`flex-1 h-12 text-base font-semibold ${
                !isLocationLocked && locationItems.length > 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-200 text-slate-400'
              }`}
            >
              <Send className="w-5 h-5 mr-2" />
              Submit Location
            </Button>
          </div>
        </div>

        {/* Submit Confirmation Modal */}
        <Dialog open={showSubmitModal} onOpenChange={setShowSubmitModal}>
          <DialogContent className="max-w-[90vw] rounded-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-600" />
                Submit Location?
              </DialogTitle>
              <DialogDescription>
                Once submitted, this location will be locked.
              </DialogDescription>
            </DialogHeader>
            <div className="py-3 space-y-1">
              <p className="text-sm"><strong>Location:</strong> {selectedLocation?.name}</p>
              <p className="text-sm"><strong>Items:</strong> {locationItems.length}</p>
              <p className="text-sm"><strong>Total Qty:</strong> {totalQuantity}</p>
            </div>
            <DialogFooter className="flex-row gap-2">
              <Button variant="outline" onClick={() => setShowSubmitModal(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={confirmSubmit} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                Submit & Lock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Desktop/Tablet UI - Standard layout
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
              {settings.allowManualBarcodeEntry === false && (
                <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300">
                  Scanner Only
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Barcode Input */}
              <div>
                <Label className="text-sm text-slate-600 mb-1.5 block">
                  {settings.allowManualBarcodeEntry === false 
                    ? 'Use hardware scanner to scan barcode'
                    : isSingleSkuMode 
                      ? 'Scan barcode (each scan = 1 unit)'
                      : 'Scan barcode, then enter quantity'}
                </Label>
                <div className="flex gap-2">
                  <Input
                    ref={barcodeInputRef}
                    placeholder={!selectedLocationId ? "Select location first" : settings.allowManualBarcodeEntry === false ? "Use scanner..." : "Scan barcode here..."}
                    value={barcodeInput}
                    onChange={handleBarcodeInputChange}
                    onKeyDown={handleBarcodeKeyDown}
                    disabled={!selectedLocationId || isLocationLocked}
                    className={`h-12 text-lg font-mono flex-1 ${settings.allowManualBarcodeEntry === false ? 'bg-slate-50' : ''}`}
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
                    {settings.allowManualBarcodeEntry !== false && (
                      <Button
                        onClick={handleScan}
                        disabled={!selectedLocationId || !barcodeInput.trim() || isLocationLocked}
                        className="h-10 px-6 bg-emerald-600 hover:bg-emerald-700 text-white ml-2"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {settings.allowManualBarcodeEntry === false 
                      ? 'Use hardware scanner to add items'
                      : 'Scan barcode once, enter quantity, then click Add'}
                  </p>
                </div>
              )}

              {/* Add button for Single SKU mode */}
              {isSingleSkuMode && settings.allowManualBarcodeEntry !== false && (
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
            <div 
              ref={itemsListDesktopRef}
              className="overflow-y-auto pb-4" 
              style={{ 
                maxHeight: '400px', 
                scrollBehavior: 'smooth',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              <Table>
                <TableHeader>
                  <TableRow className="sticky top-0 bg-white z-10">
                    <TableHead className="w-[180px]">Barcode</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center w-[180px]">Quantity</TableHead>
                    <TableHead className="text-center w-[100px]">Status</TableHead>
                    <TableHead className="text-right w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Reverse order - newest items at TOP - Using memoized reversedItems */}
                  {reversedItems.map((item, index) => (
                    <TableRow key={item.id} className={index === 0 ? 'first-item bg-emerald-50/30' : ''}>
                      <TableCell className="font-mono text-base font-bold">{item.barcode}</TableCell>
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
              {/* Bottom spacer to ensure last item is fully visible */}
              <div className="h-4" />
            </div>
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
