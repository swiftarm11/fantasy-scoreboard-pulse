import { useState, useEffect, useCallback, useRef } from 'react';
import { LeagueData } from '../types/fantasy';
import { useYahooOAuth } from './useYahooOAuth';
import { debugLogger } from '../utils/debugLogger';
import { toast } from '../components/ui/use-toast';

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
      console.log('🔍 Tokens for API call:', { 
        hasAccessToken: !!tokens?.accesstoken,
        tokenPreview: tokens?.accesstoken?.substring(0, 20) + '...'
      });

      if (!tokens?.accesstoken) {
        throw new Error('Not authenticated');
      }

      const requestPayload = {
        endpoint: 'getUserLeagues', // Changed from 'action' to 'endpoint'
        accessToken: tokens.accesstoken,
      };
      
      console.log('📤 Request payload:', requestPayload);

      // FIXED: Call yahoo-api function instead of yahoo-oauth
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(requestPayload),
      });

      console.log('📥 Response status:', resp.status);
      
      if (!resp.ok) {
        const errorText = await resp.text();
        console.error('❌ API Error Response:', errorText);
        throw new Error(`API Error: ${resp.status} - ${errorText}`);
      }

      const text = await resp.text();
      const data = JSON.parse(text);
      
      console.log('Raw API response:', data);

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

      debugLogger.info('YAHOO_API', 'Yahoo leagues fetched', { count: availableLeagues.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
      setState(prev => ({
        ...prev,
        error: message,
        isLoading: false,
      }));
      
      debugLogger.error('YAHOO_API', 'Fetch leagues failed', error);
      
      if (message.includes('token expired')) {
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
    if (!isConnected || leagueIds.length === 0) {
      setState(prev => ({ ...prev, leagues: [] }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const tokens = getStoredTokens();
      if (!tokens?.accesstoken) {
        throw new Error('Not authenticated');
      }

      const detailedLeagues: LeagueData[] = [];

      for (const leagueKey of leagueIds) {
        try {
          const leagueInfo = state.availableLeagues.find((l: any) => l.league_key === leagueKey);
          if (!leagueInfo) continue;

          // FIXED: Call yahoo-api function instead of yahoo-oauth
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              endpoint: 'getLeagueScoreboard', // Changed from 'action' to 'endpoint'
              accessToken: tokens.accesstoken,
              leagueKey,
            }),
          });

          if (!resp.ok) {
            throw new Error(await resp.text());
          }

          const sbText = await resp.text();
          const sb = JSON.parse(sbText);

          // Map Yahoo API response to LeagueData interface
          const team0 = sb?.fantasy_content?.league?.[0]?.teams?.team;
          const team1 = sb?.fantasy_content?.league?.scoreboard?.teams?.team?.[1];
          const standings0 = team0?.team_standings?.outcome_totals;
          const rank0 = sb?.fantasy_content?.league?.scoreboard?.teams?.team?.team_standings?.rank;

          const commonLeague: LeagueData = {
            id: leagueInfo.league_key,
            platform: 'Yahoo',
            leagueName: leagueInfo.name,
            teamName: team0?.name?.[0] || 'Your Team',
            myScore: parseFloat(team0?.team_points?.total || '0'),
            opponentName: team1?.name || 'Opponent',
            opponentScore: parseFloat(team1?.team_points?.total || '0'),
            record: `${standings0?.wins}-${standings0?.losses}-${standings0?.ties || 0}`,
            leaguePosition: parseInt(rank0 || '1'),
            status: sb?.fantasy_content?.league?.scoreboard?.status || 'active',
            scoringEvents: [],
            lastUpdated: new Date().toISOString(),
          };

          detailedLeagues.push(commonLeague);
        } catch (e) {
          debugLogger.error('YAHOO_API', 'Failed to fetch details for league', { leagueKey, error: e });
        }
      }

      setState(prev => ({
        ...prev,
        leagues: detailedLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      }));

      debugLogger.success('YAHOO_API', 'Detailed leagues loaded', { count: detailedLeagues.length });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to fetch league data';
      setState(prev => ({
        ...prev,
        error: msg,
        isLoading: false,
      }));
      
      debugLogger.error('YAHOO_API', 'Fetch league data failed', error);
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
    await fetchAvailableLeagues();
    const enabledIds = getEnabledLeagueIds();
    if (enabledIds.length > 0) {
      await fetchLeagueData(enabledIds);
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
