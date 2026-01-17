/**
 * Cross-platform file download utility
 * Uses Web Share API for Android - shows native share dialog
 */

/**
 * Detect if running on Android device
 */
export const isAndroid = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  return /android/i.test(userAgent);
};

/**
 * Detect if running in Capacitor
 */
export const isCapacitor = () => {
  return window.Capacitor !== undefined;
};

/**
 * Detect if running on mobile device
 */
export const isMobile = () => {
  return isAndroid() || /iPad|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Download CSV file
 * On Android: Shows Share dialog to save file
 * On Desktop: Direct download
 */
export const downloadCSV = async (csvContent, filename) => {
  // Add BOM for Excel compatibility
  const BOM = '\uFEFF';
  const content = BOM + csvContent;
  const blob = new Blob([content], { type: 'text/csv' });
  const file = new File([blob], filename, { type: 'text/csv', lastModified: Date.now() });
  
  // For Android/Mobile - Use Web Share API
  if (isAndroid() || isCapacitor() || isMobile()) {
    // Check if Web Share API is available
    if (navigator.share && navigator.canShare) {
      try {
        const shareData = { files: [file] };
        if (navigator.canShare(shareData)) {
          await navigator.share(shareData);
          // Show success message after share dialog closes
          alert('✅ Export Successful!\n\nFile: ' + filename + '\n\nSelect "Save to Files" or "Downloads" from the share menu to save the file.');
          return { success: true };
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          // User cancelled - that's ok
          return { success: true, cancelled: true };
        }
        console.log('Share failed:', err);
      }
    }
    
    // Fallback: Try direct download
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
      alert('✅ Export Successful!\n\nFile: ' + filename + '\n\nCheck your Downloads folder.');
      return { success: true };
    } catch (err) {
      console.log('Download failed:', err);
    }
    
    // Last fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(csvContent);
      alert('📋 Content Copied!\n\nFile download not available.\nContent has been copied to clipboard.\nPaste it into a text file or spreadsheet.');
      return { success: true };
    } catch (err) {
      alert('❌ Export Failed\n\nPlease try again.');
      return { success: false };
    }
  }
  
  // Desktop - Standard download
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    alert('✅ File Downloaded!\n\nFile: ' + filename + '\n\nCheck your Downloads folder.');
    return { success: true };
  } catch (err) {
    alert('❌ Download Failed\n\nPlease try again.');
    return { success: false };
  }
};

/**
 * Get accepted file types for CSV input
 */
export const getCSVAcceptTypes = () => {
  return '.csv,.txt,text/csv,text/plain,application/csv,application/vnd.ms-excel,*/*';
};

/**
 * Validate if file is a valid CSV
 */
export const isValidCSV = (file) => {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return name.endsWith('.csv') || name.endsWith('.txt');
};

export default { 
  downloadCSV, 
  isAndroid, 
  isMobile, 
  isCapacitor,
  getCSVAcceptTypes,
  isValidCSV
};
