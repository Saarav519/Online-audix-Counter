import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

/**
 * PWA Install Prompt Component
 * Shows a native-like install prompt for Android devices
 */
const PWAInstallPrompt = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone || 
                         document.referrer.includes('android-app://');
    
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed the prompt before
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    const dismissedTime = dismissed ? parseInt(dismissed) : 0;
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
    
    // Show again after 7 days
    if (dismissed && daysSinceDismissed < 7) {
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show prompt after a short delay
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('[Audix] PWA install accepted');
    } else {
      console.log('[Audix] PWA install dismissed');
    }

    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    setShowPrompt(false);
  };

  if (isInstalled || !showPrompt) return null;

  return (
    <div className="pwa-install-prompt">
      <button 
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-white/20"
        style={{ position: 'absolute', top: '8px', right: '8px' }}
      >
        <X className="w-4 h-4" />
      </button>
      
      <h3 className="flex items-center gap-2">
        <Download className="w-5 h-5" />
        Install Audix App
      </h3>
      
      <p>
        Install this app on your device for faster access and offline capability.
      </p>
      
      <div className="pwa-install-buttons">
        <button onClick={handleInstall} className="pwa-install-btn">
          Install Now
        </button>
        <button onClick={handleDismiss} className="pwa-dismiss-btn">
          Not Now
        </button>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;
