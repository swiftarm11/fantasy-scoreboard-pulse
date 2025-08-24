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

  // Corrected parsing function for Yahoo API leagues response
  const parseYahooLeagues = (apiData: any): LeagueData[] => {
    try {
      console.log('Raw API data:', apiData);

      // Navigate to the user array
      const usersNode = apiData.fantasy_content.users["0"].user;
      console.log('Users node:', usersNode);

      // Find the games object in the user array
      let gamesObject = null;
      for (const item of usersNode) {
        if (item.games) {
          gamesObject = item.games["0"].game;
          break;
        }
      }

      if (!gamesObject) {
        console.error("No games object found in user data");
        return [];
      }

      console.log('Games object:', gamesObject);

      // Find the leagues object in the game array
      let leaguesObject = null;
      for (const item of gamesObject) {
        if (item.leagues) {
          leaguesObject = item.leagues;
          break;
        }
      }

      if (!leaguesObject) {
        console.error("No leagues object found in game data");
        return [];
      }

      console.log('Leagues object:', leaguesObject);

      // Extract leagues using the count property
      const leagues: LeagueData[] = [];
      const leagueCount = leaguesObject.count || 0;

      console.log(`Processing ${leagueCount} leagues`);

      for (let i = 0; i < leagueCount; i++) {
        const key = i.toString();
        if (leaguesObject[key] && leaguesObject[key].league) {
          // Each league is wrapped in an array, take the first element
          const leagueData = leaguesObject[key].league[0];
          console.log(`League ${i}:`, leagueData);

          leagues.push({
            league_key: leagueData.league_key,
            name: leagueData.name,
            season: leagueData.season,
            game_code: leagueData.game_code,
            league_id: leagueData.league_id,
            url: leagueData.url,
            logo_url: leagueData.logo_url,
            draft_status: leagueData.draft_status,
            num_teams: leagueData.num_teams,
            edit_key: leagueData.edit_key,
            weekly_deadline: leagueData.weekly_deadline,
            league_update_timestamp: leagueData.league_update_timestamp,
            scoring_type: leagueData.scoring_type,
            league_type: leagueData.league_type,
            renew: leagueData.renew,
            renewed: leagueData.renewed,
            iris_group_chat_id: leagueData.iris_group_chat_id,
            allow_add_to_dl_extra_pos: leagueData.allow_add_to_dl_extra_pos,
            is_pro_league: leagueData.is_pro_league,
            is_cash_league: leagueData.is_cash_league,
            current_week: leagueData.current_week,
            start_week: leagueData.start_week,
            start_date: leagueData.start_date,
            end_week: leagueData.end_week,
            end_date: leagueData.end_date,
            game_code_full: leagueData.game_code_full
          });
        }
      }

      console.log(`Parsed leagues: ${leagues.length} leagues found`);
      return leagues;

    } catch (error) {
      console.error("Error parsing Yahoo leagues:", error);
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

      // Use the corrected parsing function
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
      const teamsData = response.data; // Add proper parsing here
      
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
      const scoreboardData = response.data; // Add proper parsing here
      
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
