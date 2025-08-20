import { useState, useEffect, useCallback } from 'react';
import { yahooFantasyAPI } from '../services/YahooFantasyAPI';
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
  const { isConnected } = useYahooOAuth();
  const [state, setState] = useState<YahooDataState>({
    leagues: [],
    availableLeagues: [],
    isLoading: false,
    error: null,
    lastUpdated: null
  });

  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      debugLogger.info('YAHOO_API', 'Fetching Yahoo leagues');
      const yahooLeagues = await yahooFantasyAPI.getUserLeagues();
      
      setState(prev => ({
        ...prev,
        availableLeagues: yahooLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString()
      }));

      debugLogger.info('YAHOO_API', 'Yahoo leagues fetched', yahooLeagues);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Yahoo leagues';
      
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
  }, [isConnected]);

  const fetchLeagueData = useCallback(async (leagueIds: string[]) => {
    if (!isConnected || leagueIds.length === 0) {
      setState(prev => ({ ...prev, leagues: [] }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      debugLogger.info('YAHOO_API', 'Fetching Yahoo league data for leagues', leagueIds);
      
      const leagues: LeagueData[] = [];
      
      for (const leagueId of leagueIds) {
        try {
          // Find the league info from available leagues
          const leagueInfo = state.availableLeagues.find(l => l.league_key === leagueId);
          
          if (!leagueInfo) {
            debugLogger.error('YAHOO_API', `League info not found for ${leagueId}`);
            continue;
          }

          // Fetch current week scoreboard data
          const scoreboardData = await yahooFantasyAPI.getLeagueScoreboard(leagueId);
          
          // Transform to common format
          const commonLeague = yahooFantasyAPI.yahooToCommonFormat(leagueInfo, scoreboardData);
          leagues.push(commonLeague);
          
          debugLogger.info('YAHOO_API', `Processed Yahoo league: ${commonLeague.leagueName}`);
        } catch (leagueError) {
          debugLogger.error('YAHOO_API', `Failed to fetch data for league ${leagueId}`, leagueError);
          // Continue with other leagues even if one fails
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
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch Yahoo league data';
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        isLoading: false
      }));

      debugLogger.error('YAHOO_API', 'Failed to fetch Yahoo league data', error);
    }
  }, [isConnected, state.availableLeagues]);

  // Fetch available leagues when connected
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

  // Fetch league data when enabled leagues change
  useEffect(() => {
    if (enabledLeagueIds.length > 0 && state.availableLeagues.length > 0) {
      fetchLeagueData(enabledLeagueIds);
    }
  }, [enabledLeagueIds, fetchLeagueData, state.availableLeagues]);

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
    return yahooFantasyAPI.getRateLimitStatus();
  }, []);

  return {
    ...state,
    refreshData,
    getRateLimitStatus,
    fetchAvailableLeagues
  };
};