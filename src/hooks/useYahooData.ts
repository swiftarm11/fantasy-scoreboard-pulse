# Updated useYahooData Hook (Drop-in Replacement)


import { useState, useEffect, useCallback, useRef } from 'react';
import { YahooOAuthService } from '../utils/yahooOAuth';
import { LeagueData, AuthTokens } from '../utils/config';

interface UseYahooDataState {
  leagues: LeagueData[];
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

interface UseYahooDataActions {
  login: () => Promise<void>;
  logout: () => void;
  refreshData: () => Promise<void>;
}

export const useYahooData = (): UseYahooDataState & UseYahooDataActions => {
  // State management
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Refs to prevent infinite loops
  const oauthServiceRef = useRef<YahooOAuthService>(new YahooOAuthService());
  const isInitializedRef = useRef(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable error handler using useCallback
  const handleError = useCallback((errorMessage: string, error?: any) => {
    console.error(`Yahoo Data Error: ${errorMessage}`, error);
    setError(errorMessage);
    setIsLoading(false);
  }, []);

  // Stable token refresh function using useCallback
  const checkAndRefreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const tokens = oauthServiceRef.current.getStoredTokens();
      if (!tokens) {
        setIsAuthenticated(false);
        return false;
      }

      // Check if token is expired or will expire in the next 5 minutes
      const now = Date.now();
      const tokenExpiry = tokens.expires_at * 1000; // Convert to milliseconds
      const fiveMinutesFromNow = now + 5 * 60 * 1000;

      if (tokenExpiry <= fiveMinutesFromNow) {
        console.log('Token expired or expiring soon, refreshing...');
        const refreshed = await oauthServiceRef.current.refreshToken();
        if (!refreshed) {
          setIsAuthenticated(false);
          return false;
        }
      }

      setIsAuthenticated(true);
      return true;
    } catch (error) {
      handleError('Failed to refresh token', error);
      setIsAuthenticated(false);
      return false;
    }
  }, [handleError]);

  // Stable data fetching function using useCallback
  const fetchLeagues = useCallback(async (): Promise<void> => {
    if (isLoading) return; // Prevent multiple simultaneous calls

    setIsLoading(true);
    setError(null);

    try {
      // Check token validity first
      const isTokenValid = await checkAndRefreshToken();
      if (!isTokenValid) {
        handleError('Authentication required');
        return;
      }

      // Fetch leagues data
      const leaguesData = await oauthServiceRef.current.getLeagues();
      
      // Validate and set leagues data
      if (Array.isArray(leaguesData)) {
        setLeagues(leaguesData);
        console.log(`Successfully loaded ${leaguesData.length} leagues`);
      } else {
        console.warn('Unexpected leagues data format:', leaguesData);
        setLeagues([]);
      }
    } catch (error) {
      handleError('Failed to fetch leagues data', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, checkAndRefreshToken, handleError]);

  // Stable login function using useCallback
  const login = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      await oauthServiceRef.current.initiateLogin();
      // Note: The actual authentication will happen via redirect
      // Token storage and state update will occur in the handleCallback effect
    } catch (error) {
      handleError('Failed to initiate login', error);
    } finally {
      setIsLoading(false);
    }
  }, [handleError]);

  // Stable logout function using useCallback
  const logout = useCallback((): void => {
    try {
      oauthServiceRef.current.clearTokens();
      setIsAuthenticated(false);
      setLeagues([]);
      setError(null);
      
      // Clear any pending refresh timeouts
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      
      console.log('User logged out successfully');
    } catch (error) {
      handleError('Failed to logout', error);
    }
  }, [handleError]);

  // Stable refresh data function using useCallback
  const refreshData = useCallback(async (): Promise<void> => {
    if (isAuthenticated) {
      await fetchLeagues();
    }
  }, [isAuthenticated, fetchLeagues]);

  // Initialize authentication state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      if (isInitializedRef.current) return; // Prevent multiple initializations
      
      isInitializedRef.current = true;
      
      try {
        // Check for stored tokens
        const tokens = oauthServiceRef.current.getStoredTokens();
        if (tokens) {
          const isValid = await checkAndRefreshToken();
          if (isValid) {
            // Fetch leagues data after successful authentication
            await fetchLeagues();
          }
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        handleError('Failed to initialize authentication', error);
      }
    };

    initializeAuth();
  }, []); // Empty dependency array - runs only on mount

  // Handle OAuth callback
  useEffect(() => {
    const handleCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');

      if (code && state) {
        try {
          setIsLoading(true);
          setError(null);
          
          const success = await oauthServiceRef.current.handleCallback(code, state);
          if (success) {
            setIsAuthenticated(true);
            // Fetch leagues data after successful callback
            await fetchLeagues();
            
            // Clean up URL
            const newUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
          } else {
            handleError('Failed to complete authentication');
          }
        } catch (error) {
          handleError('Authentication callback failed', error);
        } finally {
          setIsLoading(false);
        }
      }
    };

    // Only run callback handling once
    if (!isInitializedRef.current) {
      handleCallback();
    }
  }, []); // Empty dependency array - runs only on mount

  // Set up automatic token refresh
  useEffect(() => {
    if (!isAuthenticated) return;

    const setupTokenRefresh = () => {
      const tokens = oauthServiceRef.current.getStoredTokens();
      if (!tokens) return;

      // Calculate time until token expires (with 5-minute buffer)
      const now = Date.now();
      const tokenExpiry = tokens.expires_at * 1000;
      const refreshTime = tokenExpiry - now - (5 * 60 * 1000); // 5 minutes before expiry

      if (refreshTime > 0) {
        refreshTimeoutRef.current = setTimeout(async () => {
          console.log('Automatic token refresh triggered');
          await checkAndRefreshToken();
          setupTokenRefresh(); // Schedule next refresh
        }, refreshTime);
      }
    };

    setupTokenRefresh();

    // Cleanup timeout on unmount or auth change
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [isAuthenticated, checkAndRefreshToken]); // Dependencies: isAuthenticated and stable checkAndRefreshToken

  return {
    // State
    leagues,
    isLoading,
    error,
    isAuthenticated,
    // Actions
    login,
    logout,
    refreshData,
  };
};
