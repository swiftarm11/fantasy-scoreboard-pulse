import { useState, useEffect, useCallback, useRef } from 'react';
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

export const useYahooData = (enabledLeagueIds?: string[]) => {
  const { isConnected, getStoredTokens } = useYahooOAuth();
  const [state, setState] = useState<YahooDataState>({
    leagues: [],
    availableLeagues: [],
    isLoading: false,
    error: null,
    lastUpdated: null,
  });

  const [savedSelections, setSavedSelections] = useState<YahooLeagueSelection[]>([]);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved selections from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSavedSelections(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading saved Yahoo league selections:', error);
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

  // Get enabled league IDs from saved selections
  const getEnabledLeagueIds = useCallback(() => {
    return savedSelections.filter(s => s.enabled).map(s => s.leagueId);
  }, [savedSelections]);

  // Fetch available leagues from Yahoo API
  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const tokens = getStoredTokens();
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

      // Parse Yahoo API response structure
      const usersNode = data?.fantasy_content?.users?.[0]?.user;
      const gamesNode = usersNode?.[1]?.games?.[0]?.game;
      const leaguesNode = gamesNode?.[1]?.leagues;

      const availableLeagues = [];
      if (leaguesNode && leaguesNode.count > 0) {
        for (let i = 0; i < leaguesNode.count; i++) {
          const entry = leaguesNode[i.toString()];
          if (entry?.league?.[0]) {
            availableLeagues.push(entry.league[0]);
          }
        }
      }

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
  }, [isConnected, getStoredTokens]);

  // Fetch detailed league data for enabled leagues
  const fetchLeagueData = useCallback(async (leagueIds: string[]) => {
    yahooLogger.info('YAHOO_DATA', 'Starting fetchLeagueData', {
      isConnected,
      leagueCount: leagueIds.length,
      leagueIds: leagueIds.slice(0, 3)
    });

    if (!isConnected || leagueIds.length === 0) {
      yahooLogger.info('YAHOO_DATA', 'Skipping league data fetch', {
        reason: !isConnected ? 'not connected' : 'no leagues enabled'
      });
      setState(prev => ({ ...prev, leagues: [] }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const tokens = getStoredTokens();
      if (!tokens?.access_token) {
        yahooLogger.error('YAHOO_DATA', 'No access token for league data fetch');
        throw new Error('Not authenticated');
      }

      const detailedLeagues: LeagueData[] = [];

      for (const leagueKey of leagueIds) {
        yahooLogger.info('YAHOO_DATA', 'Fetching league details', { leagueKey });
        
        try {
          const leagueInfo = state.availableLeagues.find((l: any) => l.league_key === leagueKey);
          if (!leagueInfo) {
            yahooLogger.warn('YAHOO_DATA', 'League info not found in available leagues', { leagueKey });
            continue;
          }

          const requestPayload = {
            endpoint: 'getLeagueScoreboard',
            accessToken: tokens.access_token,
            leagueKey,
          };

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

          if (!resp.ok) {
            const errorText = await resp.text();
            yahooLogger.error('YAHOO_DATA', 'League scoreboard fetch failed', {
              leagueKey,
              status: resp.status,
              statusText: resp.statusText,
              errorResponse: errorText
            });
            throw new Error(errorText);
          }

          const sbText = await resp.text();
          yahooLogger.debug('YAHOO_DATA', 'League scoreboard response received', {
            leagueKey,
            responseLength: sbText.length
          });
          
          const sb = JSON.parse(sbText);

          // Map Yahoo API response to LeagueData interface
          const team0 = sb?.fantasy_content?.league?.[0]?.teams?.team;
          const team1 = sb?.fantasy_content?.league?.scoreboard?.teams?.team?.[1];
          const standings0 = team0?.team_standings?.outcome_totals;
          const rank0 = sb?.fantasy_content?.league?.scoreboard?.teams?.team?.team_standings?.rank;

          yahooLogger.debug('YAHOO_DATA', 'Parsing league data', {
            leagueKey,
            hasTeam0: !!team0,
            hasTeam1: !!team1,
            hasStandings: !!standings0,
            rank: rank0
          });

          const commonLeague: LeagueData = {
            id: leagueInfo.league_key,
            platform: 'Yahoo',
            leagueName: leagueInfo.name,
            teamName: team0?.name?.[0] || 'Your Team',
            myScore: parseFloat(team0?.team_points?.total || '0'),
            opponentName: team1?.name || 'Opponent',
            opponentScore: parseFloat(team1?.team_points?.total || '0'),
            record: `${standings0?.wins}-${standings0?.losses}-${standings0?.ties || 0}`,
            leaguePosition: (rank0 ? parseInt(rank0) : 1).toString(),
            status: sb?.fantasy_content?.league?.scoreboard?.status || 'active',
            scoringEvents: [],
            lastUpdated: new Date().toISOString(),
          };

          detailedLeagues.push(commonLeague);
          yahooLogger.info('YAHOO_DATA', 'League data parsed successfully', {
            leagueKey,
            leagueName: commonLeague.leagueName,
            teamName: commonLeague.teamName,
            record: commonLeague.record
          });
        } catch (e) {
          yahooLogger.error('YAHOO_DATA', 'Failed to fetch details for league', {
            leagueKey,
            error: e instanceof Error ? e.message : e,
            errorType: e instanceof Error ? e.constructor.name : typeof e
          });
        }
      }

      setState(prev => ({
        ...prev,
        leagues: detailedLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      }));

      yahooLogger.info('YAHOO_DATA', 'All detailed leagues loaded successfully', {
        totalRequested: leagueIds.length,
        successfullyLoaded: detailedLeagues.length,
        failed: leagueIds.length - detailedLeagues.length
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch league data';
      yahooLogger.error('YAHOO_DATA', 'fetchLeagueData failed completely', {
        error: msg,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        stack: error instanceof Error ? error.stack : undefined,
        leagueIds
      });
      
      setState(prev => ({
        ...prev,
        error: msg,
        isLoading: false,
      }));
    }
  }, [isConnected, state.availableLeagues, getStoredTokens]);

  // Auto-fetch available leagues when connected
  useEffect(() => {
    if (isConnected) {
      fetchAvailableLeagues();
    }
  }, [isConnected, fetchAvailableLeagues]);

  // Auto-fetch league data when enabled leagues change
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const enabledIds = getEnabledLeagueIds();
    if (enabledIds.length > 0 && state.availableLeagues.length > 0) {
      timeoutRef.current = setTimeout(() => {
        fetchLeagueData(enabledIds);
      }, 500);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [savedSelections, fetchLeagueData, state.availableLeagues, getEnabledLeagueIds]);

  // Refresh all data
  const refreshData = useCallback(async () => {
    yahooLogger.info('YAHOO_DATA', 'Starting full data refresh');
    try {
      await fetchAvailableLeagues();
      const enabledIds = getEnabledLeagueIds();
      if (enabledIds.length > 0) {
        await fetchLeagueData(enabledIds);
      }
      yahooLogger.info('YAHOO_DATA', 'Full data refresh completed successfully');
    } catch (error) {
      yahooLogger.error('YAHOO_DATA', 'Full data refresh failed', {
        error: error instanceof Error ? error.message : error
      });
    }
  }, [fetchAvailableLeagues, fetchLeagueData, getEnabledLeagueIds]);

  return {
    ...state,
    savedSelections,
    saveLeagueSelections,
    getEnabledLeagueIds,
    refreshData,
    fetchAvailableLeagues,
  };
};
