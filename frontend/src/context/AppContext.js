import React, { createContext, useContext, useState, useEffect } from 'react';
import { mockUsers, mockLocations, mockMasterProducts, mockScannedItems, mockSessions, mockSettings } from '../data/mockData';

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
  const [locations, setLocations] = useState(mockLocations);
  const [masterProducts, setMasterProducts] = useState(mockMasterProducts);
  const [scannedItems, setScannedItems] = useState(mockScannedItems);
  const [sessions, setSessions] = useState(mockSessions);
  const [settings, setSettings] = useState(() => {
    // Load settings from localStorage if available
    const savedSettings = localStorage.getItem('audix_settings');
    return savedSettings ? JSON.parse(savedSettings) : mockSettings;
  });
  const [currentSession, setCurrentSession] = useState(mockSessions[0]);

  // Play sound for scan feedback
  const playSound = (isValid) => {
    if (!settings.soundEnabled) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (isValid) {
      // Pleasant high-pitched beep for valid
      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
    } else {
      // Low buzzer for invalid
      oscillator.frequency.value = 220;
      oscillator.type = 'square';
      gainNode.gain.value = 0.2;
    }
    
    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, isValid ? 150 : 300);
  };

  // Login function - checks both mock and imported users
  const login = (userId, password) => {
    const allUsers = getAllUsers();
    const foundUser = allUsers.find(
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

  // Verify credentials without logging in
  const verifyCredentials = (userId, password) => {
    const allUsers = getAllUsers();
    const foundUser = allUsers.find(
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

  // Add scanned item to location
  const addScannedItem = (locationId, barcode, quantity = 1) => {
    const product = masterProducts.find(p => p.barcode === barcode);
    const isValidBarcode = product !== undefined;
    
    // Check if non-master products are allowed
    if (!isValidBarcode && !settings.allowNonMasterProducts) {
      playSound(false);
      return { success: false, error: 'Barcode not in master list', isValid: false };
    }

    playSound(true);

    setScannedItems(prev => {
      const locationItems = prev[locationId] || [];
      const existingIndex = locationItems.findIndex(item => item.barcode === barcode);

      if (settings.singleSkuScanning) {
        // Single SKU Mode: 
        // - Same barcode stays in ONE line
        // - Quantity auto-increments by 1 per scan
        // - NO manual quantity entry allowed
        if (existingIndex !== -1) {
          // Update existing item - increment by 1
          const updated = [...locationItems];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + 1,
            scannedAt: new Date().toISOString()
          };
          return { ...prev, [locationId]: updated };
        } else {
          // Add new item with quantity 1
          const newItem = {
            id: `scan_${Date.now()}`,
            barcode,
            productName: product ? product.name : `Unknown Product (${barcode})`,
            quantity: 1,
            scannedAt: new Date().toISOString(),
            isMaster: !!product
          };
          return { ...prev, [locationId]: [...locationItems, newItem] };
        }
      } else {
        // Non-Single SKU Mode (Manual Qty Entry):
        // - Can enter any quantity manually
        // - Same barcode can have quantity added to existing entry
        if (existingIndex !== -1) {
          // Update existing item quantity
          const updated = [...locationItems];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: updated[existingIndex].quantity + quantity,
            scannedAt: new Date().toISOString()
          };
          return { ...prev, [locationId]: updated };
        } else {
          // Add new item with specified quantity
          const newItem = {
            id: `scan_${Date.now()}`,
            barcode,
            productName: product ? product.name : `Unknown Product (${barcode})`,
            quantity,
            scannedAt: new Date().toISOString(),
            isMaster: !!product
          };
          return { ...prev, [locationId]: [...locationItems, newItem] };
        }
      }
    });

    return { success: true, isValid: isValidBarcode, product };
  };

  // Delete scanned item from specific location only
  const deleteScannedItem = (locationId, itemId) => {
    setScannedItems(prev => {
      const locationItems = prev[locationId] || [];
      const filtered = locationItems.filter(item => item.id !== itemId);
      return { ...prev, [locationId]: filtered };
    });
  };

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
    setSettings(prev => ({ ...prev, ...newSettings }));
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
    
    // Dynamic mode - create new location
    const newLocation = createLocationFromScan(scannedCode);
    return { success: true, location: newLocation, isNew: true };
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

  // Import users from CSV data
  const importUsers = (usersData) => {
    // This would typically update a users state, but for now we'll store in localStorage
    const importedUsers = usersData.map((u, index) => ({
      id: `user_import_${Date.now()}_${index}`,
      userId: u.userId || u.username,
      password: u.password,
      name: u.name || u.userId || u.username,
      role: u.role || 'scanner',
      createdAt: new Date().toISOString()
    }));
    
    // Store imported users (in real app, this would go to backend)
    localStorage.setItem('audix_imported_users', JSON.stringify(importedUsers));
    return importedUsers.length;
  };

  // Get all users (mock + imported)
  const getAllUsers = () => {
    const importedUsers = JSON.parse(localStorage.getItem('audix_imported_users') || '[]');
    return [...mockUsers, ...importedUsers];
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
    addScannedItem,
    deleteScannedItem,
    updateItemQuantity,
    submitLocation,
    reopenLocation,
    updateSettings,
    addLocation,
    deleteLocation,
    findLocationByCode,
    scanLocation,
    createLocationFromScan,
    importAssignedLocations,
    clearAssignedLocations,
    addMasterProduct,
    importMasterProducts,
    importUsers,
    getAllUsers,
    getNextPendingLocation,
    playSound
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
