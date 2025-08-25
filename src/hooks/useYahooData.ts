// useYahooData.ts - Yahoo Fantasy Sports Data Hook
import { useState, useEffect, useCallback } from 'react';
import { LeagueData } from '../types/fantasy';
import { useYahooOAuth } from './useYahooOAuth';
import { debugLogger } from '../utils/debugLogger';
import { toast } from '../components/ui/use-toast';

interface UseYahooDataReturn {
  leagues: LeagueData[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export const useYahooData = (leagueIds: string[]): UseYahooDataReturn => {
  const { isConnected, getStoredTokens } = useYahooOAuth();
  
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeagueData = useCallback(async () => {
    if (!isConnected || leagueIds.length === 0) {
      setLeagues([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    debugLogger.info('YAHOO_DATA', 'Starting fetchLeagueData', { leagueIds });

    try {
      const tokens = getStoredTokens();
      if (!tokens?.access_token) {
        throw new Error('Not authenticated');
      }

      const detailedLeagues: LeagueData[] = [];

      // First, get all available leagues to match names
      const leaguesResp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            action: 'getLeagues',
            accessToken: tokens.access_token
          })
        }
      );

      if (!leaguesResp.ok) {
        throw new Error(`Failed to fetch leagues: ${await leaguesResp.text()}`);
      }

      const leaguesData = await leaguesResp.json();
      
      // Parse leagues using the correct structure from yahoo-leagues-response.json
      const usersNode = leaguesData?.fantasy_content?.users?.["0"]?.user;
      const gamesNode = usersNode?.[1]?.games?.["0"]?.game;
      const leaguesNode = gamesNode?.[1]?.leagues;

      if (!leaguesNode) {
        throw new Error('Invalid leagues response structure');
      }

      const availableLeagues: any[] = [];
      for (let i = 0; i < leaguesNode.count; i++) {
        const entry = leaguesNode[i.toString()];
        if (entry?.league?.[0]) {
          availableLeagues.push(entry.league[0]);
        }
      }

      debugLogger.info('YAHOO_DATA', 'Available leagues parsed', { 
        count: availableLeagues.length, 
        leagues: availableLeagues.map(l => ({ key: l.league_key, name: l.name })) 
      });

      // Now fetch detailed data for requested leagues
      for (const leagueKey of leagueIds) {
        try {
          const leagueInfo = availableLeagues.find((l: any) => l.league_key === leagueKey);
          if (!leagueInfo) {
            debugLogger.warn('YAHOO_DATA', 'League not found in available leagues', { leagueKey });
            continue;
          }

          // Get scoreboard data for this league
          const scoreboardResp = await fetch(
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

          if (!scoreboardResp.ok) {
            debugLogger.warn('YAHOO_DATA', 'Failed to fetch scoreboard', { 
              leagueKey, 
              status: scoreboardResp.status 
            });
            continue;
          }

          const scoreboardData = await scoreboardResp.json();

          // Transform to LeagueData format
          const leagueData: LeagueData = {
            id: leagueInfo.league_key,
            platform: 'Yahoo',
            leagueName: leagueInfo.name,
            teamName: 'My Team', // Yahoo API doesn't easily provide user's team name
            myScore: 0, // Will need to be populated from actual matchup data
            opponentName: 'Opponent', // Will need to be populated from actual matchup data
            opponentScore: 0, // Will need to be populated from actual matchup data
            record: '0-0-0', // Will need to be populated from actual team data
            leaguePosition: 0, // Will need to be populated from standings
            status: leagueInfo.draft_status || 'active',
            scoringEvents: [], // Will need to be populated from scoring data
            lastUpdated: new Date().toISOString()
          };

          detailedLeagues.push(leagueData);

        } catch (leagueError) {
          debugLogger.error('YAHOO_DATA', 'Failed to fetch league details', { 
            leagueKey, 
            error: leagueError 
          });
        }
      }

      setLeagues(detailedLeagues);
      debugLogger.info('YAHOO_DATA', 'League data fetch completed', { 
        requested: leagueIds.length, 
        successful: detailedLeagues.length 
      });

    } catch (fetchError) {
      const errorMessage = fetchError instanceof Error ? fetchError.message : 'Failed to fetch league data';
      setError(errorMessage);
      debugLogger.error('YAHOO_DATA', 'fetchLeagueData failed', { error: errorMessage, fullError: fetchError });
      
      if (errorMessage.includes('token') || errorMessage.includes('auth')) {
        toast({
          title: 'Yahoo Authentication Error',
          description: 'Please reconnect to Yahoo Fantasy Sports',
          variant: 'destructive'
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, leagueIds, getStoredTokens]);

  // Fetch data when dependencies change
  useEffect(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

  const refetch = useCallback(() => {
    fetchLeagueData();
  }, [fetchLeagueData]);

  return {
    leagues,
    isLoading,
    error,
    refetch
  };
};
