import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AppProvider } from './state/app.jsx'
import App from './App.jsx'

// Catch Chrome's install prompt early, before the Me screen is opened.
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__blossomInstallPrompt = e })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider><App /></AppProvider>
  </StrictMode>,
)

// Offline shell + "Add to Home Screen" support. Data always comes live from the shop.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}))
}
