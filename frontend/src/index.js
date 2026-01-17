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
        .then(() => console.log('[Audix] Service Worker registered'))
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
