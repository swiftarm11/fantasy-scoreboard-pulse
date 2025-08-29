// src/hooks/useYahooData.ts
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { LeagueData } from '../types/fantasy';
import { useYahooOAuth } from './useYahooOAuth';
import { debugLogger } from '../utils/debugLogger';
import { toast } from '../components/ui/use-toast';
import { yahooLogger } from '../utils/yahooLogger';

interface YahooDataState {
  leagues: LeagueData[];
  availableLeagues: any[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

interface YahooLeagueSelection {
  leagueId: string;
  leagueName: string;
  enabled: boolean;
  platform: string;
}

const STORAGE_KEY = 'yahoo_league_selections';

/**
 * Custom hook for managing Yahoo Fantasy Sports data
 * ✅ FIXED: Infinite render loops and JSON parsing issues
 * ✅ FIXED: Proper dependency management and state isolation
 */
export const useYahooData = (enabledLeagueIds?: string[]) => {
  const { isConnected } = useYahooOAuth();
  
  // ✅ FIX: Use stable initial state with useMemo
  const initialState = useMemo<YahooDataState>(() => ({
    leagues: [],
    availableLeagues: [],
    isLoading: false,
    error: null,
    lastUpdated: null,
  }), []);
  
  const [state, setState] = useState(initialState);
  const [savedSelections, setSavedSelections] = useState<YahooLeagueSelection[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedRef = useRef(false);
  
  // ✅ FIX: Stable reference for available leagues to break dependency loops
  const availableLeaguesRef = useRef<any[]>([]);

  // Load saved selections from localStorage on mount only
  useEffect(() => {
    if (!hasInitializedRef.current) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setSavedSelections(JSON.parse(saved));
        }
        hasInitializedRef.current = true;
      } catch (error) {
        console.error('Error loading saved Yahoo league selections:', error);
        hasInitializedRef.current = true;
      }
    }
  }, []);

  // Save league selections to localStorage
  const saveLeagueSelections = useCallback((selections: YahooLeagueSelection[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
      setSavedSelections(selections);
      debugLogger.info('YAHOO_LEAGUES', 'League selections saved', { count: selections.length });
    } catch (error) {
      console.error('Error saving Yahoo league selections:', error);
      throw error;
    }
  }, []);

  // Get enabled league IDs from saved selections - memoized to prevent recreation
  const enabledIds = useMemo(() => {
    return savedSelections.filter(s => s.enabled).map(s => s.leagueId);
  }, [savedSelections]);

  /**
   * ✅ FIXED: Parse Yahoo's nested JSON structure correctly
   * Yahoo uses objects with numbered keys, not arrays
   */
  const parseYahooLeaguesResponse = useCallback((data: any): any[] => {
    try {
      yahooLogger.debug('YAHOO_PARSE', 'Parsing Yahoo response structure', {
        hasFantasyContent: !!data?.fantasy_content,
        hasUsers: !!data?.fantasy_content?.users,
      });

      // ✅ FIX: Correct navigation of Yahoo JSON structure using object keys
      const fantasycontent = data?.fantasy_content;
      if (!fantasycontent) {
        throw new Error('Missing fantasy_content in response');
      }

      const users = fantasycontent.users;
      if (!users || !users["0"]) {
        throw new Error('Missing users["0"] in response');
      }

      const user = users["0"].user;
      if (!user || !user[0]) {
        throw new Error('Missing user[0] in users["0"]');
      }

      // ✅ FIX: Yahoo structure is user[0] then user[1] contains games
      const userGames = user[1]?.games;
      if (!userGames || !userGames["0"]) {
        throw new Error('Missing games["0"] in user[1]');
      }

      const game = userGames["0"].game;
      if (!game || !game[0]) {
        throw new Error('Missing game[0] in games["0"]');
      }

      // ✅ FIX: Games structure is game[0] then game[1] contains leagues
      const gameLeagues = game[1]?.leagues;
      if (!gameLeagues) {
        throw new Error('Missing leagues in game[1]');
      }

      const leagueCount = gameLeagues.count || 0;
      const availableLeagues: any[] = [];

      yahooLogger.info('YAHOO_PARSE', 'Found leagues structure', {
        leagueCount,
        leaguesKeys: Object.keys(gameLeagues).filter(k => k !== 'count'),
      });

      // ✅ FIX: Parse leagues using numbered keys correctly
      for (let i = 0; i < leagueCount; i++) {
        const leagueEntry = gameLeagues[i.toString()];
        if (leagueEntry?.league?.[0]) {
          availableLeagues.push(leagueEntry.league[0]);
        }
      }

      yahooLogger.info('YAHOO_PARSE', 'Successfully parsed leagues', {
        expectedCount: leagueCount,
        actualCount: availableLeagues.length,
        leagueKeys: availableLeagues.map(l => l.league_key),
      });

      return availableLeagues;
    } catch (error) {
      yahooLogger.error('YAHOO_PARSE', 'Failed to parse leagues response', error);
      throw new Error(`League parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, []);

  /**
   * ✅ FIXED: Fetch available leagues with proper error handling and stable dependencies
   */
  const fetchAvailableLeagues = useCallback(async (): Promise<void> => {
    if (!isConnected) {
      yahooLogger.warn('YAHOO_API', 'Skipping fetch - not connected');
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Get fresh tokens each time to avoid cached stale tokens
      const raw = localStorage.getItem('yahoo_oauth_tokens');
      const tokens = raw ? JSON.parse(raw) : null;
      yahooLogger.info('YAHOO_DATA', 'Starting fetchAvailableLeagues', {
        hasAccessToken: !!tokens?.access_token,
        tokenPreview: tokens?.access_token?.substring(0, 20) + '...'
      });

      if (!tokens?.access_token) {
        yahooLogger.error('YAHOO_DATA', 'No access token available');
        throw new Error('Not authenticated');
      }

      const requestPayload = {
        endpoint: 'getUserLeagues',
        accessToken: tokens.access_token,
      };
      
      yahooLogger.info('YAHOO_DATA', 'Request payload prepared', { endpoint: requestPayload.endpoint });

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(requestPayload),
      };

      yahooLogger.logAPICall('YAHOO_DATA', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, requestOptions);
      
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, requestOptions);

      yahooLogger.info('YAHOO_DATA', 'Received API response', { 
        status: resp.status, 
        statusText: resp.statusText,
        ok: resp.ok 
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        yahooLogger.error('YAHOO_DATA', 'API request failed', {
          status: resp.status,
          statusText: resp.statusText,
          errorResponse: errorText
        });
        throw new Error(`API Error: ${resp.status} - ${errorText}`);
      }

      const text = await resp.text();
      yahooLogger.debug('YAHOO_DATA', 'Raw response text received', { 
        textLength: text.length,
        textPreview: text.substring(0, 200) + '...'
      });
      
      const data = JSON.parse(text);
      yahooLogger.debug('YAHOO_DATA', 'Parsed API response', {
        hasFantasyContent: !!data?.fantasy_content,
        hasUsers: !!data?.fantasy_content?.users,
        dataStructure: Object.keys(data || {})
      });

      // ✅ FIX: Use the corrected parsing logic
      const availableLeagues = parseYahooLeaguesResponse(data);
      
      // ✅ FIX: Update ref to break dependency loops
      availableLeaguesRef.current = availableLeagues;

      setState(prev => ({
        ...prev,
        availableLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      }));

      yahooLogger.info('YAHOO_DATA', 'Yahoo leagues successfully fetched and stored', { 
        count: availableLeagues.length,
        leagueNames: availableLeagues.map((l: any) => l.name).slice(0, 3)
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
      yahooLogger.error('YAHOO_DATA', 'fetchAvailableLeagues failed', {
        error: message,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      setState(prev => ({
        ...prev,
        error: message,
        isLoading: false,
      }));
      
      if (message.includes('token expired') || message.includes('401')) {
        yahooLogger.warn('YAHOO_DATA', 'Token appears to be expired, requesting reconnection');
        toast({
          title: 'Yahoo Token Expired',
          description: 'Please reconnect to Yahoo',
          variant: 'destructive',
        });
      }
    }
  }, [isConnected, parseYahooLeaguesResponse]); // ✅ FIX: Stable dependencies only

  /**
   * ✅ FIXED: Separate function for fetching league details with stable dependencies
   */
  const fetchLeagueDetails = useCallback(async (leagueIds: string[]): Promise<LeagueData[]> => {
    if (!isConnected || leagueIds.length === 0) {
      return [];
    }

    // Get fresh tokens each time to avoid cached stale tokens
    const raw = localStorage.getItem('yahoo_oauth_tokens');
    const tokens = raw ? JSON.parse(raw) : null;
    if (!tokens?.access_token) {
      throw new Error('Not authenticated');
    }

    const detailedLeagues: LeagueData[] = [];
    const currentAvailableLeagues = availableLeaguesRef.current; // ✅ FIX: Use ref to avoid dependency
    
    for (const leagueKey of leagueIds) {
      try {
        const leagueInfo = currentAvailableLeagues.find((l: any) => l.league_key === leagueKey);
        if (!leagueInfo) continue;

        const requestPayload = {
          endpoint: 'getLeagueScoreboard',
          accessToken: tokens.access_token,
          leagueKey,
        };

        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(requestPayload),
        });

        if (!resp.ok) continue;

        const sbText = await resp.text();
        const sb = JSON.parse(sbText);

        // ✅ TODO: Enhance scoreboard parsing based on actual Yahoo API response structure
        // For now, create basic league data entries
        const commonLeague: LeagueData = {
          id: leagueInfo.league_key,
          platform: 'Yahoo',
          leagueName: leagueInfo.name,
          teamName: 'My Team', // ✅ TODO: Parse actual team name from scoreboard
          myScore: 0, // ✅ TODO: Parse actual scores
          opponentName: 'TBD',
          opponentScore: 0,
          record: '0-0-0', // ✅ TODO: Parse actual record
          leaguePosition: '1', // ✅ TODO: Parse actual position
          status: 'active',
          scoringEvents: [],
          lastUpdated: new Date().toISOString(),
        };

        detailedLeagues.push(commonLeague);
      } catch (e) {
        yahooLogger.error('YAHOO_API', `Failed to fetch details for ${leagueKey}`, e);
        // Continue with other leagues
      }
    }

    return detailedLeagues;
  }, [isConnected]); // ✅ FIX: Minimal stable dependencies

  // ✅ FIX: Effect to fetch available leagues when connected - stable dependencies
  useEffect(() => {
    if (isConnected && hasInitializedRef.current) {
      fetchAvailableLeagues();
    }
  }, [isConnected]); // ✅ FIX: Remove fetchAvailableLeagues from dependencies to break loop

  // ✅ FIX: Effect to fetch league data when enabled leagues change - NO state dependencies
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!hasInitializedRef.current || !isConnected || enabledIds.length === 0) {
      setState(prev => ({ ...prev, leagues: [] }));
      return;
    }

    // ✅ FIX: Only trigger when we have available leagues (use ref to avoid dependency loop)
    if (availableLeaguesRef.current.length > 0) {
      timeoutRef.current = setTimeout(async () => {
        setState(prev => ({ ...prev, isLoading: true }));
        
        try {
          const detailedLeagues = await fetchLeagueDetails(enabledIds);
          setState(prev => ({
            ...prev,
            leagues: detailedLeagues,
            isLoading: false,
            lastUpdated: new Date().toISOString(),
          }));
        } catch (error) {
          setState(prev => ({
            ...prev,
            error: error instanceof Error ? error.message : 'Failed to fetch league data',
            isLoading: false,
          }));
        }
      }, 500);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabledIds.join(','), isConnected, fetchLeagueDetails]); // ✅ FIX: Stable dependencies only

  // ✅ FIX: Sync availableLeaguesRef when state updates
  useEffect(() => {
    availableLeaguesRef.current = state.availableLeagues;
  }, [state.availableLeagues]);

  // Get enabled league IDs from saved selections
  const getEnabledLeagueIds = useCallback(() => {
    return savedSelections.filter(s => s.enabled).map(s => s.leagueId);
  }, [savedSelections]);

  // Refresh all data - simple function
  const refreshData = useCallback(async () => {
    yahooLogger.info('YAHOO_DATA', 'Starting full data refresh');
    try {
      await fetchAvailableLeagues();
      // League details will be fetched automatically by the effect
    } catch (error) {
      yahooLogger.error('YAHOO_DATA', 'Full data refresh failed', {
        error: error instanceof Error ? error.message : error
      });
    }
  }, [fetchAvailableLeagues]);

  return {
    ...state,
    savedSelections,
    saveLeagueSelections,
    getEnabledLeagueIds,
    refreshData,
    fetchAvailableLeagues,
  };
};
