import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Detect if running as installed PWA or Capacitor app
const isCapacitor = window.Capacitor !== undefined;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                     window.navigator.standalone || 
                     document.referrer.includes('android-app://') ||
                     isCapacitor;

if (isStandalone) {
  console.log('[Audix] Running as installed app');
  document.body.classList.add('pwa-installed');
}

// Only register service worker for web (not Capacitor)
// Capacitor apps load from local files, don't need SW
if ('serviceWorker' in navigator && !isCapacitor) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
          console.log('[Audix] Service Worker registered');
          // Check for updates on every page load
          registration.update();
          // Auto-reload when a new SW takes control (e.g. after cache version bump)
          let refreshing = false;
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            console.log('[Audix] New Service Worker activated, reloading...');
            window.location.reload();
          });
          // If a new SW is waiting, activate it immediately
          registration.addEventListener('updatefound', () => {
            const newSW = registration.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                // New version available; our SW already does skipWaiting(),
                // but send message just in case:
                try { newSW.postMessage({ type: 'SKIP_WAITING' }); } catch (_) {}
              }
            });
          });
        })
        .catch(() => console.log('[Audix] Service Worker skipped'));
    } catch (e) {
      // Ignore
    }
  });
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
