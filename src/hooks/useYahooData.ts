import { useState, useEffect } from 'react';
import { YahooOAuthService } from '../utils/yahooOAuth';
import { supabase } from '../utils/supabase';

// Interface definitions
interface LeagueData {
  league_key: string;
  name: string;
  season?: string;
  game_code?: string;
  league_id?: string;
  url?: string;
  logo_url?: string;
  draft_status?: string;
  num_teams?: number;
  edit_key?: string;
  weekly_deadline?: string;
  league_update_timestamp?: string;
  scoring_type?: string;
  league_type?: string;
  renew?: string;
  renewed?: string;
  iris_group_chat_id?: string;
  allow_add_to_dl_extra_pos?: number;
  is_pro_league?: string;
  is_cash_league?: string;
  current_week?: number;
  start_week?: number;
  start_date?: string;
  end_week?: number;
  end_date?: string;
  game_code_full?: string;
}

interface TeamData {
  team_key: string;
  team_id: string;
  name: string;
  is_owned_by_current_login: number;
  url: string;
  team_logo: string;
  waiver_priority: number;
  number_of_moves: number;
  number_of_trades: number;
  roster_adds: {
    coverage_type: string;
    coverage_value: number;
    value: string;
  };
  clinched_playoffs?: number;
  league_scoring_type: string;
  managers: Array<{
    manager_id: string;
    nickname: string;
    guid: string;
    is_commissioner?: string;
    is_current_login?: string;
    email?: string;
    image_url?: string;
  }>;
}

interface ScoreboardData {
  week: number;
  matchups: Array<{
    week: number;
    week_start: string;
    week_end: string;
    status: string;
    is_playoffs: string;
    is_consolation: string;
    is_tied: number;
    winner_team_key: string;
    stat_winners: Array<{
      stat_id: number;
      winner_team_key: string;
      is_tied: number;
    }>;
    teams: Array<{
      team_key: string;
      points: {
        coverage_type: string;
        coverage_value: number;
        total: number;
      };
      projected_points: {
        coverage_type: string;
        coverage_value: number;
        total: number;
      };
    }>;
  }>;
}

interface YahooDataState {
  leagues: LeagueData[];
  teams: { [leagueKey: string]: TeamData[] };
  scoreboards: { [leagueKey: string]: ScoreboardData[] };
  loading: boolean;
  error: string | null;
}

export const useYahooData = () => {
  const [data, setData] = useState<YahooDataState>({
    leagues: [],
    teams: {},
    scoreboards: {},
    loading: false,
    error: null
  });

  const oauthService = new YahooOAuthService();

  // Fixed parsing function for Yahoo API leagues response
  const parseYahooLeagues = (apiData: any): LeagueData[] => {
    try {
      console.log('Raw API data:', apiData);

      // Navigate safely through the nested structure
      const users = apiData?.fantasy_content?.users?.["0"]?.user;
      if (!users || !Array.isArray(users)) {
        console.error('Invalid users structure');
        return [];
      }

      console.log('Users array:', users);

      // Find games object in user array
      let gamesArray = null;
      for (const userItem of users) {
        if (userItem.games?.["0"]?.game) {
          gamesArray = userItem.games["0"].game;
          break;
        }
      }

      if (!gamesArray || !Array.isArray(gamesArray)) {
        console.error('No games found');
        return [];
      }

      console.log('Games array:', gamesArray);

      // Find leagues object in game array
      let leaguesData = null;
      for (const gameItem of gamesArray) {
        if (gameItem.leagues) {
          leaguesData = gameItem.leagues;
          break;
        }
      }

      if (!leaguesData) {
        console.error('No leagues found');
        return [];
      }

      console.log('Leagues data:', leaguesData);

      // Extract leagues using the count property
      const leagues: LeagueData[] = [];
      const count = leaguesData.count || 0;
      
      console.log(`Processing ${count} leagues`);

      for (let i = 0; i < count; i++) {
        const leagueWrapper = leaguesData[i.toString()];
        if (leagueWrapper?.league?.[0]) {
          const league = leagueWrapper.league[0];
          console.log(`League ${i}:`, league);

          leagues.push({
            league_key: league.league_key,
            name: league.name,
            season: league.season,
            game_code: league.game_code,
            league_id: league.league_id,
            url: league.url,
            logo_url: league.logo_url,
            draft_status: league.draft_status,
            num_teams: league.num_teams,
            edit_key: league.edit_key,
            weekly_deadline: league.weekly_deadline,
            league_update_timestamp: league.league_update_timestamp,
            scoring_type: league.scoring_type,
            league_type: league.league_type,
            renew: league.renew,
            renewed: league.renewed,
            iris_group_chat_id: league.iris_group_chat_id,
            allow_add_to_dl_extra_pos: league.allow_add_to_dl_extra_pos,
            is_pro_league: league.is_pro_league,
            is_cash_league: league.is_cash_league,
            current_week: league.current_week,
            start_week: league.start_week,
            start_date: league.start_date,
            end_week: league.end_week,
            end_date: league.end_date,
            game_code_full: league.game_code_full
          });
        }
      }

      console.log(`Successfully parsed ${leagues.length} leagues`);
      return leagues;
      
    } catch (error) {
      console.error('Error parsing Yahoo leagues:', error);
      return [];
    }
  };

  const fetchLeagues = async () => {
    setData(prev => ({ ...prev, loading: true, error: null }));

    try {
      const accessToken = sessionStorage.getItem('yahoo_access_token');
      if (!accessToken) {
        throw new Error('No access token found');
      }

      console.log('Fetching leagues with access token');

      const { data: response, error } = await supabase.functions.invoke('yahoo-oauth', {
        body: { 
          endpoint: 'users;use_login=1/games;game_codes=nfl/leagues',
          access_token: accessToken 
        }
      });

      if (error) {
        throw new Error(`Supabase function error: ${error.message}`);
      }

      if (!response || !response.data) {
        throw new Error('No data received from Yahoo API');
      }

      console.log('Raw Yahoo API response:', response.data);

      // Use the fixed parsing function
      const parsedLeagues = parseYahooLeagues(response.data);
      
      console.log('Final parsed leagues:', parsedLeagues);

      setData(prev => ({
        ...prev,
        leagues: parsedLeagues,
        loading: false
      }));

    } catch (error) {
      console.error('Error fetching leagues:', error);
      setData(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        loading: false
      }));
    }
  };

  const fetchTeams = async (leagueKey: string) => {
    try {
      const accessToken = sessionStorage.getItem('yahoo_access_token');
      if (!accessToken) {
        throw new Error('No access token found');
      }

      const { data: response, error } = await supabase.functions.invoke('yahoo-oauth', {
        body: { 
          endpoint: `league/${leagueKey}/teams`,
          access_token: accessToken 
        }
      });

      if (error) throw new Error(`Supabase function error: ${error.message}`);
      if (!response || !response.data) throw new Error('No team data received');

      // Parse teams data (implement similar parsing logic for teams)
      const teamsData = response.data; // Add proper parsing here when needed
      
      setData(prev => ({
        ...prev,
        teams: {
          ...prev.teams,
          [leagueKey]: teamsData
        }
      }));

    } catch (error) {
      console.error('Error fetching teams:', error);
      setData(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error fetching teams'
      }));
    }
  };

  const fetchScoreboard = async (leagueKey: string, week?: number) => {
    try {
      const accessToken = sessionStorage.getItem('yahoo_access_token');
      if (!accessToken) {
        throw new Error('No access token found');
      }

      const endpoint = week 
        ? `league/${leagueKey}/scoreboard;week=${week}`
        : `league/${leagueKey}/scoreboard`;

      const { data: response, error } = await supabase.functions.invoke('yahoo-oauth', {
        body: { 
          endpoint,
          access_token: accessToken 
        }
      });

      if (error) throw new Error(`Supabase function error: ${error.message}`);
      if (!response || !response.data) throw new Error('No scoreboard data received');

      // Parse scoreboard data (implement similar parsing logic for scoreboards)
      const scoreboardData = response.data; // Add proper parsing here when needed
      
      setData(prev => ({
        ...prev,
        scoreboards: {
          ...prev.scoreboards,
          [leagueKey]: scoreboardData
        }
      }));

    } catch (error) {
      console.error('Error fetching scoreboard:', error);
      setData(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error fetching scoreboard'
      }));
    }
  };

  const login = async () => {
    try {
      await oauthService.initiateAuth();
    } catch (error) {
      console.error('Login error:', error);
      setData(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Login failed'
      }));
    }
  };

  const logout = async () => {
    try {
      await oauthService.clearSession();
      setData({
        leagues: [],
        teams: {},
        scoreboards: {},
        loading: false,
        error: null
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const isAuthenticated = () => {
    return !!sessionStorage.getItem('yahoo_access_token');
  };

  // Auto-fetch leagues on mount if authenticated
  useEffect(() => {
    if (isAuthenticated() && data.leagues.length === 0) {
      fetchLeagues();
    }
  }, []);

  return {
    ...data,
    login,
    logout,
    fetchLeagues,
    fetchTeams,
    fetchScoreboard,
    isAuthenticated: isAuthenticated()
  };
};
