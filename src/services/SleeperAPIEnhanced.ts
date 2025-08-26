import { supabase } from '@/integrations/supabase/client';
import { debugLogger } from '@/utils/debugLogger';

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
  metadata?: {
    team_name?: string;
    mascot?: string;
    [key: string]: any;
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

export class SleeperAPIEnhanced {
  private static instance: SleeperAPIEnhanced;
  private playersCache: Record<string, SleeperPlayer> | null = null;
  private playersCacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  
  // Smart caching for league data
  private leagueDataCache = new Map<string, {data: any, timestamp: number}>();
  private readonly STATIC_CACHE_DURATION = 300000; // 5 minutes

  static getInstance(): SleeperAPIEnhanced {
    if (!SleeperAPIEnhanced.instance) {
      SleeperAPIEnhanced.instance = new SleeperAPIEnhanced();
    }
    return SleeperAPIEnhanced.instance;
  }

  private async callAPI(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const startTime = Date.now();
    const urlParams = new URLSearchParams({
      endpoint,
      ...params,
    });

    const url = `https://doyquitecogdnvbyiszt.supabase.co/functions/v1/sleeper-api?${urlParams}`;
    
    debugLogger.logAPICall(url, 'GET', startTime);

    try {
      // Make the HTTP call to our edge function
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        debugLogger.logAPIError(error, errorData, responseTime);
        throw error;
      }

      const responseData = await response.json();
      debugLogger.logAPIResponse(response.status, response.statusText, responseData, responseTime);
      
      return responseData;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      debugLogger.logAPIError(error as Error, undefined, responseTime);
      throw error;
    }
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

  // Enhanced error recovery for SleeperAPI
  async getStaticLeagueData(leagueId: string, forceRefresh = false): Promise<{
    league: SleeperLeague,
    users: SleeperUser[],
    rosters: SleeperRoster[]
  }> {
    const cacheKey = `${leagueId}_static`;
    const cached = this.leagueDataCache.get(cacheKey);

    if (!forceRefresh && cached && (Date.now() - cached.timestamp < this.STATIC_CACHE_DURATION)) {
      debugLogger.info('SLEEPER_CACHE', `Using cached static data for league ${leagueId}`, {
        cacheAge: Date.now() - cached.timestamp,
        maxAge: this.STATIC_CACHE_DURATION
      });
      return cached.data;
    }

    debugLogger.info('SLEEPER_CACHE', `Fetching fresh static data for league ${leagueId}`, {
      forceRefresh,
      cacheExpired: cached ? Date.now() - cached.timestamp >= this.STATIC_CACHE_DURATION : true
    });

    try {
      const [league, users, rosters] = await Promise.all([
        this.getLeague(leagueId),
        this.getUsers(leagueId),
        this.getRosters(leagueId)
      ]);

      const data = { league, users, rosters };
      this.leagueDataCache.set(cacheKey, { data, timestamp: Date.now() });
      
      // Preserve to localStorage for offline recovery
      this.preserveStaticData();
      
      debugLogger.success('SLEEPER_CACHE', `Cached static data for league ${leagueId}`, {
        leagueId,
        dataKeys: Object.keys(data)
      });
      
      return data;
    } catch (error) {
      // Try to return cached data if network fails
      if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) { // 24 hours
      debugLogger.warning('SLEEPER_CACHE', `Using stale cached data due to error: ${error}`, {
        cacheAge: Date.now() - cached.timestamp
      });
        return cached.data;
      }
      
      // Try to load from localStorage as last resort
      const preserved = this.loadPreservedStaticData(leagueId);
      if (preserved) {
        debugLogger.warning('SLEEPER_CACHE', `Using preserved data from localStorage due to error: ${error}`);
        return preserved;
      }
      
      throw error;
    }
  }

  async validateLeagueId(leagueId: string): Promise<boolean> {
    debugLogger.logLeagueAdditionStart(leagueId);
    
    try {
      // Input validation
      const cleanedId = leagueId.trim();
      debugLogger.logValidationStep(`Input received: ${leagueId}`, true, { original: leagueId, cleaned: cleanedId });
      
      if (!cleanedId) {
        debugLogger.logValidationStep('League ID is empty', false);
        return false;
      }
      
      // Format validation - Accept 15-20 digit league IDs
      if (!/^\d{15,20}$/.test(cleanedId)) {
        debugLogger.logValidationStep(`Format invalid: expected 15-20 digits, got ${cleanedId.length} characters`, false, {
          value: cleanedId,
          length: cleanedId.length,
          pattern: '15-20 digits numeric only',
          regexTest: `/^\d{15,20}$/.test('${cleanedId}') = ${/^\d{15,20}$/.test(cleanedId)}`
        });
        return false;
      }
      
      debugLogger.logValidationStep(`Format valid: ${cleanedId.length} digits, numeric only`, true, { 
        value: cleanedId,
        length: cleanedId.length,
        regexTest: `/^\d{15,20}$/.test('${cleanedId}') = ${/^\d{15,20}$/.test(cleanedId)}`
      });
      
      // API validation
      debugLogger.info('LEAGUE_VALIDATION', 'Attempting to fetch league data');
      await this.getLeague(cleanedId);
      
      debugLogger.success('LEAGUE_VALIDATION', 'League validation successful', { leagueId: cleanedId });
      return true;
      
    } catch (error) {
      debugLogger.error('LEAGUE_VALIDATION', `League validation failed: ${error.message}`, {
        leagueId,
        error: error.message,
        stack: error.stack
      });
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

  // Get cache statistics for debugging
  getCacheStats(): { size: number; entries: Array<{key: string; age: number; isExpired: boolean}> } {
    const entries = Array.from(this.leagueDataCache.entries()).map(([key, value]) => ({
      key,
      age: Date.now() - value.timestamp,
      isExpired: Date.now() - value.timestamp >= this.STATIC_CACHE_DURATION
    }));
    
    return {
      size: this.leagueDataCache.size,
      entries
    };
  }

  // Clear expired cache entries
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.leagueDataCache.entries()) {
      if (now - value.timestamp >= this.STATIC_CACHE_DURATION) {
        this.leagueDataCache.delete(key);
        debugLogger.info('SLEEPER_CACHE', `Removed expired cache entry: ${key}`);
      }
    }
  }

  // Offline data preservation methods
  private preserveStaticData(): void {
    try {
      const dataToPreserve = Array.from(this.leagueDataCache.entries());
      localStorage.setItem('sleeper_static_cache', JSON.stringify(dataToPreserve));
    } catch (error) {
      debugLogger.warning('SLEEPER_CACHE', 'Failed to preserve static data to localStorage', error);
    }
  }

  private loadPreservedStaticData(leagueId: string): any | null {
    try {
      const preserved = localStorage.getItem('sleeper_static_cache');
      if (preserved) {
        const data = new Map(JSON.parse(preserved));
        const cacheKey = `${leagueId}_static`;
        const cachedData = data.get(cacheKey);
        
        if (cachedData && typeof cachedData === 'object' && cachedData !== null && 
            'timestamp' in cachedData && 'data' in cachedData &&
            Date.now() - (cachedData.timestamp as number) < 24 * 60 * 60 * 1000) { // 24 hours
          return cachedData.data;
        }
      }
    } catch (error) {
      debugLogger.warning('SLEEPER_CACHE', 'Failed to load preserved static data from localStorage', error);
    }
    return null;
  }

  // Get last update timestamp for a league
  getLastUpdateTimestamp(leagueId: string): number | null {
    const cacheKey = `${leagueId}_static`;
    const cached = this.leagueDataCache.get(cacheKey);
    return cached ? cached.timestamp : null;
  }
}

export const sleeperAPIEnhanced = SleeperAPIEnhanced.getInstance();