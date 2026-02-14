import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook to detect device type and scanner capabilities
 * Compatible with Android 7 (Nougat) and above
 */
export const useDeviceDetection = () => {
  const [deviceInfo, setDeviceInfo] = useState({
    isMobile: false,
    isAndroid: false,
    isScanner: false,
    androidVersion: null,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    isSmallScreen: false,
    isTouchDevice: false,
  });

  const detectDevice = useCallback(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    
    // Detect Android
    const isAndroid = /android/i.test(userAgent);
    
    // Extract Android version
    let androidVersion = null;
    if (isAndroid) {
      const match = userAgent.match(/android\s+([\d.]+)/i);
      if (match) {
        androidVersion = parseFloat(match[1]);
      }
    }
    
    // Detect mobile/tablet
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    // Detect touch capability
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // Detect small screen (typical for handheld scanners)
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const isSmallScreen = screenWidth <= 800 || screenHeight <= 600;
    
    // Detect enterprise scanner devices
    // Common enterprise scanner user agents contain these identifiers
    // Added RS31, RK25 and CipherLab/Newland specific identifiers for compatibility
    const scannerKeywords = [
      // CipherLab models
      'zebra', 'symbol', 'honeywell', 'datalogic', 'cipherlab',
      'bluebird', 'unitech', 'chainway', 'urovo', 'newland',
      'scanner', 'pda', 'handheld', 'mobile computer',
      // CipherLab RS series
      'rs31', 'rs30', 'rs50', 'rs51', 
      // CipherLab RK series (including RK25)
      'rk25', 'rk95', 'rk26', 'rk', 
      // CipherLab CP series
      'cp30', 'cp50', 'cp55', 'cp60', 'cp',
      // CipherLab numeric models
      '9700', '8000', '8200', '8600', '9200',
      // Newland models
      'nls-', 'mt90', 'mt65', 'n7', 'n5', 'n2', 'pt60', 'pt66',
      'nquire', 'speedata'
    ];
    
    const isScanner = scannerKeywords.some(keyword => 
      userAgent.includes(keyword)
    ) || (isAndroid && isSmallScreen);
    
    setDeviceInfo({
      isMobile,
      isAndroid,
      isScanner: isScanner || (isAndroid && isSmallScreen),
      androidVersion,
      screenWidth,
      screenHeight,
      isSmallScreen,
      isTouchDevice,
    });
  }, []);

  // Handle screen resize
  useEffect(() => {
    detectDevice();
    
    const handleResize = () => {
      setDeviceInfo(prev => ({
        ...prev,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        isSmallScreen: window.innerWidth <= 800 || window.innerHeight <= 600,
      }));
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [detectDevice]);

  return deviceInfo;
};

/**
 * HIGH-PERFORMANCE Hardware Scanner Hook
 * Optimized for rapid continuous scanning without lag
 * 
 * Features:
 * - Scan queue to handle rapid consecutive scans
 * - No React state updates during scanning (uses refs)
 * - Debounced processing to prevent overwrites
 * - Compatible with most enterprise Android scanners
 * - Option to block scanner input from reaching input fields
 */
export const useHardwareScanner = (onScan, isEnabled = true, blockInputField = false) => {
  const [scanBuffer, setScanBuffer] = useState('');
  
  // Use refs to avoid re-renders during fast scanning
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timeoutRef = useRef(null);
  const scanQueueRef = useRef([]);
  const processingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const blockInputFieldRef = useRef(blockInputField);
  
  // Keep refs updated
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);
  
  useEffect(() => {
    blockInputFieldRef.current = blockInputField;
  }, [blockInputField]);

  // Process scan queue - handles rapid consecutive scans
  const processQueue = useCallback(() => {
    if (processingRef.current || scanQueueRef.current.length === 0) return;
    
    processingRef.current = true;
    
    // Process all queued scans
    while (scanQueueRef.current.length > 0) {
      const barcode = scanQueueRef.current.shift();
      if (barcode && onScanRef.current) {
        onScanRef.current(barcode);
      }
    }
    
    processingRef.current = false;
  }, []);

  // Add scan to queue and process
  const queueScan = useCallback((barcode) => {
    if (!barcode || barcode.trim().length === 0) return;
    
    scanQueueRef.current.push(barcode.trim());
    
    // Process immediately using microtask to avoid blocking
    queueMicrotask(processQueue);
  }, [processQueue]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      
      // Reset buffer if too much time has passed (> 100ms between keys)
      // Hardware scanners typically send input < 50ms between keys
      if (timeDiff > 100) {
        bufferRef.current = '';
      }
      
      lastKeyTimeRef.current = currentTime;
      
      // Handle Enter key (most scanners send Enter after barcode)
      if (e.key === 'Enter') {
        // IMPORTANT: Only intercept if we have buffered scanner input
        // This allows normal form submissions to work
        if (bufferRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          queueScan(bufferRef.current);
          bufferRef.current = '';
          setScanBuffer('');
        }
        // If no buffer, let the Enter key pass through to input fields
        return;
      }
      
      // Handle Tab key (some scanners use Tab as suffix)
      if (e.key === 'Tab') {
        // Only intercept if we have buffered scanner input
        if (bufferRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          queueScan(bufferRef.current);
          bufferRef.current = '';
          setScanBuffer('');
        }
        return;
      }
      
      // Only capture printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        bufferRef.current += e.key;
        
        // Update display buffer (debounced to avoid excessive re-renders)
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setScanBuffer(bufferRef.current);
        }, 50);
      }
    };

    // Handle hardware scan button events (for Zebra, Honeywell, etc.)
    const handleScanButton = (e) => {
      if (e.type === 'scanbutton' || e.type === 'hardwarescan') {
        const barcode = e.detail?.barcode || e.data;
        if (barcode) {
          queueScan(barcode);
        }
      }
    };

    // Handle Zebra DataWedge messages
    const handleMessage = (e) => {
      if (e.data && typeof e.data === 'object' && e.data.barcode) {
        queueScan(e.data.barcode);
      }
    };

    // Use capture phase for faster response
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('scanbutton', handleScanButton);
    document.addEventListener('hardwarescan', handleScanButton);
    window.addEventListener('message', handleMessage);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('scanbutton', handleScanButton);
      document.removeEventListener('hardwarescan', handleScanButton);
      window.removeEventListener('message', handleMessage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isEnabled, queueScan]);

  return { scanBuffer };
};

/**
 * Ultra-fast barcode input hook for direct input field scanning
 * Use this when you want the barcode to go directly into an input field
 * and be processed on Enter
 */
export const useFastBarcodeInput = (inputRef, onBarcodeScanned, isEnabled = true) => {
  const lastInputTimeRef = useRef(0);
  const scanModeRef = useRef(false);
  
  useEffect(() => {
    if (!isEnabled || !inputRef.current) return;
    
    const input = inputRef.current;
    
    const handleInput = (e) => {
      const currentTime = Date.now();
      const timeDiff = currentTime - lastInputTimeRef.current;
      
      // If input is coming very fast (< 50ms), it's likely from a scanner
      if (timeDiff < 50) {
        scanModeRef.current = true;
      } else if (timeDiff > 200) {
        scanModeRef.current = false;
      }
      
      lastInputTimeRef.current = currentTime;
    };
    
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.trim();
        if (value && onBarcodeScanned) {
          onBarcodeScanned(value);
          input.value = '';
        }
      }
    };
    
    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeyDown);
    
    return () => {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeyDown);
    };
  }, [inputRef, onBarcodeScanned, isEnabled]);
};

export default useDeviceDetection;
