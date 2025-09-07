import { useState, useEffect, useCallback, useRef } from 'react';
import { yahooOAuth } from '../utils/yahooOAuth';
import { LeagueData } from '../types/fantasy';
import { LeagueConfig } from '../types/config';
import { YahooTokens } from '../types/yahoo';

// Yahoo API league structure
interface YahooLeague {
  league_key: string;
  league_id: string;
  name: string;
  url?: string;
  logo_url?: string;
  draft_status?: string;
  num_teams: number;
  season: string;
}

interface UseYahooDataState {
  leagues: LeagueData[];
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  availableLeagues: YahooLeague[];
  lastUpdated: string | null;
  savedSelections: LeagueConfig[];
}

interface UseYahooDataActions {
  login: () => Promise<void>;
  logout: () => void;
  refreshData: () => Promise<void>;
  fetchAvailableLeagues: () => Promise<void>;
  saveLeagueSelections: (selections: LeagueConfig[]) => void;
  getEnabledLeagueIds: () => string[];
}

export const useYahooData = (): UseYahooDataState & UseYahooDataActions => {
  // State management
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [availableLeagues, setAvailableLeagues] = useState<YahooLeague[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [savedSelections, setSavedSelections] = useState<LeagueConfig[]>([]);

  // Refs to prevent infinite loops
  const isInitializedRef = useRef(false);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Stable error handler using useCallback
  const handleError = useCallback((errorMessage: string, error?: any) => {
    console.error(`Yahoo Data Error: ${errorMessage}`, error);
    setError(errorMessage);
    setIsLoading(false);
  }, []);

  // Check authentication status
  const checkAuthentication = useCallback(() => {
    const isConnected = yahooOAuth.isConnected();
    setIsAuthenticated(isConnected);
    return isConnected;
  }, []);

  // Stable data fetching function using useCallback
  const fetchAvailableLeagues = useCallback(async (): Promise<void> => {
    if (!yahooOAuth.isConnected()) {
      console.log('Not connected to Yahoo - skipping fetch');
      setAvailableLeagues([]);
      return;
    }

    if (isLoading) {
      console.log('Already loading leagues - skipping duplicate request');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const accessToken = await yahooOAuth.getValidAccessToken();
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          endpoint: 'getUserLeagues',
          accessToken
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to fetch leagues: ${response.status} - ${errorData}`);
      }

      const data = await response.json();
      
      // Parse Yahoo API response structure
      const leaguesData = data?.fantasy_content?.users?.[0]?.user?.[0]?.games?.[0]?.game?.[0]?.leagues?.[0]?.league || [];
      
      const parsedLeagues: YahooLeague[] = leaguesData.map((leagueArray: any[]) => {
        const league = Array.isArray(leagueArray) ? leagueArray[0] : leagueArray;
        return {
          league_key: league.league_key,
          league_id: league.league_id,
          name: league.name,
          url: league.url,
          logo_url: league.logo_url,
          draft_status: league.draft_status,
          num_teams: league.num_teams,
          season: league.season
        };
      });

      setAvailableLeagues(parsedLeagues);
      console.log(`Fetched ${parsedLeagues.length} Yahoo leagues successfully`);
      
    } catch (error) {
      console.error('Yahoo Data Error: Failed to fetch leagues data', error);
      setError(error.message || 'Failed to fetch leagues data');
      
      // In preview/development mode, don't spam with errors
      if (import.meta.env.DEV) {
        console.log('Yahoo OAuth not available in preview mode - this is expected');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Stable login function using useCallback
  const login = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const authUrl = await yahooOAuth.getAuthUrl();
      window.location.href = authUrl;
      
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
      // Clear tokens and user info from localStorage
      localStorage.removeItem('yahoo_tokens');
      localStorage.removeItem('yahoo_user_info');
      
      setIsAuthenticated(false);
      setLeagues([]);
      setAvailableLeagues([]);
      setError(null);
      setLastUpdated(null);
      
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
      await fetchAvailableLeagues();
    }
  }, [isAuthenticated, fetchAvailableLeagues]);

  // Save league selections
  const saveLeagueSelections = useCallback((selections: LeagueConfig[]) => {
    setSavedSelections(selections);
    localStorage.setItem('yahoo_league_selections', JSON.stringify(selections));
  }, []);

  // Get enabled league IDs
  const getEnabledLeagueIds = useCallback((): string[] => {
    return savedSelections.filter(s => s.enabled).map(s => s.leagueId);
  }, [savedSelections]);

  // Initialize authentication state on mount
  useEffect(() => {
    const initializeAuth = async () => {
      if (isInitializedRef.current) return; // Prevent multiple initializations
      
      isInitializedRef.current = true;
      
      try {
        // Check for stored tokens
        const isConnected = checkAuthentication();
        
        // Load saved league selections
        const savedSelectionsRaw = localStorage.getItem('yahoo_league_selections');
        if (savedSelectionsRaw) {
          try {
            const parsed = JSON.parse(savedSelectionsRaw);
            // Handle both old format (strings) and new format (LeagueConfig objects)
            if (Array.isArray(parsed) && parsed.length > 0) {
              if (typeof parsed[0] === 'string') {
                // Old format - convert to new format
                const converted: LeagueConfig[] = parsed.map((leagueId: string, index: number) => ({
                  id: `yahoo_converted_${index}`,
                  leagueId,
                  platform: 'Yahoo' as const,
                  enabled: true
                }));
                setSavedSelections(converted);
                localStorage.setItem('yahoo_league_selections', JSON.stringify(converted));
              } else {
                // New format
                setSavedSelections(parsed);
              }
            }
          } catch (error) {
            console.error('Failed to parse saved selections:', error);
            setSavedSelections([]);
          }
        }
        
        if (isConnected) {
          // Fetch leagues data after successful authentication
          await fetchAvailableLeagues();
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
          
          const tokens = await yahooOAuth.exchangeCodeForTokens(code, state);
          if (tokens) {
            setIsAuthenticated(true);
            // Fetch leagues data after successful callback
            await fetchAvailableLeagues();
            
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

  return {
    // State
    leagues,
    availableLeagues,
    isLoading,
    error,
    isAuthenticated,
    lastUpdated,
    savedSelections,
    // Actions
    login,
    logout,
    refreshData,
    fetchAvailableLeagues,
    saveLeagueSelections,
    getEnabledLeagueIds,
  };
};