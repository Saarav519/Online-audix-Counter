import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { mockUsers, mockLocations, mockMasterProducts, mockScannedItems, mockSessions, mockSettings } from '../data/mockData';
import { MasterProductsDB, ScannedItemsDB, getStorageInfo } from '../utils/indexedDB';

const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  // Initialize state from localStorage if available
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('audix_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('audix_authenticated') === 'true';
  });
  
  // Load locations from localStorage or use mock data
  const [locations, setLocations] = useState(() => {
    const savedLocations = localStorage.getItem('audix_locations');
    return savedLocations ? JSON.parse(savedLocations) : mockLocations;
  });
  
  // Master products - loaded from IndexedDB (supports 100MB+)
  const [masterProducts, setMasterProducts] = useState(mockMasterProducts);
  const [isLoadingMasterData, setIsLoadingMasterData] = useState(true);
  
  // FLAG: Prevent auto-save until IndexedDB has finished loading
  // This prevents race conditions where mock data could overwrite real data
  const indexedDBLoadedRef = useRef(false);
  
  // Load scanned items from localStorage or use mock data
  // Also cleanup orphaned items (items for locations that no longer exist)
  const [scannedItems, setScannedItems] = useState(() => {
    const savedItems = localStorage.getItem('audix_scanned_items');
    const savedLocations = localStorage.getItem('audix_locations');
    
    if (savedItems && savedLocations) {
      try {
        const items = JSON.parse(savedItems);
        const locs = JSON.parse(savedLocations);
        const locationIds = new Set(locs.map(l => l.id));
        
        // Remove scanned items for locations that no longer exist
        const cleanedItems = {};
        let orphanedCount = 0;
        
        Object.entries(items).forEach(([locId, locItems]) => {
          if (locationIds.has(locId)) {
            cleanedItems[locId] = locItems;
          } else {
            orphanedCount += (locItems?.length || 0);
          }
        });
        
        if (orphanedCount > 0) {
          console.log(`🧹 Cleaned up ${orphanedCount} orphaned scanned items`);
          // Save cleaned data back to localStorage
          localStorage.setItem('audix_scanned_items', JSON.stringify(cleanedItems));
        }
        
        return cleanedItems;
      } catch (e) {
        console.warn('Failed to parse saved items:', e);
        return mockScannedItems;
      }
    }
    
    return savedItems ? JSON.parse(savedItems) : mockScannedItems;
  });
  
  const [sessions, setSessions] = useState(mockSessions);
  const [settings, setSettings] = useState(() => {
    // Load settings from localStorage if available
    const savedSettings = localStorage.getItem('audix_settings');
    return savedSettings ? JSON.parse(savedSettings) : mockSettings;
  });
  const [currentSession, setCurrentSession] = useState(mockSessions[0]);

  // ============================================
  // INDEXEDDB: Load Master Products on startup (supports 100MB+)
  // CRITICAL: This must complete BEFORE any auto-save can run
  // ============================================
  useEffect(() => {
    const loadMasterProducts = async () => {
      try {
        const products = await MasterProductsDB.getAll();
        if (products && products.length > 0) {
          setMasterProducts(products);
          console.log(`✅ Loaded ${products.length} master products from IndexedDB`);
        } else {
          // First time - save mock data to IndexedDB
          await MasterProductsDB.importAll(mockMasterProducts);
          setMasterProducts(mockMasterProducts);
          console.log('✅ Initialized IndexedDB with mock master products');
        }
      } catch (err) {
        console.warn('IndexedDB load failed, using localStorage fallback:', err);
        // Fallback to localStorage
        const saved = localStorage.getItem('audix_master_products');
        if (saved) {
          setMasterProducts(JSON.parse(saved));
        }
      } finally {
        // Mark IndexedDB as loaded - NOW auto-save is allowed
        indexedDBLoadedRef.current = true;
        setIsLoadingMasterData(false);
        console.log('✅ IndexedDB load complete, auto-save enabled');
      }
    };
    
    loadMasterProducts();
  }, []);

  // ============================================
  // PERFORMANCE OPTIMIZATION: Master Product Lookup Map
  // Convert array to Map for O(1) lookup instead of O(n) array.find()
  // Critical for large master data (thousands of products)
  // ============================================
  const masterProductMap = useMemo(() => {
    const map = new Map();
    masterProducts.forEach(product => {
      map.set(product.barcode, product);
    });
    return map;
  }, [masterProducts]);

  // Fast product lookup function - O(1) instead of O(n)
  const getProductByBarcode = useCallback((barcode) => {
    return masterProductMap.get(barcode);
  }, [masterProductMap]);

  // Persist locations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('audix_locations', JSON.stringify(locations));
  }, [locations]);

  // ============================================
  // DATA SAFETY: Synchronous localStorage save
  // Saves IMMEDIATELY after every scan - no delay
  // Trade-off: Slightly slower scanning, but ZERO data loss risk
  // ============================================
  const lastSavedRef = useRef(JSON.stringify(scannedItems));
  
  useEffect(() => {
    const currentData = JSON.stringify(scannedItems);
    // Only save if data actually changed (prevents unnecessary writes)
    if (currentData !== lastSavedRef.current) {
      try {
        localStorage.setItem('audix_scanned_items', currentData);
        lastSavedRef.current = currentData;
      } catch (e) {
        console.warn('localStorage save failed:', e);
      }
    }
  }, [scannedItems]);

  // ============================================
  // INDEXEDDB: Persist master products (supports 100MB+)
  // Only saves when master products change (not on every scan)
  // CRITICAL: Only saves AFTER IndexedDB has finished loading to prevent data loss
  // ============================================
  const masterProductsInitializedRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  
  useEffect(() => {
    // SAFETY CHECK 1: Don't save until IndexedDB has finished loading
    // This prevents race conditions where mock data overwrites real data
    if (!indexedDBLoadedRef.current) {
      console.log('⏳ Skipping master products save - IndexedDB not loaded yet');
      return;
    }
    
    // SAFETY CHECK 2: Skip first render after IndexedDB load
    if (!masterProductsInitializedRef.current) {
      masterProductsInitializedRef.current = true;
      console.log('⏳ Skipping first master products save after load');
      return;
    }
    
    // Debounce the save to prevent multiple rapid saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Save after a short delay to batch multiple changes
    saveTimeoutRef.current = setTimeout(() => {
      console.log(`💾 Saving ${masterProducts.length} master products to IndexedDB...`);
      // Save to IndexedDB (async, non-blocking)
      MasterProductsDB.importAll(masterProducts)
        .then(() => console.log('✅ Master products saved to IndexedDB'))
        .catch(err => {
          console.warn('IndexedDB save failed, using localStorage fallback:', err);
          // Fallback to localStorage (may fail for large data)
          try {
            localStorage.setItem('audix_master_products', JSON.stringify(masterProducts));
          } catch (e) {
            console.error('localStorage also failed:', e);
          }
        });
    }, 500); // 500ms debounce
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [masterProducts]);

  // Play sound for scan feedback - OPTIMIZED for fast scanning
  // Uses a shared AudioContext to avoid creating new contexts for each scan
  const audioContextRef = React.useRef(null);
  
  const playSound = React.useCallback((isValid) => {
    if (!settings.soundEnabled) return;
    
    // Use requestAnimationFrame to avoid blocking the main thread
    requestAnimationFrame(() => {
      try {
        // Reuse audio context or create new one
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const audioContext = audioContextRef.current;
        
        // Resume if suspended (browser autoplay policy)
        if (audioContext.state === 'suspended') {
          audioContext.resume();
        }
        
        if (isValid) {
          // Short pleasant beep for valid scan
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = 1200;
          oscillator.type = 'sine';
          gainNode.gain.value = 0.3;
          
          const startTime = audioContext.currentTime;
          oscillator.start(startTime);
          oscillator.stop(startTime + 0.08);
          
          oscillator.onended = () => {
            oscillator.disconnect();
            gainNode.disconnect();
          };
        } else {
          // Classic Telephone Ring for invalid scan (Android 7 compatible)
          // Simplified dual-tone without LFO for older WebView compatibility
          
          const startTime = audioContext.currentTime;
          
          // Create a simple but loud telephone-like ring
          const createRing = (ringStartTime) => {
            // Two oscillators for dual-tone ring (440Hz + 480Hz)
            const osc1 = audioContext.createOscillator();
            const osc2 = audioContext.createOscillator();
            const gainNode1 = audioContext.createGain();
            const gainNode2 = audioContext.createGain();
            
            // Classic telephone frequencies
            osc1.frequency.value = 440;
            osc2.frequency.value = 480;
            osc1.type = 'sine';
            osc2.type = 'sine';
            
            // Connect each oscillator to its own gain node
            osc1.connect(gainNode1);
            osc2.connect(gainNode2);
            gainNode1.connect(audioContext.destination);
            gainNode2.connect(audioContext.destination);
            
            // Set volume - MAXIMUM LOUD
            gainNode1.gain.value = 1.0;
            gainNode2.gain.value = 1.0;
            
            const ringDuration = 0.3;
            
            osc1.start(ringStartTime);
            osc2.start(ringStartTime);
            
            osc1.stop(ringStartTime + ringDuration);
            osc2.stop(ringStartTime + ringDuration);
            
            // Cleanup
            osc1.onended = () => {
              osc1.disconnect();
              gainNode1.disconnect();
            };
            osc2.onended = () => {
              osc2.disconnect();
              gainNode2.disconnect();
            };
          };
          
          // Create two rings with a short gap (like real telephone)
          createRing(startTime);
          createRing(startTime + 0.4); // Second ring after 0.4s
          
          // Vibrate device for invalid scan (if supported)
          if (navigator.vibrate) {
            // Vibrate pattern matching the ring: ring-pause-ring
            navigator.vibrate([300, 100, 300]);
          }
        }
      } catch (e) {
        // Silently fail if audio not supported
        console.warn('Audio playback failed:', e);
      }
    });
  }, [settings.soundEnabled]);

  // Login function - checks ONLY mock users (not imported users)
  // Imported users are for authorization actions only
  const login = (userId, password) => {
    const loginUsers = getLoginUsers();
    const foundUser = loginUsers.find(
      u => u.userId === userId && u.password === password
    );
    if (foundUser) {
      setUser(foundUser);
      setIsAuthenticated(true);
      localStorage.setItem('audix_user', JSON.stringify(foundUser));
      localStorage.setItem('audix_authenticated', 'true');
      return { success: true, user: foundUser };
    }
    return { success: false, error: 'Invalid credentials' };
  };

  // Verify credentials for Settings - uses SAME credentials as login (mock users only)
  const verifyCredentials = (userId, password) => {
    const loginUsers = getLoginUsers();
    const foundUser = loginUsers.find(
      u => u.userId === userId && u.password === password
    );
    return { success: !!foundUser, user: foundUser };
  };

  // Verify authorization credentials - uses ONLY imported users
  // For actions like: delete location, reopen locked location
  // Verify credentials for authorization actions (delete, reopen, etc.)
  // Uses SAME credentials as Main Screen login
  const verifyAuthorizationCredentials = (userId, password) => {
    const loginUsers = getLoginUsers();
    const foundUser = loginUsers.find(
      u => u.userId === userId && u.password === password
    );
    return { success: !!foundUser, user: foundUser };
  };

  // Logout function
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('audix_user');
    localStorage.removeItem('audix_authenticated');
  };

  // Add scanned item to location - OPTIMIZED FOR FAST SCANNING
  // Uses Map lookup O(1) instead of array.find O(n) for master product search
  // When duplicate barcode is scanned, it moves to the END of array (appears at TOP when reversed)
  const addScannedItem = useCallback((locationId, barcode, quantity = 1, forceExactQuantity = false) => {
    // O(1) lookup using Map instead of O(n) array.find
    const product = masterProductMap.get(barcode);
    const isValidBarcode = product !== undefined;
    
    // Check if non-master products are allowed
    if (!isValidBarcode && !settings.allowNonMasterProducts) {
      return { success: false, error: 'Barcode not in master list', isValid: false };
    }

    // Use functional update to avoid stale state issues during rapid scanning
    let newItem = null;
    
    setScannedItems(prev => {
      const locationItems = prev[locationId] || [];
      const existingIndex = locationItems.findIndex(item => item.barcode === barcode);

      // forceExactQuantity: Used when submitting/importing - sets exact quantity instead of incrementing
      if (forceExactQuantity) {
        if (existingIndex !== -1) {
          // Update existing item with exact quantity
          const existingItem = locationItems[existingIndex];
          const filteredItems = locationItems.filter((_, idx) => idx !== existingIndex);
          newItem = {
            ...existingItem,
            quantity: quantity, // SET exact quantity, don't add
            scannedAt: new Date().toISOString()
          };
          return { ...prev, [locationId]: [...filteredItems, newItem] };
        } else {
          // Add new item with exact quantity
          newItem = {
            id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            barcode,
            productName: product ? product.name : `Unknown (${barcode.slice(-6)})`,
            quantity: quantity, // Use exact quantity
            scannedAt: new Date().toISOString(),
            isMaster: !!product
          };
          return { ...prev, [locationId]: [...locationItems, newItem] };
        }
      }

      if (settings.singleSkuScanning) {
        // Single SKU Mode: 
        // - Same barcode stays in ONE line
        // - Quantity auto-increments by 1 per scan
        // - Re-scanned item MOVES TO END (appears at TOP when reversed)
        if (existingIndex !== -1) {
          // Remove existing item and add updated version to END
          const existingItem = locationItems[existingIndex];
          const filteredItems = locationItems.filter((_, idx) => idx !== existingIndex);
          newItem = {
            ...existingItem,
            quantity: existingItem.quantity + 1,
            scannedAt: new Date().toISOString()
          };
          return { ...prev, [locationId]: [...filteredItems, newItem] };
        } else {
          // Add new item - store minimal data, lookup details from master when needed
          newItem = {
            id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            barcode,
            productName: product ? product.name : `Unknown (${barcode.slice(-6)})`,
            quantity: 1,
            scannedAt: new Date().toISOString(),
            isMaster: !!product
          };
          return { ...prev, [locationId]: [...locationItems, newItem] };
        }
      } else {
        // Non-Single SKU Mode (Manual Qty Entry)
        // - Re-scanned item MOVES TO END (appears at TOP when reversed)
        if (existingIndex !== -1) {
          // Remove existing item and add updated version to END
          const existingItem = locationItems[existingIndex];
          const filteredItems = locationItems.filter((_, idx) => idx !== existingIndex);
          newItem = {
            ...existingItem,
            quantity: existingItem.quantity + quantity,
            scannedAt: new Date().toISOString()
          };
          return { ...prev, [locationId]: [...filteredItems, newItem] };
        } else {
          // Add new item - store minimal data
          newItem = {
            id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            barcode,
            productName: product ? product.name : `Unknown (${barcode.slice(-6)})`,
            quantity,
            scannedAt: new Date().toISOString(),
            isMaster: !!product
          };
          return { ...prev, [locationId]: [...locationItems, newItem] };
        }
      }
    });

    // Update location's lastUpdated timestamp
    setLocations(prev => prev.map(loc => 
      loc.id === locationId 
        ? { ...loc, lastUpdated: new Date().toISOString() }
        : loc
    ));

    return { success: true, isValid: isValidBarcode, product, item: newItem };
  }, [masterProductMap, settings.allowNonMasterProducts, settings.singleSkuScanning]);

  // Delete scanned item from specific location only
  const deleteScannedItem = (locationId, itemId) => {
    setScannedItems(prev => {
      const locationItems = prev[locationId] || [];
      const filtered = locationItems.filter(item => item.id !== itemId);
      return { ...prev, [locationId]: filtered };
    });
  };

  // Delete all scanned items for specific locations
  const deleteLocationData = (locationIds) => {
    setScannedItems(prev => {
      const updated = { ...prev };
      locationIds.forEach(locId => {
        updated[locId] = [];
      });
      return updated;
    });
  };

  // BATCH SAVE: Save multiple items to a location at once
  // This is more reliable than calling addScannedItem multiple times
  // because it performs a single atomic state update
  const batchSaveScannedItems = useCallback((locationId, items) => {
    if (!items || items.length === 0) return;
    
    setScannedItems(prev => {
      const existingItems = prev[locationId] || [];
      
      // Merge items - update existing by barcode or add new
      const itemMap = new Map();
      
      // First, add existing items to map
      existingItems.forEach(item => {
        itemMap.set(item.barcode, item);
      });
      
      // Then, update/add new items
      items.forEach(item => {
        const existingItem = itemMap.get(item.barcode);
        if (existingItem) {
          // Update existing item with new quantity
          itemMap.set(item.barcode, {
            ...existingItem,
            quantity: item.quantity,
            scannedAt: item.scannedAt || new Date().toISOString()
          });
        } else {
          // Add new item
          itemMap.set(item.barcode, {
            id: item.id || `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            barcode: item.barcode,
            productName: item.productName || `Unknown (${item.barcode.slice(-6)})`,
            quantity: item.quantity,
            scannedAt: item.scannedAt || new Date().toISOString(),
            isMaster: item.isMaster
          });
        }
      });
      
      // Convert map back to array
      const mergedItems = Array.from(itemMap.values());
      
      const newState = { ...prev, [locationId]: mergedItems };
      
      // Immediately persist to localStorage (safety measure)
      try {
        localStorage.setItem('audix_scanned_items', JSON.stringify(newState));
        console.log(`✅ Batch saved ${mergedItems.length} items to location ${locationId}`);
      } catch (e) {
        console.warn('localStorage batch save failed:', e);
      }
      
      return newState;
    });
    
    // Update location's lastUpdated timestamp
    setLocations(prev => prev.map(loc => 
      loc.id === locationId 
        ? { ...loc, lastUpdated: new Date().toISOString() }
        : loc
    ));
  }, []);

  // Update item quantity
  const updateItemQuantity = (locationId, itemId, newQuantity) => {
    setScannedItems(prev => {
      const locationItems = prev[locationId] || [];
      const updated = locationItems.map(item =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      );
      return { ...prev, [locationId]: updated };
    });
  };

  // Submit location (lock it)
  const submitLocation = (locationId) => {
    setLocations(prev =>
      prev.map(loc =>
        loc.id === locationId
          ? { ...loc, isCompleted: true, isSubmitted: true, lastUpdated: new Date().toISOString() }
          : loc
      )
    );
  };

  // Reopen submitted location
  const reopenLocation = (locationId) => {
    setLocations(prev =>
      prev.map(loc =>
        loc.id === locationId
          ? { ...loc, isSubmitted: false, lastUpdated: new Date().toISOString() }
          : loc
      )
    );
  };

  // Update settings
  const updateSettings = (newSettings) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    // Persist to localStorage
    localStorage.setItem('audix_settings', JSON.stringify(updatedSettings));
  };

  // Add new location
  const addLocation = (locationData) => {
    const newLocation = {
      id: `loc_${Date.now()}`,
      ...locationData,
      status: 'active',
      itemCount: 0,
      isCompleted: false,
      isSubmitted: false,
      isAssigned: false, // Manual locations are not assigned
      lastUpdated: new Date().toISOString()
    };
    setLocations(prev => [...prev, newLocation]);
    setScannedItems(prev => ({ ...prev, [newLocation.id]: [] }));
    return newLocation;
  };

  // Import assigned locations (for Pre-Assigned mode)
  const importAssignedLocations = (locationsData) => {
    const newLocations = locationsData.map((loc, index) => ({
      id: `loc_import_${Date.now()}_${index}`,
      name: loc.name || loc.code,
      code: loc.code,
      status: 'active',
      itemCount: 0,
      isCompleted: false,
      isSubmitted: false,
      isAssigned: true, // Imported locations are assigned
      lastUpdated: new Date().toISOString()
    }));
    
    setLocations(prev => [...prev, ...newLocations]);
    
    // Initialize empty scanned items for each new location
    setScannedItems(prev => {
      const newItems = { ...prev };
      newLocations.forEach(loc => {
        newItems[loc.id] = [];
      });
      return newItems;
    });
    
    return newLocations.length;
  };

  // Clear all assigned locations (for re-import)
  const clearAssignedLocations = () => {
    setLocations(prev => prev.filter(loc => !loc.isAssigned));
    setScannedItems(prev => {
      const newItems = { ...prev };
      locations.filter(loc => loc.isAssigned).forEach(loc => {
        delete newItems[loc.id];
      });
      return newItems;
    });
  };

  // Delete location
  const deleteLocation = (locationId) => {
    setLocations(prev => prev.filter(loc => loc.id !== locationId));
    setScannedItems(prev => {
      const newItems = { ...prev };
      delete newItems[locationId];
      return newItems;
    });
    // Also clear any temp items from localStorage
    localStorage.removeItem(`audix_temp_items_${locationId}`);
  };

  // Delete location from reports - also removes from Locations if no scanned items
  const deleteLocationFromReports = (locationId) => {
    // First, remove the scanned items for this location
    setScannedItems(prev => {
      const newItems = { ...prev };
      delete newItems[locationId];
      return newItems;
    });
    
    // Then, remove the location from the locations list
    // (since reports are tied to locations, deleting from reports means deleting the location)
    setLocations(prev => prev.filter(loc => loc.id !== locationId));
    
    // Also clear any temp items from localStorage
    localStorage.removeItem(`audix_temp_items_${locationId}`);
  };

  // Clear scanned items for a location (keeps the location, removes items)
  const clearLocationItems = (locationId) => {
    setScannedItems(prev => ({
      ...prev,
      [locationId]: []
    }));
    // Update location to reset submission status
    setLocations(prev =>
      prev.map(loc =>
        loc.id === locationId
          ? { ...loc, isSubmitted: false, itemCount: 0, lastUpdated: new Date().toISOString() }
          : loc
      )
    );
  };

  // Find location by code (for scanner auto-select) - respects mode separation
  const findLocationByCode = (code) => {
    return locations.find(l => {
      const codeMatch = l.code.toLowerCase() === code.toLowerCase() || 
                        l.name.toLowerCase().includes(code.toLowerCase());
      
      if (!codeMatch) return false;
      
      // Check mode separation
      if (settings.locationScanMode === 'preassigned') {
        // In Pre-Assigned mode, only find assigned locations
        return l.isAssigned === true;
      } else {
        // In Dynamic mode, only find dynamic/non-assigned locations
        return l.autoCreated === true || l.isAssigned === false;
      }
    });
  };

  // Auto-create location from scanned code (for dynamic mode)
  const createLocationFromScan = (scannedCode) => {
    const newLocation = {
      id: `loc_${Date.now()}`,
      name: scannedCode,
      code: scannedCode,
      status: 'active',
      itemCount: 0,
      isCompleted: false,
      isSubmitted: false,
      isAssigned: false, // Dynamic locations are not assigned
      autoCreated: true, // Mark as auto-created for dynamic mode
      lastUpdated: new Date().toISOString()
    };
    setLocations(prev => [...prev, newLocation]);
    setScannedItems(prev => ({ ...prev, [newLocation.id]: [] }));
    return newLocation;
  };

  // Create a temporary location object WITHOUT saving to state
  // Used in Dynamic mode - location is only saved when items are submitted
  const createTempLocation = (scannedCode) => {
    return {
      id: `loc_temp_${Date.now()}`,
      name: scannedCode,
      code: scannedCode,
      status: 'active',
      itemCount: 0,
      isCompleted: false,
      isSubmitted: false,
      isAssigned: false,
      autoCreated: true,
      isTemp: true, // Mark as temporary
      lastUpdated: new Date().toISOString()
    };
  };

  // Save a temporary location to permanent state (called during submit)
  // NOTE: Does NOT initialize scanned items - the caller is responsible for adding items
  const saveTempLocation = (tempLocation) => {
    if (!tempLocation || !tempLocation.isTemp) return tempLocation;
    
    // Check if location already exists (by code)
    const existing = findLocationByCode(tempLocation.code);
    if (existing) return existing;
    
    // Create permanent location from temp
    const permanentLocation = {
      ...tempLocation,
      isTemp: false
    };
    setLocations(prev => [...prev, permanentLocation]);
    // DO NOT initialize scannedItems here - it will be populated by addScannedItem
    // Initializing to empty array here causes a race condition with addScannedItem
    return permanentLocation;
  };

  // Scan location - handles both pre-assigned and dynamic modes
  const scanLocation = (scannedCode) => {
    const existingLocation = findLocationByCode(scannedCode);
    
    if (existingLocation) {
      // Check if location is submitted/locked
      if (existingLocation.isSubmitted) {
        return { 
          success: false, 
          error: `Location "${existingLocation.name}" is already scanned and completed. Manual authorization required to reopen.`, 
          location: null,
          isLocked: true 
        };
      }
      return { success: true, location: existingLocation, isNew: false };
    }
    
    // Location not found
    if (settings.locationScanMode === 'preassigned') {
      return { success: false, error: `Location "${scannedCode}" not found. Only pre-assigned locations can be scanned.`, location: null };
    }
    
    // Dynamic mode - create TEMPORARY location (not saved until submit)
    const tempLocation = createTempLocation(scannedCode);
    return { success: true, location: tempLocation, isNew: true, isTemp: true };
  };

  // Add product to master list
  const addMasterProduct = (productData) => {
    const newProduct = {
      id: `prod_${Date.now()}`,
      ...productData,
      isMaster: true
    };
    setMasterProducts(prev => [...prev, newProduct]);
    return newProduct;
  };

  // DIRECT SET: Used by import to set all products at once (bypasses useEffect save)
  // Products are already saved to IndexedDB by the import function
  const setMasterProductsDirect = (products) => {
    // Mark as already saved to prevent duplicate save
    // The import function already saved to IndexedDB
    console.log(`📥 Direct setting ${products.length} master products (already saved to IndexedDB)`);
    setMasterProducts(products);
  };

  // Import master products from CSV data - replaces old data
  const importMasterProducts = (products, replaceExisting = true) => {
    const newProducts = products.map((p, index) => ({
      id: `prod_import_${Date.now()}_${index}`,
      ...p,
      isMaster: true
    }));
    
    if (replaceExisting) {
      // Replace all existing master products
      setMasterProducts(newProducts);
    } else {
      // Append to existing
      setMasterProducts(prev => [...prev, ...newProducts]);
    }
    return newProducts.length;
  };

  // Import users from CSV data - FOR AUTHORIZATION ONLY
  // These users can only authorize actions like delete/reopen, NOT login
  const importAuthorizationUsers = (usersData) => {
    const importedUsers = usersData.map((u, index) => ({
      id: `auth_user_${Date.now()}_${index}`,
      userId: u.userId || u.username,
      password: u.password,
      name: u.name || u.userId || u.username,
      role: 'authorizer', // Mark as authorizer role
      createdAt: new Date().toISOString()
    }));
    
    // Store authorization users separately
    localStorage.setItem('audix_authorization_users', JSON.stringify(importedUsers));
    return importedUsers.length;
  };

  // Get login users (mock users only - can be updated)
  const getLoginUsers = () => {
    // Check for updated mock users in localStorage
    const updatedMockUsers = localStorage.getItem('audix_login_users');
    if (updatedMockUsers) {
      return JSON.parse(updatedMockUsers);
    }
    return [...mockUsers];
  };

  // Get authorization users (imported users only) - for authorization actions
  const getAuthorizationUsers = () => {
    return JSON.parse(localStorage.getItem('audix_authorization_users') || '[]');
  };

  // Get all users (for display purposes)
  const getAllUsers = () => {
    const loginUsers = getLoginUsers();
    const authUsers = getAuthorizationUsers();
    return [...loginUsers, ...authUsers];
  };

  // Update user credentials (for logged-in user)
  // Updates apply to both main login and settings
  const updateUserCredentials = (currentPassword, newUserId, newPassword) => {
    // Verify current password
    if (user?.password !== currentPassword) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Get current login users
    const loginUsers = getLoginUsers();
    const userIndex = loginUsers.findIndex(u => u.id === user.id);
    
    if (userIndex === -1) {
      return { success: false, error: 'User not found' };
    }

    // Update user credentials
    const updatedUser = {
      ...loginUsers[userIndex],
      userId: newUserId || loginUsers[userIndex].userId,
      password: newPassword,
    };
    
    loginUsers[userIndex] = updatedUser;
    
    // Save updated users to localStorage
    localStorage.setItem('audix_login_users', JSON.stringify(loginUsers));
    
    // Update current user session
    setUser(updatedUser);
    localStorage.setItem('audix_user', JSON.stringify(updatedUser));
    
    return { success: true, user: updatedUser };
  };

  // Get next pending location (for auto-navigation after submit)
  const getNextPendingLocation = () => {
    const pendingLocations = locations.filter(loc => {
      // Filter by mode
      if (settings.locationScanMode === 'preassigned') {
        return loc.isAssigned === true && !loc.isSubmitted;
      } else {
        return (loc.autoCreated === true || loc.isAssigned === false) && !loc.isSubmitted;
      }
    });
    return pendingLocations.length > 0 ? pendingLocations[0] : null;
  };

  const value = {
    user,
    isAuthenticated,
    locations,
    masterProducts,
    scannedItems,
    sessions,
    settings,
    currentSession,
    login,
    logout,
    verifyCredentials,
    verifyAuthorizationCredentials,
    updateUserCredentials,
    addScannedItem,
    deleteScannedItem,
    deleteLocationData,
    updateItemQuantity,
    submitLocation,
    reopenLocation,
    updateSettings,
    addLocation,
    deleteLocation,
    deleteLocationFromReports,
    clearLocationItems,
    findLocationByCode,
    scanLocation,
    createLocationFromScan,
    saveTempLocation,
    importAssignedLocations,
    clearAssignedLocations,
    addMasterProduct,
    setMasterProductsDirect, // Direct set for imports (bypasses auto-save)
    importMasterProducts,
    importAuthorizationUsers,
    getLoginUsers,
    getAuthorizationUsers,
    getAllUsers,
    getNextPendingLocation,
    getProductByBarcode, // Fast O(1) product lookup
    getStorageInfo, // Check available storage
    isLoadingMasterData, // Loading state for master products
    playSound
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
