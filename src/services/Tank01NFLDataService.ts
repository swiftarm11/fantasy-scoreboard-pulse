import { debugLogger } from "../utils/debugLogger";
import { supabase } from "../integrations/supabase/client";

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
  eventType: 'passingtd' | 'rushingtd' | 'receivingtd' | 'passingyards' | 'rushingyards' | 'receivingyards' | 'fumblelost' | 'fumble' | 'interception' | 'fieldgoal' | 'safety';
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
  away: string;
  home: string;
  teamIDAway: string;
  teamIDHome: string;
  gameTime: string;
  gameTime_epoch: string;
  awayPts: string;
  homePts: string;
  gameClock: string;
  gameStatus: string;
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
  lastPolledAt: number;
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

/**
 * Tank01 NFL Data Service - SAFE MODE
 * Handles polling Tank01 API for live NFL game data
 * Features: Circuit breaker, strict rate limiting, daily quota management, runaway prevention
 */
export class Tank01NFLDataService {
  private static instance: Tank01NFLDataService;
  
  private pollingInterval: NodeJS.Timeout | null = null;
  private gameStates: Map<string, GamePollingState> = new Map();
  private eventCallbacks: ((event: NFLScoringEvent) => void)[] = [];
  private pollingIntervalMs = 300000; // SAFE MODE: 5 minutes (was 180s)
  private isPolling = false;
  private currentWeek: number | null = null;
  private emergencyStop = false;
  private playerCache: Map<string, Tank01Player> = new Map();
  private isInitializing = false; // Prevents multiple simultaneous inits
  private lastPollTime = 0; // Prevents duplicate polls

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

  // Daily quota tracking
  private dailyQuota: DailyQuotaTracker = {
    date: new Date().toISOString().split('T')[0],
    requestCount: 0,
    lastReset: new Date()
  };

  // SAFE MODE LIMITS - Conservative to prevent quota burn
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 300000; // 5 minutes
  private readonly MAX_REQUESTS_PER_MINUTE = 5; // Very conservative
  private readonly MAX_DAILY_REQUESTS = 500; // Dev mode limit
  private readonly DAILY_QUOTA_WARNING_THRESHOLD = 0.6; // Warn at 60%
  private readonly DAILY_QUOTA_CIRCUIT_BREAKER = 0.8; // Stop at 80%
  private readonly MIN_POLL_INTERVAL = 60000; // Absolute minimum 60 seconds between polls
  private readonly GAME_POLL_COOLDOWN = 120000; // 2 minutes between play-by-play fetches per game

  private constructor() {
    debugLogger.info('TANK01_DATA', 'Tank01NFLDataService initialized in SAFE MODE');
  }

  public static getInstance(): Tank01NFLDataService {
    if (!Tank01NFLDataService.instance) {
      Tank01NFLDataService.instance = new Tank01NFLDataService();
    }
    return Tank01NFLDataService.instance;
  }

  /**
   * Load player mappings - SAFE MODE with extensive caching
   */
  private async loadPlayerMappings(): Promise<void> {
    // Prevent duplicate loading
    if (this.isInitializing) {
      debugLogger.info('TANK01_DATA', 'Player mapping load already in progress, skipping');
      return;
    }

    // Check if we already have cached players
    if (this.playerCache.size > 0) {
      debugLogger.info('TANK01_DATA', 'Using existing player cache', { cachedPlayers: this.playerCache.size });
      return;
    }

    this.isInitializing = true;

    try {
      // Try localStorage first (24hr cache)
      const cached = localStorage.getItem('tank01_players_cache');
      if (cached) {
        const { players, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

        if (age < MAX_AGE) {
          for (const player of players) {
            this.playerCache.set(player.playerID, player);
          }
          debugLogger.success('TANK01_DATA', `Loaded ${players.length} players from cache`, {
            ageHours: Math.round(age / (60 * 60 * 1000))
          });
          return;
        }
      }
    } catch (error) {
      debugLogger.warning('TANK01_DATA', 'Failed to load from cache', error);
    }

    // Only fetch if we can make request
    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01_DATA', 'Cannot load player mappings - rate limit');
      return;
    }

    try {
      this.recordRequestStart();
      debugLogger.info('TANK01_DATA', 'Loading player mappings from API');

      const response = await supabase.functions.invoke('tank01-api', {
        body: { endpoint: 'players' }
      });

      if (response.error?.message?.includes('429')) {
        debugLogger.error('TANK01_DATA', 'API QUOTA EXCEEDED', response.error);
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.nextRetryTime = new Date(Date.now() + 3600000); // 1 hour
        throw new Error('Tank01 API quota exceeded');
      }

      if (response.error) {
        throw new Error(`API error: ${response.error.message}`);
      }

      const players = response.data?.body || [];
      this.playerCache.clear();
      
      for (const player of players) {
        this.playerCache.set(player.playerID, player);
      }

      // Save to localStorage
      try {
        localStorage.setItem('tank01_players_cache', JSON.stringify({ 
          players, 
          timestamp: Date.now() 
        }));
      } catch (error) {
        debugLogger.warning('TANK01_DATA', 'Failed to cache to localStorage', error);
      }

      this.recordRequestSuccess();
      debugLogger.success('TANK01_DATA', `Loaded ${players.length} player mappings`);
    } catch (error) {
      this.recordRequestFailure();
      this.recordFailure();
      debugLogger.error('TANK01_DATA', 'Failed to load player mappings', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Fetch active games - SAFE MODE: Only scoreboard, no automatic play-by-play
   */
  public async pollActiveGames(): Promise<Tank01Game[]> {
    // SAFETY: Prevent rapid duplicate polls
    const now = Date.now();
    if (now - this.lastPollTime < this.MIN_POLL_INTERVAL) {
      debugLogger.warning('TANK01_DATA', 'Poll blocked - too soon since last poll', {
        timeSinceLastPoll: now - this.lastPollTime,
        minInterval: this.MIN_POLL_INTERVAL
      });
      return [];
    }

    if (this.emergencyStop) {
      debugLogger.error('TANK01_DATA', 'Poll blocked - emergency stop active');
      return [];
    }

    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01_DATA', 'Poll blocked - rate limit exceeded');
      return [];
    }

    try {
      this.lastPollTime = now;
      this.recordRequestStart();
      
      debugLogger.api('TANK01_DATA', 'Polling scoreboard (getNFLScoresOnly)');

      const response = await supabase.functions.invoke('tank01-api', {
        body: { endpoint: 'scoreboard' }
      });

      // Check for quota exceeded
      if (response.error?.message?.includes('429')) {
        debugLogger.error('TANK01_DATA', 'QUOTA EXCEEDED - Circuit breaker activated');
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.failureCount = 999;
        this.circuitBreaker.nextRetryTime = new Date(now + 3600000); // 1 hour
        this.emergencyStopPolling();
        throw new Error('Tank01 API quota exceeded (429)');
      }

      if (response.error) {
        throw new Error(`Tank01 API error: ${response.error.message}`);
      }

      const data = response.data;
      const gamesObj = data?.body || {};
      const gamesArray: Tank01Game[] = Object.values(gamesObj);

      this.recordRequestSuccess();
      
      // Find active games
      const activeGames: Tank01Game[] = [];
      for (const game of gamesArray) {
        if (this.isGameActive(game)) {
          activeGames.push(game);
          // Update game state (but don't fetch play-by-play automatically)
          this.gameStates.set(game.gameID, {
            gameId: game.gameID,
            lastPlayId: '',
            lastPolledAt: now,
            isActive: true
          });
        }
      }

      debugLogger.info('TANK01_DATA', `Found ${activeGames.length} active games`, {
        totalGames: gamesArray.length,
        activeGameIds: activeGames.map(g => g.gameID)
      });

      return activeGames;

    } catch (error) {
      this.recordRequestFailure();
      this.recordFailure();
      debugLogger.error('TANK01_DATA', 'Failed to poll games', error);
      throw error;
    }
  }

  /**
   * Manual method to fetch play-by-play for a specific game
   * SAFE MODE: Must be called explicitly, has cooldown per game
   */
  public async fetchGamePlayByPlay(gameId: string): Promise<Tank01Play[]> {
    const gameState = this.gameStates.get(gameId);
    const now = Date.now();

    // Check cooldown for this specific game
    if (gameState && (now - gameState.lastPolledAt) < this.GAME_POLL_COOLDOWN) {
      debugLogger.warning('TANK01_DATA', `Game ${gameId} on cooldown`, {
        timeSinceLastPoll: now - gameState.lastPolledAt,
        cooldown: this.GAME_POLL_COOLDOWN
      });
      return [];
    }

    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01_DATA', 'Cannot fetch play-by-play - rate limit');
      return [];
    }

    try {
      this.recordRequestStart();
      debugLogger.api('TANK01_DATA', `Fetching play-by-play for ${gameId}`);

      const response = await supabase.functions.invoke('tank01-api', {
        body: {
          endpoint: 'plays',
          gameId: gameId
        }
      });

      if (response.error?.message?.includes('429')) {
        debugLogger.error('TANK01_DATA', 'QUOTA EXCEEDED');
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.nextRetryTime = new Date(now + 3600000);
        this.emergencyStopPolling();
        throw new Error('Tank01 API quota exceeded (429)');
      }

      if (response.error) {
        throw new Error(`API error: ${response.error.message}`);
      }

      const plays = response.data?.body?.playByPlay || [];
      
      // Update game state cooldown
      if (gameState) {
        gameState.lastPolledAt = now;
      }

      this.recordRequestSuccess();
      debugLogger.success('TANK01_DATA', `Fetched ${plays.length} plays for ${gameId}`);
      return plays;

    } catch (error) {
      this.recordRequestFailure();
      this.recordFailure();
      debugLogger.error('TANK01_DATA', `Failed to fetch play-by-play for ${gameId}`, error);
      return [];
    }
  }

  /**
   * Check if game is active
   */
  private isGameActive(game: Tank01Game): boolean {
    return game.gameStatusCode === "1" || 
           game.gameStatus?.includes("Live") || 
           game.gameStatus?.includes("In Progress");
  }

  /**
   * Start polling - SAFE MODE with extended intervals
   */
  public async startPolling(intervalMs: number = 300000): Promise<void> {
    if (this.isPolling) {
      debugLogger.warning('TANK01_DATA', 'Already polling, ignoring start request');
      return;
    }

    if (this.emergencyStop) {
      throw new Error('Emergency stop active - use resetEmergencyStop() first');
    }

    if (this.circuitBreaker.isOpen) {
      const now = new Date();
      if (this.circuitBreaker.nextRetryTime && now < this.circuitBreaker.nextRetryTime) {
        throw new Error(`Circuit breaker open until ${this.circuitBreaker.nextRetryTime.toISOString()}`);
      }
      this.resetCircuitBreaker();
    }

    // SAFE MODE: Enforce minimum interval
    this.pollingIntervalMs = Math.max(intervalMs, 300000); // Minimum 5 minutes
    this.isPolling = true;

    debugLogger.info('TANK01_DATA', 'Starting polling - SAFE MODE', {
      requestedInterval: intervalMs,
      actualInterval: this.pollingIntervalMs,
      minInterval: 300000
    });

    // Load player mappings once
    try {
      await this.loadPlayerMappings();
    } catch (error) {
      debugLogger.error('TANK01_DATA', 'Failed to load player mappings, continuing anyway', error);
    }

    // Initial poll
    try {
      await this.pollActiveGames();
    } catch (error) {
      debugLogger.error('TANK01_DATA', 'Initial poll failed', error);
      this.isPolling = false;
      throw error;
    }

    // Set up recurring polling
    this.pollingInterval = setInterval(async () => {
      if (this.emergencyStop || this.circuitBreaker.isOpen) {
        debugLogger.warning('TANK01_DATA', 'Stopping polling due to emergency stop or circuit breaker');
        this.stopPolling();
        return;
      }

      try {
        await this.pollActiveGames();
      } catch (error) {
        debugLogger.error('TANK01_DATA', 'Polling cycle failed', error);
      }
    }, this.pollingIntervalMs);

    debugLogger.success('TANK01_DATA', 'Polling started successfully');
  }

  /**
   * Stop polling
   */
  public stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    debugLogger.info('TANK01_DATA', 'Polling stopped');
  }

  /**
   * Emergency stop
   */
  public emergencyStopPolling(): void {
    this.emergencyStop = true;
    this.stopPolling();
    debugLogger.warning('TANK01_DATA', '🚨 EMERGENCY STOP ACTIVATED 🚨');
  }

  /**
   * Reset emergency stop
   */
  public resetEmergencyStop(): void {
    this.emergencyStop = false;
    this.resetCircuitBreaker();
    debugLogger.info('TANK01_DATA', 'Emergency stop reset');
  }

  /**
   * Check daily quota with localStorage persistence
   */
  private checkDailyQuota(): boolean {
    const today = new Date().toISOString().split('T')[0];

    // Reset if new day
    if (this.dailyQuota.date !== today) {
      this.dailyQuota = {
        date: today,
        requestCount: 0,
        lastReset: new Date()
      };
      try {
        localStorage.setItem('tank01_daily_quota', JSON.stringify(this.dailyQuota));
      } catch (error) {
        // Ignore
      }
    }

    // Load from localStorage
    try {
      const stored = localStorage.getItem('tank01_daily_quota');
      if (stored) {
        const storedQuota = JSON.parse(stored);
        if (storedQuota.date === today) {
          this.dailyQuota = storedQuota;
        }
      }
    } catch (error) {
      // Ignore
    }

    const percentUsed = this.dailyQuota.requestCount / this.MAX_DAILY_REQUESTS;

    // Circuit breaker at 80%
    if (percentUsed >= this.DAILY_QUOTA_CIRCUIT_BREAKER) {
      debugLogger.error('TANK01_DATA', '🚨 DAILY QUOTA CIRCUIT BREAKER 🚨', {
        used: this.dailyQuota.requestCount,
        limit: this.MAX_DAILY_REQUESTS,
        percent: (percentUsed * 100).toFixed(1) + '%'
      });
      this.circuitBreaker.isOpen = true;
      this.emergencyStopPolling();
      return false;
    }

    // Warning at 60%
    if (percentUsed >= this.DAILY_QUOTA_WARNING_THRESHOLD) {
      debugLogger.warning('TANK01_DATA', 'Daily quota warning', {
        used: this.dailyQuota.requestCount,
        limit: this.MAX_DAILY_REQUESTS,
        remaining: this.MAX_DAILY_REQUESTS - this.dailyQuota.requestCount
      });
    }

    return true;
  }

  /**
   * Increment quota counter
   */
  private incrementDailyQuota(): void {
    this.dailyQuota.requestCount++;
    
    // Persist to localStorage every request in SAFE MODE
    try {
      localStorage.setItem('tank01_daily_quota', JSON.stringify(this.dailyQuota));
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Rate limiting check
   */
  private canMakeRequest(): boolean {
    // Check circuit breaker
    if (this.circuitBreaker.isOpen) {
      const now = new Date();
      if (this.circuitBreaker.nextRetryTime && now >= this.circuitBreaker.nextRetryTime) {
        this.resetCircuitBreaker();
        return true;
      }
      return false;
    }

    // Check daily quota
    if (!this.checkDailyQuota()) {
      return false;
    }

    // Check per-minute rate limit
    const now = new Date();
    const timeSinceReset = now.getTime() - this.requestMetrics.lastMinuteReset.getTime();
    
    if (timeSinceReset >= 60000) {
      this.requestMetrics.requestsThisMinute = 0;
      this.requestMetrics.lastMinuteReset = now;
    }

    if (this.requestMetrics.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
      debugLogger.warning('TANK01_DATA', 'Per-minute rate limit hit', {
        requests: this.requestMetrics.requestsThisMinute,
        limit: this.MAX_REQUESTS_PER_MINUTE
      });
      return false;
    }

    return true;
  }

  private recordRequestStart(): void {
    this.requestMetrics.totalRequests++;
    this.requestMetrics.requestsThisMinute++;
    this.requestMetrics.lastRequestTime = new Date();
    this.incrementDailyQuota();
  }

  private recordRequestSuccess(): void {
    this.requestMetrics.successfulRequests++;
    this.resetCircuitBreaker();
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
      debugLogger.warning('TANK01_DATA', 'Circuit breaker opened', {
        failures: this.circuitBreaker.failureCount,
        nextRetry: this.circuitBreaker.nextRetryTime
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
   * Get comprehensive service status
   */
  public getServiceStatus() {
    const percentUsed = this.dailyQuota.requestCount / this.MAX_DAILY_REQUESTS;

    return {
      mode: 'SAFE MODE',
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
        percentUsed: (percentUsed * 100).toFixed(1) + '%',
        status: percentUsed >= this.DAILY_QUOTA_CIRCUIT_BREAKER ? 'CRITICAL' :
                percentUsed >= this.DAILY_QUOTA_WARNING_THRESHOLD ? 'WARNING' : 'OK'
      },
      playerCache: {
        size: this.playerCache.size
      },
      safetyLimits: {
        minPollInterval: this.MIN_POLL_INTERVAL,
        gamePollCooldown: this.GAME_POLL_COOLDOWN,
        maxRequestsPerMinute: this.MAX_REQUESTS_PER_MINUTE
      }
    };
  }

  /**
   * Get player mapping
   */
  public getPlayerMapping(tank01PlayerId: string): Tank01Player | null {
    return this.playerCache.get(tank01PlayerId) || null;
  }
}

// Export singleton
export const tank01NFLDataService = Tank01NFLDataService.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).tank01NFLDataService = tank01NFLDataService;
}
