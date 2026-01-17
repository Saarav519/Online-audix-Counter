import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

// Safe Service Worker registration - handles offline gracefully
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Wrap in try-catch to prevent uncaught errors
    try {
      navigator.serviceWorker.register('/service-worker.js')
        .then((registration) => {
          console.log('[Audix] Service Worker registered');
        })
        .catch(() => {
          // Silently ignore - app works offline with existing cache
          console.log('[Audix] Service Worker update skipped (offline)');
        });
    } catch (e) {
      // Ignore any errors during SW registration
      console.log('[Audix] Running in offline mode');
    }
  });
}

// Detect if running as installed PWA
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                     window.navigator.standalone || 
                     document.referrer.includes('android-app://');

if (isStandalone) {
  console.log('[Audix] Running as installed PWA');
  document.body.classList.add('pwa-installed');
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
