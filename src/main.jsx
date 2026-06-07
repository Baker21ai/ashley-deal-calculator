import React from 'react'
import ReactDOM from 'react-dom/client'
import AshleyDealCalculator from '../ashley-calculator-v5-fixed.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AshleyDealCalculator />
  </React.StrictMode>,
)

// Register the service worker for offline / installable PWA support.
// Only in production builds and over secure contexts (localhost counts).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
