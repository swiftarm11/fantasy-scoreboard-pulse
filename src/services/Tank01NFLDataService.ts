import { debugLogger } from '../utils/debugLogger';
import { supabase } from '../integrations/supabase/client';
import { NFLScoringEvent } from './NFLDataService';

// Tank01 API Data Structures
export interface Tank01Player {
  playerID: string;
  longName: string;
  team: string;
  teamID: string;
  position: string;
  jerseyNum: string;
  yahooPlayerID?: string;
  sleeperPlayerID?: string;
}

export interface Tank01Game {
  gameID: string;
  gameDate: string;
  gameStatus: string;
  gameWeek: string;
  awayTeam: string;
  homeTeam: string;
  awayPts: string;
  homePts: string;
  gameStatusCode: string;
}

export interface Tank01Play {
  playID: string;
  gameID: string;
  playerID: string;
  team: string;
  playType: string;
  playDescription: string;
  down: string;
  toGo: string;
  yardLine: string;
  quarter: string;
  gameClock: string;
  yards: string;
  teamScore: string;
  opponentScore: string;
  isScoringPlay: boolean;
  playResult: string;
}

interface GamePollingState {
  gameId: string;
  lastPlayId: string;
  isActive: boolean;
}

interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: Date | null;
  nextRetryTime: Date | null;
}

interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastRequestTime: Date | null;
  requestsThisMinute: number;
  lastMinuteReset: Date;
}

export class Tank01NFLDataService {
  private static instance: Tank01NFLDataService;
  private pollingInterval: NodeJS.Timeout | null = null;
  private gameStates: Map<string, GamePollingState> = new Map();
  private eventCallbacks: ((event: NFLScoringEvent) => void)[] = [];
  private pollingIntervalMs = 30000; // 30 seconds for Tank01
  private isPolling = false;
  private currentWeek: number | null = null;
  private emergencyStop = false;
  private playerCache: Map<string, Tank01Player> = new Map();
  
  // Circuit breaker for API resilience
  private circuitBreaker: CircuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: null,
    nextRetryTime: null
  };
  
  // Request monitoring
  private requestMetrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    lastRequestTime: null,
    requestsThisMinute: 0,
    lastMinuteReset: new Date()
  };
  
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3; // Lower threshold for paid API
  private readonly CIRCUIT_BREAKER_TIMEOUT = 120000; // 2 minutes
  private readonly MAX_REQUESTS_PER_MINUTE = 6; // Conservative for free tier

  private constructor() {}

  public static getInstance(): Tank01NFLDataService {
    if (!Tank01NFLDataService.instance) {
      Tank01NFLDataService.instance = new Tank01NFLDataService();
    }
    return Tank01NFLDataService.instance;
  }

  /**
   * Start polling for active NFL games using Tank01
   */
  public async startPolling(intervalMs: number = 30000): Promise<void> {
    if (this.isPolling) {
      debugLogger.warning('TANK01_DATA', 'Polling already active, skipping start request');
      return;
    }

    if (this.emergencyStop) {
      debugLogger.error('TANK01_DATA', 'Cannot start polling - emergency stop is active');
      throw new Error('Emergency stop is active. Use resetEmergencyStop() first.');
    }

    if (this.circuitBreaker.isOpen) {
      const now = new Date();
      if (this.circuitBreaker.nextRetryTime && now < this.circuitBreaker.nextRetryTime) {
        debugLogger.warning('TANK01_DATA', 'Cannot start polling - circuit breaker is open', {
          nextRetryTime: this.circuitBreaker.nextRetryTime.toISOString()
        });
        throw new Error('Circuit breaker is open. Please wait before retrying.');
      } else {
        this.resetCircuitBreaker();
      }
    }

    this.pollingIntervalMs = Math.max(intervalMs, 30000); // Minimum 30 seconds
    this.isPolling = true;
    
    debugLogger.info('TANK01_DATA', 'Starting Tank01 NFL game polling', { 
      requestedInterval: intervalMs,
      actualInterval: this.pollingIntervalMs 
    });

    // Load player mappings first
    await this.loadPlayerMappings();

    // Initial poll
    try {
      await this.pollActiveGames();
    } catch (error) {
      this.isPolling = false;
      throw error;
    }

    // Set up recurring polling
    this.pollingInterval = setInterval(async () => {
      if (this.emergencyStop || this.circuitBreaker.isOpen) {
        this.stopPolling();
        return;
      }

      try {
        await this.pollActiveGames();
      } catch (error) {
        debugLogger.error('TANK01_DATA', 'Error during polling cycle', error);
        this.recordFailure();
      }
    }, this.pollingIntervalMs);
  }

  /**
   * Stop polling for games
   */
  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.isPolling = false;
    this.gameStates.clear();
    
    debugLogger.info('TANK01_DATA', 'Tank01 NFL game polling stopped');
  }

  /**
   * Emergency stop - immediately halts all polling and prevents restart
   */
  public emergencyStopPolling(): void {
    this.emergencyStop = true;
    this.stopPolling();
    debugLogger.warning('TANK01_DATA', 'EMERGENCY STOP ACTIVATED - All polling halted');
  }

  /**
   * Reset emergency stop to allow polling again
   */
  public resetEmergencyStop(): void {
    this.emergencyStop = false;
    this.resetCircuitBreaker();
    debugLogger.info('TANK01_DATA', 'Emergency stop reset - Polling can be restarted');
  }

  /**
   * Load player mappings from Tank01 API
   */
  private async loadPlayerMappings(): Promise<void> {
    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01_DATA', 'Skipping player mapping load due to rate limit');
      return;
    }

    try {
      this.recordRequestStart();
      debugLogger.info('TANK01_DATA', 'Loading Tank01 player mappings');

      const response = await supabase.functions.invoke('tank01-api', {
        body: { 
          endpoint: 'players'
        }
      });

      if (response.error) {
        throw new Error(`Tank01 API error: ${response.error.message}`);
      }

      const players = response.data?.body || [];
      
      this.playerCache.clear();
      for (const player of players) {
        this.playerCache.set(player.playerID, player);
      }

      this.recordRequestSuccess();
      debugLogger.success('TANK01_DATA', `Loaded ${players.length} player mappings from Tank01`);

    } catch (error) {
      this.recordRequestFailure();
      debugLogger.error('TANK01_DATA', 'Failed to load player mappings', error);
      throw error;
    }
  }

  /**
   * Fetch current week NFL games from Tank01
   */
  public async pollActiveGames(): Promise<Tank01Game[]> {
    if (this.emergencyStop) {
      throw new Error('Emergency stop is active');
    }

    if (this.circuitBreaker.isOpen) {
      throw new Error('Circuit breaker is open - too many failures');
    }

    if (!this.canMakeRequest()) {
      throw new Error('Rate limit exceeded - too many requests this minute');
    }

    try {
      this.recordRequestStart();
      
      // Get current week and season
      const currentDate = new Date();
      const currentSeason = currentDate.getFullYear();
      const currentWeek = this.getCurrentNFLWeek();
      
      debugLogger.api('TANK01_DATA', `Fetching Tank01 games for week ${currentWeek}, season ${currentSeason}`);
      
      const response = await supabase.functions.invoke('tank01-api', {
        body: { 
          endpoint: 'games',
          week: currentWeek.toString(),
          season: currentSeason.toString()
        }
      });

      if (response.error) {
        throw new Error(`Tank01 API error: ${response.error.message}`);
      }

      const games = response.data?.body || [];
      
      debugLogger.success('TANK01_DATA', `Fetched ${games.length} games from Tank01`, {
        week: currentWeek,
        season: currentSeason
      });

      this.recordRequestSuccess();
      this.currentWeek = currentWeek;

      // Process each active game for live events
      const activeGames: Tank01Game[] = [];
      for (const game of games) {
        if (this.isGameActive(game)) {
          activeGames.push(game);
          await this.processGameEvents(game);
        }
      }

      debugLogger.info('TANK01_DATA', `Processing ${activeGames.length} active games`);
      return activeGames;

    } catch (error) {
      this.recordRequestFailure();
      this.recordFailure();
      debugLogger.error('TANK01_DATA', 'Failed to fetch Tank01 games', error);
      throw error;
    }
  }

  /**
   * Parse play-by-play data from Tank01 API
   */
  public async parsePlayByPlay(gameId: string): Promise<Tank01Play[]> {
    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01_DATA', 'Skipping play-by-play fetch due to rate limit');
      return [];
    }

    try {
      this.recordRequestStart();
      debugLogger.api('TANK01_DATA', `Fetching Tank01 play-by-play for game ${gameId}`);

      const response = await supabase.functions.invoke('tank01-api', {
        body: { 
          endpoint: 'plays',
          gameId: gameId
        }
      });
      
      if (response.error) {
        throw new Error(`Tank01 API error: ${response.error.message}`);
      }

      const plays = response.data?.body || [];

      this.recordRequestSuccess();
      debugLogger.success('TANK01_DATA', `Parsed ${plays.length} plays for game ${gameId}`);
      return plays;

    } catch (error) {
      this.recordRequestFailure();
      debugLogger.error('TANK01_DATA', `Failed to parse play-by-play for game ${gameId}`, error);
      return [];
    }
  }

  /**
   * Detect scoring events from Tank01 play data
   */
  public detectScoringEvents(plays: Tank01Play[], gameId: string): NFLScoringEvent[] {
    const events: NFLScoringEvent[] = [];
    const gameState = this.gameStates.get(gameId);

    for (const play of plays) {
      // Skip if we've already processed this play
      if (gameState && play.playID <= gameState.lastPlayId) {
        continue;
      }

      // Only process scoring plays or significant yardage plays
      if (play.isScoringPlay || (parseInt(play.yards) >= 20)) {
        const event = this.createScoringEvent(play, gameId);
        if (event) {
          events.push(event);
          
          // Emit event to subscribers
          this.eventCallbacks.forEach(callback => {
            try {
              callback(event);
            } catch (error) {
              debugLogger.error('TANK01_DATA', 'Error in event callback', error);
            }
          });
        }
      }
    }

    // Update game state with latest processed play
    if (plays.length > 0) {
      const latestPlay = plays[plays.length - 1];
      this.gameStates.set(gameId, {
        gameId,
        lastPlayId: latestPlay.playID,
        isActive: true
      });
    }

    return events;
  }

  /**
   * Create NFLScoringEvent from Tank01 play data
   */
  private createScoringEvent(play: Tank01Play, gameId: string): NFLScoringEvent | null {
    const player = this.playerCache.get(play.playerID);
    if (!player) {
      debugLogger.warning('TANK01_DATA', `Player not found in cache: ${play.playerID}`);
      return null;
    }

    const eventType = this.mapPlayTypeToEventType(play.playType, play.playDescription);
    if (!eventType) {
      return null;
    }

    const yards = parseInt(play.yards) || 0;
    const stats: { [key: string]: number | undefined } = {
      yards: yards
    };

    if (play.isScoringPlay) {
      stats.touchdowns = 1;
    }

    return {
      id: `tank01-${play.playID}`,
      player: {
        id: play.playerID,
        name: player.longName,
        position: player.position,
        team: player.team,
      },
      team: play.team,
      eventType,
      description: play.playDescription,
      timestamp: new Date(),
      stats,
      gameId,
      period: parseInt(play.quarter) || 1,
      clock: play.gameClock,
      scoringPlay: play.isScoringPlay
    };
  }

  /**
   * Map Tank01 play types to NFL event types
   */
  private mapPlayTypeToEventType(playType: string, description: string): NFLScoringEvent['eventType'] | null {
    const lowerType = playType.toLowerCase();
    const lowerDesc = description.toLowerCase();

    if (lowerDesc.includes('touchdown')) {
      if (lowerType.includes('pass') || lowerDesc.includes('pass')) {
        return lowerDesc.includes('caught') ? 'receiving_td' : 'passing_td';
      }
      if (lowerType.includes('rush') || lowerDesc.includes('rush')) {
        return 'rushing_td';
      }
      return 'rushing_td'; // Default for TDs
    }

    if (lowerType.includes('field goal') || lowerDesc.includes('field goal')) {
      return 'field_goal';
    }

    if (lowerType.includes('pass') || lowerDesc.includes('pass')) {
      return 'passing_yards';
    }

    if (lowerType.includes('rush') || lowerDesc.includes('rush')) {
      return 'rushing_yards';
    }

    if (lowerDesc.includes('interception')) {
      return 'interception';
    }

    if (lowerDesc.includes('fumble')) {
      return 'fumble';
    }

    if (lowerDesc.includes('safety')) {
      return 'safety';
    }

    return null;
  }

  /**
   * Check if game is currently active
   */
  private isGameActive(game: Tank01Game): boolean {
    const status = game.gameStatusCode || game.gameStatus;
    return status === '2' || status === 'in_progress' || status === 'live';
  }

  /**
   * Process live events for a specific game
   */
  private async processGameEvents(game: Tank01Game): Promise<void> {
    try {
      const plays = await this.parsePlayByPlay(game.gameID);
      const events = this.detectScoringEvents(plays, game.gameID);
      
      debugLogger.info('TANK01_DATA', `Processed ${events.length} scoring events for game ${game.gameID}`);
    } catch (error) {
      debugLogger.error('TANK01_DATA', `Failed to process events for game ${game.gameID}`, error);
    }
  }

  /**
   * Subscribe to scoring events
   */
  public onScoringEvent(callback: (event: NFLScoringEvent) => void): () => void {
    this.eventCallbacks.push(callback);
    
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index > -1) {
        this.eventCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get current NFL week (simplified calculation)
   */
  private getCurrentNFLWeek(): number {
    const now = new Date();
    const seasonStart = new Date(now.getFullYear(), 8, 5); // Sept 5th approximation
    const weeksSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
    return Math.max(1, Math.min(18, weeksSinceStart + 1));
  }

  // Circuit breaker and request management methods
  private canMakeRequest(): boolean {
    const now = new Date();
    
    // Reset minute counter if needed
    if (now.getTime() - this.requestMetrics.lastMinuteReset.getTime() >= 60000) {
      this.requestMetrics.requestsThisMinute = 0;
      this.requestMetrics.lastMinuteReset = now;
    }
    
    return this.requestMetrics.requestsThisMinute < this.MAX_REQUESTS_PER_MINUTE;
  }

  private recordRequestStart(): void {
    this.requestMetrics.totalRequests++;
    this.requestMetrics.requestsThisMinute++;
    this.requestMetrics.lastRequestTime = new Date();
  }

  private recordRequestSuccess(): void {
    this.requestMetrics.successfulRequests++;
  }

  private recordRequestFailure(): void {
    this.requestMetrics.failedRequests++;
  }

  private recordFailure(): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = new Date();

    if (this.circuitBreaker.failureCount >= this.CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.nextRetryTime = new Date(Date.now() + this.CIRCUIT_BREAKER_TIMEOUT);
      
      debugLogger.warning('TANK01_DATA', 'Circuit breaker opened due to failures', {
        failureCount: this.circuitBreaker.failureCount,
        nextRetryTime: this.circuitBreaker.nextRetryTime
      });
    }
  }

  private resetCircuitBreaker(): void {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.circuitBreaker.nextRetryTime = null;
  }

  /**
   * Get service status and metrics
   */
  public getServiceStatus() {
    return {
      isPolling: this.isPolling,
      emergencyStop: this.emergencyStop,
      circuitBreaker: this.circuitBreaker,
      requestMetrics: this.requestMetrics,
      activeGames: this.gameStates.size,
      playersCached: this.playerCache.size,
      currentWeek: this.currentWeek
    };
  }

  /**
   * Get player by Tank01 ID with platform mappings
   */
  public getPlayerMapping(tank01PlayerId: string): Tank01Player | null {
    return this.playerCache.get(tank01PlayerId) || null;
  }
}

// Export singleton instance
export const tank01NFLDataService = Tank01NFLDataService.getInstance();