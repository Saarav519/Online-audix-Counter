import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { mockUsers, mockLocations, mockMasterProducts, mockMasterLocations, mockScannedItems, mockSessions, mockSettings } from '../data/mockData';
import { MasterProductsDB, MasterLocationsDB, ScannedItemsDB, ScannedItemsByLocationDB, getStorageInfo, getMasterMeta } from '../utils/indexedDB';

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
  
  // Loading state for scanned items (prevents showing stale data in Reports)
  const [isLoadingScannedData, setIsLoadingScannedData] = useState(true);
  
  // Master locations - loaded from IndexedDB (similar pattern to masterProducts)
  const [masterLocations, setMasterLocations] = useState(mockMasterLocations);
  const masterLocationsInitializedRef = useRef(false);
  
  // FLAG: Prevent auto-save until IndexedDB has finished loading
  // This prevents race conditions where mock data could overwrite real data
  const indexedDBLoadedRef = useRef(false);
  
  // Load scanned items - starts with localStorage (sync), then migrates to IndexedDB (async)
  // IndexedDB load will overwrite this once ready
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
          console.log(`Cleaned up ${orphanedCount} orphaned scanned items`);
        }
        
        return cleanedItems;
      } catch (e) {
        console.warn('Failed to parse saved items:', e);
        return mockScannedItems;
      }
    }
    
    return savedItems ? JSON.parse(savedItems) : mockScannedItems;
  });
  
  // Flag: IndexedDB scanned items loaded (prevents overwriting real data with mock)
  const scannedItemsFromIDBRef = useRef(false);
  
  const [sessions, setSessions] = useState(mockSessions);
  const [settings, setSettings] = useState(() => {
    // Load settings from localStorage if available
    const savedSettings = localStorage.getItem('audix_settings');
    return savedSettings ? JSON.parse(savedSettings) : mockSettings;
  });
  const [currentSession, setCurrentSession] = useState(mockSessions[0]);

  // UI state: hide bottom nav during active scanning
  const [hideBottomNav, setHideBottomNav] = useState(false);

  // Reports page selected locations - shared with Settings for sync
  // Persisted in localStorage to survive navigation
  const [reportSelectedLocations, setReportSelectedLocationsState] = useState(() => {
    const saved = localStorage.getItem('audix_report_selected_locations');
    return saved ? JSON.parse(saved) : ['all'];
  });

  // Wrapper to persist selection to localStorage
  const setReportSelectedLocations = (newValue) => {
    const value = typeof newValue === 'function' ? newValue(reportSelectedLocations) : newValue;
    setReportSelectedLocationsState(value);
    localStorage.setItem('audix_report_selected_locations', JSON.stringify(value));
  };

  // ============================================
  // INDEXEDDB: Load Master Products on startup (supports 100MB+)
  // CRITICAL: This must complete BEFORE any auto-save can run
  // Detects if IndexedDB was evicted by browser and warns user
  // ============================================
  useEffect(() => {
    const loadMasterProducts = async () => {
      try {
        const products = await MasterProductsDB.getAll();
        if (products && products.length > 0) {
          setMasterProducts(products);
          console.log(`Loaded ${products.length} master products from IndexedDB`);
        } else {
          // IndexedDB is empty - check if user previously had data imported
          const meta = getMasterMeta();
          const prevCount = meta?.products?.count || 0;
          
          if (prevCount > 0) {
            // DATA LOSS DETECTED: User had imported data but IndexedDB is empty
            // This happens when mobile browser evicts data under memory pressure
            console.error(`DATA LOSS: Previously had ${prevCount} products, IndexedDB now empty!`);
            setMasterProducts([]);
            // Show alert to user (set a flag that components can check)
            localStorage.setItem('audix_master_data_lost', JSON.stringify({
              products: prevCount,
              detectedAt: new Date().toISOString()
            }));
          } else {
            // Truly first time - save mock data to IndexedDB
            await MasterProductsDB.importAll(mockMasterProducts);
            setMasterProducts(mockMasterProducts);
            console.log('Initialized IndexedDB with mock master products');
          }
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
        console.log('IndexedDB load complete, auto-save enabled');
      }
    };
    
    loadMasterProducts();
  }, []);

  // ============================================
  // INDEXEDDB: Load Master Locations on startup
  // Detects data loss similar to master products
  // ============================================
  useEffect(() => {
    const loadMasterLocations = async () => {
      try {
        const locations = await MasterLocationsDB.getAll();
        if (locations && locations.length > 0) {
          setMasterLocations(locations);
          console.log(`Loaded ${locations.length} master locations from IndexedDB`);
        } else {
          // Check if user previously had data
          const meta = getMasterMeta();
          const prevCount = meta?.locations?.count || 0;
          
          if (prevCount > 0) {
            console.error(`DATA LOSS: Previously had ${prevCount} locations, IndexedDB now empty!`);
            setMasterLocations([]);
          } else {
            // First time - save mock data to IndexedDB
            await MasterLocationsDB.importAll(mockMasterLocations);
            setMasterLocations(mockMasterLocations);
            console.log('Initialized IndexedDB with mock master locations');
          }
        }
      } catch (err) {
        console.warn('IndexedDB master locations load failed, using localStorage fallback:', err);
        const saved = localStorage.getItem('audix_master_locations');
        if (saved) {
          setMasterLocations(JSON.parse(saved));
        }
      }
    };
    
    loadMasterLocations();
  }, []);

  // ============================================
  // INDEXEDDB: Load Scanned Items on startup (V3 migration)
  // Migrates from localStorage (5MB) to IndexedDB (100MB+)
  // CRITICAL: Sets isLoadingScannedData=false when done to unblock Reports
  // ============================================
  useEffect(() => {
    const loadScannedItems = async () => {
      try {
        const idbData = await ScannedItemsByLocationDB.getAll();
        const idbKeys = Object.keys(idbData);
        
        if (idbKeys.length > 0) {
          // IndexedDB has data - use it as primary source
          setScannedItems(idbData);
          scannedItemsFromIDBRef.current = true;
          console.log(`Loaded ${idbKeys.length} locations' scanned items from IndexedDB`);
          
          // Clean up localStorage copy (no longer needed)
          localStorage.removeItem('audix_scanned_items');
        } else {
          // No IndexedDB data - migrate from localStorage
          const savedItems = localStorage.getItem('audix_scanned_items');
          if (savedItems) {
            try {
              const items = JSON.parse(savedItems);
              const keys = Object.keys(items);
              if (keys.length > 0) {
                // Save to IndexedDB
                await ScannedItemsByLocationDB.saveAll(items);
                setScannedItems(items);
                scannedItemsFromIDBRef.current = true;
                console.log(`Migrated ${keys.length} locations' scanned items from localStorage to IndexedDB`);
                // Remove from localStorage to free space
                localStorage.removeItem('audix_scanned_items');
              }
            } catch (e) {
              console.warn('Failed to migrate localStorage items to IndexedDB:', e);
            }
          } else {
            // First time - save mock data to IndexedDB
            await ScannedItemsByLocationDB.saveAll(mockScannedItems);
            scannedItemsFromIDBRef.current = true;
            console.log('Initialized IndexedDB with mock scanned items');
          }
        }
      } catch (err) {
        console.warn('IndexedDB scanned items load failed, using localStorage fallback:', err);
        // Keep using localStorage data (already loaded in useState init)
      } finally {
        // Mark scanned data as loaded - Reports can now show accurate data
        setIsLoadingScannedData(false);
      }
    };
    
    loadScannedItems();
  }, []);

  // ============================================
  // AUTO-SAVE: Persist master locations to IndexedDB when changed
  // Uses safeSave (upsert) instead of importAll (clear+insert) to prevent data loss
  // ============================================
  useEffect(() => {
    if (!indexedDBLoadedRef.current) return;
    if (!masterLocationsInitializedRef.current) {
      masterLocationsInitializedRef.current = true;
      return;
    }
    
    const saveTimeout = setTimeout(() => {
      console.log(`Saving ${masterLocations.length} master locations to IndexedDB (safe)...`);
      MasterLocationsDB.safeSave(masterLocations)
        .then(() => console.log('Master locations saved to IndexedDB'))
        .catch(err => {
          console.warn('IndexedDB master locations save failed:', err);
        });
    }, 300);

    return () => clearTimeout(saveTimeout);
  }, [masterLocations]);

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

  // ============================================
  // PERFORMANCE OPTIMIZATION: Master Location Lookup Set
  // Uses Set for O(1) lookup by location code
  // ============================================
  const masterLocationSet = useMemo(() => {
    const set = new Set();
    masterLocations.forEach(loc => {
      set.add(loc.code);
      // Also add lowercase for case-insensitive matching
      set.add(loc.code.toLowerCase());
    });
    return set;
  }, [masterLocations]);

  // Master location lookup map - O(1) by code
  const masterLocationMap = useMemo(() => {
    const map = new Map();
    masterLocations.forEach(loc => {
      map.set(loc.code, loc);
      map.set(loc.code.toLowerCase(), loc);
    });
    return map;
  }, [masterLocations]);

  // Fast location master lookup
  const getMasterLocationByCode = useCallback((code) => {
    return masterLocationMap.get(code) || masterLocationMap.get(code.toLowerCase());
  }, [masterLocationMap]);

  // Check if a location code is in master
  const isLocationInMaster = useCallback((code) => {
    return masterLocationSet.has(code) || masterLocationSet.has(code.toLowerCase());
  }, [masterLocationSet]);

  // Persist locations to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('audix_locations', JSON.stringify(locations));
  }, [locations]);

  // ============================================
  // INDEXEDDB: Debounced save for scannedItems (replaces localStorage)
  // Saves every 500ms to IndexedDB (100MB+ capacity)
  // CRITICAL: Waits for IndexedDB load to complete before saving
  // to prevent overwriting real data with stale/mock state
  // ============================================
  const lastSavedRef = useRef(JSON.stringify(scannedItems));
  const saveTimeoutRef2 = useRef(null);
  const scannedItemsInitializedRef = useRef(false);
  
  useEffect(() => {
    // SAFETY: Don't save until IndexedDB has finished loading scanned data
    if (isLoadingScannedData) return;
    
    // Skip initial render and IndexedDB-triggered setState to prevent overwriting
    if (!scannedItemsInitializedRef.current) {
      scannedItemsInitializedRef.current = true;
      return;
    }
    
    const currentData = JSON.stringify(scannedItems);
    // Only save if data actually changed (prevents unnecessary writes)
    if (currentData !== lastSavedRef.current) {
      // Clear any pending save
      if (saveTimeoutRef2.current) {
        clearTimeout(saveTimeoutRef2.current);
      }
      
      // Debounced save - 500ms delay for performance
      saveTimeoutRef2.current = setTimeout(() => {
        // Save to IndexedDB (async, non-blocking, 100MB+ capacity)
        ScannedItemsByLocationDB.saveAll(scannedItems)
          .then(() => {
            lastSavedRef.current = currentData;
            console.log(`Saved scanned items to IndexedDB (${Object.keys(scannedItems).length} locations)`);
          })
          .catch(err => {
            console.warn('IndexedDB save failed, falling back to localStorage:', err);
            // Fallback to localStorage if IndexedDB fails
            try {
              localStorage.setItem('audix_scanned_items', currentData);
              lastSavedRef.current = currentData;
            } catch (lsErr) {
              console.error('Both IndexedDB and localStorage save failed:', lsErr);
            }
          });
      }, 500);
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (saveTimeoutRef2.current) {
        clearTimeout(saveTimeoutRef2.current);
        // Force immediate save on unmount - use localStorage as sync fallback
        // (IndexedDB is async and may not complete before page unload)
        try {
          localStorage.setItem('audix_scanned_items', JSON.stringify(scannedItems));
        } catch (e) {
          // Last resort - at least try IndexedDB
          ScannedItemsByLocationDB.saveAll(scannedItems).catch(() => {});
        }
      }
    };
  }, [scannedItems]);

  // ============================================
  // CLEANUP: Remove orphaned scannedItems keys
  // When locations change, clean up any scannedItems entries
  // for location IDs that no longer exist in the locations array
  // Also cleans up orphaned IndexedDB entries
  // CRITICAL: Only runs AFTER IndexedDB scanned data is loaded to prevent
  // cleaning up real data based on stale/mock initial state
  // ============================================
  useEffect(() => {
    // Don't cleanup until IndexedDB data is loaded
    if (isLoadingScannedData) return;
    if (!locations || locations.length === 0) return;
    const validIds = new Set(locations.map(l => l.id));
    setScannedItems(prev => {
      const orphanKeys = Object.keys(prev).filter(k => !validIds.has(k));
      if (orphanKeys.length === 0) return prev; // no orphans, no update
      const cleaned = { ...prev };
      orphanKeys.forEach(k => delete cleaned[k]);
      console.log(`Cleaned ${orphanKeys.length} orphaned scannedItems keys`);
      // Also remove from IndexedDB
      ScannedItemsByLocationDB.deleteLocations(orphanKeys).catch(() => {});
      return cleaned;
    });
  }, [locations, isLoadingScannedData]);

  // ============================================
  // INDEXEDDB: Persist master products (supports 100MB+)
  // Only saves when master products change (not on every scan)
  // CRITICAL FIX: Uses safeSave (upsert) instead of importAll (clear+insert)
  // This prevents data loss if the save is interrupted (mobile memory pressure, tab kill)
  // ============================================
  const masterProductsInitializedRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  
  useEffect(() => {
    // SAFETY CHECK 1: Don't save until IndexedDB has finished loading
    // This prevents race conditions where mock data overwrites real data
    if (!indexedDBLoadedRef.current) {
      return;
    }
    
    // SAFETY CHECK 2: Skip first render after IndexedDB load
    if (!masterProductsInitializedRef.current) {
      masterProductsInitializedRef.current = true;
      return;
    }

    // SAFETY CHECK 3: Don't auto-save empty data (would lose everything)
    if (!masterProducts || masterProducts.length === 0) {
      console.log('Skipping auto-save: master products empty');
      return;
    }
    
    // Debounce the save to prevent multiple rapid saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Save after a short delay to batch multiple changes
    saveTimeoutRef.current = setTimeout(() => {
      console.log(`Saving ${masterProducts.length} master products to IndexedDB (safe)...`);
      // FIXED: Use safeSave (upsert) instead of importAll (clear+insert)
      // safeSave never clears the store, so interrupted saves can't cause data loss
      MasterProductsDB.safeSave(masterProducts)
        .then(() => console.log('Master products saved to IndexedDB'))
        .catch(err => {
          console.warn('IndexedDB save failed, using localStorage backup:', err);
          // Backup to localStorage as last resort
          try {
            localStorage.setItem('audix_master_products', JSON.stringify(masterProducts));
          } catch (e) { /* localStorage might be full */ }
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
    // Remove scanned items for these locations
    setScannedItems(prev => {
      const updated = { ...prev };
      locationIds.forEach(locId => {
        delete updated[locId];
      });
      return updated;
    });
    // Also remove from IndexedDB
    ScannedItemsByLocationDB.deleteLocations(locationIds).catch(err => {
      console.warn('IndexedDB delete after sync clear failed:', err);
    });
    // Also remove the locations themselves (they've been synced)
    setLocations(prev => {
      const updated = prev.filter(loc => !locationIds.includes(loc.id));
      try {
        localStorage.setItem('audix_locations', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to sync localStorage after sync clear:', e);
      }
      return updated;
    });
    // Clear temp items
    locationIds.forEach(locId => {
      localStorage.removeItem(`audix_temp_items_${locId}`);
    });
  };

  // BATCH SAVE: Save multiple items to a location at once
  // REPLACES all existing items for the location (not merge)
  // This ensures deleted items don't come back after re-submit
  const batchSaveScannedItems = useCallback((locationId, items) => {
    if (!items || items.length === 0) return;
    
    setScannedItems(prev => {
      const newState = { ...prev, [locationId]: items };
      
      // Immediately persist to IndexedDB (single location save is fast)
      ScannedItemsByLocationDB.saveLocation(locationId, items)
        .then(() => console.log(`Batch saved ${items.length} items to location ${locationId} (IndexedDB)`))
        .catch(err => {
          console.warn('IndexedDB batch save failed, trying localStorage:', err);
          try {
            localStorage.setItem('audix_scanned_items', JSON.stringify(newState));
          } catch (lsErr) {
            console.error('Both IndexedDB and localStorage batch save failed:', lsErr);
          }
        });
      
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
  const submitLocation = (locationId, isEmpty = false, emptyRemarks = '') => {
    setLocations(prev =>
      prev.map(loc =>
        loc.id === locationId
          ? { 
              ...loc, 
              isCompleted: true, 
              isSubmitted: true, 
              isEmpty: isEmpty,
              emptyRemarks: emptyRemarks,
              emptyMarkedAt: isEmpty ? new Date().toISOString() : null,
              lastUpdated: new Date().toISOString() 
            }
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

  // Rename a location
  const renameLocation = (locationId, newName) => {
    setLocations(prev => prev.map(loc =>
      loc.id === locationId
        ? { ...loc, name: newName, code: newName, lastUpdated: new Date().toISOString() }
        : loc
    ));
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
    // Remove from IndexedDB
    ScannedItemsByLocationDB.deleteLocation(locationId).catch(err => {
      console.warn('IndexedDB delete failed for location:', err);
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
    // Remove from IndexedDB
    ScannedItemsByLocationDB.deleteLocation(locationId).catch(err => {
      console.warn('IndexedDB delete failed for location from reports:', err);
    });
    
    // Then, remove the location from the locations list
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
      // EXACT match only - no partial matching to prevent false positives
      // e.g. location "123456789" should NOT match code "1" or "24"
      const codeMatch = l.code.toLowerCase() === code.toLowerCase() || 
                        l.name.toLowerCase() === code.toLowerCase();
      
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
    // Look up master location for human-readable name
    const masterLoc = masterLocations.find(
      ml => ml.code.toLowerCase() === scannedCode.toLowerCase()
    );
    const locationName = masterLoc ? masterLoc.name : scannedCode;
    
    return {
      id: `loc_temp_${Date.now()}`,
      name: locationName,
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
    if (!tempLocation) {
      console.warn('⚠️ saveTempLocation called with null/undefined location');
      return null;
    }
    
    // Check if location already exists (by code OR by ID)
    const existingByCode = findLocationByCode(tempLocation.code);
    const existingById = locations.find(l => l.id === tempLocation.id);
    
    if (existingByCode) {
      console.log(`✅ Location already exists by code: ${existingByCode.name} (${existingByCode.id})`);
      return existingByCode;
    }
    
    if (existingById) {
      console.log(`✅ Location already exists by ID: ${existingById.name} (${existingById.id})`);
      return existingById;
    }
    
    // Create permanent location from temp
    const permanentLocation = {
      ...tempLocation,
      isTemp: false
    };
    
    console.log(`📍 Creating permanent location: ${permanentLocation.name} (${permanentLocation.id})`);
    setLocations(prev => [...prev, permanentLocation]);
    
    // Also persist to localStorage immediately
    try {
      const currentLocations = JSON.parse(localStorage.getItem('audix_locations') || '[]');
      currentLocations.push(permanentLocation);
      localStorage.setItem('audix_locations', JSON.stringify(currentLocations));
      console.log(`💾 Immediately persisted location to localStorage`);
    } catch (e) {
      console.warn('Failed to persist location to localStorage:', e);
    }
    
    // DO NOT initialize scannedItems here - it will be populated by addScannedItem
    // Initializing to empty array here causes a race condition with addScannedItem
    return permanentLocation;
  };

  // Scan location - handles both pre-assigned and dynamic modes
  const scanLocation = (scannedCode) => {
    // ============================================
    // MASTER LOCATION VALIDATION
    // If allowNonMasterLocations is false (default), only accept master locations
    // ============================================
    if (!settings.allowNonMasterLocations && masterLocations.length > 0) {
      if (!isLocationInMaster(scannedCode)) {
        return { 
          success: false, 
          error: `Location "${scannedCode}" not in Master. Only master locations are allowed.`, 
          location: null,
          notInMaster: true
        };
      }
    }

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
    
    // Location not found in active locations
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

  // ============================================
  // MASTER LOCATIONS CRUD FUNCTIONS
  // ============================================
  
  // Add single master location
  const addMasterLocation = (locationData) => {
    const newLocation = {
      code: locationData.code,
      name: locationData.name || locationData.code,
      description: locationData.description || '',
      isMaster: true
    };
    setMasterLocations(prev => {
      // Prevent duplicates by code
      const existing = prev.find(l => l.code === newLocation.code);
      if (existing) return prev;
      return [...prev, newLocation];
    });
    return newLocation;
  };

  // DIRECT SET: Used by import to set all locations at once
  const setMasterLocationsDirect = (locations) => {
    console.log(`📥 Direct setting ${locations.length} master locations (already saved to IndexedDB)`);
    setMasterLocations(locations);
  };

  // Import master locations from CSV data
  const importMasterLocations = (locations, replaceExisting = true) => {
    const newLocations = locations.map(l => ({
      code: l.code,
      name: l.name || l.code,
      description: l.description || '',
      isMaster: true
    }));
    
    if (replaceExisting) {
      setMasterLocations(newLocations);
    } else {
      setMasterLocations(prev => [...prev, ...newLocations]);
    }
    return newLocations.length;
  };

  // Delete single master location by code
  const deleteMasterLocation = (code) => {
    setMasterLocations(prev => prev.filter(l => l.code !== code));
  };

  // Delete multiple master locations by code (used after sync)
  const deleteMasterLocationsBatch = (codes) => {
    const codeSet = new Set(codes.map(c => c.toLowerCase()));
    setMasterLocations(prev => prev.filter(l => !codeSet.has((l.code || '').toLowerCase())));
  };

  // Clear ALL master products
  const clearMasterProducts = async () => {
    setMasterProducts([]);
    localStorage.removeItem('audix_master_products');
    localStorage.removeItem('audix_master_data_lost');
    try { await MasterProductsDB.clear(); } catch (e) { /* ignore */ }
  };

  // Clear ALL master locations
  const clearMasterLocations = async () => {
    setMasterLocations([]);
    localStorage.removeItem('audix_master_locations');
    try { await MasterLocationsDB.clear(); } catch (e) { /* ignore */ }
  };

  // Clear ALL authorization users
  const clearAuthUsers = () => {
    localStorage.removeItem('audix_authorization_users');
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
  const getNextPendingLocation = useCallback(() => {
    const pendingLocations = locations.filter(loc => {
      // Filter by mode
      if (settings.locationScanMode === 'preassigned') {
        return loc.isAssigned === true && !loc.isSubmitted;
      } else {
        return (loc.autoCreated === true || loc.isAssigned === false) && !loc.isSubmitted;
      }
    });
    return pendingLocations.length > 0 ? pendingLocations[0] : null;
  }, [locations, settings.locationScanMode]);

  // ============================================
  // PREASSIGNED MODE: Get or create assigned location for a master location code
  // Returns existing assigned location or creates a new one
  // ============================================
  const getOrCreateAssignedLocation = useCallback((masterCode, masterName) => {
    const existing = locations.find(l =>
      l.isAssigned && l.code.toLowerCase() === masterCode.toLowerCase()
    );
    if (existing) return existing;

    const newLoc = {
      id: `loc_assigned_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: masterName || masterCode,
      code: masterCode,
      status: 'active',
      itemCount: 0,
      isCompleted: false,
      isSubmitted: false,
      isAssigned: true,
      lastUpdated: new Date().toISOString()
    };

    setLocations(prev => [...prev, newLoc]);
    setScannedItems(prev => ({ ...prev, [newLoc.id]: [] }));

    return newLoc;
  }, [locations]);

  // ============================================
  // PREASSIGNED MODE: Get next sequential master location after current
  // Follows masterLocations array order (import order)
  // Skips already-submitted locations
  // ============================================
  const getNextSequentialLocation = useCallback((currentCode) => {
    if (!masterLocations || masterLocations.length === 0) return null;

    const currentIndex = masterLocations.findIndex(
      ml => ml.code.toLowerCase() === currentCode.toLowerCase()
    );

    if (currentIndex === -1) return null;

    for (let i = currentIndex + 1; i < masterLocations.length; i++) {
      const ml = masterLocations[i];
      const assignedLoc = locations.find(
        l => l.isAssigned && l.code.toLowerCase() === ml.code.toLowerCase()
      );
      if (!assignedLoc || !assignedLoc.isSubmitted) {
        return ml;
      }
    }
    return null; // All remaining locations are submitted
  }, [masterLocations, locations]);

  // ============================================
  // PERFORMANCE: Memoize context value to prevent unnecessary re-renders
  // Only re-creates when dependencies actually change
  // ============================================
  const value = useMemo(() => ({
    user,
    isAuthenticated,
    locations,
    masterProducts,
    masterLocations,
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
    batchSaveScannedItems,
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
    renameLocation,
    importAssignedLocations,
    clearAssignedLocations,
    addMasterProduct,
    setMasterProductsDirect,
    importMasterProducts,
    addMasterLocation,
    setMasterLocationsDirect,
    importMasterLocations,
    deleteMasterLocation,
    deleteMasterLocationsBatch,
    getMasterLocationByCode,
    isLocationInMaster,
    clearMasterProducts,
    clearMasterLocations,
    clearAuthUsers,
    importAuthorizationUsers,
    getLoginUsers,
    getAuthorizationUsers,
    getAllUsers,
    getNextPendingLocation,
    getOrCreateAssignedLocation,
    getNextSequentialLocation,
    getProductByBarcode,
    getStorageInfo,
    isLoadingMasterData,
    isLoadingScannedData,
    playSound,
    hideBottomNav,
    setHideBottomNav,
    reportSelectedLocations,
    setReportSelectedLocations
  }), [
    user,
    isAuthenticated,
    locations,
    masterProducts,
    masterLocations,
    scannedItems,
    sessions,
    settings,
    currentSession,
    hideBottomNav,
    login,
    logout,
    verifyCredentials,
    verifyAuthorizationCredentials,
    updateUserCredentials,
    addScannedItem,
    batchSaveScannedItems,
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
    renameLocation,
    importAssignedLocations,
    clearAssignedLocations,
    addMasterProduct,
    setMasterProductsDirect,
    importMasterProducts,
    addMasterLocation,
    setMasterLocationsDirect,
    importMasterLocations,
    deleteMasterLocation,
    deleteMasterLocationsBatch,
    getMasterLocationByCode,
    isLocationInMaster,
    clearMasterProducts,
    clearMasterLocations,
    clearAuthUsers,
    importAuthorizationUsers,
    getLoginUsers,
    getAuthorizationUsers,
    getAllUsers,
    getNextPendingLocation,
    getOrCreateAssignedLocation,
    getNextSequentialLocation,
    getProductByBarcode,
    // getStorageInfo is stable (imported function) - not included in deps
    isLoadingMasterData,
    isLoadingScannedData,
    playSound,
    reportSelectedLocations
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
