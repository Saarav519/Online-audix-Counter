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
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef(null);
  const lastSubmitTimeRef = useRef(0);
  
  // SCANNER MODE: When true, ALL printable chars are intercepted (not sent to input field)
  // This is the KEY fix for barcode overlap - scanner chars never reach the input field
  const scannerModeRef = useRef(false);
  const scannerModeTimerRef = useRef(null);
  
  const MAX_BARCODE_LENGTH = 25;
  
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const processQueue = useCallback(() => {
    if (processingRef.current || scanQueueRef.current.length === 0) return;
    processingRef.current = true;
    while (scanQueueRef.current.length > 0) {
      const barcode = scanQueueRef.current.shift();
      if (barcode && onScanRef.current) {
        onScanRef.current(barcode);
      }
    }
    processingRef.current = false;
  }, []);

  const queueScan = useCallback((barcode) => {
    if (!barcode || barcode.trim().length === 0) return;
    const cleaned = barcode.trim();
    
    // ANTI-OVERLAP: Split suspiciously long barcodes
    if (cleaned.length > MAX_BARCODE_LENGTH) {
      if (/^\d+$/.test(cleaned)) {
        for (const splitLen of [13, 12, 8]) {
          if (cleaned.length >= splitLen + 8) {
            const first = cleaned.substring(0, splitLen);
            const second = cleaned.substring(splitLen);
            if (second.length >= 8 && second.length <= 20) {
              scanQueueRef.current.push(first);
              scanQueueRef.current.push(second);
              queueMicrotask(processQueue);
              return;
            }
            if (second.length > 20) {
              scanQueueRef.current.push(first);
              queueMicrotask(() => queueScan(second));
              queueMicrotask(processQueue);
              return;
            }
          }
        }
      }
      // Check for duplicate barcode
      const halfLen = Math.floor(cleaned.length / 2);
      for (const tryLen of [halfLen, halfLen + 1, halfLen - 1]) {
        if (tryLen >= 8 && tryLen <= 20) {
          const first = cleaned.substring(0, tryLen);
          const second = cleaned.substring(tryLen);
          if (first === second) {
            scanQueueRef.current.push(first);
            scanQueueRef.current.push(second);
            queueMicrotask(processQueue);
            return;
          }
        }
      }
      // Alphanumeric split
      for (const splitLen of [13, 12, 10, 8]) {
        if (cleaned.length >= splitLen + 8) {
          const first = cleaned.substring(0, splitLen);
          const second = cleaned.substring(splitLen);
          if (second.length >= 8 && second.length <= 20) {
            scanQueueRef.current.push(first);
            scanQueueRef.current.push(second);
            queueMicrotask(processQueue);
            return;
          }
        }
      }
    }
    
    scanQueueRef.current.push(cleaned);
    queueMicrotask(processQueue);
  }, [processQueue]);

  // Submit the buffer contents as a scan result
  const submitBuffer = useCallback((currentTime) => {
    if (bufferRef.current.length === 0) return;
    
    const scanned = bufferRef.current;
    bufferRef.current = '';
    setScanBuffer('');
    
    // Activate cooldown + keep scanner mode active
    cooldownRef.current = true;
    scannerModeRef.current = true;
    lastSubmitTimeRef.current = currentTime || Date.now();
    
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => { cooldownRef.current = false; }, 120);
    
    // Keep scanner mode active a bit longer than cooldown to catch next barcode's first chars
    if (scannerModeTimerRef.current) clearTimeout(scannerModeTimerRef.current);
    scannerModeTimerRef.current = setTimeout(() => { scannerModeRef.current = false; }, 300);
    
    // Also clear any focused input field's value to prevent stale chars
    try {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        if (!activeEl.hasAttribute('data-qty-input') && !activeEl.closest('[role="dialog"]')) {
          activeEl.value = '';
          // Dispatch input event to sync React state
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    } catch (e) { /* ignore */ }
    
    queueScan(scanned);
  }, [queueScan]);

  useEffect(() => {
    if (!isEnabled) return;

    const handleKeyDown = (e) => {
      // Skip qty inputs and dialogs
      const target = e.target;
      const isQtyInput = target && (
        target.hasAttribute('data-qty-input') ||
        target.closest('[data-qty-edit]') ||
        target.closest('[role="dialog"]')
      );
      if (isQtyInput) {
        bufferRef.current = '';
        scannerModeRef.current = false;
        return;
      }
      
      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      const timeSinceLastSubmit = currentTime - lastSubmitTimeRef.current;
      
      // =============================================
      // BUFFER RESET LOGIC
      // =============================================
      if (timeDiff > 80 || cooldownRef.current) {
        bufferRef.current = '';
        cooldownRef.current = false;
        // If long gap AND not in post-submit window, exit scanner mode
        if (timeDiff > 300 && timeSinceLastSubmit > 300) {
          scannerModeRef.current = false;
        }
      }
      
      lastKeyTimeRef.current = currentTime;
      
      // =============================================
      // SCANNER MODE DETECTION
      // After 2+ rapid chars (< 50ms apart), activate scanner mode
      // Scanner mode: block ALL chars from reaching input field
      // =============================================
      const isRapidInput = timeDiff < 50;
      
      if (isRapidInput && bufferRef.current.length >= 1) {
        // We have rapid consecutive input = scanner mode
        scannerModeRef.current = true;
        // Keep extending scanner mode timeout while chars keep coming
        if (scannerModeTimerRef.current) clearTimeout(scannerModeTimerRef.current);
        scannerModeTimerRef.current = setTimeout(() => { scannerModeRef.current = false; }, 300);
      }
      
      // Determine if we should block this key from reaching the input field
      const shouldBlock = !allowKeyInput || scannerModeRef.current;
      
      // =============================================
      // HANDLE ENTER KEY
      // =============================================
      if (e.key === 'Enter') {
        if (bufferRef.current.length > 0) {
          // Always block Enter when we have buffer content (prevent form submission / input handler)
          e.preventDefault();
          e.stopPropagation();
          submitBuffer(currentTime);
        }
        return;
      }
      
      // =============================================
      // HANDLE TAB KEY
      // =============================================
      if (e.key === 'Tab') {
        if (bufferRef.current.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          submitBuffer(currentTime);
        }
        return;
      }
      
      // =============================================
      // HANDLE PRINTABLE CHARS
      // =============================================
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        
        // BLOCK from input field when in scanner mode or manual input disabled
        if (shouldBlock) {
          e.preventDefault();
          e.stopPropagation();
        }
        
        bufferRef.current += e.key;
        
        // SAFETY: Force-submit if buffer exceeds max length
        if (bufferRef.current.length >= MAX_BARCODE_LENGTH) {
          submitBuffer(currentTime);
          return;
        }
        
        // Update display buffer (debounced)
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setScanBuffer(bufferRef.current);
        }, 50);
      }
    };

    // Handle hardware scan button events (Zebra, Honeywell, etc.)
    const handleScanButton = (e) => {
      if (e.type === 'scanbutton' || e.type === 'hardwarescan') {
        const barcode = e.detail?.barcode || e.data;
        if (barcode) queueScan(barcode);
      }
    };

    // Handle Zebra DataWedge messages
    const handleMessage = (e) => {
      if (e.data && typeof e.data === 'object' && e.data.barcode) {
        queueScan(e.data.barcode);
      }
    };

    // Use capture phase for fastest interception
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
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
      if (scannerModeTimerRef.current) clearTimeout(scannerModeTimerRef.current);
    };
  }, [isEnabled, queueScan, allowKeyInput, submitBuffer]);

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
