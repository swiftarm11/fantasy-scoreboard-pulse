// src/hooks/useYahooData.ts

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

export const useYahooData = (enabledLeagueIds: string[] = []) => {
  const { isConnected, getStoredTokens } = useYahooOAuth();
  const [state, setState] = useState<YahooDataState>({
    leagues: [],
    availableLeagues: [],
    isLoading: false,
    error: null,
    lastUpdated: null
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) return;
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const tokens = getStoredTokens();
      if (!tokens?.access_token) throw new Error('Not authenticated');

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ action: 'getLeagues', accessToken: tokens.access_token })
        }
      );
      if (!resp.ok) throw new Error(await resp.text());

      const text = await resp.text();
      const data = JSON.parse(text);

      const usersNode = data.fantasy_content.users["0"].user;
      const gamesNode = usersNode[1].games["0"].game;
      const leaguesNode = gamesNode[1].leagues;

      const availableLeagues = [];
      for (let i = 0; i < leaguesNode.count; i++) {
        const entry = leaguesNode[i.toString()];
        if (entry?.league?.[0]) {
          availableLeagues.push(entry.league);
        }
      }

      setState(prev => ({
        ...prev,
        availableLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString()
      }));
      debugLogger.info('YAHOO_API', 'Yahoo leagues fetched', availableLeagues);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      debugLogger.error('YAHOO_API', 'Fetch leagues failed', error);
      if (message.includes('token expired')) {
        toast({ title: 'Yahoo Token Expired', description: 'Reconnect please', variant: 'destructive' });
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
      if (!tokens?.access_token) throw new Error('Not authenticated');

      const detailedLeagues: LeagueData[] = [];
      for (const leagueKey of leagueIds) {
        try {
          const leagueInfo = state.availableLeagues.find((l: any) => l.league_key === leagueKey);
          if (!leagueInfo) continue;

          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
              },
              body: JSON.stringify({
                action: 'getLeagueScoreboard',
                accessToken: tokens.access_token,
                leagueKey
              })
            }
          );
          if (!resp.ok) throw new Error(await resp.text());
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
            record: `${standings0.wins}-${standings0.losses}-${standings0.ties?.toString() || 0}`,
            leaguePosition: parseInt(rank0),
            status: sb.fantasy_content.league.scoreboard.status,
            scoringEvents: [], 
            lastUpdated: new Date().toISOString()
          };
          detailedLeagues.push(commonLeague);
        } catch (e) {
          debugLogger.error('YAHOO_API', `Failed detail for ${leagueKey}`, e);
        }
      }

      setState(prev => ({ ...prev, leagues: detailedLeagues, isLoading: false, lastUpdated: new Date().toISOString() }));
      debugLogger.success('YAHOO_API', 'Detailed leagues loaded', detailedLeagues);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed fetch league data';
      setState(prev => ({ ...prev, error: msg, isLoading: false }));
      debugLogger.error('YAHOO_API', 'Fetch league data failed', error);
    }
  }, [isConnected, state.availableLeagues, getStoredTokens]);

  useEffect(() => {
    fetchAvailableLeagues();
  }, [isConnected, fetchAvailableLeagues]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (enabledLeagueIds.length && state.availableLeagues.length) {
      timeoutRef.current = setTimeout(() => fetchLeagueData(enabledLeagueIds), 500);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [enabledLeagueIds, fetchLeagueData, state.availableLeagues]);

  const refreshData = useCallback(() => {
    fetchAvailableLeagues().then(() => {
      if (enabledLeagueIds.length) fetchLeagueData(enabledLeagueIds);
    });
  }, [fetchAvailableLeagues, fetchLeagueData, enabledLeagueIds]);

  return {
    ...state,
    refreshData,
    fetchAvailableLeagues
  };
};
