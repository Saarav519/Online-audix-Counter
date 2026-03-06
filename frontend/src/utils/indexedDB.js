/**
 * IndexedDB Storage Utility for Large Data
 * Supports 100MB+ storage (unlike localStorage's 5-10MB limit)
 * Used for Master Products and Scanned Items
 */

const DB_NAME = 'AudixStockDB';
const DB_VERSION = 3;

// Store names
const STORES = {
  MASTER_PRODUCTS: 'masterProducts',
  MASTER_LOCATIONS: 'masterLocations',
  SCANNED_ITEMS: 'scannedItems',
  SCANNED_ITEMS_BY_LOC: 'scannedItemsByLocation',
  LOCATIONS: 'locations',
  SETTINGS: 'settings',
  AUTH_USERS: 'authUsers'
};

let dbInstance = null;

/**
 * Initialize IndexedDB
 */
const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Master Products store - indexed by barcode for fast lookup
      if (!db.objectStoreNames.contains(STORES.MASTER_PRODUCTS)) {
        const productStore = db.createObjectStore(STORES.MASTER_PRODUCTS, { keyPath: 'barcode' });
        productStore.createIndex('sku', 'sku', { unique: false });
        productStore.createIndex('category', 'category', { unique: false });
      }

      // Master Locations store - indexed by code for fast lookup
      if (!db.objectStoreNames.contains(STORES.MASTER_LOCATIONS)) {
        const masterLocStore = db.createObjectStore(STORES.MASTER_LOCATIONS, { keyPath: 'code' });
        masterLocStore.createIndex('name', 'name', { unique: false });
      }

      // Scanned Items store - indexed by locationId
      if (!db.objectStoreNames.contains(STORES.SCANNED_ITEMS)) {
        const scannedStore = db.createObjectStore(STORES.SCANNED_ITEMS, { keyPath: 'id', autoIncrement: true });
        scannedStore.createIndex('locationId', 'locationId', { unique: false });
        scannedStore.createIndex('barcode', 'barcode', { unique: false });
      }

      // Locations store
      if (!db.objectStoreNames.contains(STORES.LOCATIONS)) {
        const locationStore = db.createObjectStore(STORES.LOCATIONS, { keyPath: 'id' });
        locationStore.createIndex('code', 'code', { unique: false });
      }

      // Settings store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // Authorization Users store
      if (!db.objectStoreNames.contains(STORES.AUTH_USERS)) {
        db.createObjectStore(STORES.AUTH_USERS, { keyPath: 'id' });
      }

      // Scanned Items By Location store (V3) - stores items grouped by locationId
      // Format: { locationId: "loc_123", items: [...], updatedAt: "..." }
      // This replaces localStorage for scanned items (supports 100MB+ vs 5MB limit)
      if (!db.objectStoreNames.contains(STORES.SCANNED_ITEMS_BY_LOC)) {
        db.createObjectStore(STORES.SCANNED_ITEMS_BY_LOC, { keyPath: 'locationId' });
      }
    };
  });
};

/**
 * Get all items from a store
 */
const getAll = async (storeName) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get single item by key
 */
const getByKey = async (storeName, key) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Put single item (add or update)
 */
const put = async (storeName, item) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(item);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Put multiple items efficiently (bulk insert) - ULTRA OPTIMIZED for large datasets
 * Uses single transaction per batch to minimize overhead
 */
const putMany = async (storeName, items, onProgress = null) => {
  const db = await initDB();
  const BATCH_SIZE = 5000; // Large batches = fewer transactions = much faster
  let totalCompleted = 0;
  
  if (items.length === 0) {
    return 0;
  }

  // Process in batches
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      
      // Use cursor-less batch put for speed
      for (const item of batch) {
        store.put(item);
      }
      
      transaction.oncomplete = () => {
        totalCompleted += batch.length;
        if (onProgress) {
          onProgress(totalCompleted, items.length);
        }
        resolve();
      };
      
      transaction.onerror = () => reject(transaction.error);
    });
  }
  
  return totalCompleted;
};

/**
 * Delete single item by key
 */
const deleteByKey = async (storeName, key) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clear all items in a store
 */
const clearStore = async (storeName) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Get items by index value
 */
const getByIndex = async (storeName, indexName, value) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

// ============================================
// HIGH-LEVEL API FOR APP DATA
// ============================================

/**
 * Master Products API
 */
export const MasterProductsDB = {
  getAll: () => getAll(STORES.MASTER_PRODUCTS),
  
  getByBarcode: (barcode) => getByKey(STORES.MASTER_PRODUCTS, barcode),
  
  save: (product) => put(STORES.MASTER_PRODUCTS, product),
  
  // Bulk import - replaces all existing data (OPTIMIZED for large datasets)
  importAll: async (products, onProgress = null) => {
    await clearStore(STORES.MASTER_PRODUCTS);
    // Yield to UI after clearing
    await new Promise(resolve => setTimeout(resolve, 0));
    return putMany(STORES.MASTER_PRODUCTS, products, onProgress);
  },
  
  // ULTRA-FAST: Direct CSV to IndexedDB import (bypasses React state)
  // Returns the products array after saving to DB
  importFromCSV: async (csvText, onProgress = null) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    const dataLines = lines.slice(1); // Skip header
    const totalLines = dataLines.length;
    
    if (totalLines === 0) {
      return { success: false, error: 'No data found', products: [] };
    }

    // Parse all lines first (fast, in-memory)
    const products = [];
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const parts = line.split(',').map(s => s.trim().replace(/"/g, ''));
      const [barcode, name, price] = parts;
      
      if (barcode && name) {
        products.push({
          barcode,
          name,
          price: parseFloat(price) || 0,
          isMaster: true
        });
      }
    }

    if (products.length === 0) {
      return { success: false, error: 'No valid products found', products: [] };
    }

    // Clear and import to IndexedDB
    await clearStore(STORES.MASTER_PRODUCTS);
    
    // Save to IndexedDB with progress
    await putMany(STORES.MASTER_PRODUCTS, products, onProgress);
    
    return { success: true, count: products.length, products };
  },
  
  // Bulk add without clearing
  addMany: (products, onProgress = null) => putMany(STORES.MASTER_PRODUCTS, products, onProgress),
  
  delete: (barcode) => deleteByKey(STORES.MASTER_PRODUCTS, barcode),
  
  clear: () => clearStore(STORES.MASTER_PRODUCTS),
  
  count: async () => {
    const all = await getAll(STORES.MASTER_PRODUCTS);
    return all.length;
  }
};

/**
 * Master Locations API
 */
export const MasterLocationsDB = {
  getAll: () => getAll(STORES.MASTER_LOCATIONS),
  
  getByCode: (code) => getByKey(STORES.MASTER_LOCATIONS, code),
  
  save: (location) => put(STORES.MASTER_LOCATIONS, location),
  
  // Bulk import - replaces all existing data
  importAll: async (locations, onProgress = null) => {
    await clearStore(STORES.MASTER_LOCATIONS);
    await new Promise(resolve => setTimeout(resolve, 0));
    return putMany(STORES.MASTER_LOCATIONS, locations, onProgress);
  },
  
  // Direct CSV to IndexedDB import
  importFromCSV: async (csvText, onProgress = null) => {
    const lines = csvText.split('\n').filter(line => line.trim());
    const dataLines = lines.slice(1); // Skip header
    const totalLines = dataLines.length;
    
    if (totalLines === 0) {
      return { success: false, error: 'No data found', locations: [] };
    }

    const locations = [];
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      const parts = line.split(',').map(s => s.trim().replace(/"/g, ''));
      const [code, name, description] = parts;
      
      if (code) {
        locations.push({
          code,
          name: name || code,
          description: description || '',
          isMaster: true
        });
      }
    }

    if (locations.length === 0) {
      return { success: false, error: 'No valid locations found', locations: [] };
    }

    await clearStore(STORES.MASTER_LOCATIONS);
    await putMany(STORES.MASTER_LOCATIONS, locations, onProgress);
    
    return { success: true, count: locations.length, locations };
  },
  
  addMany: (locations, onProgress = null) => putMany(STORES.MASTER_LOCATIONS, locations, onProgress),
  
  delete: (code) => deleteByKey(STORES.MASTER_LOCATIONS, code),
  
  clear: () => clearStore(STORES.MASTER_LOCATIONS),
  
  count: async () => {
    const all = await getAll(STORES.MASTER_LOCATIONS);
    return all.length;
  }
};

/**
 * Scanned Items API
 */
export const ScannedItemsDB = {
  getAll: () => getAll(STORES.SCANNED_ITEMS),
  
  getByLocation: (locationId) => getByIndex(STORES.SCANNED_ITEMS, 'locationId', locationId),
  
  save: (item) => put(STORES.SCANNED_ITEMS, item),
  
  saveMany: (items) => putMany(STORES.SCANNED_ITEMS, items),
  
  delete: (id) => deleteByKey(STORES.SCANNED_ITEMS, id),
  
  // Delete all items for a location
  deleteByLocation: async (locationId) => {
    const items = await getByIndex(STORES.SCANNED_ITEMS, 'locationId', locationId);
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SCANNED_ITEMS, 'readwrite');
      const store = transaction.objectStore(STORES.SCANNED_ITEMS);
      
      items.forEach(item => store.delete(item.id));
      
      transaction.oncomplete = () => resolve(items.length);
      transaction.onerror = () => reject(transaction.error);
    });
  },
  
  clear: () => clearStore(STORES.SCANNED_ITEMS)
};

/**
 * Locations API
 */
export const LocationsDB = {
  getAll: () => getAll(STORES.LOCATIONS),
  
  getById: (id) => getByKey(STORES.LOCATIONS, id),
  
  getByCode: (code) => getByIndex(STORES.LOCATIONS, 'code', code),
  
  save: (location) => put(STORES.LOCATIONS, location),
  
  saveMany: (locations) => putMany(STORES.LOCATIONS, locations),
  
  delete: (id) => deleteByKey(STORES.LOCATIONS, id),
  
  clear: () => clearStore(STORES.LOCATIONS)
};

/**
 * Settings API (key-value store)
 */
export const SettingsDB = {
  get: async (key) => {
    const result = await getByKey(STORES.SETTINGS, key);
    return result ? result.value : null;
  },
  
  set: (key, value) => put(STORES.SETTINGS, { key, value }),
  
  delete: (key) => deleteByKey(STORES.SETTINGS, key),
  
  clear: () => clearStore(STORES.SETTINGS)
};

/**
 * Authorization Users API
 */
export const AuthUsersDB = {
  getAll: () => getAll(STORES.AUTH_USERS),
  
  save: (user) => put(STORES.AUTH_USERS, user),
  
  saveMany: (users) => putMany(STORES.AUTH_USERS, users),
  
  delete: (id) => deleteByKey(STORES.AUTH_USERS, id),
  
  clear: () => clearStore(STORES.AUTH_USERS)
};

/**
 * Scanned Items By Location API (V3 - replaces localStorage)
 * Stores: { locationId: "loc_123", items: [...], updatedAt: "2026-..." }
 * Supports 100MB+ (vs localStorage's 5MB limit)
 */
export const ScannedItemsByLocationDB = {
  // Get all location data as { [locationId]: items[] } object
  getAll: async () => {
    const records = await getAll(STORES.SCANNED_ITEMS_BY_LOC);
    const result = {};
    records.forEach(rec => {
      result[rec.locationId] = rec.items || [];
    });
    return result;
  },
  
  // Save items for a single location (replaces existing)
  saveLocation: async (locationId, items) => {
    return put(STORES.SCANNED_ITEMS_BY_LOC, {
      locationId,
      items: items || [],
      updatedAt: new Date().toISOString()
    });
  },
  
  // Save entire scannedItems object { [locationId]: items[] }
  saveAll: async (scannedItemsObj) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SCANNED_ITEMS_BY_LOC, 'readwrite');
      const store = transaction.objectStore(STORES.SCANNED_ITEMS_BY_LOC);
      const now = new Date().toISOString();
      
      Object.entries(scannedItemsObj).forEach(([locationId, items]) => {
        store.put({ locationId, items: items || [], updatedAt: now });
      });
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },
  
  // Delete items for a location
  deleteLocation: (locationId) => deleteByKey(STORES.SCANNED_ITEMS_BY_LOC, locationId),
  
  // Delete multiple locations
  deleteLocations: async (locationIds) => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.SCANNED_ITEMS_BY_LOC, 'readwrite');
      const store = transaction.objectStore(STORES.SCANNED_ITEMS_BY_LOC);
      locationIds.forEach(id => store.delete(id));
      transaction.oncomplete = () => resolve(locationIds.length);
      transaction.onerror = () => reject(transaction.error);
    });
  },
  
  clear: () => clearStore(STORES.SCANNED_ITEMS_BY_LOC)
};

/**
 * Check available storage quota
 */
export const getStorageInfo = async () => {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      available: estimate.quota || 0,
      usedMB: ((estimate.usage || 0) / (1024 * 1024)).toFixed(2),
      availableMB: ((estimate.quota || 0) / (1024 * 1024)).toFixed(2)
    };
  }
  return { used: 0, available: 0, usedMB: '0', availableMB: 'Unknown' };
};

/**
 * Initialize database on module load
 */
initDB().catch(err => console.warn('IndexedDB init failed:', err));

export default {
  MasterProductsDB,
  MasterLocationsDB,
  ScannedItemsDB,
  ScannedItemsByLocationDB,
  LocationsDB,
  SettingsDB,
  AuthUsersDB,
  getStorageInfo,
  STORES
};
