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
  const [availableLeagues, setAvailableLeagues] = useState<AppLeagueData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthService = new YahooOAuthService();

  const getAccessToken = (): string | null =>
    sessionStorage.getItem('yahoo_access_token');

  const parseYahooLeagues = (data: YahooRawResponse): YahooLeagueRaw[] => {
    const users = data.fantasy_content.users['0'].user;
    const gameWrapper = users.find(
      (item): item is YahooUserContent => typeof item === 'object' && 'games' in item
    ) as YahooUserContent;

    const game = gameWrapper.games['0'].game;
    const leaguesContent = (
      game.find(
        (item): item is YahooGameContent => typeof item === 'object' && 'leagues' in item
      ) as YahooGameContent
    ).leagues;

    const raws: YahooLeagueRaw[] = [];
    for (let i = 0; i < leaguesContent.count; i++) {
      const wrapper = leaguesContent[i.toString()];
      if (wrapper?.league?.[0]) raws.push(wrapper.league[0]);
    }
    return raws;
  };

  const fetchAvailableLeagues = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      if (!token) throw new Error('No access token found.');

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
      setAvailableLeagues(rawLeagues.map(transformLeague));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (oauthService.isConnected() && !isLoading && availableLeagues.length === 0) {
      fetchAvailableLeagues();
    }
  }, [availableLeagues.length, isLoading]);

  return {
    availableLeagues,
    isLoading,
    error,
    fetchAvailableLeagues,
    login: () => oauthService.connect(),
    logout: () => oauthService.disconnect(),
    isAuthenticated: () => oauthService.isConnected(),
  };
};
