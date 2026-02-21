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
 */
export const useHardwareScanner = (onScan, isEnabled = true, allowKeyInput = true) => {
  const [scanBuffer, setScanBuffer] = useState('');
  
  // Use refs to avoid re-renders during fast scanning
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const timeoutRef = useRef(null);
  const scanQueueRef = useRef([]);
  const processingRef = useRef(false);
  const onScanRef = useRef(onScan);
  const cooldownRef = useRef(false); // Cooldown after processing a scan
  const cooldownTimerRef = useRef(null);
  const autoSubmitTimerRef = useRef(null); // Auto-submit buffer after idle period
  const lastSubmitTimeRef = useRef(0); // Track when last scan was submitted
  
  // Max barcode length - anything longer is likely overlapping scans
  const MAX_BARCODE_LENGTH = 25;
  
  // Keep onScan ref updated
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Process scan queue - handles rapid consecutive scans ONE AT A TIME
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

  // Flush and submit the current buffer content
  const flushBuffer = useCallback(() => {
    if (bufferRef.current.length > 0) {
      const buffered = bufferRef.current;
      bufferRef.current = '';
      setScanBuffer('');
      // Activate cooldown so next key resets fresh
      cooldownRef.current = true;
      lastSubmitTimeRef.current = Date.now();
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = setTimeout(() => { cooldownRef.current = false; }, 100);
      return buffered;
    }
    return null;
  }, []);

  // Add scan to queue and process
  const queueScan = useCallback((barcode) => {
    if (!barcode || barcode.trim().length === 0) return;
    
    const cleaned = barcode.trim();
    
    // ANTI-OVERLAP: If barcode is suspiciously long, it may be
    // two barcodes concatenated. Try to split intelligently.
    // Standard barcodes: EAN-13 (13), UPC-A (12), EAN-8 (8), Code128 (variable up to ~20)
    if (cleaned.length > MAX_BARCODE_LENGTH) {
      // Strategy 1: All-numeric - try splitting at common barcode lengths
      if (/^\d+$/.test(cleaned)) {
        for (const splitLen of [13, 12, 8]) {
          if (cleaned.length >= splitLen + 8) {
            // Try to split: first barcode at splitLen, rest is second
            const first = cleaned.substring(0, splitLen);
            const second = cleaned.substring(splitLen);
            if (second.length >= 8 && second.length <= 20) {
              console.log(`[Scanner] Anti-overlap split: "${first}" + "${second}"`);
              scanQueueRef.current.push(first);
              scanQueueRef.current.push(second);
              queueMicrotask(processQueue);
              return;
            }
            // Second part is also too long? Try splitting it recursively
            if (second.length > 20) {
              console.log(`[Scanner] Anti-overlap split first: "${first}", recursing rest`);
              scanQueueRef.current.push(first);
              // Re-queue the remainder for another split attempt
              queueMicrotask(() => queueScan(second));
              queueMicrotask(processQueue);
              return;
            }
          }
        }
      }
      
      // Strategy 2: Check if it's the same barcode repeated (duplicate scan)
      const halfLen = Math.floor(cleaned.length / 2);
      if (cleaned.length % 2 === 0 || cleaned.length % 2 === 1) {
        for (const tryLen of [halfLen, halfLen + 1, halfLen - 1]) {
          if (tryLen >= 8 && tryLen <= 20) {
            const first = cleaned.substring(0, tryLen);
            const second = cleaned.substring(tryLen);
            if (first === second) {
              // Exact duplicate - just queue once (or twice, scanner user expects both)
              console.log(`[Scanner] Duplicate barcode detected: "${first}"`);
              scanQueueRef.current.push(first);
              scanQueueRef.current.push(second);
              queueMicrotask(processQueue);
              return;
            }
          }
        }
      }
      
      // Strategy 3: Alphanumeric - try splitting at half or common lengths
      for (const splitLen of [13, 12, 10, 8]) {
        if (cleaned.length >= splitLen + 8) {
          const first = cleaned.substring(0, splitLen);
          const second = cleaned.substring(splitLen);
          if (second.length >= 8 && second.length <= 20) {
            console.log(`[Scanner] Anti-overlap alpha split: "${first}" + "${second}"`);
            scanQueueRef.current.push(first);
            scanQueueRef.current.push(second);
            queueMicrotask(processQueue);
            return;
          }
        }
      }
      
      // Fallback: just submit as-is (might be a long Code128 barcode)
      console.warn(`[Scanner] Long barcode (${cleaned.length} chars), submitting as-is: "${cleaned}"`);
    }
    
    scanQueueRef.current.push(cleaned);
    queueMicrotask(processQueue);
  }, [processQueue]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e) => {
      // CRITICAL: Do NOT intercept keyboard events for quantity input fields
      const target = e.target;
      const isQtyInput = target && (
        target.hasAttribute('data-qty-input') ||
        target.closest('[data-qty-edit]') ||
        target.closest('[role="dialog"]')
      );
      
      if (isQtyInput) {
        bufferRef.current = '';
        return;
      }
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      const timeSinceLastSubmit = currentTime - lastSubmitTimeRef.current;
      
      // Reset buffer if:
      // 1. Too much time has passed between keys (> 80ms) - new scan starting
      // 2. In cooldown (just processed a scan) - force fresh start
      // 3. Very short time since last submit (< 100ms) - scanner firing next barcode
      if (timeDiff > 80 || cooldownRef.current || (timeSinceLastSubmit < 100 && timeDiff > 30)) {
        bufferRef.current = '';
        cooldownRef.current = false;
      }
      
      lastKeyTimeRef.current = currentTime;

      // Cancel any pending auto-submit since we're still receiving keys
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
        autoSubmitTimerRef.current = null;
      }

      // BLOCKING MODE: If manual input is disabled, prevent default for ALL printable keys
      if (!allowKeyInput) {
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
        }
      }
      
      // Handle Enter key (most scanners send Enter after barcode)
      if (e.key === 'Enter') {
        if (bufferRef.current.length > 0) {
          if (allowKeyInput) {
            e.preventDefault();
            e.stopPropagation();
          }
          
          const scanned = bufferRef.current;
          bufferRef.current = '';
          setScanBuffer('');
          
          // ACTIVATE COOLDOWN - critical for preventing overlap
          cooldownRef.current = true;
          lastSubmitTimeRef.current = currentTime;
          if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
          cooldownTimerRef.current = setTimeout(() => { cooldownRef.current = false; }, 100);
          
          queueScan(scanned);
        }
        return;
      }
      
      // Handle Tab key (some scanners use Tab as suffix)
      if (e.key === 'Tab') {
        if (bufferRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          
          const scanned = bufferRef.current;
          bufferRef.current = '';
          setScanBuffer('');
          
          // ACTIVATE COOLDOWN
          cooldownRef.current = true;
          lastSubmitTimeRef.current = currentTime;
          if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
          cooldownTimerRef.current = setTimeout(() => { cooldownRef.current = false; }, 100);
          
          queueScan(scanned);
        }
        return;
      }
      
      // Only capture printable characters for scanner buffer
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        bufferRef.current += e.key;
        
        // SAFETY: If buffer exceeds max barcode length, force-submit immediately
        // This prevents infinite accumulation from overlapping scans
        if (bufferRef.current.length >= MAX_BARCODE_LENGTH) {
          const scanned = bufferRef.current;
          bufferRef.current = '';
          setScanBuffer('');
          
          // ACTIVATE COOLDOWN
          cooldownRef.current = true;
          lastSubmitTimeRef.current = currentTime;
          if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
          cooldownTimerRef.current = setTimeout(() => { cooldownRef.current = false; }, 100);
          
          queueScan(scanned);
          return;
        }
        
        // AUTO-SUBMIT TIMER: If no more chars arrive within 200ms, submit buffer
        // This handles scanners that don't send Enter/Tab suffix
        autoSubmitTimerRef.current = setTimeout(() => {
          if (bufferRef.current.length > 0) {
            const scanned = bufferRef.current;
            bufferRef.current = '';
            setScanBuffer('');
            
            cooldownRef.current = true;
            lastSubmitTimeRef.current = Date.now();
            if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
            cooldownTimerRef.current = setTimeout(() => { cooldownRef.current = false; }, 100);
            
            queueScan(scanned);
          }
        }, 200);
        
        // Update display buffer (debounced)
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
      if (autoSubmitTimerRef.current) clearTimeout(autoSubmitTimerRef.current);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, [isEnabled, queueScan, allowKeyInput, flushBuffer]);

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
