import { supabase } from '@/integrations/supabase/client';

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  settings: {
    playoff_week_start: number;
    num_teams: number;
    league_average_match: number;
  };
  scoring_settings: Record<string, number>;
  roster_positions: string[];
  status: string;
  sport: string;
  season_type: string;
}

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players: string[];
  starters: string[];
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_against: number;
  };
}

export interface SleeperMatchup {
  roster_id: number;
  matchup_id: number;
  points: number;
  players_points: Record<string, number>;
  starters_points: number[];
}

export interface SleeperPlayer {
  player_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  position: string;
  team: string;
  status: string;
  injury_status?: string;
}

export interface SleeperState {
  week: number;
  season_type: string;
  season: string;
  leg: number;
}

export class SleeperAPI {
  private static instance: SleeperAPI;
  private playersCache: Record<string, SleeperPlayer> | null = null;
  private playersCacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  static getInstance(): SleeperAPI {
    if (!SleeperAPI.instance) {
      SleeperAPI.instance = new SleeperAPI();
    }
    return SleeperAPI.instance;
  }

  private async callAPI(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const urlParams = new URLSearchParams({
      endpoint,
      ...params,
    });

    const { data, error } = await supabase.functions.invoke('sleeper-api', {
      body: {},
      method: 'GET',
    });

    if (error) {
      throw new Error(`Sleeper API call failed: ${error.message}`);
    }

    // Make the actual HTTP call to our edge function
    const response = await fetch(
      `https://doyquitecogdnvbyiszt.supabase.co/functions/v1/sleeper-api?${urlParams}`,
      {
        headers: {
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getLeague(leagueId: string): Promise<SleeperLeague> {
    return this.callAPI('league', { leagueId });
  }

  async getUsers(leagueId: string): Promise<SleeperUser[]> {
    return this.callAPI('users', { leagueId });
  }

  async getRosters(leagueId: string): Promise<SleeperRoster[]> {
    return this.callAPI('rosters', { leagueId });
  }

  async getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return this.callAPI('matchups', { leagueId, week: week.toString() });
  }

  async getPlayers(): Promise<Record<string, SleeperPlayer>> {
    const now = Date.now();
    
    // Check if cache is still valid
    if (this.playersCache && (now - this.playersCacheTimestamp) < this.CACHE_DURATION) {
      return this.playersCache;
    }

    // Try to load from IndexedDB first
    try {
      const cachedData = localStorage.getItem('sleeper_players_cache');
      const cacheTimestamp = localStorage.getItem('sleeper_players_timestamp');
      
      if (cachedData && cacheTimestamp) {
        const timestamp = parseInt(cacheTimestamp);
        if ((now - timestamp) < this.CACHE_DURATION) {
          this.playersCache = JSON.parse(cachedData);
          this.playersCacheTimestamp = timestamp;
          return this.playersCache;
        }
      }
    } catch (e) {
      console.warn('Failed to load players from cache:', e);
    }

    // Fetch fresh data
    const players = await this.callAPI('players');
    
    // Cache the data
    this.playersCache = players;
    this.playersCacheTimestamp = now;
    
    try {
      localStorage.setItem('sleeper_players_cache', JSON.stringify(players));
      localStorage.setItem('sleeper_players_timestamp', now.toString());
    } catch (e) {
      console.warn('Failed to cache players data:', e);
    }

    return players;
  }

  async getCurrentWeek(): Promise<number> {
    const state: SleeperState = await this.callAPI('state');
    return state.week;
  }

  async validateLeagueId(leagueId: string): Promise<boolean> {
    try {
      await this.getLeague(leagueId);
      return true;
    } catch {
      return false;
    }
  }

  // Utility method to get player name by ID
  async getPlayerName(playerId: string): Promise<string> {
    const players = await this.getPlayers();
    const player = players[playerId];
    return player ? player.full_name : `Player ${playerId}`;
  }

  // Utility method to get multiple player names
  async getPlayerNames(playerIds: string[]): Promise<Record<string, string>> {
    const players = await this.getPlayers();
    const names: Record<string, string> = {};
    
    playerIds.forEach(id => {
      const player = players[id];
      names[id] = player ? player.full_name : `Player ${id}`;
    });
    
    return names;
  }
}

export const sleeperAPI = SleeperAPI.getInstance();