import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize MSW if simulation mode is enabled
async function enableMocking() {
  const isSimulationEnabled = 
    import.meta.env.VITE_YAHOO_SIMULATION === 'true' ||
    new URLSearchParams(window.location.search).get('simulation') === 'true';

  if (isSimulationEnabled) {
    const { worker } = await import('./mocks');
    
    return worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: {
        url: '/mockServiceWorker.js'
      }
    });
  }
}

// Start the app with optional MSW
enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
