// Mock Data for Audix Stock Management

export const mockUsers = [
  {
    id: "user_1",
    userId: "admin",
    password: "admin123",
    name: "Admin User",
    role: "admin",
    createdAt: "2025-07-01"
  },
  {
    id: "user_2",
    userId: "scanner1",
    password: "scan123",
    name: "Scanner User 1",
    role: "scanner",
    createdAt: "2025-07-01"
  }
];

export const mockLocations = [
  {
    id: "loc_1",
    name: "Warehouse A - Section 1",
    code: "WH-A1",
    status: "active",
    itemCount: 45,
    isCompleted: false,
    isSubmitted: false,
    lastUpdated: "2025-07-10T10:30:00"
  },
  {
    id: "loc_2",
    name: "Warehouse A - Section 2",
    code: "WH-A2",
    status: "active",
    itemCount: 32,
    isCompleted: true,
    isSubmitted: true,
    lastUpdated: "2025-07-09T14:20:00"
  },
  {
    id: "loc_3",
    name: "Warehouse B - Cold Storage",
    code: "WH-B-CS",
    status: "active",
    itemCount: 18,
    isCompleted: false,
    isSubmitted: false,
    lastUpdated: "2025-07-08T09:15:00"
  },
  {
    id: "loc_4",
    name: "Retail Store Front",
    code: "RT-SF",
    status: "active",
    itemCount: 67,
    isCompleted: true,
    isSubmitted: false,
    lastUpdated: "2025-07-10T11:45:00"
  }
];

export const mockMasterProducts = [
  {
    id: "prod_1",
    barcode: "8901234567890",
    name: "Organic Rice 5kg",
    sku: "ORG-RICE-5K",
    category: "Food & Groceries",
    price: 450,
    isMaster: true
  },
  {
    id: "prod_2",
    barcode: "8901234567891",
    name: "Whole Wheat Flour 1kg",
    sku: "WH-FLOUR-1K",
    category: "Food & Groceries",
    price: 65,
    isMaster: true
  },
  {
    id: "prod_3",
    barcode: "8901234567892",
    name: "Premium Olive Oil 500ml",
    sku: "OLV-OIL-500",
    category: "Cooking Oil",
    price: 850,
    isMaster: true
  },
  {
    id: "prod_4",
    barcode: "8901234567893",
    name: "Instant Noodles Pack",
    sku: "NOOD-INST-PK",
    category: "Food & Groceries",
    price: 15,
    isMaster: true
  },
  {
    id: "prod_5",
    barcode: "8901234567894",
    name: "Green Tea 100 Bags",
    sku: "TEA-GRN-100",
    category: "Beverages",
    price: 220,
    isMaster: true
  },
  {
    id: "prod_6",
    barcode: "8901234567895",
    name: "Hand Sanitizer 500ml",
    sku: "SAN-HND-500",
    category: "Health & Hygiene",
    price: 180,
    isMaster: true
  },
  {
    id: "prod_7",
    barcode: "8901234567896",
    name: "LED Bulb 9W",
    sku: "LED-BLB-9W",
    category: "Electronics",
    price: 120,
    isMaster: true
  },
  {
    id: "prod_8",
    barcode: "8901234567897",
    name: "Notebook A4 200 Pages",
    sku: "NB-A4-200",
    category: "Stationery",
    price: 85,
    isMaster: true
  }
];

export const mockScannedItems = {
  loc_1: [
    { id: "scan_1", barcode: "8901234567890", productName: "Organic Rice 5kg", quantity: 25, scannedAt: "2025-07-10T10:15:00" },
    { id: "scan_2", barcode: "8901234567891", productName: "Whole Wheat Flour 1kg", quantity: 15, scannedAt: "2025-07-10T10:20:00" },
    { id: "scan_3", barcode: "8901234567894", productName: "Green Tea 100 Bags", quantity: 5, scannedAt: "2025-07-10T10:25:00" }
  ],
  loc_2: [
    { id: "scan_4", barcode: "8901234567892", productName: "Premium Olive Oil 500ml", quantity: 12, scannedAt: "2025-07-09T14:00:00" },
    { id: "scan_5", barcode: "8901234567893", productName: "Instant Noodles Pack", quantity: 20, scannedAt: "2025-07-09T14:10:00" }
  ],
  loc_3: [
    { id: "scan_6", barcode: "8901234567895", productName: "Hand Sanitizer 500ml", quantity: 8, scannedAt: "2025-07-08T09:00:00" },
    { id: "scan_7", barcode: "8901234567896", productName: "LED Bulb 9W", quantity: 10, scannedAt: "2025-07-08T09:10:00" }
  ],
  loc_4: [
    { id: "scan_8", barcode: "8901234567897", productName: "Notebook A4 200 Pages", quantity: 30, scannedAt: "2025-07-10T11:30:00" },
    { id: "scan_9", barcode: "8901234567890", productName: "Organic Rice 5kg", quantity: 37, scannedAt: "2025-07-10T11:40:00" }
  ]
};

export const mockSessions = [
  {
    id: "session_1",
    name: "July 2025 Monthly Count",
    startDate: "2025-07-01",
    endDate: "2025-07-31",
    status: "active",
    locations: ["loc_1", "loc_2", "loc_3", "loc_4"],
    completedLocations: 2,
    totalItems: 162
  },
  {
    id: "session_2",
    name: "June 2025 Quarterly Audit",
    startDate: "2025-06-01",
    endDate: "2025-06-30",
    status: "completed",
    locations: ["loc_1", "loc_2"],
    completedLocations: 2,
    totalItems: 245
  }
];

export const mockSettings = {
  allowNonMasterProducts: false,
  singleSkuScanning: false,
  soundEnabled: true,
  autoSubmitOnComplete: false,
  requireAuthForEdit: true,
  locationScanMode: 'dynamic' // 'preassigned' or 'dynamic'
};
