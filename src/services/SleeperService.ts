import { sleeperAPIEnhanced, SleeperLeague, SleeperUser } from './SleeperAPIEnhanced';
import { SleeperScoringSettings } from './FantasyPointsCalculator';
import { debugLogger } from '@/utils/debugLogger';

export interface SleeperUserLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  settings: {
    num_teams: number;
  };
  scoring_settings: SleeperScoringSettings;
  roster_positions: string[];
}

export interface StandardizedScoringRules {
  // Passing
  pass_yd: number;
  pass_td: number;
  pass_int: number;
  pass_2pt: number;
  
  // Rushing  
  rush_yd: number;
  rush_td: number;
  rush_2pt: number;
  
  // Receiving
  rec_yd: number;
  rec_td: number;
  rec: number; // Reception points (PPR)
  rec_2pt: number;
  
  // Fumbles
  fum_lost: number;
  fum_rec: number;
  
  // Kicking
  fgm_0_19: number;
  fgm_20_29: number;
  fgm_30_39: number;
  fgm_40_49: number;
  fgm_50p: number;
  fgmiss: number;
  xpm: number;
  xpmiss: number;
  
  // Defense/Special Teams
  def_td: number;
  def_int: number;
  def_fr: number;
  def_ff: number;
  def_sack: number;
  def_safe: number;
  def_pa: number; // Points allowed
  def_yds_allowed: number; // Yards allowed
  
  // Bonus thresholds (if supported)
  bonus_pass_yd_300?: number;
  bonus_pass_yd_400?: number;
  bonus_rush_yd_100?: number;
  bonus_rush_yd_200?: number;
  bonus_rec_yd_100?: number;
  bonus_rec_yd_200?: number;
  
  // Platform identifier
  platform: 'Sleeper';
  lastUpdated: string;
}

export class SleeperService {
  private static instance: SleeperService;
  private scoringCache = new Map<string, StandardizedScoringRules>();
  private readonly CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache
  private readonly STORAGE_PREFIX = 'sleeper_scoring_';

  public static getInstance(): SleeperService {
    if (!SleeperService.instance) {
      SleeperService.instance = new SleeperService();
    }
    return SleeperService.instance;
  }

  /**
   * Fetch all leagues for a user (requires username)
   */
  async fetchSleeperLeagues(username: string, season: string = '2024'): Promise<SleeperUserLeague[]> {
    debugLogger.info('SLEEPER_SERVICE', `Fetching leagues for user: ${username}, season: ${season}`);
    
    try {
      // Note: Sleeper API requires username, not user_id for this endpoint
      const response = await fetch(`https://api.sleeper.app/v1/user/${username}/leagues/nfl/${season}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'FantasyDashboard/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch leagues: ${response.status} ${response.statusText}`);
      }

      const leagues: SleeperLeague[] = await response.json();
      
      debugLogger.success('SLEEPER_SERVICE', `Found ${leagues.length} leagues for user ${username}`, {
        username,
        season,
        leagueCount: leagues.length,
        leagueIds: leagues.map(l => l.league_id)
      });

      return leagues.map(league => ({
        league_id: league.league_id,
        name: league.name,
        season: league.season,
        status: league.status,
        settings: {
          num_teams: league.settings.num_teams
        },
        scoring_settings: league.scoring_settings,
        roster_positions: league.roster_positions
      }));
      
    } catch (error) {
      debugLogger.error('SLEEPER_SERVICE', `Failed to fetch leagues for user ${username}`, {
        username,
        season,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get scoring settings for a specific league
   */
  async getLeagueScoring(leagueId: string): Promise<StandardizedScoringRules> {
    debugLogger.info('SLEEPER_SERVICE', `Fetching scoring settings for league: ${leagueId}`);
    
    // Check cache first
    const cached = this.getCachedScoringRules(leagueId);
    if (cached) {
      debugLogger.info('SLEEPER_SERVICE', `Using cached scoring rules for league: ${leagueId}`);
      return cached;
    }

    try {
      // Fetch league data using existing SleeperAPIEnhanced
      const league = await sleeperAPIEnhanced.getLeague(leagueId);
      
      // Parse and standardize scoring settings
      const standardizedRules = this.parseSleeperScoringSettings(league.scoring_settings, leagueId);
      
      // Cache the rules
      this.cacheScoringRules(leagueId, standardizedRules);
      
      debugLogger.success('SLEEPER_SERVICE', `Successfully parsed scoring rules for league: ${leagueId}`, {
        leagueId,
        ruleCount: Object.keys(standardizedRules).length
      });
      
      return standardizedRules;
      
    } catch (error) {
      debugLogger.error('SLEEPER_SERVICE', `Failed to fetch scoring settings for league: ${leagueId}`, {
        leagueId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Parse Sleeper scoring settings into standardized format
   */
  private parseSleeperScoringSettings(
    scoringSettings: Record<string, number>,
    leagueId: string
  ): StandardizedScoringRules {
    debugLogger.info('SLEEPER_SERVICE', `Parsing scoring settings for league: ${leagueId}`, {
      originalSettings: scoringSettings
    });

    // Default scoring rules (most common Sleeper settings)
    const standardized: StandardizedScoringRules = {
      // Passing
      pass_yd: scoringSettings.pass_yd || 0.04, // 1 pt per 25 yards
      pass_td: scoringSettings.pass_td || 4,
      pass_int: scoringSettings.pass_int || -2,
      pass_2pt: scoringSettings.pass_2pt || 2,
      
      // Rushing
      rush_yd: scoringSettings.rush_yd || 0.1, // 1 pt per 10 yards
      rush_td: scoringSettings.rush_td || 6,
      rush_2pt: scoringSettings.rush_2pt || 2,
      
      // Receiving
      rec_yd: scoringSettings.rec_yd || 0.1, // 1 pt per 10 yards
      rec_td: scoringSettings.rec_td || 6,
      rec: scoringSettings.rec || 0, // PPR value
      rec_2pt: scoringSettings.rec_2pt || 2,
      
      // Fumbles
      fum_lost: scoringSettings.fum_lost || -2,
      fum_rec: scoringSettings.fum_rec || 2,
      
      // Kicking
      fgm_0_19: scoringSettings.fgm_0_19 || 3,
      fgm_20_29: scoringSettings.fgm_20_29 || 3,
      fgm_30_39: scoringSettings.fgm_30_39 || 3,
      fgm_40_49: scoringSettings.fgm_40_49 || 4,
      fgm_50p: scoringSettings.fgm_50p || 5,
      fgmiss: scoringSettings.fgmiss || 0,
      xpm: scoringSettings.xpm || 1,
      xpmiss: scoringSettings.xpmiss || 0,
      
      // Defense/Special Teams
      def_td: scoringSettings.def_td || 6,
      def_int: scoringSettings.def_int || 2,
      def_fr: scoringSettings.def_fr || 2,
      def_ff: scoringSettings.def_ff || 1,
      def_sack: scoringSettings.def_sack || 1,
      def_safe: scoringSettings.def_safe || 2,
      def_pa: scoringSettings.def_pa || 0,
      def_yds_allowed: scoringSettings.def_yds_allowed || 0,
      
      // Bonus scoring (if present)
      bonus_pass_yd_300: scoringSettings.bonus_pass_yd_300 || undefined,
      bonus_pass_yd_400: scoringSettings.bonus_pass_yd_400 || undefined,
      bonus_rush_yd_100: scoringSettings.bonus_rush_yd_100 || undefined,
      bonus_rush_yd_200: scoringSettings.bonus_rush_yd_200 || undefined,
      bonus_rec_yd_100: scoringSettings.bonus_rec_yd_100 || undefined,
      bonus_rec_yd_200: scoringSettings.bonus_rec_yd_200 || undefined,
      
      platform: 'Sleeper',
      lastUpdated: new Date().toISOString()
    };

    debugLogger.info('SLEEPER_SERVICE', `Standardized scoring rules for league: ${leagueId}`, {
      leagueId,
      standardizedRules: standardized,
      isFullPPR: standardized.rec >= 1,
      isHalfPPR: standardized.rec > 0 && standardized.rec < 1,
      isStandard: standardized.rec === 0
    });

    return standardized;
  }

  /**
   * Get cached scoring rules from memory or localStorage
   */
  private getCachedScoringRules(leagueId: string): StandardizedScoringRules | null {
    // Check memory cache first
    const memoryCache = this.scoringCache.get(leagueId);
    if (memoryCache) {
      const cacheAge = Date.now() - new Date(memoryCache.lastUpdated).getTime();
      if (cacheAge < this.CACHE_DURATION) {
        return memoryCache;
      }
      // Remove expired memory cache
      this.scoringCache.delete(leagueId);
    }

    // Check localStorage
    try {
      const storageKey = `${this.STORAGE_PREFIX}${leagueId}`;
      const cached = localStorage.getItem(storageKey);
      
      if (cached) {
        const parsed: StandardizedScoringRules = JSON.parse(cached);
        const cacheAge = Date.now() - new Date(parsed.lastUpdated).getTime();
        
        if (cacheAge < this.CACHE_DURATION) {
          // Restore to memory cache
          this.scoringCache.set(leagueId, parsed);
          return parsed;
        } else {
          // Remove expired localStorage cache
          localStorage.removeItem(storageKey);
        }
      }
    } catch (error) {
      debugLogger.warning('SLEEPER_SERVICE', `Failed to load cached scoring rules for league: ${leagueId}`, {
        error: error.message
      });
    }

    return null;
  }

  /**
   * Cache scoring rules in memory and localStorage
   */
  private cacheScoringRules(leagueId: string, rules: StandardizedScoringRules): void {
    try {
      // Update timestamp
      rules.lastUpdated = new Date().toISOString();
      
      // Cache in memory
      this.scoringCache.set(leagueId, rules);
      
      // Cache in localStorage
      const storageKey = `${this.STORAGE_PREFIX}${leagueId}`;
      localStorage.setItem(storageKey, JSON.stringify(rules));
      
      debugLogger.info('SLEEPER_SERVICE', `Cached scoring rules for league: ${leagueId}`, {
        leagueId,
        cacheKey: storageKey,
        timestamp: rules.lastUpdated
      });
      
    } catch (error) {
      debugLogger.warning('SLEEPER_SERVICE', `Failed to cache scoring rules for league: ${leagueId}`, {
        error: error.message
      });
    }
  }

  /**
   * Clear cache for a specific league
   */
  public clearLeagueCache(leagueId: string): void {
    this.scoringCache.delete(leagueId);
    
    try {
      const storageKey = `${this.STORAGE_PREFIX}${leagueId}`;
      localStorage.removeItem(storageKey);
      
      debugLogger.info('SLEEPER_SERVICE', `Cleared cache for league: ${leagueId}`, {
        leagueId,
        cacheKey: storageKey
      });
    } catch (error) {
      debugLogger.warning('SLEEPER_SERVICE', `Failed to clear cache for league: ${leagueId}`, {
        error: error.message
      });
    }
  }

  /**
   * Clear all cached scoring rules
   */
  public clearAllCache(): void {
    this.scoringCache.clear();
    
    try {
      // Find and remove all Sleeper scoring cache entries
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      debugLogger.info('SLEEPER_SERVICE', `Cleared all Sleeper scoring cache`, {
        removedKeys: keysToRemove.length
      });
      
    } catch (error) {
      debugLogger.warning('SLEEPER_SERVICE', `Failed to clear all cache`, {
        error: error.message
      });
    }
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): {
    memoryCache: number;
    localStorageCache: number;
    totalLeagues: string[];
  } {
    const memoryCount = this.scoringCache.size;
    const leagueIds = Array.from(this.scoringCache.keys());
    
    let localStorageCount = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_PREFIX)) {
          localStorageCount++;
        }
      }
    } catch (error) {
      debugLogger.warning('SLEEPER_SERVICE', `Failed to count localStorage cache`, {
        error: error.message
      });
    }
    
    return {
      memoryCache: memoryCount,
      localStorageCache: localStorageCount,
      totalLeagues: leagueIds
    };
  }

  /**
   * Batch fetch scoring rules for multiple leagues
   */
  async batchGetLeagueScoring(leagueIds: string[]): Promise<Record<string, StandardizedScoringRules>> {
    debugLogger.info('SLEEPER_SERVICE', `Batch fetching scoring rules for ${leagueIds.length} leagues`, {
      leagueIds
    });

    const results: Record<string, StandardizedScoringRules> = {};
    const fetchPromises = leagueIds.map(async (leagueId) => {
      try {
        results[leagueId] = await this.getLeagueScoring(leagueId);
      } catch (error) {
        debugLogger.error('SLEEPER_SERVICE', `Failed to fetch scoring for league: ${leagueId}`, {
          leagueId,
          error: error.message
        });
      }
    });

    await Promise.allSettled(fetchPromises);
    
    debugLogger.success('SLEEPER_SERVICE', `Batch fetch completed`, {
      requested: leagueIds.length,
      successful: Object.keys(results).length,
      failed: leagueIds.length - Object.keys(results).length
    });

    return results;
  }
}

// Export singleton instance
export const sleeperService = SleeperService.getInstance();