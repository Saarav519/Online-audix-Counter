/**
 * Cross-platform file download utility
 * Works on Desktop browsers, Android browsers, and Android WebViews (Capacitor)
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
 * Download file using multiple fallback methods
 * @param {string} content - File content (string)
 * @param {string} filename - Name of the file to download
 * @param {string} mimeType - MIME type of the file (default: text/csv)
 */
export const downloadFile = async (content, filename, mimeType = 'text/csv') => {
  // Try multiple methods in order of preference
  
  // Method 1: Try Web Share API for mobile (allows saving/sharing file)
  if (isMobile() && navigator.share && navigator.canShare) {
    try {
      const file = new File([content], filename, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
          text: `Download ${filename}`
        });
        return true;
      }
    } catch (err) {
      console.log('Web Share API failed, trying fallback:', err.message);
    }
  }

  // Method 2: Try using Data URI (more compatible with mobile)
  if (isMobile()) {
    try {
      const dataUri = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(content);
      const link = document.createElement('a');
      link.setAttribute('href', dataUri);
      link.setAttribute('download', filename);
      link.setAttribute('target', '_blank');
      link.style.display = 'none';
      document.body.appendChild(link);
      
      // Use setTimeout to ensure the link is in the DOM
      setTimeout(() => {
        link.click();
        document.body.removeChild(link);
      }, 100);
      
      return true;
    } catch (err) {
      console.log('Data URI method failed, trying blob:', err.message);
    }
  }

  // Method 3: Standard Blob download (works best on desktop)
  try {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // Small delay for mobile browsers
    setTimeout(() => {
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);
    
    return true;
  } catch (err) {
    console.error('Blob download failed:', err.message);
  }

  // Method 4: Open in new window as last resort
  try {
    const dataUri = 'data:' + mimeType + ';charset=utf-8,' + encodeURIComponent(content);
    const newWindow = window.open(dataUri, '_blank');
    if (newWindow) {
      alert(`File "${filename}" opened in new tab. Please use your browser's save/download option to save it.`);
      return true;
    }
  } catch (err) {
    console.error('New window method failed:', err.message);
  }

  // All methods failed
  alert(`Unable to download file automatically. Please copy the data manually or try on a different device.`);
  return false;
};

/**
 * Download CSV file with proper handling
 * @param {string} csvContent - CSV content string
 * @param {string} filename - Name of the file (should end with .csv)
 */
export const downloadCSV = (csvContent, filename) => {
  // Add BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  return downloadFile(BOM + csvContent, filename, 'text/csv;charset=utf-8');
};

export default { downloadFile, downloadCSV, isAndroid, isIOS, isMobile };
