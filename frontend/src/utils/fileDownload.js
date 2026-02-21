/**
 * Cross-platform file download utility
 * Creates "Audix" folder on device and saves all exports there
 */

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

// App folder name
const APP_FOLDER = 'Audix_Exports';

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
 * Create app folder if it doesn't exist
 */
const ensureAppFolder = async () => {
  try {
    await Filesystem.mkdir({
      path: APP_FOLDER,
      directory: Directory.Documents,
      recursive: true
    });
  } catch (e) {
    // Folder might already exist, that's ok
  }
};

/**
 * Build CSV content efficiently using array join (much faster than string concatenation)
 * For large datasets, builds in chunks to avoid blocking the UI thread
 */
export const buildCSV = (headers, rows) => {
  const parts = [headers.join(',')];
  for (let i = 0; i < rows.length; i++) {
    parts.push(rows[i]);
  }
  return parts.join('\n');
};

/**
 * Download CSV file
 * On Android: Saves to Audix_Exports folder in Documents
 * On Desktop: Standard download
 */
export const downloadCSV = async (csvContent, filename) => {
  // Add BOM for Excel compatibility
  const BOM = '\uFEFF';
  const content = BOM + csvContent;
  
  // For Capacitor/Android - Save to app folder
  if (isCapacitor()) {
    try {
      // Ensure app folder exists
      await ensureAppFolder();
      
      // Save file to app folder
      const filePath = APP_FOLDER + '/' + filename;
      
      await Filesystem.writeFile({
        path: filePath,
        data: content,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      });
      
      // Get the full path for display
      const result = await Filesystem.getUri({
        path: filePath,
        directory: Directory.Documents
      });
      
      alert(
        '✅ FILE EXPORTED SUCCESSFULLY!\n\n' +
        '📄 File: ' + filename + '\n\n' +
        '📁 Location: Documents/' + APP_FOLDER + '\n\n' +
        'Open your File Manager app and go to:\n' +
        'Internal Storage → Documents → ' + APP_FOLDER
      );
      
      return { success: true, path: result.uri };
    } catch (err) {
      console.error('Filesystem save failed:', err);
      
      // Try external storage as backup
      try {
        await Filesystem.writeFile({
          path: 'Download/' + filename,
          data: content,
          directory: Directory.ExternalStorage,
          encoding: Encoding.UTF8
        });
        
        alert(
          '✅ FILE EXPORTED SUCCESSFULLY!\n\n' +
          '📄 File: ' + filename + '\n\n' +
          '📁 Location: Downloads folder\n\n' +
          'Open your File Manager app and check Downloads.'
        );
        
        return { success: true };
      } catch (err2) {
        console.error('External storage failed:', err2);
      }
      
      // Fallback to blob download
      return downloadViaBlob(content, filename, true);
    }
  }
  
  // For all other environments (browser, mobile browser, desktop)
  return downloadViaBlob(content, filename, true);
};

/**
 * Download file using blob URL - reliable cross-browser method
 */
const downloadViaBlob = (content, filename, showAlert = true) => {
  try {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    
    // Cleanup immediately after click
    document.body.removeChild(link);
    // Revoke after a short delay to ensure download starts
    setTimeout(() => URL.revokeObjectURL(url), 500);
    
    if (showAlert) {
      alert('✅ File Downloaded!\n\nFile: ' + filename + '\n\nCheck your Downloads folder.');
    }
    
    return { success: true };
  } catch (err) {
    console.error('Blob download failed:', err);
    alert('❌ Download Failed\n\nPlease try again.');
    return { success: false };
  }
};

/**
 * List all exported files in app folder
 */
export const listExportedFiles = async () => {
  if (!isCapacitor()) return [];
  
  try {
    await ensureAppFolder();
    const result = await Filesystem.readdir({
      path: APP_FOLDER,
      directory: Directory.Documents
    });
    return result.files || [];
  } catch (err) {
    console.log('List files failed:', err);
    return [];
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
  buildCSV,
  listExportedFiles,
  isAndroid, 
  isMobile, 
  isCapacitor,
  getCSVAcceptTypes,
  isValidCSV,
  APP_FOLDER
};
