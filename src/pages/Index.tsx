import { useEffect } from 'react';
import { yahooOAuth } from '@/utils/yahooOAuth';
import { FantasyDashboard } from '@/components/FantasyDashboard';

const Index = () => {
  // Enhanced debugging and service exposure
  useEffect(() => {
    console.log('=== INDEX COMPONENT MOUNTED ===');
    console.log('yahooOAuth import:', yahooOAuth);
    console.log('yahooOAuth type:', typeof yahooOAuth);
    
    try {
      window.yahooOAuth = yahooOAuth;
      console.log('✅ Yahoo OAuth service exposed to window');
      console.log('Yahoo OAuth configured:', yahooOAuth.isConfigured());
      console.log('Yahoo OAuth connected:', yahooOAuth.isConnected());
      
      // Debug environment variables
      console.log('Client ID from env:', import.meta.env.VITE_YAHOO_CLIENT_ID);
      console.log('Redirect URI from env:', import.meta.env.VITE_YAHOO_REDIRECT_URI);
      
      // Test service methods
      console.log('getConfigurationStatus:', yahooOAuth.getConfigurationStatus());
      
      // Expose env vars for console debugging
      window.appEnv = {
        YAHOO_CLIENT_ID: import.meta.env.VITE_YAHOO_CLIENT_ID,
        YAHOO_REDIRECT_URI: import.meta.env.VITE_YAHOO_REDIRECT_URI
      };
      console.log('Environment variables exposed to window.appEnv');
      
    } catch (error) {
      console.error('Error exposing yahooOAuth:', error);
    }
    
    console.log('=== END MOUNT DEBUG ===');
  }, []);

  return (
    <div>
      <FantasyDashboard />
    </div>
  );
};

export default Index;