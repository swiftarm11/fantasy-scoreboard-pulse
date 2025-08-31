import { useEffect } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AccessibilityProvider } from "@/components/AccessibilityProvider";
import { SimulationControls } from "@/components/SimulationControls";
import { SimulationProvider } from "@/contexts/SimulationContext";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { YahooCallback } from "./pages/YahooCallback";
import { yahooOAuth } from "@/utils/yahooOAuth";

const queryClient = new QueryClient();

const App = () => {
  // Expose Yahoo OAuth service and env vars globally
  useEffect(() => {
    window.yahooOAuth = yahooOAuth;
    window.appEnv = {
      YAHOO_CLIENT_ID: import.meta.env.VITE_YAHOO_CLIENT_ID,
      YAHOO_REDIRECT_URI: import.meta.env.VITE_YAHOO_REDIRECT_URI,
      YAHOO_SIMULATION: import.meta.env.VITE_YAHOO_SIMULATION
    };
    console.log('✅ Yahoo OAuth service exposed to window in App.tsx');
    console.log('App env:', window.appEnv);
    
    // Log simulation status
    const isSimulationEnabled = 
      import.meta.env.VITE_YAHOO_SIMULATION === 'true' ||
      new URLSearchParams(window.location.search).get('simulation') === 'true';
    
    if (isSimulationEnabled) {
      console.log('🎮 Simulation mode is ENABLED');
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AccessibilityProvider>
          <SimulationProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth/yahoo/callback" element={<YahooCallback />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
            <SimulationControls />
          </SimulationProvider>
        </AccessibilityProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
