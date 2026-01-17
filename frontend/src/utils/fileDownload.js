/**
 * Cross-platform file download utility
 * Saves directly to Downloads folder on Android with success popup
 */

import { Filesystem, Directory } from '@capacitor/filesystem';

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
 * Download CSV file - Saves to Downloads folder on Android
 * @param {string} csvContent - CSV content string
 * @param {string} filename - Name of the file (should end with .csv)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const downloadCSV = async (csvContent, filename) => {
  // Add BOM for Excel compatibility with UTF-8
  const BOM = '\uFEFF';
  const content = BOM + csvContent;
  
  // For Capacitor/Android - Save directly to Downloads folder
  if (isCapacitor()) {
    try {
      // Save to Downloads directory
      const result = await Filesystem.writeFile({
        path: filename,
        data: content,
        directory: Directory.Documents,
        encoding: 'utf8',
      });
      
      // Show success popup
      alert(`✅ File Saved Successfully!\n\nFile: ${filename}\nLocation: Documents folder\n\nYou can find this file in your device's file manager.`);
      
      return { success: true, message: 'File saved to Documents folder' };
    } catch (err) {
      console.log('Capacitor Filesystem failed:', err);
      
      // Try external storage as fallback
      try {
        await Filesystem.writeFile({
          path: 'Download/' + filename,
          data: content,
          directory: Directory.ExternalStorage,
          encoding: 'utf8',
        });
        
        alert(`✅ File Saved Successfully!\n\nFile: ${filename}\nLocation: Downloads folder\n\nYou can find this file in your Downloads.`);
        
        return { success: true, message: 'File saved to Downloads folder' };
      } catch (err2) {
        console.log('External storage failed:', err2);
      }
    }
  }
  
  // For Android browser or Web - use Web Share API or download
  if (isMobile() || isAndroid()) {
    const blob = new Blob([content], { type: 'text/csv' });
    const file = new File([blob], filename, { type: 'text/csv' });
    
    // Try Web Share API
    if (navigator.share && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return { success: true, message: 'File shared' };
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return { success: true, message: 'Cancelled' };
        }
      }
    }
  }
  
  // Desktop/Web fallback - standard download
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
    
    alert(`✅ File Downloaded!\n\nFile: ${filename}\n\nCheck your Downloads folder.`);
    
    return { success: true, message: 'File downloaded' };
  } catch (err) {
    alert(`❌ Export Failed\n\nPlease try again.`);
    return { success: false, message: err.message };
  }
};

/**
 * Get accepted file types for CSV input
 */
export const getCSVAcceptTypes = () => {
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
  return name.endsWith('.csv') || name.endsWith('.txt');
};

export default { 
  downloadCSV, 
  isAndroid, 
  isMobile, 
  isCapacitor,
  getCSVAcceptTypes,
  readCSVFile,
  isValidCSV
};
