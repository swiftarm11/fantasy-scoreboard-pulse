import { debugLogger } from '../utils/debugLogger';
import { Platform } from '../types/fantasy';

export interface PlayerMapping {
  id: string; // Unique composite key: name-team-position
  name: string;
  team: string;
  position: string;
  platforms: {
    yahoo?: string; // Yahoo player key
    sleeper?: string; // Sleeper player ID
    espn?: string; // ESPN player ID
  };
  alternateNames: string[]; // Name variations
  lastUpdated: Date;
}

export interface ESPNPlayer {
  id: string;
  displayName: string;
  fullName: string;
  proTeam: {
    abbreviation: string;
    displayName: string;
  };
  position: {
    abbreviation: string;
  };
}

export interface RosterPlayer {
  id: string;
  name: string;
  team: string;
  position: string;
  platform: Platform;
}

interface PlayerIndex {
  byName: Map<string, PlayerMapping[]>;
  byTeamAndPosition: Map<string, PlayerMapping[]>;
  byPlatformId: Map<string, PlayerMapping>;
}

export class PlayerMappingService {
  private static instance: PlayerMappingService;
  private playerIndex: PlayerIndex;
  private cacheKey = 'fantasy_player_mappings';
  private cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours

  private constructor() {
    this.playerIndex = {
      byName: new Map(),
      byTeamAndPosition: new Map(),
      byPlatformId: new Map()
    };
    this.loadCachedMappings();
  }

  public static getInstance(): PlayerMappingService {
    if (!PlayerMappingService.instance) {
      PlayerMappingService.instance = new PlayerMappingService();
    }
    return PlayerMappingService.instance;
  }

  /**
   * Creates name-based lookup index from roster data
   */
  public buildPlayerIndex(rosterData: RosterPlayer[]): void {
    debugLogger.info('PLAYER_MAPPING', 'Building player index from roster data', { playerCount: rosterData.length });
    
    this.clearIndex();

    for (const player of rosterData) {
      const mapping = this.createOrUpdateMapping(player);
      this.addToIndex(mapping);
    }

    this.saveCachedMappings();
    debugLogger.success('PLAYER_MAPPING', 'Player index built successfully', { 
      nameEntries: this.playerIndex.byName.size,
      teamPositionEntries: this.playerIndex.byTeamAndPosition.size
    });
  }

  /**
   * Fuzzy matching for player resolution
   */
  public findPlayer(name: string, team: string, position: string): PlayerMapping | null {
    const normalizedName = this.normalizeName(name);
    const normalizedTeam = this.normalizeTeam(team);
    const normalizedPosition = this.normalizePosition(position);

    // 1. Exact match by name
    const exactMatches = this.playerIndex.byName.get(normalizedName) || [];
    for (const player of exactMatches) {
      if (this.normalizeTeam(player.team) === normalizedTeam && 
          this.normalizePosition(player.position) === normalizedPosition) {
        return player;
      }
    }

    // 2. Fuzzy name matching with team/position filter
    const fuzzyMatches = this.fuzzyNameSearch(normalizedName);
    for (const player of fuzzyMatches) {
      if (this.normalizeTeam(player.team) === normalizedTeam && 
          this.normalizePosition(player.position) === normalizedPosition) {
        return player;
      }
    }

    // 3. Team + Position matching (useful for trade scenarios)
    const teamPositionKey = `${normalizedTeam}-${normalizedPosition}`;
    const teamPositionMatches = this.playerIndex.byTeamAndPosition.get(teamPositionKey) || [];
    
    // Find best name match within same team/position
    let bestMatch: PlayerMapping | null = null;
    let bestScore = 0;

    for (const player of teamPositionMatches) {
      const score = this.calculateNameSimilarity(normalizedName, this.normalizeName(player.name));
      if (score > bestScore && score > 0.7) { // 70% similarity threshold
        bestMatch = player;
        bestScore = score;
      }
    }

    if (bestMatch) {
      debugLogger.info('PLAYER_MAPPING', 'Fuzzy match found', { 
        searchName: name, 
        foundName: bestMatch.name, 
        similarity: bestScore 
      });
    }

    return bestMatch;
  }

  /**
   * Converts ESPN player data to fantasy platform IDs
   */
  public mapESPNToFantasy(espnPlayer: ESPNPlayer, platform: Platform): string | null {
    const mapping = this.findPlayer(
      espnPlayer.displayName || espnPlayer.fullName,
      espnPlayer.proTeam.abbreviation,
      espnPlayer.position.abbreviation
    );

    if (!mapping) {
      debugLogger.warning('PLAYER_MAPPING', 'No mapping found for ESPN player', { 
        name: espnPlayer.displayName, 
        team: espnPlayer.proTeam.abbreviation,
        position: espnPlayer.position.abbreviation 
      });
      return null;
    }

    const platformId = mapping.platforms[platform.toLowerCase() as keyof typeof mapping.platforms];
    
    if (!platformId) {
      debugLogger.warning('PLAYER_MAPPING', `No ${platform} ID found for player`, { 
        playerName: mapping.name,
        availablePlatforms: Object.keys(mapping.platforms)
      });
    }

    return platformId || null;
  }

  /**
   * Add a new player mapping or update existing one
   */
  public addPlayerMapping(player: RosterPlayer): void {
    const mapping = this.createOrUpdateMapping(player);
    this.addToIndex(mapping);
    this.saveCachedMappings();
  }

  /**
   * Handle player trades by updating team information
   */
  public updatePlayerTeam(playerId: string, newTeam: string, platform: Platform): void {
    const mapping = this.playerIndex.byPlatformId.get(`${platform}-${playerId}`);
    
    if (mapping) {
      // Remove from old team-position index
      const oldKey = `${this.normalizeTeam(mapping.team)}-${this.normalizePosition(mapping.position)}`;
      const oldList = this.playerIndex.byTeamAndPosition.get(oldKey) || [];
      const updatedOldList = oldList.filter(p => p.id !== mapping.id);
      
      if (updatedOldList.length > 0) {
        this.playerIndex.byTeamAndPosition.set(oldKey, updatedOldList);
      } else {
        this.playerIndex.byTeamAndPosition.delete(oldKey);
      }

      // Update mapping
      mapping.team = newTeam;
      mapping.lastUpdated = new Date();

      // Add to new team-position index
      const newKey = `${this.normalizeTeam(newTeam)}-${this.normalizePosition(mapping.position)}`;
      const newList = this.playerIndex.byTeamAndPosition.get(newKey) || [];
      newList.push(mapping);
      this.playerIndex.byTeamAndPosition.set(newKey, newList);

      this.saveCachedMappings();
      debugLogger.info('PLAYER_MAPPING', 'Player team updated', { playerId, oldTeam: mapping.team, newTeam });
    }
  }

  /**
   * Get mapping statistics for debugging
   */
  public getMappingStats(): {
    totalPlayers: number;
    platformCoverage: Record<string, number>;
    lastUpdated: Date | null;
  } {
    const allMappings = Array.from(this.playerIndex.byPlatformId.values());
    const platformCoverage: Record<string, number> = {};
    let lastUpdated: Date | null = null;

    for (const mapping of allMappings) {
      Object.keys(mapping.platforms).forEach(platform => {
        platformCoverage[platform] = (platformCoverage[platform] || 0) + 1;
      });
      
      if (!lastUpdated || mapping.lastUpdated > lastUpdated) {
        lastUpdated = mapping.lastUpdated;
      }
    }

    return {
      totalPlayers: allMappings.length,
      platformCoverage,
      lastUpdated
    };
  }

  private createOrUpdateMapping(player: RosterPlayer): PlayerMapping {
    const id = this.createPlayerId(player.name, player.team, player.position);
    
    // Check if mapping already exists
    let mapping = Array.from(this.playerIndex.byPlatformId.values())
      .find(m => m.id === id);

    if (mapping) {
      // Update existing mapping
      mapping.platforms[player.platform.toLowerCase() as keyof typeof mapping.platforms] = player.id;
      mapping.lastUpdated = new Date();
    } else {
      // Create new mapping
      mapping = {
        id,
        name: player.name,
        team: player.team,
        position: player.position,
        platforms: {
          [player.platform.toLowerCase()]: player.id
        } as any,
        alternateNames: [player.name],
        lastUpdated: new Date()
      };
    }

    return mapping;
  }

  private addToIndex(mapping: PlayerMapping): void {
    const normalizedName = this.normalizeName(mapping.name);
    const teamPositionKey = `${this.normalizeTeam(mapping.team)}-${this.normalizePosition(mapping.position)}`;

    // Add to name index
    const nameList = this.playerIndex.byName.get(normalizedName) || [];
    const existingIndex = nameList.findIndex(p => p.id === mapping.id);
    if (existingIndex >= 0) {
      nameList[existingIndex] = mapping;
    } else {
      nameList.push(mapping);
    }
    this.playerIndex.byName.set(normalizedName, nameList);

    // Add to team-position index
    const teamPositionList = this.playerIndex.byTeamAndPosition.get(teamPositionKey) || [];
    const existingTeamIndex = teamPositionList.findIndex(p => p.id === mapping.id);
    if (existingTeamIndex >= 0) {
      teamPositionList[existingTeamIndex] = mapping;
    } else {
      teamPositionList.push(mapping);
    }
    this.playerIndex.byTeamAndPosition.set(teamPositionKey, teamPositionList);

    // Add to platform ID index
    Object.entries(mapping.platforms).forEach(([platform, playerId]) => {
      if (playerId) {
        this.playerIndex.byPlatformId.set(`${platform}-${playerId}`, mapping);
      }
    });
  }

  private clearIndex(): void {
    this.playerIndex.byName.clear();
    this.playerIndex.byTeamAndPosition.clear();
    this.playerIndex.byPlatformId.clear();
  }

  private fuzzyNameSearch(searchName: string): PlayerMapping[] {
    const matches: PlayerMapping[] = [];
    
    for (const [name, players] of this.playerIndex.byName.entries()) {
      if (this.calculateNameSimilarity(searchName, name) > 0.6) {
        matches.push(...players);
      }
    }

    return matches;
  }

  private calculateNameSimilarity(name1: string, name2: string): number {
    // Simple Levenshtein distance-based similarity
    const distance = this.levenshteinDistance(name1, name2);
    const maxLength = Math.max(name1.length, name2.length);
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private createPlayerId(name: string, team: string, position: string): string {
    return `${this.normalizeName(name)}-${this.normalizeTeam(team)}-${this.normalizePosition(position)}`;
  }

  private normalizeName(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z\s]/g, '') // Remove non-alphabetic chars except spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  private normalizeTeam(team: string): string {
    // Handle common team abbreviation mappings
    const teamMappings: Record<string, string> = {
      'LV': 'LAS', 'LVR': 'LAS', // Las Vegas Raiders
      'WSH': 'WAS', // Washington
      'JAX': 'JAC', // Jacksonville
    };
    
    const normalized = team.toUpperCase().trim();
    return teamMappings[normalized] || normalized;
  }

  private normalizePosition(position: string): string {
    // Normalize position abbreviations
    const positionMappings: Record<string, string> = {
      'RB': 'RB',
      'WR': 'WR', 
      'QB': 'QB',
      'TE': 'TE',
      'K': 'K',
      'DEF': 'D/ST',
      'DST': 'D/ST',
      'D/ST': 'D/ST'
    };

    const normalized = position.toUpperCase().trim();
    return positionMappings[normalized] || normalized;
  }

  private loadCachedMappings(): void {
    try {
      const cached = localStorage.getItem(this.cacheKey);
      if (!cached) return;

      const { data, timestamp } = JSON.parse(cached);
      
      // Check if cache is expired
      if (Date.now() - timestamp > this.cacheExpiry) {
        localStorage.removeItem(this.cacheKey);
        return;
      }

      // Restore mappings to index
      for (const mapping of data) {
        mapping.lastUpdated = new Date(mapping.lastUpdated);
        this.addToIndex(mapping);
      }

      debugLogger.success('PLAYER_MAPPING', 'Loaded cached player mappings', { count: data.length });
    } catch (error) {
      debugLogger.error('PLAYER_MAPPING', 'Failed to load cached mappings', error);
      localStorage.removeItem(this.cacheKey);
    }
  }

  private saveCachedMappings(): void {
    try {
      const allMappings = Array.from(this.playerIndex.byPlatformId.values());
      const cacheData = {
        data: allMappings,
        timestamp: Date.now()
      };
      
      localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
      debugLogger.success('PLAYER_MAPPING', 'Cached player mappings saved', { count: allMappings.length });
    } catch (error) {
      debugLogger.error('PLAYER_MAPPING', 'Failed to save cached mappings', error);
    }
  }
}

// Export singleton instance
export const playerMappingService = PlayerMappingService.getInstance();