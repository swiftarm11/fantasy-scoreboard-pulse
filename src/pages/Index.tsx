import React from 'react';
import { FantasyDashboard } from '../components/FantasyDashboard';
import { ConnectionStatusBanner } from '../components/ConnectionStatusBanner';
import { LoadingStateProvider } from '../components/enhanced-loading-states/LoadingStateProvider';
import { AuthStatusHandler } from '../components/AuthStatusHandler';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useYahooData } from '../hooks/useYahooData';
import { yahooFantasyAPI } from '../services/YahooFantasyAPI';
import { useState, useEffect } from 'react';

const Index = () => {
  const networkStatus = useNetworkStatus();
  const [rateLimitStatus, setRateLimitStatus] = useState<any>(null);
  const [showAuthStatus, setShowAuthStatus] = useState(false);
  
  // Check if we need to show auth status on load
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hasAuthParams = urlParams.get('auth_success') || urlParams.get('auth_error');
    setShowAuthStatus(!!hasAuthParams);
  }, []);
  
  // Update rate limit status periodically
  useEffect(() => {
    const updateStatus = () => {
      const status = yahooFantasyAPI.getRateLimitStatus();
      setRateLimitStatus(status);
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  const handleRetryConnection = () => {
    // Force a data refresh
    window.location.reload();
  };

  return (
    <LoadingStateProvider>
      <div className="min-h-screen bg-background">
        {showAuthStatus && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
            <AuthStatusHandler onStatusChange={(status) => setShowAuthStatus(!!status)} />
          </div>
        )}
        <ConnectionStatusBanner
          isOnline={networkStatus.isOnline}
          rateLimitStatus={rateLimitStatus}
          onRetry={handleRetryConnection}
          usingCachedData={!networkStatus.isOnline}
          lastUpdated={networkStatus.lastConnected}
        />
        <FantasyDashboard />
      </div>
    </LoadingStateProvider>
  );
};

export default Index;
