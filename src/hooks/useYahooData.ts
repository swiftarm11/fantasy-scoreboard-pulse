
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

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      debugLogger.info('YAHOO_API', 'Fetching Yahoo leagues');

      const tokens = getStoredTokens();
      if (!tokens?.access_token) throw new Error('Not authenticated');

      const resp = await fetch(
        'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-api',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w`,
            apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w'
          },
          body: JSON.stringify({
            endpoint: 'getUserLeagues',
            accessToken: tokens.access_token
          })
        }
      );

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(errText || 'Failed to fetch leagues');
      }

      const data = await resp.json();
      console.log('Yahoo API leagues response:', data);
      
      // Navigate the Yahoo Fantasy API JSON structure:
      const leagues = data?.fantasy_content?.users?.[0]?.user?.[0]?.games?.[0]?.game?.[0]?.leagues?.[0]?.league || [];

      setState(prev => ({
        ...prev,
        availableLeagues: leagues,
        isLoading: false,
        lastUpdated: new Date().toISOString()
      }));

      debugLogger.info('YAHOO_API', 'Yahoo leagues fetched', leagues);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to fetch Yahoo leagues';

      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));

      debugLogger.error('YAHOO_API', 'Failed to fetch Yahoo leagues', error);

      if (errorMessage.includes('token expired')) {
        toast({
          title: 'Yahoo Token Expired',
          description: 'Please reconnect your Yahoo account',
          variant: 'destructive'
        });
      }
    }
  }, [isConnected, getStoredTokens]);

  const fetchLeagueData = useCallback(
    async (leagueIds: string[]) => {
      if (!isConnected || leagueIds.length === 0) {
        setState(prev => ({ ...prev, leagues: [] }));
        return;
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }));
      try {
        debugLogger.info(
          'YAHOO_API',
          'Fetching Yahoo league data for leagues',
          leagueIds
        );

        const leagues: LeagueData[] = [];
        for (const leagueId of leagueIds) {
          try {
            const leagueInfo = state.availableLeagues.find(
              (l: any) => l.league_key[0] === leagueId
            );
            if (!leagueInfo) {
              debugLogger.error(
                'YAHOO_API',
                `League info not found for ${leagueId}`
              );
              continue;
            }

            const tokens = getStoredTokens();
            if (!tokens?.access_token) throw new Error('Not authenticated');

            const scoreboardResp = await fetch(
              'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-api',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w`,
                  apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w'
                },
                body: JSON.stringify({
                  endpoint: 'getLeagueScoreboard',
                  leagueKey: leagueId,
                  accessToken: tokens.access_token
                })
              }
            );
            if (!scoreboardResp.ok) {
              const errText = await scoreboardResp.text();
              throw new Error(errText || 'Failed to fetch scoreboard');
            }
            const scoreboardData = await scoreboardResp.json();

            const commonLeague: LeagueData = {
              id: leagueId,
              leagueName: leagueInfo.name[0],
              platform: 'Yahoo',
              teamName: 'My Team', // TODO: Extract from scoreboard data
              myScore: 0,
              opponentScore: 0,
              opponentName: 'TBD',
              record: '0-0',
              leaguePosition: 'N/A',
              status: 'neutral',
              scoringEvents: [],
              lastUpdated: new Date().toISOString()
            };
            leagues.push(commonLeague);
            debugLogger.info(
              'YAHOO_API',
              `Processed Yahoo league: ${commonLeague.leagueName}`
            );
          } catch (leagueError) {
            debugLogger.error(
              'YAHOO_API',
              `Failed to fetch data for league ${leagueId}`,
              leagueError
            );
          }
        }

        setState(prev => ({
          ...prev,
          leagues,
          isLoading: false,
          lastUpdated: new Date().toISOString()
        }));
        debugLogger.success('YAHOO_API', 'Yahoo league data updated', leagues);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch Yahoo league data';
        setState(prev => ({ ...prev, error: errorMessage, isLoading: false }));
        debugLogger.error('YAHOO_API', 'Failed to fetch Yahoo league data', error);
      }
    },
    [isConnected, state.availableLeagues, getStoredTokens]
  );

  useEffect(() => {
    if (isConnected) {
      fetchAvailableLeagues();
    } else {
      setState(prev => ({
        ...prev,
        availableLeagues: [],
        leagues: [],
        error: null
      }));
    }
  }, [isConnected, fetchAvailableLeagues]);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (enabledLeagueIds.length > 0 && state.availableLeagues.length > 0) {
      timeoutRef.current = setTimeout(() => {
        fetchLeagueData(enabledLeagueIds);
      }, 500);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabledLeagueIds, fetchLeagueData, state.availableLeagues]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const refreshData = useCallback(() => {
    if (isConnected) {
      fetchAvailableLeagues().then(() => {
        if (enabledLeagueIds.length > 0) {
          fetchLeagueData(enabledLeagueIds);
        }
      });
    }
  }, [isConnected, fetchAvailableLeagues, fetchLeagueData, enabledLeagueIds]);

  const getRateLimitStatus = useCallback(() => {
    return { requests: 0, remaining: 1000, resetTime: Date.now() };
  }, []);

  return {
    ...state,
    refreshData,
    getRateLimitStatus,
    fetchAvailableLeagues
  };
};
