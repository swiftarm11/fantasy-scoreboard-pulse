// useYahooData.ts - Yahoo Fantasy Sports Data Hook
import { useState, useEffect, useCallback, useRef } from 'react';
import { LeagueData, ScoringEvent } from '../types/fantasy';
import { LeagueConfig } from '../types/config';
import { useYahooOAuth } from './useYahooOAuth';
import { debugLogger } from '../utils/debugLogger';
import { toast } from '../components/ui/use-toast';

export const useYahooData = (leagueConfigs: LeagueConfig[] = []) => {
  const { isConnected, getStoredTokens } = useYahooOAuth();
  
  const [state, setState] = useState({
    leagues: [],
    availableLeagues: [],
    isLoading: false,
    error: null,
    lastUpdated: null,
  });
  
  // ✅ UPDATED: Fixed fetchAvailableLeagues function
  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) return;
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const tokens = getStoredTokens();
      if (!tokens?.access_token) throw new Error('Not authenticated');
      
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            endpoint: 'getUserLeagues',
            accessToken: tokens.access_token
          })
        }
      );
      
      if (!resp.ok) throw new Error(await resp.text());
      
      const text = await resp.text();
      const data = JSON.parse(text);
      
      // ✅ FIXED: Match the actual response structure from yahoo-api
      const leagues = data?.fantasy_content?.users?.[0]?.user?.[0]?.games?.[0]?.game?.[0]?.leagues?.[0]?.league;
      
      let availableLeagues = [];
      
      if (leagues && Array.isArray(leagues)) {
        // If it's already an array of league objects
        availableLeagues = leagues;
      } else if (leagues && typeof leagues === 'object') {
        // If it's the nested structure with count, parse it
        const count = leagues.count || 0;
        for (let i = 0; i < count; i++) {
          const entry = leagues[i.toString()];
          if (entry?.league?.[0]) {
            availableLeagues.push(entry.league[0]);
          }
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
        toast({
          title: 'Yahoo Token Expired',
          description: 'Please reconnect to Yahoo',
          variant: 'destructive'
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
      if (!tokens?.access_token) throw new Error('Not authenticated');
      
      const detailedLeagues = [];
      
      for (const leagueKey of leagueIds) {
        try {
          const leagueInfo = state.availableLeagues.find(l => l.league_key === leagueKey);
          if (!leagueInfo) continue;
          
          const resp = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
              },
              body: JSON.stringify({
                endpoint: 'getLeagueScoreboard',
                accessToken: tokens.access_token,
                leagueKey
              })
            }
          );
          
          if (!resp.ok) throw new Error(await resp.text());
          
          const sbText = await resp.text();
          const sb = JSON.parse(sbText);
          
          const teams = sb.fantasy_content?.league?.[0]?.teams?.team;
          if (!teams || !Array.isArray(teams)) continue;
          
          const userTeam = teams[0];
          const opponentTeam = teams[1];
          
          if (!userTeam || !opponentTeam) continue;
          
          const myScore = parseFloat(userTeam.team_points?.total || '0');
          const opponentScore = parseFloat(opponentTeam.team_points?.total || '0');
          
          const scoreDiff = myScore - opponentScore;
          let status = 'neutral';
          if (scoreDiff >= 10) status = 'winning';
          else if (scoreDiff <= -10) status = 'losing';
          
          const totalScore = myScore + opponentScore;
          const winProbability = totalScore > 0 ? (myScore / totalScore) * 100 : 50;
          
          const scoringEvents = [
            {
              id: `${leagueKey}-event-1`,
              playerName: 'Recent Player',
              position: 'QB',
              weeklyPoints: 2.5,
              action: 'Passing Touchdown',
              scoreImpact: 2.5,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              isRecent: true
            }
          ];
          
          const leagueData = {
            id: leagueKey,
            leagueName: leagueInfo.name || 'Unknown League',
            platform: 'Yahoo',
            teamName: userTeam.name || 'Your Team',
            myScore,
            opponentScore,
            opponentName: opponentTeam.name || 'Opponent',
            record: `${userTeam.team_standings?.wins || 0}-${userTeam.team_standings?.losses || 0}`,
            leaguePosition: `${userTeam.team_standings?.rank || 1} of ${teams.length}`,
            status,
            scoringEvents,
            lastUpdated: new Date().toLocaleTimeString(),
            winProbability,
            wins: parseInt(userTeam.team_standings?.wins || '0'),
            losses: parseInt(userTeam.team_standings?.losses || '0')
          };
          
          detailedLeagues.push(leagueData);
          
        } catch (error) {
          debugLogger.error('YAHOO_API', `Failed to fetch data for league ${leagueKey}`, error);
        }
      }
      
      setState(prev => ({
        ...prev,
        leagues: detailedLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString()
      }));
      
      debugLogger.info('YAHOO_API', 'Yahoo league data fetched', detailedLeagues);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch league data';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      debugLogger.error('YAHOO_API', 'Fetch league data failed', error);
    }
  }, [isConnected, getStoredTokens, state.availableLeagues]);
  
  useEffect(() => {
    if (isConnected) {
      fetchAvailableLeagues();
    } else {
      setState(prev => ({
        ...prev,
        leagues: [],
        availableLeagues: [],
        error: null
      }));
    }
  }, [isConnected, fetchAvailableLeagues]);
  
  useEffect(() => {
    if (isConnected && state.availableLeagues.length > 0) {
      const enabledLeagueIds = leagueConfigs
        .filter(config => config.enabled && config.platform === 'Yahoo')
        .map(config => config.leagueId);
      
      if (enabledLeagueIds.length > 0) {
        fetchLeagueData(enabledLeagueIds);
      }
    }
  }, [leagueConfigs, isConnected, state.availableLeagues.length, fetchLeagueData]);
  
  const refetch = useCallback(() => {
    fetchAvailableLeagues();
  }, [fetchAvailableLeagues]);
  
  return {
    leagues: state.leagues,
    availableLeagues: state.availableLeagues,
    isLoading: state.isLoading,
    error: state.error,
    lastUpdated: state.lastUpdated,
    fetchAvailableLeagues,
    fetchLeagueData,
    refetch
  };
};
