/**
 * Cross-platform file download/upload utility
 * Optimized for Android WebViews and Capacitor apps
 */

/**
 * Detect if running on Android device
 */
export const isAndroid = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return /android/i.test(userAgent);
};

/**
 * Detect if running on iOS device
 */
export const isIOS = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
};

/**
 * Detect if running on mobile device
 */
export const isMobile = () => {
  return isAndroid() || isIOS() || /webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Detect if running in Capacitor
 */
export const isCapacitor = () => {
  return window.Capacitor !== undefined;
};

/**
 * Download CSV file - Android optimized
 * Uses Web Share API as primary method for Android
 */
export const downloadCSV = async (csvContent, filename) => {
  // Add BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  const content = BOM + csvContent;
  const mimeType = 'text/csv';
  
  // Create blob and file for sharing
  const blob = new Blob([content], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType, lastModified: Date.now() });
  
  // For Android/Capacitor - try Web Share API (shows native share dialog)
  if (isAndroid() || isCapacitor() || isMobile()) {
    
    // Method 1: Web Share API with file (Best option - native share dialog)
    if (navigator.share && navigator.canShare) {
      try {
        const shareData = { files: [file] };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return { success: true, method: 'share' };
        }
      } catch (err) {
        // User cancelled or share failed - try next method
        if (err.name !== 'AbortError') {
          console.log('Share failed:', err.message);
        } else {
          // User cancelled - that's okay
          return { success: true, method: 'cancelled' };
        }
      }
    }
    
    // Method 2: Download via anchor with data URL
    try {
      const reader = new FileReader();
      return new Promise((resolve) => {
        reader.onload = function() {
          const dataUrl = reader.result;
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = filename;
          link.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(link);
          
          // Try click
          link.click();
          
          setTimeout(() => {
            document.body.removeChild(link);
            resolve({ success: true, method: 'dataurl' });
          }, 1000);
        };
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.log('Data URL method failed:', err.message);
    }
    
    // Method 3: Blob URL download
    try {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);
      
      return { success: true, method: 'blob' };
    } catch (err) {
      console.log('Blob URL method failed:', err.message);
    }
    
    // Method 4: Last resort - copy to clipboard
    try {
      await navigator.clipboard.writeText(csvContent);
      alert(`File copied to clipboard!\n\nYou can paste it into a text file or spreadsheet app.`);
      return { success: true, method: 'clipboard' };
    } catch (err) {
      console.log('Clipboard failed:', err.message);
    }
    
    // All methods failed
    alert(`Export failed. Please try again or use a different device.`);
    return { success: false, method: 'failed' };
  }
  
  // Desktop browsers - standard download
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true, method: 'download' };
  } catch (err) {
    console.error('Download failed:', err);
    return { success: false, method: 'error' };
  }
};

/**
 * Get accepted file types for CSV input
 * Returns string for input accept attribute - broad to work on Android
 */
export const getCSVAcceptTypes = () => {
  // Be very permissive for Android compatibility
  return '.csv,.txt,text/csv,text/plain,application/csv,application/vnd.ms-excel,*/*';
};

/**
 * Read CSV file content
 */
export const readCSVFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
};

/**
 * Validate if file is a valid CSV
 */
export const isValidCSV = (file) => {
  if (!file) return false;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  
  // Check by extension
  if (name.endsWith('.csv') || name.endsWith('.txt')) return true;
  
  // Check by MIME type
  if (type.includes('csv') || type.includes('text') || type === '') return true;
  
  return false;
};

export default { 
  downloadCSV, 
  isAndroid, 
  isIOS, 
  isMobile, 
  isCapacitor,
  getCSVAcceptTypes,
  readCSVFile,
  isValidCSV
};
