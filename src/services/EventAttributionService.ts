import { debugLogger } from '../utils/debugLogger';
import { safeLower } from '../utils/strings';
import { playerMappingService, RosterPlayer } from './PlayerMappingService';
import { tank01NFLDataService, NFLScoringEvent } from './Tank01NFLDataService';
import { yahooFantasyAPI } from './YahooFantasyAPI';
import { sleeperAPIEnhanced } from './SleeperAPIEnhanced';
import { sleeperService } from './SleeperService';
import { Platform, LeagueData, ScoringEvent } from '../types/fantasy';
import { LeagueConfig } from '../types/config';
import { supabase } from '../integrations/supabase/client';

// Configuration interfaces for scoring events
export interface ConfigScoringEvent {
  id: string;
  playerId: string;
  playerName: string;
  teamAbbr: string;
  eventType: 'rushing_td' | 'passing_td' | 'receiving_td' | 'rushing_yards' | 'passing_yards' | 'receiving_yards';
  description: string;
  fantasyPoints: number;
  timestamp: Date;
  week: number;
  leagueId: string;
}

export interface PlayerStatSnapshot {
  playerId: string;
  week: number;
  stats: Record<string, number>;
  lastUpdated: Date;
}

export interface StatMapping {
  stat_id: string;
  name: string;
  display_name: string;
  points?: number;
}

// Fantasy roster data structures
export interface FantasyRoster {
  leagueId: string;
  teamId: string;
  teamName: string;
  ownerId: string;
  platform: Platform;
  players: FantasyPlayer[];
  lastUpdated: Date;
}

export interface FantasyPlayer {
  id: string;
  platformPlayerId: string;
  name: string;
  position: string;
  team: string;
  isStarter: boolean;
  isActive: boolean; // Not on bye/injured
}

// League scoring settings
export interface LeagueScoringSettings {
  leagueId: string;
  platform: Platform;
  pointsPerPassingYard: number;
  pointsPerPassingTd: number;
  pointsPerRushingYard: number;
  pointsPerRushingTd: number;
  pointsPerReceivingYard: number;
  pointsPerReceivingTd: number;
  pointsPerReception: number; // PPR leagues
  pointsPerFieldGoal: number;
  pointsPerSafety: number;
  pointsPerFumble: number;
  pointsPerInterception: number;
  customRules: Record<string, number>; // Platform-specific rules
  lastUpdated: Date;
}

// Fantasy event attribution result
export interface FantasyEventAttribution {
  nflEvent: NFLScoringEvent;
  fantasyEvents: FantasyEventImpact[];
  timestamp: Date;
}

export interface FantasyEventImpact {
  leagueId: string;
  teamId: string;
  teamName: string;
  platform: Platform;
  player: FantasyPlayer;
  pointsScored: number;
  isStarter: boolean;
  eventType: ConfigScoringEvent['eventType'];
  description: string;
  originalEvent: NFLScoringEvent;
}

interface RosterCache {
  rosters: Map<string, FantasyRoster>; // leagueId -> roster
  scoringSettings: Map<string, LeagueScoringSettings>; // leagueId -> settings
  lastUpdated: Date;
  playerMappings: Map<string, RosterPlayer[]>; // Tank01 player ID -> fantasy players
}

export class EventAttributionService {
  private static instance: EventAttributionService;
  private cache: RosterCache;
  private cacheExpiry = 60 * 60 * 1000; // 1 hour
  private cacheKey = 'fantasy_roster_cache';
  private eventCallbacks: ((attribution: FantasyEventAttribution) => void)[] = [];

  private constructor() {
    this.cache = {
      rosters: new Map(),
      scoringSettings: new Map(),
      lastUpdated: new Date(0),
      playerMappings: new Map()
    };
    this.loadCachedData();
  }

  public static getInstance(): EventAttributionService {
    if (!EventAttributionService.instance) {
      EventAttributionService.instance = new EventAttributionService();
    }
    return EventAttributionService.instance;
  }

  /**
   * Load and cache all user's team rosters from enabled leagues
   */
  public async loadRosters(leagueConfigs: LeagueConfig[], forceRefresh = false): Promise<void> {
    const now = new Date();
    const isExpired = now.getTime() - this.cache.lastUpdated.getTime() > this.cacheExpiry;
    
    if (!forceRefresh && !isExpired && this.cache.rosters.size > 0) {
      debugLogger.info('EVENT_ATTRIBUTION', 'Using cached roster data', {
        rosterCount: this.cache.rosters.size,
        cacheAge: now.getTime() - this.cache.lastUpdated.getTime()
      });
      return;
    }

    debugLogger.info('EVENT_ATTRIBUTION', 'Loading rosters from fantasy platforms', {
      leagueCount: leagueConfigs.length,
      forceRefresh
    });

    this.cache.rosters.clear();
    this.cache.scoringSettings.clear();
    this.cache.playerMappings.clear();

    const rosterPlayers: RosterPlayer[] = [];

    // Load rosters from each enabled league
    for (const leagueConfig of leagueConfigs.filter(c => c.enabled)) {
      try {
        if (leagueConfig.platform === 'Yahoo') {
          await this.loadYahooRoster(leagueConfig, rosterPlayers);
        } else if (leagueConfig.platform === 'Sleeper') {
          await this.loadSleeperRoster(leagueConfig, rosterPlayers);
        }
      } catch (error) {
        debugLogger.error('EVENT_ATTRIBUTION', `Failed to load roster for ${leagueConfig.platform} league ${leagueConfig.leagueId}`, error);
      }
    }

    // Update player mapping service with all roster players
    if (rosterPlayers.length > 0) {
      playerMappingService.buildPlayerIndex(rosterPlayers);
    }

    // Build player mapping cache for quick lookups (NOW WITH AWAIT!)
    await this.buildPlayerMappingCache();

    this.cache.lastUpdated = now;
    this.saveCachedData();

    debugLogger.success('EVENT_ATTRIBUTION', 'Roster loading complete', {
      rostersLoaded: this.cache.rosters.size,
      totalPlayers: rosterPlayers.length,
      mappingsCreated: this.cache.playerMappings.size
    });
  }

  /**
   * Find which fantasy teams own the player in an NFL event
   */
  public attributeEvent(nflEvent: NFLScoringEvent): FantasyEventAttribution | null {
    try {
      const fantasyPlayers = this.cache.playerMappings.get(nflEvent.player.id) || [];
      
      if (fantasyPlayers.length === 0) {
        debugLogger.info('EVENT_ATTRIBUTION', 'No fantasy ownership found for NFL player', {
          playerId: nflEvent.player.id,
          playerName: nflEvent.player.name
        });
        return null;
      }

      const fantasyEvents: FantasyEventImpact[] = [];

      for (const fantasyPlayer of fantasyPlayers) {
        const roster = this.cache.rosters.get(fantasyPlayer.platform + '-' + fantasyPlayer.id.split('-')[0]); // Extract league ID
        if (!roster) continue;

        // Extract just the player ID from composite ID format (leagueId-playerId)
      const playerIdOnly = fantasyPlayer.id.includes('-') ? fantasyPlayer.id.split('-')[1] : fantasyPlayer.id;
      const rosterPlayer = roster.players.find(p => p.platformPlayerId === playerIdOnly);

        if (!rosterPlayer) continue;

        const points = this.calculateFantasyImpact(nflEvent, roster.leagueId);
        if (points === 0) continue; // No fantasy impact

        const eventType = this.mapNFLEventToFantasyEvent(nflEvent.eventType);
        if (!eventType) continue;

        fantasyEvents.push({
          leagueId: roster.leagueId,
          teamId: roster.teamId,
          teamName: roster.teamName,
          platform: roster.platform,
          player: rosterPlayer,
          pointsScored: points,
          isStarter: rosterPlayer.isStarter,
          eventType,
          description: this.generateFantasyDescription(nflEvent, points),
          originalEvent: nflEvent
        });
      }

      if (fantasyEvents.length === 0) {
        return null;
      }

      const attribution: FantasyEventAttribution = {
        nflEvent,
        fantasyEvents,
        timestamp: new Date()
      };

      // Emit to callbacks
      this.eventCallbacks.forEach(callback => {
        try {
          callback(attribution);
        } catch (error) {
          debugLogger.error('EVENT_ATTRIBUTION', 'Error in attribution callback', error);
        }
      });

      debugLogger.success('EVENT_ATTRIBUTION', 'Event attributed to fantasy teams', {
        nflPlayer: nflEvent.player.name,
        fantasyTeamsAffected: fantasyEvents.length,
        eventType: nflEvent.eventType
      });

      return attribution;

    } catch (error) {
      debugLogger.error('EVENT_ATTRIBUTION', 'Failed to attribute NFL event', error);
      return null;
    }
  }

  /**
   * Calculate fantasy point impact for an NFL event
   */
  public calculateFantasyImpact(nflEvent: NFLScoringEvent, leagueId: string): number {
    const scoringSettings = this.cache.scoringSettings.get(leagueId);
    if (!scoringSettings) {
      debugLogger.warning('EVENT_ATTRIBUTION', 'No scoring settings found for league', { leagueId });
      return 0;
    }

    let points = 0;
    const stats = nflEvent.stats;

    switch (nflEvent.eventType) {
      case 'passingtd':
        points = scoringSettings.pointsPerPassingTd;
        break;
      case 'rushingtd':
        points = scoringSettings.pointsPerRushingTd;
        break;
      case 'receivingtd':
        points = scoringSettings.pointsPerReceivingTd;
        if (scoringSettings.pointsPerReception > 0) {
          points += scoringSettings.pointsPerReception; // PPR bonus for TD reception
        }
        break;
      case 'passingyards':
        if (stats.passingYards) {
          points = stats.passingYards * scoringSettings.pointsPerPassingYard;
        }
        break;
      case 'rushingyards':
        if (stats.rushingYards) {
          points = stats.rushingYards * scoringSettings.pointsPerRushingYard;
        }
        break;
      case 'receivingyards':
        if (stats.receivingYards) {
          points = stats.receivingYards * scoringSettings.pointsPerReceivingYard;
          if (scoringSettings.pointsPerReception > 0) {
            points += scoringSettings.pointsPerReception; // PPR bonus
          }
        }
        break;
      case 'fieldgoal':
        points = scoringSettings.pointsPerFieldGoal || 0;
        // Some leagues have distance bonuses - check custom rules
        if (stats.fieldGoalDistance && scoringSettings.customRules[`fg_${stats.fieldGoalDistance}_plus`]) {
          points += scoringSettings.customRules[`fg_${stats.fieldGoalDistance}_plus`];
        }
        break;
      case 'safety':
        points = scoringSettings.pointsPerSafety || 0;
        break;
      case 'fumble':
      case 'fumblelost':
        points = scoringSettings.pointsPerFumble || 0; // Usually negative
        break;
      case 'interception':
        // This could be thrown (negative) or caught (positive for defense)
        points = scoringSettings.pointsPerInterception;
        break;
    }

    return Math.round(points * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Generate fantasy-specific event objects for dashboard display
   */
  public generateFantasyEvents(attributions: FantasyEventAttribution[]): ScoringEvent[] {
    const fantasyEvents: ScoringEvent[] = [];

    for (const attribution of attributions) {
      for (const impact of attribution.fantasyEvents) {
        fantasyEvents.push({
          id: `${attribution.nflEvent.id}-${impact.leagueId}-${impact.teamId}`,
          playerName: impact.player.name,
          position: impact.player.position,
          weeklyPoints: impact.pointsScored,
          action: impact.description,
          scoreImpact: impact.pointsScored,
          timestamp: attribution.timestamp.toISOString(),
          isRecent: Date.now() - attribution.timestamp.getTime() < 300000 // 5 minutes
        });
      }
    }

    return fantasyEvents.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  /**
   * Register callback for new event attributions
   */
  public onEventAttribution(callback: (attribution: FantasyEventAttribution) => void): () => void {
    this.eventCallbacks.push(callback);
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Get cached roster statistics
   */
  public getCacheStats(): {
    rostersCount: number;
    playersCount: number;
    mappingsCount: number;
    lastUpdated: Date;
    isExpired: boolean;
  } {
    const playersCount = Array.from(this.cache.rosters.values())
      .reduce((total, roster) => total + roster.players.length, 0);

    return {
      rostersCount: this.cache.rosters.size,
      playersCount,
      mappingsCount: this.cache.playerMappings.size,
      lastUpdated: this.cache.lastUpdated,
      isExpired: Date.now() - this.cache.lastUpdated.getTime() > this.cacheExpiry
    };
  }

  /**
   * Force refresh roster data
   */
  public async refreshRosters(leagueConfigs: LeagueConfig[]): Promise<void> {
    await this.loadRosters(leagueConfigs, true);
  }

  // Private helper methods

  private async loadYahooRoster(leagueConfig: LeagueConfig, rosterPlayers: RosterPlayer[]): Promise<void> {
    try {
      debugLogger.info('EVENT_ATTRIBUTION', 'Loading Yahoo roster', { leagueId: leagueConfig.leagueId });
      
      // Fetch roster from Yahoo API
      const rosterData = await yahooFantasyAPI.getTeamRoster(leagueConfig.leagueId, leagueConfig.teamId || '');
      
      if (!rosterData) {
        throw new Error(`Could not fetch roster for Yahoo league ${leagueConfig.leagueId}`);
      }

      const fantasyPlayers: FantasyPlayer[] = [];
      
      // Process Yahoo roster players
      for (const player of rosterData.players || []) {
        const fantasyPlayer: FantasyPlayer = {
          id: `${leagueConfig.leagueId}-${player.player_id}`,
          platformPlayerId: player.player_id,
          name: player.name?.full || player.name?.display_name || 'Unknown Player',
          position: player.position_type || player.primary_position || 'UNKNOWN',
          team: player.editorial_team_abbr || 'UNKNOWN',
          isStarter: player.selected_position?.position !== 'BN' && player.selected_position?.position !== 'IR',
          isActive: !player.status_full?.includes('Out') && !player.status_full?.includes('IR')
        };

        fantasyPlayers.push(fantasyPlayer);

        // Add to roster players for mapping service
        rosterPlayers.push({
          id: player.player_id,
          name: fantasyPlayer.name,
          team: fantasyPlayer.team,
          position: fantasyPlayer.position,
          platform: 'Yahoo'
        });
      }

      // Create roster entry
      const roster: FantasyRoster = {
        leagueId: leagueConfig.leagueId,
        teamId: leagueConfig.teamId || 'default',
        teamName: leagueConfig.customTeamName || rosterData.team_name || `Team ${leagueConfig.teamId}`,
        ownerId: 'current_user',
        platform: 'Yahoo',
        players: fantasyPlayers,
        lastUpdated: new Date()
      };

      this.cache.rosters.set(`Yahoo-${leagueConfig.leagueId}`, roster);

      // Create Yahoo standard scoring settings
      const scoringSettings: LeagueScoringSettings = {
        leagueId: leagueConfig.leagueId,
        platform: 'Yahoo',
        pointsPerPassingYard: 1/25, // 1 point per 25 yards
        pointsPerPassingTd: 4,
        pointsPerRushingYard: 1/10, // 1 point per 10 yards
        pointsPerRushingTd: 6,
        pointsPerReceivingYard: 1/10, // 1 point per 10 yards
        pointsPerReceivingTd: 6,
        pointsPerReception: 0, // Standard scoring, not PPR
        pointsPerFieldGoal: 3,
        pointsPerSafety: 2,
        pointsPerFumble: -2,
        pointsPerInterception: -2, // For QB throwing interceptions
        customRules: {}, // Yahoo has consistent rules
        lastUpdated: new Date()
      };

      this.cache.scoringSettings.set(leagueConfig.leagueId, scoringSettings);

      debugLogger.success('EVENT_ATTRIBUTION', 'Yahoo roster loaded successfully', {
        leagueId: leagueConfig.leagueId,
        playerCount: fantasyPlayers.length
      });
      
    } catch (error) {
      debugLogger.error('EVENT_ATTRIBUTION', 'Failed to load Yahoo roster', error);
      throw error;
    }
  }

  private async loadSleeperRoster(leagueConfig: LeagueConfig, rosterPlayers: RosterPlayer[]): Promise<void> {
    try {
      debugLogger.info('EVENT_ATTRIBUTION', 'Loading Sleeper roster', { leagueId: leagueConfig.leagueId });
      
      const staticData = await sleeperAPIEnhanced.getStaticLeagueData(leagueConfig.leagueId);
      const { league, users, rosters } = staticData;

      // Find user's roster based on username if provided
      let userRoster = rosters[0]; // Default to first roster if no username
      if (leagueConfig.sleeperUsername) {
        const user = users.find(u => 
          safeLower(u.username) === safeLower(leagueConfig.sleeperUsername) ||
          safeLower(u.display_name) === safeLower(leagueConfig.sleeperUsername)
        );
        if (user) {
          const foundRoster = rosters.find(r => r.owner_id === user.user_id);
          if (foundRoster) {
            userRoster = foundRoster;
          }
        }
      }

      if (!userRoster) {
        throw new Error(`Could not find roster for user in league ${leagueConfig.leagueId}`);
      }

      // Convert Sleeper roster to our format
      const fantasyPlayers: FantasyPlayer[] = [];
      const rosterPlayerIds = [...(userRoster.players || []), ...(userRoster.starters || [])];

      // Batch fetch all player names to avoid cache thrashing
      const playerNames = await sleeperAPIEnhanced.getPlayerNames(rosterPlayerIds);

      for (const playerId of rosterPlayerIds) {
        try {
          const playerName = playerNames[playerId] || `Player ${playerId}`;
          
          const fantasyPlayer: FantasyPlayer = {
            id: `${leagueConfig.leagueId}-${playerId}`,
            platformPlayerId: playerId,
            name: playerName,
            position: 'UNKNOWN', // Sleeper doesn't provide position in roster
            team: 'UNKNOWN',     // Would need player data lookup
            isStarter: userRoster.starters?.includes(playerId) || false,
            isActive: true
          };

          fantasyPlayers.push(fantasyPlayer);

          // Add to roster players for mapping service
          rosterPlayers.push({
            id: playerId,
            name: playerName,
            team: 'UNKNOWN', // Would need full player data
            position: 'UNKNOWN',
            platform: 'Sleeper'
          });

        } catch (playerError) {
          debugLogger.warning('EVENT_ATTRIBUTION', `Could not resolve Sleeper player ${playerId}`, playerError);
        }
      }

      // Create roster entry
      const roster: FantasyRoster = {
        leagueId: leagueConfig.leagueId,
        teamId: userRoster.roster_id.toString(),
        teamName: leagueConfig.customTeamName || `Team ${userRoster.roster_id}`,
        ownerId: userRoster.owner_id,
        platform: 'Sleeper',
        players: fantasyPlayers,
        lastUpdated: new Date()
      };

      this.cache.rosters.set(`Sleeper-${leagueConfig.leagueId}`, roster);

      // Fetch proper scoring settings using SleeperService
      try {
        const standardizedScoring = await sleeperService.getLeagueScoring(leagueConfig.leagueId);
        
        // Convert standardized scoring to internal format
        const scoringSettings: LeagueScoringSettings = {
          leagueId: leagueConfig.leagueId,
          platform: 'Sleeper',
          pointsPerPassingYard: standardizedScoring.pass_yd,
          pointsPerPassingTd: standardizedScoring.pass_td,
          pointsPerRushingYard: standardizedScoring.rush_yd,
          pointsPerRushingTd: standardizedScoring.rush_td,
          pointsPerReceivingYard: standardizedScoring.rec_yd,
          pointsPerReceivingTd: standardizedScoring.rec_td,
          pointsPerReception: standardizedScoring.rec,
          pointsPerFieldGoal: standardizedScoring.fgm_30_39, // Default field goal value
          pointsPerSafety: standardizedScoring.def_safe,
          pointsPerFumble: standardizedScoring.fum_lost,
          pointsPerInterception: standardizedScoring.pass_int,
          customRules: {
            // Store all standardized rules for advanced calculations
            ...Object.fromEntries(
              Object.entries(standardizedScoring).map(([key, value]) => [key, value as number])
            )
          },
          lastUpdated: new Date()
        };

        this.cache.scoringSettings.set(leagueConfig.leagueId, scoringSettings);
        
        debugLogger.success('EVENT_ATTRIBUTION', 'Loaded Sleeper scoring settings', {
          leagueId: leagueConfig.leagueId,
          isPPR: standardizedScoring.rec > 0,
          passingTdPoints: standardizedScoring.pass_td,
          rushingTdPoints: standardizedScoring.rush_td,
          receivingTdPoints: standardizedScoring.rec_td
        });
      
      } catch (scoringError) {
        debugLogger.warning('EVENT_ATTRIBUTION', 'Failed to load Sleeper scoring settings, using defaults', {
          leagueId: leagueConfig.leagueId,
          error: scoringError.message
        });
        
        // Fallback to default scoring settings
        const defaultScoring: LeagueScoringSettings = {
          leagueId: leagueConfig.leagueId,
          platform: 'Sleeper',
          pointsPerPassingYard: 0.04,
          pointsPerPassingTd: 4,
          pointsPerRushingYard: 0.1,
          pointsPerRushingTd: 6,
          pointsPerReceivingYard: 0.1,
          pointsPerReceivingTd: 6,
          pointsPerReception: league.scoring_settings?.rec || 0,
          pointsPerFieldGoal: 3,
          pointsPerSafety: 2,
          pointsPerFumble: -2,
          pointsPerInterception: -2,
          customRules: league.scoring_settings || {},
          lastUpdated: new Date()
        };

        this.cache.scoringSettings.set(leagueConfig.leagueId, defaultScoring);
      }

      debugLogger.success('EVENT_ATTRIBUTION', 'Sleeper roster loaded successfully', {
        leagueId: leagueConfig.leagueId,
        playerCount: fantasyPlayers.length
      });

    } catch (error) {
      debugLogger.error('EVENT_ATTRIBUTION', 'Failed to load Sleeper roster', error);
      throw error;
    }
  }

  private async buildPlayerMappingCache(): Promise<void> {
    this.cache.playerMappings.clear();

    debugLogger.info('EVENT_ATTRIBUTION', 'Building player mapping cache from database');

    // Collect all Sleeper player IDs from rosters
    const sleeperPlayerIds: string[] = [];
    for (const roster of this.cache.rosters.values()) {
      if (roster.platform === 'Sleeper') {
        for (const player of roster.players) {
          sleeperPlayerIds.push(player.platformPlayerId);
        }
      }
    }

    if (sleeperPlayerIds.length === 0) {
      debugLogger.warning('EVENT_ATTRIBUTION', 'No Sleeper players to map');
      return;
    }

    try {
      // Query player_mappings table to get Tank01 IDs for Sleeper players
      const { data: mappings, error } = await supabase
        .from('player_mappings')
        .select('tank01_id, sleeper_id, name, team, position')
        .in('sleeper_id', sleeperPlayerIds);

      if (error) {
        debugLogger.error('EVENT_ATTRIBUTION', 'Failed to query player mappings', error);
        return;
      }

      if (!mappings || mappings.length === 0) {
        debugLogger.warning('EVENT_ATTRIBUTION', 'No player mappings found in database');
        return;
      }

      // Build Tank01 ID -> Fantasy Players mapping
      for (const mapping of mappings) {
        if (!mapping.tank01_id || !mapping.sleeper_id) continue;

        // Find all fantasy teams that have this Sleeper player
        const fantasyPlayers: RosterPlayer[] = [];

        for (const roster of this.cache.rosters.values()) {
          if (roster.platform !== 'Sleeper') continue;

          const player = roster.players.find(p => p.platformPlayerId === mapping.sleeper_id);
          if (player) {
            fantasyPlayers.push({
              id: `${roster.leagueId}-${player.platformPlayerId}`,
              name: player.name,
              team: mapping.team || player.team,
              position: mapping.position || player.position,
              platform: 'Sleeper'
            });
          }
        }

        if (fantasyPlayers.length > 0) {
          this.cache.playerMappings.set(mapping.tank01_id, fantasyPlayers);
        }
      }

      debugLogger.success('EVENT_ATTRIBUTION', 'Player mapping cache built from database', {
        sleeperPlayers: sleeperPlayerIds.length,
        mappingsFound: mappings.length,
        tank01MappingsCreated: this.cache.playerMappings.size
      });

    } catch (error) {
      debugLogger.error('EVENT_ATTRIBUTION', 'Failed to build player mapping cache', error);
    }
  }

  private mapNFLEventToFantasyEvent(nflEventType: NFLScoringEvent['eventType']): ConfigScoringEvent['eventType'] | null {
    const mapping: Record<NFLScoringEvent['eventType'], ConfigScoringEvent['eventType'] | null> = {
      'passingtd': 'passing_td',
      'rushingtd': 'rushing_td',
      'receivingtd': 'receiving_td',
      'passingyards': 'passing_yards',
      'rushingyards': 'rushing_yards',
      'receivingyards': 'receiving_yards',
      'fieldgoal': null, // Kickers not typically tracked in basic fantasy
      'safety': null,
      'fumble': null,
      'fumblelost': null,
      'interception': null
    };

    return mapping[nflEventType] || null;
  }

  private generateFantasyDescription(nflEvent: NFLScoringEvent, points: number): string {
    const sign = points >= 0 ? '+' : '';
    return `${nflEvent.description} (${sign}${points} pts)`;
  }

  private loadCachedData(): void {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return;

      const data = JSON.parse(cached);
      if (Date.now() - new Date(data.timestamp).getTime() > this.cacheExpiry) {
        localStorage.removeItem(this.cacheKey);
        return;
      }

      // Restore cache data (simplified - would need full deserialization)
      this.cache.lastUpdated = new Date(data.timestamp);
      
      debugLogger.info('EVENT_ATTRIBUTION', 'Loaded cached roster data');
    } catch (error) {
      debugLogger.error('EVENT_ATTRIBUTION', 'Failed to load cached data', error);
      localStorage.removeItem(this.cacheKey);
    }
  }

  private saveCachedData(): void {
    try {
      const cacheData = {
        timestamp: this.cache.lastUpdated.toISOString(),
        rosterCount: this.cache.rosters.size,
        mappingCount: this.cache.playerMappings.size
      };

      localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      debugLogger.error('EVENT_ATTRIBUTION', 'Failed to save cached data', error);
    }
  }
}

// Export singleton instance
export const eventAttributionService = EventAttributionService.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).eventAttributionService = eventAttributionService;
}
