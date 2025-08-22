import { useEffect } from 'react';
import { yahooOAuth } from '@/utils/yahooOAuth';
import { FantasyDashboard } from '@/components/FantasyDashboard';
// ... other imports

const Index = () => {
  // Expose Yahoo OAuth service
  useEffect(() => {
    window.yahooOAuth = yahooOAuth;
    console.log('✅ Yahoo OAuth service exposed to window');
    console.log('Yahoo OAuth configured:', yahooOAuth.isConfigured());
    console.log('Yahoo OAuth connected:', yahooOAuth.isConnected());
  }, []);

  return (
    <div>
      {/* Your existing dashboard content */}
      <FantasyDashboard />
    </div>
  );
};

export default Index;
