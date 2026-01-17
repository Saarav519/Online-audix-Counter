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
  
  // For Android - always try Web Share API first (most reliable)
  if (isAndroid() || isCapacitor()) {
    try {
      // Create a Blob and File
      const blob = new Blob([content], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType, lastModified: Date.now() });
      
      // Check if Web Share API with files is supported
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        });
        return { success: true, method: 'share' };
      }
    } catch (err) {
      console.log('Share API failed:', err.message);
    }
    
    // Fallback: Create blob URL and open in new window
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      // Try opening in a new window/tab
      const newWindow = window.open(url, '_blank');
      if (newWindow) {
        // Show instructions
        setTimeout(() => {
          alert(`File ready!\n\nTap the 3-dot menu (⋮) and select "Download" to save the file.`);
        }, 500);
        
        // Cleanup after delay
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return { success: true, method: 'window' };
      }
    } catch (err) {
      console.log('Window open failed:', err.message);
    }
    
    // Last resort: Show content for manual copy
    alert(`Unable to download automatically.\n\nThe file will open in a new tab. Use long-press to save or copy the content.`);
    const dataUri = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(content);
    window.open(dataUri, '_blank');
    return { success: false, method: 'manual' };
  }
  
  // Desktop/other browsers - standard download
  try {
    const blob = new Blob([content], { type: mimeType });
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
  // Android file pickers often have issues with specific MIME types
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
