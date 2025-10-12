import { debugLogger } from '../utils/debugLogger';
import { supabase } from '../integrations/supabase/client';

// NFL Scoring Event - shared type for all NFL data sources
export interface NFLScoringEvent {
  id: string;
  player: {
    id: string;
    name: string;
    position: string;
    team: string;
  };
  team: string;
  eventType: 'passing_td' | 'rushing_td' | 'receiving_td' | 'passing_yards' | 'rushing_yards' | 'receiving_yards' | 'fumble_lost' | 'fumble' | 'interception' | 'field_goal' | 'safety';
  description: string;
  timestamp: Date;
  stats: Record<string, number>;
  gameId: string;
  period: number;
  clock: string;
  scoringPlay: boolean;
}

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

interface DailyQuotaTracker {
  date: string; // YYYY-MM-DD format
  requestCount: number;
  lastReset: Date;
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
  
  // Daily quota tracking for Pro plan
  private dailyQuota: DailyQuotaTracker = {
    date: new Date().toISOString().split('T')[0],
    requestCount: 0,
    lastReset: new Date()
  };
  
  // DEVELOPMENT MODE - 500 req/day limit (change to 1000 for production)
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3; // Lower threshold for paid API
  private readonly CIRCUIT_BREAKER_TIMEOUT = 120000; // 2 minutes
  private readonly MAX_REQUESTS_PER_MINUTE = 8; // Dev mode: 500/day ≈ 8/min safe
  private readonly MAX_DAILY_REQUESTS = 500; // Dev mode limit (change to 1000 for production)
  private readonly DAILY_QUOTA_WARNING_THRESHOLD = 0.7; // Warn at 70% (350 requests)
  private readonly DAILY_QUOTA_CIRCUIT_BREAKER = 0.85; // Stop at 85% (425 requests)

  private constructor() {}

  public static getInstance(): Tank01NFLDataService {
    if (!Tank01NFLDataService.instance) {
      Tank01NFLDataService.instance = new Tank01NFLDataService();
    }
    return Tank01NFLDataService.instance;
  }

  /**
   * Start polling for active NFL games using Tank01
   * DEVELOPMENT MODE - 180s polling (change to 90s for production)
   */
  public async startPolling(intervalMs: number = 180000): Promise<void> {
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

    this.pollingIntervalMs = Math.max(intervalMs, 180000); // Minimum 180 seconds for dev mode (90s for production)
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
   * Manual poll trigger for immediate data refresh
   */
  public async manualPoll(): Promise<void> {
    debugLogger.info('TANK01_DATA', '⚡ Manual poll triggered for Tank01');
    
    try {
      await this.pollActiveGames();
      debugLogger.success('TANK01_DATA', '✅ Manual poll completed successfully');
    } catch (error) {
      debugLogger.error('TANK01_DATA', '❌ Manual poll failed', error);
      throw error;
    }
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
   * Load player mappings from Tank01 API (with 24-hour localStorage cache)
   */
  private async loadPlayerMappings(): Promise<void> {
    // Check if we already have cached players from this session
    if (this.playerCache.size > 0) {
      debugLogger.info('TANK01_DATA', 'Using existing player cache', { 
        cachedPlayers: this.playerCache.size 
      });
      return;
    }

    // Try to load from localStorage (24hr cache)
    try {
      const cached = localStorage.getItem('tank01_players_cache');
      if (cached) {
        const { players, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

        if (age < MAX_AGE) {
          for (const player of players) {
            this.playerCache.set(player.playerID, player);
          }
          debugLogger.success('TANK01_DATA', `Loaded ${players.length} players from localStorage cache`, {
            ageHours: Math.round(age / (60 * 60 * 1000))
          });
          return;
        }
      }
    } catch (error) {
      debugLogger.warning('TANK01_DATA', 'Failed to load player cache from localStorage', error);
    }

    // Fetch fresh data if no valid cache
    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01_DATA', 'Skipping player mapping load due to rate limit');
      return;
    }

    try {
      this.recordRequestStart();
      debugLogger.info('TANK01_DATA', 'Loading Tank01 player mappings from API');

      const response = await supabase.functions.invoke('tank01-api', {
        body: { 
          endpoint: 'players'
        }
      });

      // Detect 429 (Too Many Requests) - Tank01 quota exceeded
      if (response.error && (
        response.error.message?.includes('429') || 
        response.error.message?.toLowerCase().includes('rate limit') ||
        response.error.message?.toLowerCase().includes('too many requests')
      )) {
        debugLogger.error('TANK01_DATA', '🚨 Tank01 API QUOTA EXCEEDED (429)', {
          error: response.error.message,
          dailyRequests: this.dailyQuota.requestCount
        });
        
        // Trip circuit breaker for 1 hour
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.failureCount = 999; // Force circuit breaker
        this.circuitBreaker.nextRetryTime = new Date(Date.now() + 60 * 60 * 1000);
        
        throw new Error('Tank01 API quota exceeded (429). Service disabled for 1 hour.');
      }

      if (response.error) {
        throw new Error(`Tank01 API error: ${response.error.message}`);
      }

      const players = response.data?.body || [];
      
      this.playerCache.clear();
      for (const player of players) {
        this.playerCache.set(player.playerID, player);
      }

      // Save to localStorage for future sessions
      try {
        localStorage.setItem('tank01_players_cache', JSON.stringify({
          players,
          timestamp: Date.now()
        }));
      } catch (error) {
        debugLogger.warning('TANK01_DATA', 'Failed to cache players to localStorage', error);
      }

      this.recordRequestSuccess();
      debugLogger.success('TANK01_DATA', `Loaded ${players.length} player mappings from Tank01 API`);

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

      // Detect 429 (Too Many Requests) - Tank01 quota exceeded
      if (response.error && (
        response.error.message?.includes('429') || 
        response.error.message?.toLowerCase().includes('rate limit') ||
        response.error.message?.toLowerCase().includes('too many requests')
      )) {
        debugLogger.error('TANK01_DATA', '🚨 Tank01 API QUOTA EXCEEDED (429)', {
          error: response.error.message,
          dailyRequests: this.dailyQuota.requestCount
        });
        
        // Trip circuit breaker for 1 hour
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.failureCount = 999;
        this.circuitBreaker.nextRetryTime = new Date(Date.now() + 60 * 60 * 1000);
        
        throw new Error('Tank01 API quota exceeded (429). Service disabled for 1 hour.');
      }

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
      
      // Detect 429 (Too Many Requests) - Tank01 quota exceeded
      if (response.error && (
        response.error.message?.includes('429') || 
        response.error.message?.toLowerCase().includes('rate limit') ||
        response.error.message?.toLowerCase().includes('too many requests')
      )) {
        debugLogger.error('TANK01_DATA', '🚨 Tank01 API QUOTA EXCEEDED (429)', {
          error: response.error.message,
          dailyRequests: this.dailyQuota.requestCount
        });
        
        // Trip circuit breaker for 1 hour
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.failureCount = 999;
        this.circuitBreaker.nextRetryTime = new Date(Date.now() + 60 * 60 * 1000);
        
        throw new Error('Tank01 API quota exceeded (429). Service disabled for 1 hour.');
      }
      
      if (response.error) {
        throw new Error(`Tank01 API error: ${response.error.message}`);
      }

      const plays = response.data?.body?.playByPlay || [];

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
    // Safety check: ensure plays is an array
    if (!Array.isArray(plays)) {
      debugLogger.warning('TANK01_DATA', 'detectScoringEvents received non-array plays', { plays, gameId });
      return [];
    }

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
   * Create NFLScoringEvent from Tank01 play data with proper stats extraction
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

    // Extract comprehensive stats from Tank01 play data
    const yards = parseInt(play.yards) || 0;
    const stats = this.extractPlayerStats(play, eventType);

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
   * Extract detailed player statistics from Tank01 play data
   */
  private extractPlayerStats(play: Tank01Play, eventType: string): { [key: string]: number | undefined } {
    const yards = parseInt(play.yards) || 0;
    const stats: { [key: string]: number | undefined } = {};

    // Base stats for all plays
    if (yards > 0) {
      stats.yards = yards;
    }

    // Map stats based on event type for fantasy point calculation
    switch (eventType) {
      case 'passing_td':
        stats.passingYards = yards;
        stats.passingTouchdowns = 1;
        stats.passingCompletions = 1;
        stats.passingAttempts = 1;
        break;
      
      case 'passing_yards':
        stats.passingYards = yards;
        stats.passingCompletions = 1;
        stats.passingAttempts = 1;
        break;
      
      case 'rushing_td':
        stats.rushingYards = yards;
        stats.rushingTouchdowns = 1;
        stats.rushingAttempts = 1;
        break;
      
      case 'rushing_yards':
        stats.rushingYards = yards;
        stats.rushingAttempts = 1;
        break;
      
      case 'receiving_td':
        stats.receivingYards = yards;
        stats.receivingTouchdowns = 1;
        stats.receptions = 1;
        stats.targets = 1;
        break;
      
      case 'receiving_yards':
        stats.receivingYards = yards;
        stats.receptions = 1;
        stats.targets = 1;
        break;
      
      case 'field_goal':
        stats.fieldGoalsMade = 1;
        stats.fieldGoalsAttempted = 1;
        // Estimate distance based on yardline if available
        if (play.yardLine) {
          const yardLine = parseInt(play.yardLine) || 35;
          stats.fieldGoalDistance = yardLine + 17; // Add end zone + goalpost
        }
        break;
      
      case 'interception':
        stats.interceptions = 1;
        break;
      
      case 'fumble':
        stats.fumbles = 1;
        break;
      
      case 'safety':
        stats.safeties = 1;
        break;
    }

    return stats;
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
    // Check daily quota first
    if (!this.checkDailyQuota()) {
      throw new Error('Daily quota limit reached (900/1000 requests used). Service paused until tomorrow.');
    }

    // Check per-minute rate limit
    const now = new Date();
    const timeSinceLastReset = now.getTime() - this.requestMetrics.lastMinuteReset.getTime();
    
    if (timeSinceLastReset >= 60000) {
      this.requestMetrics.requestsThisMinute = 0;
      this.requestMetrics.lastMinuteReset = now;
    }

    this.requestMetrics.requestsThisMinute++;
    this.requestMetrics.totalRequests++;
    this.requestMetrics.lastRequestTime = now;
    
    // Increment daily counter
    this.incrementDailyQuota();
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
   * Check and update daily quota tracker
   */
  private checkDailyQuota(): boolean {
    const today = new Date().toISOString().split('T')[0];
    
    // Reset counter if new day
    if (this.dailyQuota.date !== today) {
      debugLogger.info('TANK01_DATA', '📅 Daily quota reset', {
        previousDate: this.dailyQuota.date,
        previousCount: this.dailyQuota.requestCount,
        newDate: today
      });
      
      this.dailyQuota = {
        date: today,
        requestCount: 0,
        lastReset: new Date()
      };
      
      // Persist to localStorage
      try {
        localStorage.setItem('tank01_daily_quota', JSON.stringify(this.dailyQuota));
      } catch (error) {
        debugLogger.warning('TANK01_DATA', 'Failed to persist quota to localStorage', error);
      }
    }

    // Load from localStorage if available (handles page refreshes)
    try {
      const stored = localStorage.getItem('tank01_daily_quota');
      if (stored) {
        const storedQuota = JSON.parse(stored);
        if (storedQuota.date === today && storedQuota.requestCount > this.dailyQuota.requestCount) {
          this.dailyQuota = storedQuota;
        }
      }
    } catch (error) {
      // Ignore localStorage errors
    }

    const percentUsed = this.dailyQuota.requestCount / this.MAX_DAILY_REQUESTS;

    // Circuit breaker at 90%
    if (percentUsed >= this.DAILY_QUOTA_CIRCUIT_BREAKER) {
      debugLogger.error('TANK01_DATA', '🚨 DAILY QUOTA CIRCUIT BREAKER TRIGGERED', {
        requestCount: this.dailyQuota.requestCount,
        limit: this.MAX_DAILY_REQUESTS,
        percentUsed: `${(percentUsed * 100).toFixed(1)}%`
      });
      this.circuitBreaker.isOpen = true;
      this.circuitBreaker.nextRetryTime = new Date(Date.now() + 60 * 60 * 1000); // Retry in 1 hour
      return false;
    }

    // Warning at 80%
    if (percentUsed >= this.DAILY_QUOTA_WARNING_THRESHOLD && percentUsed < this.DAILY_QUOTA_CIRCUIT_BREAKER) {
      debugLogger.warning('TANK01_DATA', '⚠️ Daily quota warning', {
        requestCount: this.dailyQuota.requestCount,
        limit: this.MAX_DAILY_REQUESTS,
        percentUsed: `${(percentUsed * 100).toFixed(1)}%`,
        remaining: this.MAX_DAILY_REQUESTS - this.dailyQuota.requestCount
      });
    }

    return true;
  }

  /**
   * Increment daily quota counter
   */
  private incrementDailyQuota(): void {
    this.dailyQuota.requestCount++;
    
    // Persist to localStorage every 10 requests
    if (this.dailyQuota.requestCount % 10 === 0) {
      try {
        localStorage.setItem('tank01_daily_quota', JSON.stringify(this.dailyQuota));
      } catch (error) {
        // Ignore localStorage errors
      }
    }
  }

  /**
   * Get service status and metrics
   */
  public getServiceStatus() {
    const percentUsed = this.dailyQuota.requestCount / this.MAX_DAILY_REQUESTS;
    
    return {
      isPolling: this.isPolling,
      pollingInterval: this.pollingIntervalMs,
      activeGames: this.gameStates.size,
      emergencyStop: this.emergencyStop,
      circuitBreaker: {
        isOpen: this.circuitBreaker.isOpen,
        failureCount: this.circuitBreaker.failureCount,
        nextRetryTime: this.circuitBreaker.nextRetryTime?.toISOString()
      },
      requestMetrics: {
        totalRequests: this.requestMetrics.totalRequests,
        successfulRequests: this.requestMetrics.successfulRequests,
        failedRequests: this.requestMetrics.failedRequests,
        requestsThisMinute: this.requestMetrics.requestsThisMinute,
        lastRequestTime: this.requestMetrics.lastRequestTime?.toISOString()
      },
      dailyQuota: {
        date: this.dailyQuota.date,
        used: this.dailyQuota.requestCount,
        limit: this.MAX_DAILY_REQUESTS,
        remaining: this.MAX_DAILY_REQUESTS - this.dailyQuota.requestCount,
        percentUsed: `${(percentUsed * 100).toFixed(1)}%`,
        warningThreshold: Math.floor(this.MAX_DAILY_REQUESTS * this.DAILY_QUOTA_WARNING_THRESHOLD),
        circuitBreakerThreshold: Math.floor(this.MAX_DAILY_REQUESTS * this.DAILY_QUOTA_CIRCUIT_BREAKER)
      },
      playerCache: {
        size: this.playerCache.size,
        hasCachedPlayers: this.playerCache.size > 0
      },
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