// src/hooks/useYahooData.ts

import { useState, useEffect } from 'react';
import { YahooOAuthService } from '../utils/yahooOAuth';
import { supabase } from '../integrations/supabase/client';
import type { LeagueData as AppLeagueData } from '../types/fantasy';

interface YahooLeagueRaw {
  league_key: string;
  name: string;
  season?: string;
  game_code?: string;
}

interface YahooGameContent {
  leagues: {
    count: number;
    [index: string]: { league: YahooLeagueRaw[] };
  };
}

interface YahooGameWrapper {
  game: Array<unknown | YahooGameContent>;
}

interface YahooUserContent {
  games: {
    '0': YahooGameWrapper;
  };
}

interface YahooRawResponse {
  fantasy_content: {
    users: {
      '0': {
        user: Array<{ guid?: string } | YahooUserContent>;
      };
    };
  };
}

const transformLeague = (raw: YahooLeagueRaw): AppLeagueData => ({
  id: raw.league_key,
  leagueName: raw.name,
  platform: 'Yahoo',
  season: raw.season ?? '',
  teamName: '',
  myScore: 0,
  opponentScore: 0,
  gameCode: raw.game_code ?? '',
});

export const useYahooData = () => {
  // Initialize with empty arrays to prevent undefined errors
  const [availableLeagues, setAvailableLeagues] = useState<AppLeagueData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthService = new YahooOAuthService();

  const getAccessToken = (): string | null =>
    sessionStorage.getItem('yahoo_access_token');

  const parseYahooLeagues = (data: YahooRawResponse): YahooLeagueRaw[] => {
    try {
      // Add safety checks at each level
      if (!data?.fantasy_content?.users?.['0']?.user) {
        console.error('Invalid response structure');
        return [];
      }

      const users = data.fantasy_content.users['0'].user;
      const gameWrapper = users.find(
        (item): item is YahooUserContent => 
          typeof item === 'object' && item !== null && 'games' in item
      );

      if (!gameWrapper?.games?.['0']?.game) {
        console.error('No games found in response');
        return [];
      }

      const game = gameWrapper.games['0'].game;
      const leaguesContent = game.find(
        (item): item is YahooGameContent => 
          typeof item === 'object' && item !== null && 'leagues' in item
      );

      if (!leaguesContent?.leagues) {
        console.error('No leagues found in game data');
        return [];
      }

      const leagues = leaguesContent.leagues;
      const raws: YahooLeagueRaw[] = [];
      const count = leagues.count || 0;

      for (let i = 0; i < count; i++) {
        const wrapper = leagues[i.toString()];
        if (wrapper?.league?.) {
          raws.push(wrapper.league);
        }
      }

      return raws;
    } catch (err) {
      console.error('Error parsing Yahoo leagues:', err);
      return [];
    }
  };

  const fetchAvailableLeagues = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error('No access token found.');
      }

      const { data: resp, error: fnError } = await supabase.functions.invoke(
        'yahoo-oauth',
        {
          body: {
            endpoint: 'users;use_login=1/games;game_codes=nfl/leagues',
            access_token: token,
          },
        }
      );

      if (fnError) throw new Error(fnError.message);
      if (!resp?.data) throw new Error('Empty Yahoo response.');

      const rawLeagues = parseYahooLeagues(resp.data as YahooRawResponse);
      const transformedLeagues = rawLeagues.map(transformLeague);
      
      // Ensure we always set an array, never undefined
      setAvailableLeagues(transformedLeagues || []);
      
    } catch (err: any) {
      console.error('Fetch leagues error:', err);
      setError(err.message || 'Unknown error occurred');
      setAvailableLeagues([]); // Ensure empty array on error
    } finally {
      setIsLoading(false);
    }
  };

  // More defensive useEffect with proper dependency handling
  useEffect(() => {
    const shouldFetch = 
      oauthService.isConnected() && 
      !isLoading && 
      Array.isArray(availableLeagues) && 
      availableLeagues.length === 0;
      
    if (shouldFetch) {
      fetchAvailableLeagues();
    }
  }, [isLoading]); // Simplified dependencies

  return {
    availableLeagues: availableLeagues || [], // Extra safety
    isLoading: Boolean(isLoading),
    error,
    fetchAvailableLeagues,
    login: () => oauthService.connect(),
    logout: () => oauthService.disconnect(),
    isAuthenticated: () => oauthService.isConnected(),
  };
};
