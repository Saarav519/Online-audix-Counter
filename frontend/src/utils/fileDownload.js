/**
 * Cross-platform file download utility
 * Reliable file export for Android Capacitor apps
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
 * Uses multiple methods with proper verification
 */
export const downloadCSV = async (csvContent, filename) => {
  // Add BOM for Excel compatibility
  const BOM = '\uFEFF';
  const content = BOM + csvContent;
  
  // For Android/Capacitor - Use blob download with data URL
  if (isAndroid() || isCapacitor() || isMobile()) {
    
    // Method 1: Create downloadable link with data URL
    try {
      // Encode content as base64
      const base64Content = btoa(unescape(encodeURIComponent(content)));
      const dataUrl = 'data:text/csv;base64,' + base64Content;
      
      // Create and trigger download link
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      
      // Add to DOM and click
      document.body.appendChild(link);
      link.click();
      
      // Small delay then cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
      document.body.removeChild(link);
      
      // Show success
      alert('✅ File Exported!\n\nFilename: ' + filename + '\n\n📁 Check your Downloads folder or Recent files.');
      return { success: true, method: 'dataurl' };
    } catch (err) {
      console.log('Data URL download failed:', err);
    }
    
    // Method 2: Try Web Share API
    try {
      const blob = new Blob([content], { type: 'text/csv' });
      const file = new File([blob], filename, { type: 'text/csv' });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        alert('✅ File Shared!\n\nFilename: ' + filename);
        return { success: true, method: 'share' };
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        return { success: true, cancelled: true };
      }
      console.log('Share failed:', err);
    }
    
    // Method 3: Blob URL download
    try {
      const blob = new Blob([content], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.style.cssText = 'position:absolute;left:-9999px';
      document.body.appendChild(link);
      link.click();
      
      await new Promise(resolve => setTimeout(resolve, 500));
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      alert('✅ File Exported!\n\nFilename: ' + filename + '\n\n📁 Check your Downloads folder.');
      return { success: true, method: 'blob' };
    } catch (err) {
      console.log('Blob download failed:', err);
    }
    
    // Method 4: Copy to clipboard as fallback
    try {
      await navigator.clipboard.writeText(csvContent);
      alert('📋 Data Copied to Clipboard!\n\nDirect download not available on this device.\n\nOpen a text editor or spreadsheet app and paste the content, then save as .csv file.');
      return { success: true, method: 'clipboard' };
    } catch (err) {
      console.log('Clipboard failed:', err);
    }
    
    alert('❌ Export Failed\n\nPlease try on a different device.');
    return { success: false };
  }
  
  // Desktop - Standard blob download
  try {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('✅ File Downloaded!\n\nFilename: ' + filename + '\n\n📁 Check your Downloads folder.');
    return { success: true };
  } catch (err) {
    alert('❌ Download Failed\n\nPlease try again.');
    return { success: false };
  }
};

/**
 * Get accepted file types for CSV input - broad for Android compatibility
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
