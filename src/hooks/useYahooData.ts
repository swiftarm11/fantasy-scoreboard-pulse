// src/hooks/useYahooData.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { LeagueData } from '../types/fantasy';
import { useYahooOAuth } from './useYahooOAuth';
import { debugLogger } from '../utils/debugLogger';
import { toast } from '../components/ui/use-toast';

interface YahooLeagueSelection {
  leagueId: string;
  leagueName: string;
  enabled: boolean;
  platform: 'Yahoo';
}

interface YahooDataState {
  leagues: LeagueData[];
  availableLeagues: any[];
  savedSelections: YahooLeagueSelection[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

const YAHOO_SELECTIONS_KEY = 'yahoo_league_selections';

export const useYahooData = (enabledLeagueIds?: string[]) => {
  const { isConnected, getStoredTokens } = useYahooOAuth();
  const [state, setState] = useState<YahooDataState>({
    leagues: [],
    availableLeagues: [],
    savedSelections: [],
    isLoading: false,
    error: null,
    lastUpdated: null,
  });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load saved selections from localStorage on mount
  const loadSavedSelections = useCallback(() => {
    try {
      const saved = localStorage.getItem(YAHOO_SELECTIONS_KEY);
      if (saved) {
        const selections = JSON.parse(saved) as YahooLeagueSelection[];
        setState(prev => ({ ...prev, savedSelections: selections }));
        debugLogger.info('YAHOO_SELECTIONS', 'Loaded saved selections', { count: selections.length });
        return selections;
      }
    } catch (error) {
      debugLogger.error('YAHOO_SELECTIONS', 'Failed to load saved selections', error);
    }
    return [];
  }, []);

  // Save league selections to localStorage
  const saveLeagueSelections = useCallback((selections: YahooLeagueSelection[]) => {
    try {
      localStorage.setItem(YAHOO_SELECTIONS_KEY, JSON.stringify(selections));
      setState(prev => ({ ...prev, savedSelections: selections }));
      debugLogger.info('YAHOO_SELECTIONS', 'Saved league selections', { count: selections.length });
    } catch (error) {
      debugLogger.error('YAHOO_SELECTIONS', 'Failed to save selections', error);
      toast({
        title: 'Error',
        description: 'Failed to save league selections',
        variant: 'destructive',
      });
    }
  }, []);

  // Get enabled league IDs from saved selections
  const getEnabledLeagueIds = useCallback(() => {
    return state.savedSelections
      .filter(selection => selection.enabled)
      .map(selection => selection.leagueId);
  }, [state.savedSelections]);

  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const tokens = getStoredTokens();
      if (!tokens?.accesstoken) {
        throw new Error('Not authenticated');
      }

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'getLeagues',
          accessToken: tokens.accesstoken,
        }),
      });

      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      const text = await resp.text();
      const data = JSON.parse(text);
      
      // FIXED: Correct parsing based on the actual Yahoo API response structure
      const usersNode = data.fantasy_content.users[0].user;
      const gamesNode = usersNode[1].games[0].game;
      const leaguesNode = gamesNode[1].leagues;

      const availableLeagues = [];
      for (let i = 0; i < leaguesNode.count; i++) {
        const entry = leaguesNode[i.toString()];
        if (entry?.league?.[0]) {
          availableLeagues.push(entry.league[0]);
        }
      }

      setState(prev => ({
        ...prev,
        availableLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      }));

      debugLogger.info('YAHOO_API', 'Yahoo leagues fetched', { availableLeagues });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      debugLogger.error('YAHOO_API', 'Fetch leagues failed', error);
      
      if (message.includes('token expired')) {
        toast({
          title: 'Yahoo Token Expired',
          description: 'Reconnect please',
          variant: 'destructive',
        });
      }
    }
  }, [isConnected, getStoredTokens]);

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

          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              action: 'getLeagueScoreboard',
              accessToken: tokens.accesstoken,
              leagueKey,
            }),
          });

          if (!resp.ok) {
            throw new Error(await resp.text());
          }

          const sbText = await resp.text();
          const sb = JSON.parse(sbText);

          // Map to LeagueData
          const team0 = sb.fantasy_content.league[0].teams.team;
          const team1 = sb.fantasy_content.league.scoreboard.teams.team[1];
          const standings0 = team0.team_standings.outcome_totals;
          const rank0 = sb.fantasy_content.league.scoreboard.teams.team.team_standings.rank;

          const commonLeague: LeagueData = {
            id: leagueInfo.league_key,
            platform: 'Yahoo',
            leagueName: leagueInfo.name,
            teamName: team0.name[0],
            myScore: parseFloat(team0.team_points.total),
            opponentName: team1.name,
            opponentScore: parseFloat(team1.team_points.total),
            record: `${standings0.wins}-${standings0.losses}-${standings0.ties?.toString() || '0'}`,
            leaguePosition: parseInt(rank0),
            status: sb.fantasy_content.league.scoreboard.status,
            scoringEvents: [],
            lastUpdated: new Date().toISOString(),
          };

          detailedLeagues.push(commonLeague);
        } catch (e) {
          debugLogger.error('YAHOO_API', `Failed detail for ${leagueKey}`, e);
        }
      }

      setState(prev => ({
        ...prev,
        leagues: detailedLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString(),
      }));

      debugLogger.success('YAHOO_API', 'Detailed leagues loaded', { detailedLeagues });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed fetch league data';
      setState(prev => ({ ...prev, error: msg, isLoading: false }));
      debugLogger.error('YAHOO_API', 'Fetch league data failed', error);
    }
  }, [isConnected, state.availableLeagues, getStoredTokens]);

  // Load saved selections on mount
  useEffect(() => {
    loadSavedSelections();
  }, [loadSavedSelections]);

  // Fetch available leagues when connected
  useEffect(() => {
    fetchAvailableLeagues();
  }, [isConnected, fetchAvailableLeagues]);

  // Fetch league data when enabled leagues change
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Use enabledLeagueIds parameter if provided, otherwise use saved selections
    const leagueIds = enabledLeagueIds || getEnabledLeagueIds();
    
    if (leagueIds.length > 0 && state.availableLeagues.length > 0) {
      timeoutRef.current = setTimeout(() => {
        fetchLeagueData(leagueIds);
      }, 500);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabledLeagueIds, getEnabledLeagueIds, fetchLeagueData, state.availableLeagues]);

  const refreshData = useCallback(() => {
    fetchAvailableLeagues().then(() => {
      const leagueIds = enabledLeagueIds || getEnabledLeagueIds();
      if (leagueIds.length > 0) {
        fetchLeagueData(leagueIds);
      }
    });
  }, [fetchAvailableLeagues, fetchLeagueData, enabledLeagueIds, getEnabledLeagueIds]);

  return {
    ...state,
    refreshData,
    fetchAvailableLeagues,
    saveLeagueSelections,
    getEnabledLeagueIds,
  };
};
