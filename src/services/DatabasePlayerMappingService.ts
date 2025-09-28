import { supabase } from '@/integrations/supabase/client';
import { debugLogger } from '@/utils/debugLogger';

// Tank01 API Player data structure
export interface Tank01Player {
  espnID: string;
  espnName: string;
  sleeperBotID: string;
  yahooPlayerID: string;
  team: string;
  pos: string;
  longName: string;
  playerID: string;
  isFreeAgent: string;
  lastGamePlayed?: string;
}

// Database player mapping structure (matching Supabase types)
export interface DatabasePlayerMapping {
  id: string;
  tank01_id: string;
  tank01_primary_id?: string | null;
  sleeper_id?: string | null;
  yahoo_id?: string | null;
  espn_id?: string | null;
  name: string;
  team: string;
  position: string;
  alternate_names: string[];
  is_active: boolean;
  last_game_played?: string | null;
  last_updated: string;
  created_at: string;
}

// Sync metadata structure
export interface SyncMetadata {
  id: string;
  sync_type: string;
  started_at: string;
  completed_at?: string | null;
  status: string;
  total_players?: number | null;
  active_players?: number | null;
  api_requests_used: number;
  error_message?: string | null;
  metadata: any; // Use any for JSON compatibility
}

export class DatabasePlayerMappingService {
  private static instance: DatabasePlayerMappingService;
  private lastSyncTime: Date | null = null;
  private isInitialized = false;
  private playerCache = new Map<string, DatabasePlayerMapping>();

  private constructor() {}

  static getInstance(): DatabasePlayerMappingService {
    if (!DatabasePlayerMappingService.instance) {
      DatabasePlayerMappingService.instance = new DatabasePlayerMappingService();
    }
    return DatabasePlayerMappingService.instance;
  }

  /**
   * Initialize the service and check last sync status
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.loadLastSyncStatus();
      await this.loadPlayerCache();
      this.isInitialized = true;
      
      debugLogger.info('DB_PLAYER_MAPPING', 'Service initialized', {
        lastSync: this.lastSyncTime,
        cacheSize: this.playerCache.size
      });
    } catch (error) {
      debugLogger.error('DB_PLAYER_MAPPING', 'Failed to initialize service', { error });
      throw error;
    }
  }

  /**
   * Sync all players from Tank01 API to database
   */
  async syncAllPlayers(forceUpdate = false): Promise<SyncMetadata> {
    // Check if we need to sync (24 hour window)
    const needsSync = forceUpdate || this.shouldSync();
    
    if (!needsSync) {
      throw new Error('Sync not needed - last sync was within 24 hours');
    }

    // Create sync metadata record
    const syncMetadata = await this.createSyncRecord('full_player_sync');
    
    try {
      // Fetch all players from Tank01 API
      const players = await this.fetchAllPlayersFromTank01();
      
      debugLogger.info('DB_PLAYER_MAPPING', 'Fetched players from Tank01', {
        totalPlayers: players.length,
        syncId: syncMetadata.id
      });

      // Filter to active players only (reduce database size)
      const activePlayers = this.filterActivePlayers(players);
      
      debugLogger.info('DB_PLAYER_MAPPING', 'Filtered to active players', {
        totalPlayers: players.length,
        activePlayers: activePlayers.length,
        syncId: syncMetadata.id
      });

      // Batch insert players to database
      await this.batchInsertPlayers(activePlayers, syncMetadata.id);

      // Update sync metadata as completed
      const finalSyncMetadata = await this.completeSyncRecord(syncMetadata.id, {
        total_players: players.length,
        active_players: activePlayers.length,
        api_requests_used: 1 // Tank01 returns all players in one request
      });

      // Refresh cache
      await this.loadPlayerCache();
      this.lastSyncTime = new Date();

      debugLogger.info('DB_PLAYER_MAPPING', 'Player sync completed successfully', {
        syncId: syncMetadata.id,
        activePlayers: activePlayers.length
      });

      return { ...syncMetadata, status: 'completed', ...finalSyncMetadata };

    } catch (error) {
      debugLogger.error('DB_PLAYER_MAPPING', 'Player sync failed', {
        error,
        syncId: syncMetadata.id
      });

      await this.failSyncRecord(syncMetadata.id, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Find player mapping by platform and ID
   */
  async findPlayerByPlatformId(platform: 'espn' | 'yahoo' | 'sleeper', playerId: string): Promise<DatabasePlayerMapping | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // First check cache
    const cacheKey = `${platform}:${playerId}`;
    for (const [_, player] of this.playerCache) {
      if (
        (platform === 'espn' && player.espn_id === playerId) ||
        (platform === 'yahoo' && player.yahoo_id === playerId) ||
        (platform === 'sleeper' && player.sleeper_id === playerId)
      ) {
        return player;
      }
    }

    // Fallback to database query
    let column: string;
    switch (platform) {
      case 'espn': column = 'espn_id'; break;
      case 'yahoo': column = 'yahoo_id'; break;
      case 'sleeper': column = 'sleeper_id'; break;
    }

    try {
      const { data, error } = await supabase
        .from('player_mappings')
        .select('*')
        .eq(column, playerId)
        .eq('is_active', true)
        .maybeSingle() as { data: any | null; error: any };

      if (error) {
        debugLogger.error('DB_PLAYER_MAPPING', 'Database query failed', { error, platform, playerId });
        return null;
      }

      if (data) {
        // Parse alternate_names if it's a JSON string
        const parsedData = {
          ...data,
          alternate_names: Array.isArray(data.alternate_names) 
            ? data.alternate_names 
            : (typeof data.alternate_names === 'string' ? JSON.parse(data.alternate_names) : [])
        } as DatabasePlayerMapping;
        
        // Add to cache
        this.playerCache.set(parsedData.tank01_id, parsedData);
        return parsedData;
      }
    } catch (error) {
      debugLogger.error('DB_PLAYER_MAPPING', 'Exception during player lookup', { error, platform, playerId });
      return null;
    }
  }

  /**
   * Get player mapping by Tank01 ID
   */
  async getPlayerByTank01Id(tank01Id: string): Promise<DatabasePlayerMapping | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check cache first
    if (this.playerCache.has(tank01Id)) {
      return this.playerCache.get(tank01Id)!;
    }

    // Query database
    try {
      const { data, error } = await supabase
        .from('player_mappings')
        .select('*')
        .eq('tank01_id', tank01Id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        debugLogger.error('DB_PLAYER_MAPPING', 'Database query failed', { error, tank01Id });
        return null;
      }

      if (data) {
        // Parse alternate_names if it's a JSON string
        const parsedData = {
          ...data,
          alternate_names: Array.isArray(data.alternate_names) 
            ? data.alternate_names 
            : (typeof data.alternate_names === 'string' ? JSON.parse(data.alternate_names) : [])
        } as DatabasePlayerMapping;
        
        this.playerCache.set(parsedData.tank01_id, parsedData);
        return parsedData;
      }
    } catch (error) {
      debugLogger.error('DB_PLAYER_MAPPING', 'Exception during Tank01 lookup', { error, tank01Id });
      return null;
    }
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(): Promise<{
    lastSync: Date | null;
    totalPlayers: number;
    activePlayers: number;
    syncHistory: SyncMetadata[];
    needsSync: boolean;
  }> {
    try {
      // Get player counts
      const { count: totalCount } = await supabase
        .from('player_mappings')
        .select('*', { count: 'exact', head: true });

      const { count: activeCount } = await supabase
        .from('player_mappings')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Get recent sync history
      const { data: syncHistory } = await supabase
        .from('sync_metadata')
        .select('*')
        .eq('sync_type', 'full_player_sync')
        .order('started_at', { ascending: false })
        .limit(10);

      return {
        lastSync: this.lastSyncTime,
        totalPlayers: totalCount || 0,
        activePlayers: activeCount || 0,
        syncHistory: (syncHistory || []).map(sync => ({
          ...sync,
          status: sync.status as 'in_progress' | 'completed' | 'failed',
          metadata: sync.metadata || {}
        })) as SyncMetadata[],
        needsSync: this.shouldSync()
      };
    } catch (error) {
      debugLogger.error('DB_PLAYER_MAPPING', 'Failed to get sync stats', { error });
      return {
        lastSync: null,
        totalPlayers: 0,
        activePlayers: 0,
        syncHistory: [],
        needsSync: true
      };
    }
  }

  /**
   * Manual cleanup - remove inactive players older than 30 days
   */
  async cleanupInactivePlayers(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count } = await supabase
        .from('player_mappings')
        .delete({ count: 'exact' })
        .eq('is_active', false)
        .lt('last_updated', thirtyDaysAgo.toISOString());

      debugLogger.info('DB_PLAYER_MAPPING', 'Cleaned up inactive players', { count });
      return count || 0;
    } catch (error) {
      debugLogger.error('DB_PLAYER_MAPPING', 'Failed to cleanup inactive players', { error });
      throw error;
    }
  }

  // Private helper methods

  private async loadLastSyncStatus(): Promise<void> {
    try {
      const { data } = await supabase
        .from('sync_metadata')
        .select('completed_at')
        .eq('sync_type', 'full_player_sync')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data?.completed_at) {
        this.lastSyncTime = new Date(data.completed_at);
      }
    } catch (error) {
      debugLogger.info('DB_PLAYER_MAPPING', 'Could not load last sync status', { error });
    }
  }

  private async loadPlayerCache(): Promise<void> {
    try {
      // Load recently accessed players into cache (limit to 1000 for memory)
      const { data } = await supabase
        .from('player_mappings')
        .select('*')
        .eq('is_active', true)
        .order('last_updated', { ascending: false })
        .limit(1000);

      if (data) {
        this.playerCache.clear();
        data.forEach(row => {
          // Parse alternate_names if it's a JSON string
          const player = {
            ...row,
            alternate_names: Array.isArray(row.alternate_names) 
              ? row.alternate_names 
              : (typeof row.alternate_names === 'string' ? JSON.parse(row.alternate_names) : [])
          } as DatabasePlayerMapping;
          
          this.playerCache.set(player.tank01_id, player);
        });
      }
    } catch (error) {
      debugLogger.info('DB_PLAYER_MAPPING', 'Could not load player cache', { error });
    }
  }

  private shouldSync(): boolean {
    if (!this.lastSyncTime) return true;
    
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const timeSinceLastSync = Date.now() - this.lastSyncTime.getTime();
    
    return timeSinceLastSync > twentyFourHours;
  }

  private async fetchAllPlayersFromTank01(): Promise<Tank01Player[]> {
    const response = await fetch(`https://doyquitecogdnvbyiszt.supabase.co/functions/v1/tank01-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        endpoint: 'players',
        action: 'getNFLPlayerList'
      })
    });

    if (!response.ok) {
      throw new Error(`Tank01 API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.statusCode !== 200 || !Array.isArray(data.body)) {
      throw new Error('Invalid Tank01 API response format');
    }

    return data.body;
  }

  private filterActivePlayers(players: Tank01Player[]): Tank01Player[] {
    // Filter out free agents with no recent games and inactive players
    return players.filter(player => {
      // Keep if not a free agent
      if (player.isFreeAgent !== 'True') return true;
      
      // Keep if has recent game activity (within last season)
      if (player.lastGamePlayed) {
        const gameDate = player.lastGamePlayed;
        // Basic check - if game is from 2024 or later, keep it
        return gameDate.includes('2024') || gameDate.includes('2025');
      }
      
      // Keep if has essential fantasy platform IDs
      return player.sleeperBotID || player.yahooPlayerID || player.espnID;
    });
  }

  private async batchInsertPlayers(players: Tank01Player[], syncId: string): Promise<void> {
    const batchSize = 500;
    
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      const mappings = batch.map(this.transformTank01ToMapping);
      
      debugLogger.info('DB_PLAYER_MAPPING', `Inserting batch ${Math.floor(i / batchSize) + 1}`, {
        syncId,
        batchStart: i,
        batchSize: batch.length
      });

      // Use upsert to handle duplicates
      const { error } = await supabase
        .from('player_mappings')
        .upsert(mappings, { 
          onConflict: 'tank01_id',
          ignoreDuplicates: false 
        });

      if (error) {
        debugLogger.error('DB_PLAYER_MAPPING', 'Batch insert failed', { error, syncId, batchStart: i });
        throw error;
      }
    }
  }

  private transformTank01ToMapping(player: Tank01Player): Omit<DatabasePlayerMapping, 'id' | 'created_at' | 'last_updated'> {
    return {
      tank01_id: player.playerID,
      tank01_primary_id: player.playerID,
      sleeper_id: player.sleeperBotID || null,
      yahoo_id: player.yahooPlayerID || null,
      espn_id: player.espnID || null,
      name: player.longName || player.espnName,
      team: player.team,
      position: player.pos,
      alternate_names: [player.espnName, player.longName].filter(Boolean),
      is_active: player.isFreeAgent !== 'True',
      last_game_played: player.lastGamePlayed || null
    };
  }

  private async createSyncRecord(syncType: string): Promise<SyncMetadata> {
    const { data, error } = await supabase
      .from('sync_metadata')
      .insert({
        sync_type: syncType,
        status: 'in_progress',
        api_requests_used: 0,
        metadata: {}
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as SyncMetadata;
  }

  private async completeSyncRecord(id: string, updates: Partial<SyncMetadata>): Promise<SyncMetadata> {
    const { data, error } = await supabase
      .from('sync_metadata')
      .update({
        ...updates,
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data as SyncMetadata;
  }

  private async failSyncRecord(id: string, errorMessage: string): Promise<void> {
    const { error } = await supabase
      .from('sync_metadata')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      debugLogger.error('DB_PLAYER_MAPPING', 'Failed to update sync record', { error });
    }
  }
}

// Export singleton instance
export const databasePlayerMappingService = DatabasePlayerMappingService.getInstance();
