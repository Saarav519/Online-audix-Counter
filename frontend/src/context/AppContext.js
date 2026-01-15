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
  const [settings, setSettings] = useState(mockSettings);
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

  // Login function
  const login = (userId, password) => {
    const foundUser = mockUsers.find(
      u => u.userId === userId && u.password === password
    );
    if (foundUser) {
      setUser(foundUser);
      setIsAuthenticated(true);
      return { success: true, user: foundUser };
    }
    return { success: false, error: 'Invalid credentials' };
  };

  // Logout function
  const logout = () => {
    setUser(null);
    setIsAuthenticated(false);
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

      if (existingIndex !== -1 && !settings.singleSkuScanning) {
        // Update existing item quantity
        const updated = [...locationItems];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
          scannedAt: new Date().toISOString()
        };
        return { ...prev, [locationId]: updated };
      } else {
        // Add new item
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
      lastUpdated: new Date().toISOString()
    };
    setLocations(prev => [...prev, newLocation]);
    setScannedItems(prev => ({ ...prev, [newLocation.id]: [] }));
    return newLocation;
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

  // Import master products from CSV data
  const importMasterProducts = (products) => {
    const newProducts = products.map((p, index) => ({
      id: `prod_import_${Date.now()}_${index}`,
      ...p,
      isMaster: true
    }));
    setMasterProducts(prev => [...prev, ...newProducts]);
    return newProducts.length;
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
    addScannedItem,
    deleteScannedItem,
    updateItemQuantity,
    submitLocation,
    reopenLocation,
    updateSettings,
    addLocation,
    addMasterProduct,
    importMasterProducts,
    playSound
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
