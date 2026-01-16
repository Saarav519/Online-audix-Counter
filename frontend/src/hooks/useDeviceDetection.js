import { useState, useEffect, useCallback } from 'react';

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
    const scannerKeywords = [
      'zebra', 'symbol', 'honeywell', 'datalogic', 'cipherlab',
      'bluebird', 'unitech', 'chainway', 'urovo', 'newland',
      'scanner', 'pda', 'handheld', 'mobile computer'
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
 * Custom hook to handle hardware scanner key events
 * Compatible with most enterprise Android scanners
 */
export const useHardwareScanner = (onScan, isEnabled = true) => {
  const [scanBuffer, setScanBuffer] = useState('');
  const [lastKeyTime, setLastKeyTime] = useState(0);

  useEffect(() => {
    if (!isEnabled) return;

    let buffer = '';
    let timeout = null;
    
    const handleKeyDown = (e) => {
      const currentTime = Date.now();
      
      // Hardware scanners typically send input very fast (< 50ms between keys)
      // Regular keyboard input is much slower
      const timeDiff = currentTime - lastKeyTime;
      
      // If it's been more than 100ms since last key, reset buffer
      if (timeDiff > 100) {
        buffer = '';
      }
      
      setLastKeyTime(currentTime);
      
      // Handle Enter key (most scanners send Enter after barcode)
      if (e.key === 'Enter') {
        if (buffer.length > 0) {
          e.preventDefault();
          onScan?.(buffer);
          buffer = '';
          setScanBuffer('');
        }
        return;
      }
      
      // Handle Tab key (some scanners use Tab as suffix)
      if (e.key === 'Tab') {
        if (buffer.length > 0) {
          e.preventDefault();
          onScan?.(buffer);
          buffer = '';
          setScanBuffer('');
        }
        return;
      }
      
      // Only capture printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        buffer += e.key;
        setScanBuffer(buffer);
        
        // Clear buffer after 500ms of inactivity
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
          buffer = '';
          setScanBuffer('');
        }, 500);
      }
    };

    // Handle hardware scan button events (for Zebra, Honeywell, etc.)
    const handleScanButton = (e) => {
      // Some devices dispatch custom events for hardware buttons
      if (e.type === 'scanbutton' || e.type === 'hardwarescan') {
        const barcode = e.detail?.barcode || e.data;
        if (barcode) {
          onScan?.(barcode);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('scanbutton', handleScanButton);
    document.addEventListener('hardwarescan', handleScanButton);
    
    // For Zebra DataWedge
    window.addEventListener('message', (e) => {
      if (e.data && typeof e.data === 'object' && e.data.barcode) {
        onScan?.(e.data.barcode);
      }
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('scanbutton', handleScanButton);
      document.removeEventListener('hardwarescan', handleScanButton);
      if (timeout) clearTimeout(timeout);
    };
  }, [onScan, isEnabled, lastKeyTime]);

  return { scanBuffer };
};

export default useDeviceDetection;
