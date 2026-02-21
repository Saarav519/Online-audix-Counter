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
  ArrowLeft,
  ToggleRight
} from 'lucide-react';
import { Switch } from '../components/ui/switch';

// ============================================
// PERFORMANCE: Debounce utility for localStorage saves
// ============================================
const useDebouncedCallback = (callback, delay) => {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);
  
  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  const debouncedFn = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  // Force immediate execution (for before unmount/navigation)
  const flush = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    callbackRef.current(...args);
  }, []);
  
  return [debouncedFn, flush];
};

// Memoized ScannedItem component for better performance with large lists
const ScannedItemRow = memo(({ 
  item, 
  isEditing, 
  editQuantity, 
  setEditQuantity, 
  onQuantityUpdate, 
  onDelete,
  singleSkuMode,
  isLocationLocked,
  onStartEdit,
  onDirectQuantityChange
}) => {
  const inlineInputRef = useRef(null);

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
      <div className="flex items-center gap-2 flex-shrink-0" data-qty-edit="true">
        {isLocationLocked ? (
          <span 
            className="font-bold text-sm min-w-[32px] text-center px-2 py-1 rounded bg-slate-100 text-slate-600"
          >
            {item.quantity}
          </span>
        ) : (
          <input
            ref={inlineInputRef}
            type="number"
            min="1"
            max={singleSkuMode ? item.quantity : undefined}
            inputMode="numeric"
            pattern="[0-9]*"
            value={isEditing ? editQuantity : item.quantity}
            data-qty-input="true"
            className={`w-16 h-8 text-center text-sm font-bold p-1 rounded border focus:outline-none focus:ring-2 ${
              singleSkuMode 
                ? 'border-amber-300 bg-amber-50 text-amber-700 focus:ring-amber-500 focus:border-amber-500' 
                : 'border-emerald-300 bg-emerald-50 text-emerald-700 focus:ring-emerald-500 focus:border-emerald-500'
            }`}
            onFocus={(e) => {
              e.stopPropagation();
              onStartEdit(item.id, String(item.quantity));
              e.target.select();
            }}
            onChange={(e) => {
              e.stopPropagation();
              let val = e.target.value;
              // In Single SKU mode, clamp to max = item.quantity (only decrease allowed)
              if (singleSkuMode && val !== '') {
                const numVal = parseInt(val);
                if (!isNaN(numVal) && numVal > item.quantity) {
                  val = String(item.quantity);
                }
              }
              setEditQuantity(val);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                onQuantityUpdate(item.id);
                e.target.blur();
              }
            }}
            onBlur={(e) => {
              e.stopPropagation();
              onQuantityUpdate(item.id);
            }}
          />
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

// ============================================
// PERFORMANCE: Virtualized row renderer for react-window
// Only renders visible items in the list for massive performance boost
// ============================================
const VirtualizedItemRow = memo(({ index, style, data }) => {
  const {
    items,
    editingItemId,
    editQuantity,
    setEditQuantity,
    handleQuantityUpdate,
    handleDelete,
    isSingleSkuMode,
    isLocationLocked,
    setEditingItemId
  } = data;
  
  const item = items[index];
  if (!item) return null;
  
  return (
    <div style={{ ...style, paddingRight: '8px', paddingBottom: '8px' }}>
      <ScannedItemRow
        item={item}
        isEditing={editingItemId === item.id}
        editQuantity={editQuantity}
        setEditQuantity={setEditQuantity}
        onQuantityUpdate={handleQuantityUpdate}
        onDelete={handleDelete}
        singleSkuMode={isSingleSkuMode}
        isLocationLocked={isLocationLocked}
        onStartEdit={(id, qty) => {
          setEditingItemId(id);
          setEditQuantity(String(qty));
        }}
      />
    </div>
  );
});

VirtualizedItemRow.displayName = 'VirtualizedItemRow';

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
    batchSaveScannedItems, // For reliable batch submit
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
  
  // "Ask Quantity Before Adding" toggle (Punching Mode)
  const [askQuantityBeforeAdding, setAskQuantityBeforeAdding] = useState(() => {
    const saved = localStorage.getItem('audix_ask_qty_before_adding');
    return saved === 'true';
  });
  const [showQuantityPopup, setShowQuantityPopup] = useState(false);
  const [pendingBarcode, setPendingBarcode] = useState('');
  const [pendingProductName, setPendingProductName] = useState('');
  const [pendingIsValid, setPendingIsValid] = useState(false);
  const [popupQuantity, setPopupQuantity] = useState('1');
  const popupQuantityRef = useRef(null);
  
  // ============================================
  // TEMPORARY SCANNED ITEMS - Auto-saved to localStorage for persistence
  // Final save to context happens when user clicks "Submit Location"
  // ============================================
  const [tempScannedItems, setTempScannedItems] = useState([]);
  
  // Temporary location for Dynamic mode - only saved when items are submitted
  // Initialize from localStorage if available (to survive page refreshes/re-renders)
  const [tempLocation, setTempLocation] = useState(() => {
    const savedTempLocation = localStorage.getItem('audix_temp_location');
    if (savedTempLocation) {
      try {
        const parsed = JSON.parse(savedTempLocation);
        console.log(`📍 Restored temp location from localStorage: ${parsed.name}`);
        return parsed;
      } catch (e) {
        console.warn('Failed to parse saved temp location:', e);
      }
    }
    return null;
  });
  
  // ============================================
  // AUTO-SAVE: Persist temp location to localStorage whenever it changes
  // This prevents data loss when component re-renders
  // ============================================
  useEffect(() => {
    if (tempLocation) {
      localStorage.setItem('audix_temp_location', JSON.stringify(tempLocation));
    } else {
      localStorage.removeItem('audix_temp_location');
    }
  }, [tempLocation]);
  
  // ============================================
  // PERFORMANCE: Debounced localStorage save for temp items
  // Saves every 500ms instead of on every scan - major performance boost
  // ============================================
  const saveItemsToStorage = useCallback((items, locationId) => {
    if (locationId) {
      const key = `audix_temp_items_${locationId}`;
      try {
        if (items.length > 0) {
          localStorage.setItem(key, JSON.stringify(items));
        } else {
          // Empty array - remove the key so stale data doesn't persist
          localStorage.removeItem(key);
        }
      } catch (e) {
        console.warn('localStorage save failed:', e);
      }
    }
  }, []);
  
  const [debouncedSaveItems, flushSaveItems] = useDebouncedCallback(saveItemsToStorage, 500);
  
  // Auto-save temp items with debouncing (500ms delay for performance)
  useEffect(() => {
    if (selectedLocationId) {
      debouncedSaveItems(tempScannedItems, selectedLocationId);
    }
  }, [tempScannedItems, selectedLocationId, debouncedSaveItems]);
  
  // Flush save on unmount to prevent data loss
  useEffect(() => {
    return () => {
      if (selectedLocationId) {
        flushSaveItems(tempScannedItems, selectedLocationId);
      }
      // Cleanup auto-confirm/auto-process timers
      if (locationAutoConfirmTimerRef.current) clearTimeout(locationAutoConfirmTimerRef.current);
      if (barcodeAutoProcessTimerRef.current) clearTimeout(barcodeAutoProcessTimerRef.current);
    };
  }, [selectedLocationId, tempScannedItems, flushSaveItems]);
  
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
  const askQuantityRef = useRef(askQuantityBeforeAdding);
  
  // Refs for auto-detecting scanner input (rapid onChange events)
  const locationInputTimeRef = useRef(0);
  const locationAutoConfirmTimerRef = useRef(null);
  const barcodeInputTimeRef = useRef(0);
  const barcodeAutoProcessTimerRef = useRef(null);
  
  // Keep askQuantityRef in sync
  useEffect(() => {
    askQuantityRef.current = askQuantityBeforeAdding;
  }, [askQuantityBeforeAdding]);

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
    // If we have a selected location, we're not waiting for location scan
    if (selectedLocationId) {
      setWaitingForLocationScan(false);
    }
  }, [selectedLocationId]);
  
  useEffect(() => {
    waitingForLocationScanRef.current = waitingForLocationScan;
  }, [waitingForLocationScan]);
  
  useEffect(() => {
    isSingleSkuModeRef.current = settings.singleSkuScanning;
    // When Single SKU mode is ON, auto-disable Ask Qty
    if (settings.singleSkuScanning && askQuantityBeforeAdding) {
      setAskQuantityBeforeAdding(false);
      localStorage.setItem('audix_ask_qty_before_adding', 'false');
    }
  }, [settings.singleSkuScanning]);
  
  useEffect(() => {
    quantityInputRef2.current = quantityInput;
  }, [quantityInput]);

  const existingLocation = locations.find(l => l.id === selectedLocationId);
  // Use existing location if found, otherwise use temp location (for new dynamic locations)
  const selectedLocation = existingLocation || tempLocation;
  const isLocationLocked = existingLocation?.isSubmitted;

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
      
      if (existingIndex !== -1) {
        // Existing barcode: increment quantity, move to end
        const existingItem = prev[existingIndex];
        const filteredItems = prev.filter((_, idx) => idx !== existingIndex);
        newItem = {
          ...existingItem,
          quantity: existingItem.quantity + quantity,
          scannedAt: new Date().toISOString()
        };
        return [...filteredItems, newItem];
      } else {
        // New barcode: create new item
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
    });
    
    return { success: true, isValid: isValidBarcode, product, item: newItem };
  }, [getProductByBarcode, settings.allowNonMasterProducts]);
  
  // Delete item from temp state - IMMEDIATELY persists to localStorage
  const deleteTempItem = useCallback((itemId) => {
    setTempScannedItems(prev => {
      const updated = prev.filter(item => item.id !== itemId);
      
      // Immediately persist deletion to localStorage (not debounced)
      // This prevents deleted items from reappearing when navigating away and back
      if (selectedLocationId) {
        const key = `audix_temp_items_${selectedLocationId}`;
        try {
          if (updated.length > 0) {
            localStorage.setItem(key, JSON.stringify(updated));
          } else {
            // All items deleted - remove the key entirely
            localStorage.removeItem(key);
          }
          console.log(`🗑️ Deleted item ${itemId}, ${updated.length} items remaining, saved to localStorage`);
        } catch (e) {
          console.warn('localStorage save after delete failed:', e);
        }
      }
      
      return updated;
    });
  }, [selectedLocationId]);
  
  // Update item quantity in temp state - IMMEDIATELY persists to localStorage
  const updateTempItemQuantity = useCallback((itemId, newQuantity) => {
    setTempScannedItems(prev => {
      const updated = prev.map(item => 
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      );
      
      // Immediately persist to localStorage
      if (selectedLocationId) {
        const key = `audix_temp_items_${selectedLocationId}`;
        try {
          localStorage.setItem(key, JSON.stringify(updated));
        } catch (e) {
          console.warn('localStorage save after qty update failed:', e);
        }
      }
      
      return updated;
    });
  }, [selectedLocationId]);
  
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
      // FAST BARCODE PROCESSING
      
      // Check if "Ask Quantity Before Adding" is ON
      if (askQuantityRef.current) {
        // Punching Mode: show quantity popup
        const checkResult = showQtyPopup(scannedValue);
        if (!checkResult.success) {
          setLastScanResult({ 
            success: false, 
            message: checkResult.error,
            barcode: scannedValue
          });
          playSound(false);
          scanResultTimeoutRef.current = setTimeout(() => {
            setLastScanResult(null);
          }, 3000);
        }
        setBarcodeInput('');
        return;
      }
      
      // Default Mode: auto-add with qty=1
      const result = addTempItem(scannedValue, 1);
      
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
          quantity: 1,
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
  }, [scanLocation, addTempItem, playSound, showQtyPopup]);

  // Enable hardware scanner hook - always enabled when location is not locked
  // The hook captures ALL keyboard-based scanner input
  // When manual entry is OFF, input field blocks direct typing (via preventDefault in hook)
  // When manual entry is ON, both hook and input field work
  useHardwareScanner(handleHardwareScan, !isLocationLocked, settings.allowManualBarcodeEntry !== false);

  // In Pre-Assigned mode, redirect to Locations page if no location is selected
  // Scan Items should only be accessed by opening a location from the Locations page
  useEffect(() => {
    if (settings.locationScanMode === 'preassigned' && !searchParams.get('location')) {
      navigate('/reports');
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

  // Keep focus on barcode input - ALWAYS refocus after ANY interaction (Mobile only)
  // The ONLY exception is when user is actively editing a quantity input field
  useEffect(() => {
    if (!showScannerMode || !selectedLocationId || isLocationLocked) return;
    
    const keepFocusOnBarcode = (e) => {
      // Don't interfere if quantity popup is open
      if (showQuantityPopup) return;
      
      const target = e.target;
      
      // ONLY skip refocusing for quantity input interactions
      const isQtyInput = target && (
        target.hasAttribute('data-qty-input') || 
        (target.tagName === 'INPUT' && target.closest('[data-qty-edit]'))
      );
      if (isQtyInput) return;
      
      // For EVERYTHING else (buttons, toggles, switches, empty space, etc.)
      // refocus the barcode input after a short delay to let the action complete
      setTimeout(() => {
        // Final safety check: don't steal focus from qty inputs that may have just been focused
        const activeEl = document.activeElement;
        const isActiveQtyInput = activeEl && (
          activeEl.hasAttribute('data-qty-input') || 
          activeEl.closest('[data-qty-edit]') ||
          activeEl.closest('[role="dialog"]')
        );
        if (isActiveQtyInput) return;
        
        if (barcodeInputRef.current && !isLocationLocked && selectedLocationId && !showQuantityPopup) {
          barcodeInputRef.current.focus();
        }
      }, 150);
    };

    // Listen on both touch and click to cover all interaction types
    document.addEventListener('touchend', keepFocusOnBarcode);
    document.addEventListener('mouseup', keepFocusOnBarcode);
    
    return () => {
      document.removeEventListener('touchend', keepFocusOnBarcode);
      document.removeEventListener('mouseup', keepFocusOnBarcode);
    };
  }, [showScannerMode, selectedLocationId, isLocationLocked, showQuantityPopup]);

  // Handle location scan/input
  const handleLocationKeyDown = (e) => {
    if (e.key === 'Enter' && locationInput.trim()) {
      // Cancel any pending auto-confirm since Enter was pressed explicitly
      if (locationAutoConfirmTimerRef.current) {
        clearTimeout(locationAutoConfirmTimerRef.current);
        locationAutoConfirmTimerRef.current = null;
      }
      handleLocationScan();
    }
  };

  // Auto-detect scanner input in location field and auto-confirm
  const handleLocationInputChange = (e) => {
    const newValue = e.target.value;
    setLocationInput(newValue);
    setLocationError('');

    // Auto-confirm logic: detect scanner-like rapid input
    const currentTime = Date.now();
    const timeDiff = currentTime - locationInputTimeRef.current;
    const charsAdded = newValue.length - locationInput.length;
    locationInputTimeRef.current = currentTime;

    // Clear any pending auto-confirm timer
    if (locationAutoConfirmTimerRef.current) {
      clearTimeout(locationAutoConfirmTimerRef.current);
      locationAutoConfirmTimerRef.current = null;
    }

    // Scanner detection: multiple chars at once OR rapid input (< 80ms between changes)
    if (newValue.trim() && (charsAdded > 2 || (timeDiff < 80 && charsAdded > 0))) {
      // Wait for scanner to finish sending all characters, then auto-confirm
      // Use the DOM input ref value to get the final scanner output
      locationAutoConfirmTimerRef.current = setTimeout(() => {
        const finalValue = locationInputRef.current?.value?.trim();
        if (finalValue) {
          handleLocationScan(finalValue);
        }
      }, 300);
    }
  };

  const handleLocationScan = (inputOverride) => {
    const input = (inputOverride || locationInput).trim();
    if (!input) return;

    const result = scanLocation(input);
    
    if (result.success) {
      setSelectedLocationId(result.location.id);
      setLocationInput(result.location.code);
      setLocationError('');
      setWaitingForLocationScan(false); // Important: Mark location as selected
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
      // Cancel any pending auto-process since Enter was pressed explicitly
      if (barcodeAutoProcessTimerRef.current) {
        clearTimeout(barcodeAutoProcessTimerRef.current);
        barcodeAutoProcessTimerRef.current = null;
      }
      handleScan();
    }
  };
  
  // ============================================
  // SIMPLIFIED INPUT HANDLING
  // When manual entry is OFF: Accept scanner input (rapid), block manual typing (slow)
  // When manual entry is ON: Accept all input
  // ============================================
  const handleBarcodeInputChange = (e) => {
    const newValue = e.target.value;
    
    if (settings.allowManualBarcodeEntry === false) {
      // When manual entry is DISABLED, detect scanner vs manual input
      const currentTime = Date.now();
      const timeDiff = currentTime - barcodeInputTimeRef.current;
      const charsAdded = newValue.length - barcodeInput.length;
      barcodeInputTimeRef.current = currentTime;
      
      // Scanner detection: multiple chars at once OR rapid input (< 80ms between changes)
      if (charsAdded > 2 || (timeDiff < 80 && charsAdded > 0)) {
        // Scanner input detected - accept it
        setBarcodeInput(newValue);
        
        // Clear pending auto-process timer
        if (barcodeAutoProcessTimerRef.current) {
          clearTimeout(barcodeAutoProcessTimerRef.current);
        }
        
        // Auto-process after scanner finishes (some scanners don't send Enter)
        barcodeAutoProcessTimerRef.current = setTimeout(() => {
          const finalValue = barcodeInputRef.current?.value?.trim();
          if (finalValue && selectedLocationId) {
            if (askQuantityBeforeAdding) {
              // Punching Mode: show popup
              showQtyPopup(finalValue);
              setBarcodeInput('');
            } else {
              // Default Mode: auto-add qty=1
              const result = addTempItem(finalValue, 1);
              
              setLastScanResult({
                barcode: finalValue,
                quantity: 1,
                ...result
              });
              
              setBarcodeInput('');
              
              playSound(result.success);
              setTimeout(() => setLastScanResult(null), 3000);
              
              if (barcodeInputRef.current) {
                barcodeInputRef.current.focus();
              }
            }
          }
        }, 300);
        return;
      }
      
      // Slow input = manual typing - block it when manual entry is OFF
      return;
    }
    
    // Manual entry is ENABLED - accept all input
    setBarcodeInput(newValue);
  };

  // Toggle handler for "Ask Quantity Before Adding"
  const handleToggleAskQuantity = (checked) => {
    setAskQuantityBeforeAdding(checked);
    localStorage.setItem('audix_ask_qty_before_adding', String(checked));
    // Immediately refocus barcode input after toggle
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }, 50);
  };

  // Show quantity popup for a barcode
  const showQtyPopup = useCallback((barcode) => {
    const product = getProductByBarcode ? getProductByBarcode(barcode) : null;
    const isValid = product !== undefined && product !== null;
    
    // Check if non-master products are allowed
    if (!isValid && !settings.allowNonMasterProducts) {
      return { success: false, error: 'Barcode not in master list' };
    }
    
    setPendingBarcode(barcode);
    setPendingProductName(product ? product.name : `Unknown (${barcode.slice(-6)})`);
    setPendingIsValid(isValid);
    setPopupQuantity('1');
    setShowQuantityPopup(true);
    
    // Focus qty input after popup opens
    setTimeout(() => {
      if (popupQuantityRef.current) {
        popupQuantityRef.current.focus();
        popupQuantityRef.current.select();
      }
    }, 100);
    
    return { success: true };
  }, [getProductByBarcode, settings.allowNonMasterProducts]);

  // Confirm quantity from popup and add item
  const confirmQuantityPopup = () => {
    const qty = parseInt(popupQuantity) || 1;
    if (qty < 1) return;
    
    const result = addTempItem(pendingBarcode, qty);
    
    setLastScanResult({
      barcode: pendingBarcode,
      quantity: qty,
      ...result
    });
    
    playSound(result.success);
    setTimeout(() => setLastScanResult(null), 3000);
    
    // Close popup and reset
    setShowQuantityPopup(false);
    setPendingBarcode('');
    setBarcodeInput('');
    
    // Refocus barcode input
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }, 100);
  };

  // Cancel quantity popup
  const cancelQuantityPopup = () => {
    setShowQuantityPopup(false);
    setPendingBarcode('');
    setBarcodeInput('');
    
    // Refocus barcode input
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }, 100);
  };

  const handleScan = () => {
    if (!barcodeInput.trim() || !selectedLocationId) return;
    
    if (askQuantityBeforeAdding) {
      // Punching Mode: show quantity popup
      const checkResult = showQtyPopup(barcodeInput.trim());
      if (!checkResult.success) {
        setLastScanResult({
          barcode: barcodeInput,
          quantity: 0,
          success: false,
          error: checkResult.error
        });
        setBarcodeInput('');
        playSound(false);
        setTimeout(() => setLastScanResult(null), 3000);
      }
      return;
    }
    
    // Default Mode: auto-add with qty=1
    const result = addTempItem(barcodeInput.trim(), 1);
    
    setLastScanResult({
      barcode: barcodeInput,
      quantity: 1,
      ...result
    });
    
    // Clear barcode input immediately after scan
    setBarcodeInput('');
    
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
    const newQty = parseInt(editQuantity);
    if (newQty > 0) {
      // In Single SKU mode, only allow DECREASE (not increase)
      if (isSingleSkuMode) {
        const currentItem = locationItems.find(i => i.id === itemId);
        if (currentItem && newQty > currentItem.quantity) {
          // Don't allow increase - revert to current quantity
          setEditingItemId(null);
          setEditQuantity('');
          return;
        }
      }
      updateTempItemQuantity(itemId, newQty);
    }
    setEditingItemId(null);
    setEditQuantity('');
  };

  const handleQuantityIncrement = (itemId, currentQty) => {
    updateTempItemQuantity(itemId, currentQty + 1);
  };

  const handleQuantityDecrement = (itemId, currentQty) => {
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
    
    // Check if location exists in the locations array
    const existingLocationInList = locations.find(l => l.id === selectedLocationId);
    
    // If this is a temp location (Dynamic mode), save it permanently first
    // IMPORTANT: Use either tempLocation OR selectedLocation (for cases where tempLocation was lost)
    if (tempLocation && tempLocation.isTemp) {
      const savedLocation = saveTempLocation(tempLocation);
      if (savedLocation) {
        finalLocationId = savedLocation.id;
        console.log(`✅ Saved temp location: ${savedLocation.name} (${savedLocation.id})`);
      }
    } else if (!existingLocationInList && selectedLocation) {
      // Fallback: If location doesn't exist in list but we have selectedLocation
      // This handles cases where tempLocation state was lost but selectedLocation is set
      console.log(`⚠️ Location not in list, creating from selectedLocation: ${selectedLocation.name}`);
      const savedLocation = saveTempLocation({
        ...selectedLocation,
        isTemp: true  // Force it to be treated as temp so it gets saved
      });
      if (savedLocation) {
        finalLocationId = savedLocation.id;
        console.log(`✅ Created location from selectedLocation: ${savedLocation.name} (${savedLocation.id})`);
      }
    }
    
    // BATCH SAVE: Save all temp items to context at once (prevents race conditions)
    // This is more reliable than adding items one by one
    if (tempScannedItems.length > 0) {
      // Format items for permanent storage
      const itemsToSave = tempScannedItems.map(item => ({
        id: item.id || `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        barcode: item.barcode,
        productName: item.productName,
        quantity: item.quantity,
        scannedAt: item.scannedAt || new Date().toISOString(),
        isMaster: item.isMaster
      }));
      
      // Use batch save for atomic update
      batchSaveScannedItems(finalLocationId, itemsToSave);
      
      console.log(`📤 Submitted ${itemsToSave.length} items (${itemsToSave.reduce((s, i) => s + i.quantity, 0)} qty) to location ${finalLocationId}`);
    }
    
    // Submit and lock the location
    submitLocation(finalLocationId);
    setShowSubmitModal(false);
    
    // Clear temp items and temp location
    clearTempItems();
    setTempLocation(null);
    
    // Clear the current scan location and temp location from localStorage since it's submitted
    localStorage.removeItem('audix_current_scan_location');
    localStorage.removeItem('audix_temp_location');
    // Also clear temp items for this location
    localStorage.removeItem(`audix_temp_items_${selectedLocationId}`);
    
    // Check if we're in Pre-Assigned mode
    if (settings.locationScanMode === 'preassigned') {
      // In Pre-Assigned mode, navigate back to Locations page
      // This will show the list view with next pending location ready to open
      navigate('/reports');
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
                  onChange={handleLocationInputChange}
                  onKeyDown={handleLocationKeyDown}
                  className="h-14 text-lg font-mono text-center"
                  autoComplete="off"
                  autoFocus
                />
                
                {/* Confirm Button */}
                <Button
                  onClick={() => handleLocationScan()}
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

          {/* Mode Badges + Ask Quantity Toggle (only when Single SKU is OFF) */}
          <div className="flex items-center justify-between px-1">
            <Badge 
              variant="outline" 
              className={`text-xs ${settings.locationScanMode === 'dynamic' 
                ? 'bg-purple-50 text-purple-700 border-purple-200' 
                : 'bg-blue-50 text-blue-700 border-blue-200'}`}
            >
              {settings.locationScanMode === 'dynamic' ? 'Dynamic' : 'Pre-Assigned'}
            </Badge>
            {!isSingleSkuMode && (
              <div className="flex items-center gap-2">
                <Label htmlFor="ask-qty-toggle-mobile" className="text-xs text-slate-600 cursor-pointer">
                  Ask Qty
                </Label>
                <Switch
                  id="ask-qty-toggle-mobile"
                  checked={askQuantityBeforeAdding}
                  onCheckedChange={handleToggleAskQuantity}
                  className="data-[state=checked]:bg-emerald-600"
                />
              </div>
            )}
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
              </div>

              {/* Add Button - Only show if manual entry is allowed */}
              {settings.allowManualBarcodeEntry !== false && (
                <Button
                  onClick={handleScan}
                  disabled={!barcodeInput.trim() || isLocationLocked}
                  className="w-full h-12 mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold"
                >
                  <Plus className="w-5 h-5 mr-2" />
                  {askQuantityBeforeAdding ? 'Scan & Enter Qty' : 'Add (Qty: 1)'}
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
                      : (lastScanResult.error || lastScanResult.message)}
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
                    paddingBottom: '8px',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {reversedItems.map((item) => (
                    <ScannedItemRow
                      key={item.id}
                      item={item}
                      isEditing={editingItemId === item.id}
                      editQuantity={editQuantity}
                      setEditQuantity={setEditQuantity}
                      onQuantityUpdate={handleQuantityUpdate}
                      onDelete={handleDelete}
                      singleSkuMode={isSingleSkuMode}
                      isLocationLocked={isLocationLocked}
                      onStartEdit={(id, qty) => {
                        setEditingItemId(id);
                        setEditQuantity(String(qty));
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-slate-200 p-3 shadow-lg z-40">

        {/* Quantity Popup (Punching Mode) - Clean numeric input only */}
        <Dialog open={showQuantityPopup} onOpenChange={(open) => { if (!open) cancelQuantityPopup(); }}>
          <DialogContent className="sm:max-w-[340px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Hash className="w-5 h-5 text-emerald-600" />
                Enter Quantity
              </DialogTitle>
              <DialogDescription className="text-left">
                <span className="font-mono text-sm font-bold text-slate-800">{pendingBarcode}</span>
                <br />
                <span className="text-slate-500">{pendingProductName}</span>
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="flex items-center justify-center">
                <Input
                  ref={popupQuantityRef}
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  value={popupQuantity}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPopupQuantity(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      confirmQuantityPopup();
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="h-16 w-full text-center text-3xl font-bold border-2 border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500"
                  data-qty-input="true"
                  autoFocus
                />
              </div>
              <p className="text-xs text-slate-400 text-center mt-2">Type quantity and press Enter to add</p>
            </div>
            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={cancelQuantityPopup}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmQuantityPopup}
                disabled={!popupQuantity || parseInt(popupQuantity) < 1}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Add (Qty: {popupQuantity || 0})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
          {!isSingleSkuMode && (
            <div className="flex items-center gap-2 px-3 py-1.5 border rounded-full bg-white">
              <Label htmlFor="ask-qty-toggle-desktop" className="text-xs text-slate-600 cursor-pointer whitespace-nowrap">
                Ask Quantity Before Adding
              </Label>
              <Switch
                id="ask-qty-toggle-desktop"
                checked={askQuantityBeforeAdding}
                onCheckedChange={handleToggleAskQuantity}
                className="data-[state=checked]:bg-emerald-600"
              />
            </div>
          )}
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
                onChange={handleLocationInputChange}
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
                    : askQuantityBeforeAdding 
                      ? 'Scan barcode → enter quantity in popup'
                      : 'Scan barcode (each scan adds 1 unit, re-scan increments)'}
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
                  {settings.allowManualBarcodeEntry !== false && (
                    <Button
                      onClick={handleScan}
                      disabled={!selectedLocationId || !barcodeInput.trim() || isLocationLocked}
                      className="h-12 px-6 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {askQuantityBeforeAdding ? 'Enter Qty' : 'Add'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Mode Info */}
              <div className={`p-3 rounded-lg border ${askQuantityBeforeAdding ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200'}`}>
                <p className="text-sm flex items-center gap-2 ${askQuantityBeforeAdding ? 'text-teal-700' : 'text-slate-600'}">
                  <Hash className="w-4 h-4" />
                  {askQuantityBeforeAdding 
                    ? <span className="text-teal-700"><strong>Punching Mode:</strong> After scanning, a popup will ask for the quantity before adding.</span>
                    : <span className="text-slate-600"><strong>Auto Mode:</strong> Each scan adds 1 unit. Same barcode increments qty. Edit qty by clicking the number.</span>}
                </p>
              </div>

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
                        : (lastScanResult.error || lastScanResult.message)}
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
                        {editingItemId === item.id ? (
                            <div className="flex items-center justify-center gap-1">
                              <Input
                                type="number"
                                min="1"
                                max={isSingleSkuMode ? item.quantity : undefined}
                                value={editQuantity}
                                onChange={(e) => {
                                  let val = e.target.value;
                                  if (isSingleSkuMode && val !== '') {
                                    const numVal = parseInt(val);
                                    if (!isNaN(numVal) && numVal > item.quantity) {
                                      val = String(item.quantity);
                                    }
                                  }
                                  setEditQuantity(val);
                                }}
                                className="w-20 h-8 text-center"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleQuantityUpdate(item.id);
                                  }
                                }}
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
                              {!isLocationLocked && !isSingleSkuMode && (
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
              {/* Bottom spacer to ensure last item is fully visible */}
              <div className="h-4" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quantity Popup (Punching Mode) - Desktop - Clean numeric input only */}
      <Dialog open={showQuantityPopup} onOpenChange={(open) => { if (!open) cancelQuantityPopup(); }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Hash className="w-5 h-5 text-emerald-600" />
              Enter Quantity
            </DialogTitle>
            <DialogDescription className="text-left">
              <span className="font-mono text-sm font-bold text-slate-800">{pendingBarcode}</span>
              <br />
              <span className="text-slate-500">{pendingProductName}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center justify-center">
              <Input
                ref={popupQuantityRef}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                value={popupQuantity}
                onChange={(e) => {
                  const val = e.target.value;
                  setPopupQuantity(val);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    confirmQuantityPopup();
                  }
                }}
                onFocus={(e) => e.target.select()}
                className="h-16 w-full text-center text-3xl font-bold border-2 border-emerald-300 focus:border-emerald-500 focus:ring-emerald-500"
                data-qty-input="true"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 text-center mt-2">Type quantity and press Enter to add</p>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={cancelQuantityPopup}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmQuantityPopup}
              disabled={!popupQuantity || parseInt(popupQuantity) < 1}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Add (Qty: {popupQuantity || 0})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Confirmation Modal - Desktop */}
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
