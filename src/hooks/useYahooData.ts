// src/hooks/useYahooData.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { yahooOAuth } from '../utils/yahooOAuth';
import { useSimulationManager } from './useSimulationManager';
import type { LeagueData, MatchupData, PlayerData } from '../utils/config';

// Types for our data structures
interface YahooApiResponse {
  fantasy_content: {
    users: Array<{
      user: Array<{
        games: {
          [key: string]: {
            game: Array<{
              leagues?: {
                [key: string]: {
                  league: LeagueData[];
                };
              };
            }>;
          };
        };
      }>;
    }>;
  };
}

interface UseYahooDataReturn {
  leagues: LeagueData[];
  loading: boolean;
  error: string | null;
  isConnected: boolean;
  refreshData: () => Promise<void>;
  fetchLeagueMatchups: (leagueKey: string, week?: number) => Promise<MatchupData[]>;
  fetchLeagueRosters: (leagueKey: string) => Promise<PlayerData[]>;
  lastUpdated: Date | null;
}

export const useYahooData = (): UseYahooDataReturn => {
  // Simulation integration
  const { simulationConfig } = useSimulationManager();
  
  // State management
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Refs for polling control
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchTime = useRef<number>(0);
  const MINIMUM_FETCH_INTERVAL = 5000; // 5 second minimum between fetches

  // Check if we're connected to Yahoo OAuth
  const isConnected = yahooOAuth?.isConnected() || false;

  // Fetch simulation data
  const fetchSimulationData = async (): Promise<LeagueData[]> => {
    console.log('🎮 [SIMULATION] Fetching mock league data');
    
    try {
      // Try to fetch from local testdata first
      const response = await fetch('/testdata/leagues.json');
      
      if (response.ok) {
        const mockData = await response.json();
        console.log('🎮 [SIMULATION] Successfully loaded mock data:', {
          leaguesCount: mockData.leagues?.length || 0,
          dataSource: 'local'
        });
        
        // Transform mock data to match your LeagueData interface
        return mockData.leagues || mockData || [];
      }
      
      // Fallback to GitHub raw if local doesn't exist
      const githubResponse = await fetch('https://raw.githubusercontent.com/swiftarm11/fantasy-scoreboard-pulse/main/public/testdata/leagues.json');
      
      if (githubResponse.ok) {
        const mockData = await githubResponse.json();
        console.log('🎮 [SIMULATION] Successfully loaded mock data from GitHub:', {
          leaguesCount: mockData.leagues?.length || 0,
          dataSource: 'github'
        });
        
        return mockData.leagues || mockData || [];
      }
      
      throw new Error('Mock data not available');
      
    } catch (error) {
      console.warn('🎮 [SIMULATION] Failed to fetch mock data, using fallback:', error);
      
      // Return fallback mock data
      return [
        {
          league_key: 'sim_league_1',
          league_id: '1',
          name: 'Simulation League 1',
          num_teams: 12,
          season: '2024',
          current_week: simulationConfig.currentWeek.toString(),
          start_week: '1',
          end_week: '17',
          is_finished: 0,
          url: '',
          logo_url: '',
          draft_status: 'postdraft',
          max_teams: 12,
          weekly_deadline: '',
          league_update_timestamp: Date.now().toString(),
          scoring_type: 'head2head',
          league_type: 'private',
          renew: '',
          renewed: '',
          iris_group_chat_id: '',
          allow_add_to_dl_extra_pos: 1,
          is_pro_league: '0',
          is_cash_league: '0',
          current_week_number: simulationConfig.currentWeek,
          teams: []
        }
      ];
    }
  };

  // Fetch real Yahoo data
  const fetchYahooData = async (): Promise<LeagueData[]> => {
    console.log('[YAHOO INFO] YAHOO_DATA: Starting fetchAvailableLeagues', {
      hasAccessToken: !!yahooOAuth?.getTokens()?.access_token,
      tokenPreview: yahooOAuth?.getTokens()?.access_token?.substring(0, 20) + '...'
    });

    if (!yahooOAuth?.isConnected()) {
      throw new Error('Yahoo OAuth not connected');
    }

    const tokens = yahooOAuth.getTokens();
    if (!tokens?.access_token) {
      throw new Error('No access token available');
    }

    // Prepare request payload
    const payload = {
      endpoint: 'getUserLeagues',
      accessToken: tokens.access_token
    };

    console.log('[YAHOO INFO] YAHOO_DATA: Request payload prepared', {
      endpoint: payload.endpoint
    });

    // Make API call through Supabase edge function
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload)
    });

    console.log('[YAHOO INFO] YAHOO_DATA: API call completed', {
      request: payload,
      response: {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[YAHOO ERROR] API call failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Yahoo API call failed: ${response.status} ${response.statusText}`);
    }

    console.log('[YAHOO INFO] YAHOO_DATA: Received API response', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    const responseText = await response.text();
    
    console.log('[YAHOO DEBUG] YAHOO_DATA: Raw response text received', {
      textLength: responseText.length,
      textPreview: responseText.substring(0, 100) + '...'
    });

    let parsedResponse: YahooApiResponse;
    try {
      parsedResponse = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[YAHOO ERROR] Failed to parse API response:', parseError);
      throw new Error('Invalid JSON response from Yahoo API');
    }

    console.log('[YAHOO DEBUG] YAHOO_DATA: Parsed API response', {
      hasFantasyContent: !!parsedResponse.fantasy_content,
      hasUsers: !!parsedResponse.fantasy_content?.users,
      dataStructure: Object.keys(parsedResponse)
    });

    // Extract leagues from the response
    const extractedLeagues: LeagueData[] = [];
    
    try {
      const users = parsedResponse.fantasy_content?.users;
      if (users && Array.isArray(users)) {
        users.forEach(userWrapper => {
          const user = userWrapper.user;
          if (Array.isArray(user)) {
            user.forEach(userItem => {
              const games = userItem.games;
              if (games) {
                Object.values(games).forEach(gameWrapper => {
                  if (gameWrapper.game && Array.isArray(gameWrapper.game)) {
                    gameWrapper.game.forEach(gameItem => {
                      const leagues = gameItem.leagues;
                      if (leagues) {
                        Object.values(leagues).forEach(leagueWrapper => {
                          if (leagueWrapper.league && Array.isArray(leagueWrapper.league)) {
                            extractedLeagues.push(...leagueWrapper.league);
                          }
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    } catch (extractError) {
      console.error('[YAHOO ERROR] Failed to extract leagues from response:', extractError);
      throw new Error('Failed to parse league data from Yahoo response');
    }

    console.log('[YAHOO INFO] YAHOO_DATA: Yahoo leagues successfully fetched and stored', {
      count: extractedLeagues.length,
      leagueNames: extractedLeagues.slice(0, 3).map(l => l.name)
    });

    return extractedLeagues;
  };

  // Main fetch function that handles simulation vs real data
  const fetchAvailableLeagues = useCallback(async (): Promise<void> => {
    // Debouncing to prevent rapid consecutive calls
    const now = Date.now();
    if (now - lastFetchTime.current < MINIMUM_FETCH_INTERVAL) {
      console.info('Debouncing data fetch - minimum interval enforced');
      return;
    }
    lastFetchTime.current = now;

    setLoading(true);
    setError(null);

    try {
      let fetchedLeagues: LeagueData[];

      // Check if simulation mode is enabled
      if (simulationConfig.enabled) {
        console.log('🎮 [SIMULATION] Mode enabled - fetching mock data');
        fetchedLeagues = await fetchSimulationData();
      } else {
        console.log('📊 [LIVE] Mode enabled - fetching real Yahoo data');
        fetchedLeagues = await fetchYahooData();
      }

      setLeagues(fetchedLeagues);
      setLastUpdated(new Date());
      
      console.log(`✅ Data fetch completed - ${simulationConfig.enabled ? 'SIMULATION' : 'LIVE'} mode`, {
        leagueCount: fetchedLeagues.length,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('❌ Data fetch failed:', err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [simulationConfig.enabled, simulationConfig.currentWeek]);

  // Fetch league matchups
  const fetchLeagueMatchups = useCallback(async (leagueKey: string, week?: number): Promise<MatchupData[]> => {
    console.log(`[MATCHUPS] Fetching for league: ${leagueKey}, week: ${week || 'current'}`);
    
    if (simulationConfig.enabled) {
      try {
        const weekParam = week || simulationConfig.currentWeek;
        const response = await fetch(`/testdata/matchups/league_${leagueKey}_week_${weekParam}.json`);
        if (response.ok) {
          const mockMatchups = await response.json();
          return mockMatchups.matchups || [];
        }
      } catch (error) {
        console.warn('Mock matchups not available, returning empty array');
      }
      return [];
    }

    // Real Yahoo API matchup fetching would go here
    // For now, return empty array
    return [];
  }, [simulationConfig.enabled, simulationConfig.currentWeek]);

  // Fetch league rosters
  const fetchLeagueRosters = useCallback(async (leagueKey: string): Promise<PlayerData[]> => {
    console.log(`[ROSTERS] Fetching for league: ${leagueKey}`);
    
    if (simulationConfig.enabled) {
      try {
        const response = await fetch(`/testdata/rosters/league_${leagueKey}.json`);
        if (response.ok) {
          const mockRosters = await response.json();
          return mockRosters.players || [];
        }
      } catch (error) {
        console.warn('Mock rosters not available, returning empty array');
      }
      return [];
    }

    // Real Yahoo API roster fetching would go here
    // For now, return empty array
    return [];
  }, [simulationConfig.enabled]);

  // Manual refresh function
  const refreshData = useCallback(async (): Promise<void> => {
    console.log('🔄 Manual data refresh triggered');
    await fetchAvailableLeagues();
  }, [fetchAvailableLeagues]);

  // Auto-polling setup
  const startPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    
    const POLLING_INTERVAL = 15000; // 15 seconds
    console.info(`Starting polling with ${POLLING_INTERVAL}ms interval`);
    
    pollingRef.current = setInterval(() => {
      fetchAvailableLeagues();
    }, POLLING_INTERVAL);
  }, [fetchAvailableLeagues]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      console.info('Stopped polling');
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Effects
  useEffect(() => {
    if (isConnected) {
      fetchAvailableLeagues();
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [isConnected, fetchAvailableLeagues, startPolling, stopPolling]);

  // Re-fetch when simulation config changes
  useEffect(() => {
    if (isConnected) {
      console.log('🔄 Simulation config changed - refreshing data', {
        enabled: simulationConfig.enabled,
        currentWeek: simulationConfig.currentWeek
      });
      fetchAvailableLeagues();
    }
  }, [simulationConfig.enabled, simulationConfig.currentWeek, fetchAvailableLeagues, isConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    leagues,
    loading,
    error,
    isConnected,
    refreshData,
    fetchLeagueMatchups,
    fetchLeagueRosters,
    lastUpdated
  };
};
