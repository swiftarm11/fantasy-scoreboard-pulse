import { debugLogger } from "../utils/debugLogger";
import { supabase } from "../integrations/supabase/client";

// NFL Scoring Event - matches your existing type
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

// Tank01 Game from getNFLScoresOnly
interface Tank01Game {
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
  lineScore?: {
    period: string;
    gameClock: string;
    away: {
      Q1?: string;
      Q2?: string;
      Q3?: string;
      Q4?: string;
      teamID: string;
      currentlyInPossession: string;
      totalPts: string;
      teamAbv: string;
    };
    home: {
      Q1?: string;
      Q2?: string;
      Q3?: string;
      Q4?: string;
      teamID: string;
      currentlyInPossession: string;
      totalPts: string;
      teamAbv: string;
    };
  };
}

// Tank01 Scoring Play from play-by-play - ACTUAL API STRUCTURE
interface Tank01ScoringPlay {
  score: string;              // "CeeDee Lamb 74 Yd pass from Dak Prescott (Brandon Aubrey Kick)"
  scorePeriod: string;        // "Q1", "Q2", etc.
  homeScore: string;
  awayScore: string;
  teamID: string;
  scoreDetails: string;
  scoreType: string;          // "TD", "FG", "SF"
  scoreTime: string;
  team: string;               // "DAL", "WSH"
  playerIDs: string[];        // Array of player IDs involved
}

// Tank01 Play-by-Play Response
interface Tank01PlayByPlayResponse {
  statusCode: number;
  body: {
    scoringPlays: Tank01ScoringPlay[];
    allPlayByPlay: Array<{
      play: string;
      playPeriod: string;
      playClock: string;
      playerStats?: Record<string, any>;
      teamID: string;
    }>;
  };
}

interface GamePollingState {
  gameId: string;
  lastScoreCount: number;
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
  date: string;
  requestCount: number;
  lastReset: Date;
}

/**
 * Tank01 NFL Data Service - PRODUCTION READY
 * Built to parse YOUR exact Tank01 API response structure
 */
export class Tank01NFLDataService {
  private static instance: Tank01NFLDataService;
  
  private pollingInterval: NodeJS.Timeout | null = null;
  private gameStates: Map<string, GamePollingState> = new Map();
  private eventCallbacks: ((event: NFLScoringEvent) => void)[] = [];
  private pollingIntervalMs = 300000; // 5 minutes
  private isPolling = false;
  private emergencyStop = false;
  private lastPollTime = 0;

  // Circuit breaker
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

  // Daily quota
  private dailyQuota: DailyQuotaTracker = {
    date: new Date().toISOString().split('T')[0],
    requestCount: 0,
    lastReset: new Date()
  };

  // SAFE LIMITS
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 300000; // 5 minutes
  private readonly MAX_REQUESTS_PER_MINUTE = 5;
  private readonly MAX_DAILY_REQUESTS = 400; // Conservative limit
  private readonly DAILY_QUOTA_WARNING_THRESHOLD = 0.6;
  private readonly DAILY_QUOTA_CIRCUIT_BREAKER = 0.8;
  private readonly MIN_POLL_INTERVAL = 60000; // 1 minute minimum
  private readonly GAME_POLL_COOLDOWN = 600000; // 10 minutes per game for play-by-play

  private constructor() {
    debugLogger.info('TANK01', 'Tank01NFLDataService initialized');
  }

  public static getInstance(): Tank01NFLDataService {
    if (!Tank01NFLDataService.instance) {
      Tank01NFLDataService.instance = new Tank01NFLDataService();
    }
    return Tank01NFLDataService.instance;
  }

  /**
   * Register callback for scoring events
   */
  public onScoringEvent(callback: (event: NFLScoringEvent) => void): () => void {
    this.eventCallbacks.push(callback);
    debugLogger.info('TANK01', 'Event callback registered', { totalCallbacks: this.eventCallbacks.length });
    
    // Return unsubscribe function
    return () => {
      const index = this.eventCallbacks.indexOf(callback);
      if (index > -1) {
        this.eventCallbacks.splice(index, 1);
        debugLogger.info('TANK01', 'Event callback unregistered');
      }
    };
  }

  /**
   * Emit event to all callbacks
   */
  private emitEvent(event: NFLScoringEvent): void {
    debugLogger.info('TANK01', 'Emitting scoring event', {
      eventId: event.id,
      player: event.player.name,
      type: event.eventType,
      points: event.stats
    });

    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        debugLogger.error('TANK01', 'Error in event callback', error);
      }
    }
  }

  /**
   * Poll for active games using getNFLScoresOnly
   */
  public async pollActiveGames(): Promise<Tank01Game[]> {
    const now = Date.now();
    
    // Prevent rapid duplicate polls
    if (now - this.lastPollTime < this.MIN_POLL_INTERVAL) {
      debugLogger.warning('TANK01', 'Poll blocked - too soon', {
        timeSince: now - this.lastPollTime,
        minInterval: this.MIN_POLL_INTERVAL
      });
      return [];
    }

    if (this.emergencyStop) {
      debugLogger.error('TANK01', 'Poll blocked - emergency stop');
      return [];
    }

    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01', 'Poll blocked - rate limit');
      return [];
    }

    try {
      this.lastPollTime = now;
      this.recordRequestStart();
      
      debugLogger.api('TANK01', 'Polling scoreboard (getNFLScoresOnly)');

      const response = await supabase.functions.invoke('tank01-api', {
        body: { endpoint: 'scoreboard' }
      });

      if (response.error?.message?.includes('429')) {
        debugLogger.error('TANK01', 'QUOTA EXCEEDED');
        this.circuitBreaker.isOpen = true;
        this.circuitBreaker.nextRetryTime = new Date(now + 3600000);
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
      
      // Find active games (gameStatusCode === "1")
      const activeGames: Tank01Game[] = [];
      for (const game of gamesArray) {
        if (this.isGameActive(game)) {
          activeGames.push(game);
          
          // Update game state
          const existing = this.gameStates.get(game.gameID);
          if (!existing) {
            this.gameStates.set(game.gameID, {
              gameId: game.gameID,
              lastScoreCount: 0,
              lastPolledAt: now,
              isActive: true
            });
          }
        }
      }

      debugLogger.info('TANK01', `Found ${activeGames.length} active games`, {
        totalGames: gamesArray.length,
        activeGameIds: activeGames.map(g => `${g.away}@${g.home}`)
      });

      return activeGames;

    } catch (error) {
      this.recordRequestFailure();
      this.recordFailure();
      debugLogger.error('TANK01', 'Failed to poll games', error);
      throw error;
    }
  }

  /**
   * Fetch play-by-play for a specific game
   */
  public async fetchGamePlayByPlay(gameId: string): Promise<Tank01ScoringPlay[]> {
    const gameState = this.gameStates.get(gameId);
    const now = Date.now();

    // Check cooldown
    if (gameState && (now - gameState.lastPolledAt) < this.GAME_POLL_COOLDOWN) {
      const remaining = this.GAME_POLL_COOLDOWN - (now - gameState.lastPolledAt);
      debugLogger.info('TANK01', `Game ${gameId} on cooldown`, {
        remainingMs: remaining,
        remainingSec: Math.round(remaining / 1000)
      });
      return [];
    }

    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01', 'Cannot fetch play-by-play - rate limit');
      return [];
    }

    try {
      this.recordRequestStart();
      debugLogger.api('TANK01', `Fetching play-by-play for ${gameId}`);

      const response = await supabase.functions.invoke('tank01-api', {
        body: {
          endpoint: 'plays',
          gameId: gameId
        }
      });

      if (response.error?.message?.includes('429')) {
        debugLogger.error('TANK01', 'QUOTA EXCEEDED');
        this.circuitBreaker.isOpen = true;
        this.emergencyStopPolling();
        throw new Error('Tank01 API quota exceeded (429)');
      }

      if (response.error) {
        throw new Error(`API error: ${response.error.message}`);
      }

      const playByPlayData = response.data as Tank01PlayByPlayResponse;
      const scoringPlays = playByPlayData?.body?.scoringPlays || [];
      
      // Update game state
      if (gameState) {
        gameState.lastPolledAt = now;
        gameState.lastScoreCount = scoringPlays.length;
      }

      this.recordRequestSuccess();
      
      debugLogger.success('TANK01', `Fetched ${scoringPlays.length} scoring plays for ${gameId}`);
      
      // Process scoring plays into events
      await this.processScoringPlays(scoringPlays, gameId);
      
      return scoringPlays;

    } catch (error) {
      this.recordRequestFailure();
      this.recordFailure();
      debugLogger.error('TANK01', `Failed to fetch play-by-play for ${gameId}`, error);
      return [];
    }
  }

  /**
   * Process scoring plays into NFLScoringEvents
   */
  private async processScoringPlays(plays: Tank01ScoringPlay[], gameId: string): Promise<void> {
    for (const play of plays) {
      try {
        const event = await this.createScoringEvent(play, gameId);
        if (event) {
          this.emitEvent(event);
        }
      } catch (error) {
        debugLogger.error('TANK01', 'Failed to process scoring play', { play, error });
      }
    }
  }

  /**
   * Create NFLScoringEvent from Tank01 scoring play
   */
  private async createScoringEvent(play: Tank01ScoringPlay, gameId: string): Promise<NFLScoringEvent | null> {
    // Get primary player ID (first in array)
    const primaryPlayerId = play.playerIDs?.[0];
    if (!primaryPlayerId) {
      debugLogger.warning('TANK01', 'Scoring play has no player IDs', play);
      return null;
    }

    // Look up player info from Supabase
    const { data: playerData, error } = await supabase
      .from('player_mappings')
      .select('*')
      .eq('tank01_id', primaryPlayerId)
      .single();

    if (error || !playerData) {
      debugLogger.warning('TANK01', `Player ${primaryPlayerId} not found in mappings`);
      return null;
    }

    const eventType = this.mapScoreTypeToEventType(play.scoreType);
    if (!eventType) {
      return null;
    }

    // Calculate stats based on score type
    const stats = this.extractStats(play);

    const event: NFLScoringEvent = {
      id: `tank01-${gameId}-${play.scorePeriod}-${play.scoreTime}-${primaryPlayerId}`,
      player: {
        id: primaryPlayerId,
        name: playerData.name,
        position: playerData.position,
        team: playerData.team
      },
      team: playerData.team,
      eventType,
      description: play.scoreDescription || `${play.scoreType} in ${play.scorePeriod}`,
      timestamp: new Date(),
      stats,
      gameId,
      period: this.parsePeriod(play.scorePeriod),
      clock: play.scoreTime,
      scoringPlay: true
    };

    return event;
  }

  /**
   * Map Tank01 scoreType to your event types
   */
  private mapScoreTypeToEventType(scoreType: string): NFLScoringEvent['eventType'] | null {
    const lower = scoreType.toLowerCase();
    
    if (lower.includes('td') || lower.includes('touchdown')) {
      if (lower.includes('pass')) return 'passingtd';
      if (lower.includes('rush')) return 'rushingtd';
      if (lower.includes('rec')) return 'receivingtd';
      return 'rushingtd'; // Default TD
    }
    
    if (lower.includes('fg') || lower.includes('field goal')) return 'fieldgoal';
    if (lower.includes('int')) return 'interception';
    if (lower.includes('fum')) return 'fumble';
    if (lower.includes('safety')) return 'safety';
    
    return null;
  }

  /**
   * Extract stats from scoring play
   */
  private extractStats(play: Tank01ScoringPlay): Record<string, number> {
    const stats: Record<string, number> = {};
    
    const scoreType = play.scoreType.toLowerCase();
    
    if (scoreType.includes('td') || scoreType.includes('touchdown')) {
      if (scoreType.includes('pass')) {
        stats.passingTouchdowns = 1;
      } else if (scoreType.includes('rush')) {
        stats.rushingTouchdowns = 1;
      } else if (scoreType.includes('rec')) {
        stats.receivingTouchdowns = 1;
      }
    }
    
    if (scoreType.includes('fg')) {
      stats.fieldGoalsMade = 1;
    }
    
    return stats;
  }

  /**
   * Parse period string to number
   */
  private parsePeriod(period: string): number {
    if (period.includes('Q1') || period.includes('1st')) return 1;
    if (period.includes('Q2') || period.includes('2nd')) return 2;
    if (period.includes('Q3') || period.includes('3rd')) return 3;
    if (period.includes('Q4') || period.includes('4th')) return 4;
    if (period.includes('OT')) return 5;
    return 1;
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
   * Start polling
   */
  public async startPolling(intervalMs: number = 300000): Promise<void> {
    if (this.isPolling) {
      debugLogger.warning('TANK01', 'Already polling');
      return;
    }

    if (this.emergencyStop) {
      throw new Error('Emergency stop active');
    }

    this.pollingIntervalMs = Math.max(intervalMs, 300000);
    this.isPolling = true;

    debugLogger.info('TANK01', 'Starting polling', { interval: this.pollingIntervalMs });

    // Initial poll
    try {
      await this.pollActiveGames();
    } catch (error) {
      this.isPolling = false;
      throw error;
    }

    // Set up recurring
    this.pollingInterval = setInterval(async () => {
      if (this.emergencyStop || this.circuitBreaker.isOpen) {
        this.stopPolling();
        return;
      }

      try {
        await this.pollActiveGames();
      } catch (error) {
        debugLogger.error('TANK01', 'Polling cycle failed', error);
      }
    }, this.pollingIntervalMs);
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
    debugLogger.info('TANK01', 'Polling stopped');
  }

  /**
   * Emergency stop
   */
  public emergencyStopPolling(): void {
    this.emergencyStop = true;
    this.stopPolling();
    debugLogger.warning('TANK01', '🚨 EMERGENCY STOP 🚨');
  }

  /**
   * Reset emergency stop
   */
  public resetEmergencyStop(): void {
    this.emergencyStop = false;
    this.resetCircuitBreaker();
    debugLogger.info('TANK01', 'Emergency stop reset');
  }

  // Rate limiting methods
  private checkDailyQuota(): boolean {
    const today = new Date().toISOString().split('T')[0];
    
    if (this.dailyQuota.date !== today) {
      this.dailyQuota = {
        date: today,
        requestCount: 0,
        lastReset: new Date()
      };
      try {
        localStorage.setItem('tank01_daily_quota', JSON.stringify(this.dailyQuota));
      } catch (error) {}
    }

    try {
      const stored = localStorage.getItem('tank01_daily_quota');
      if (stored) {
        const storedQuota = JSON.parse(stored);
        if (storedQuota.date === today) {
          this.dailyQuota = storedQuota;
        }
      }
    } catch (error) {}

    const percentUsed = this.dailyQuota.requestCount / this.MAX_DAILY_REQUESTS;

    if (percentUsed >= this.DAILY_QUOTA_CIRCUIT_BREAKER) {
      debugLogger.error('TANK01', 'DAILY QUOTA CIRCUIT BREAKER', {
        used: this.dailyQuota.requestCount,
        limit: this.MAX_DAILY_REQUESTS
      });
      this.circuitBreaker.isOpen = true;
      this.emergencyStopPolling();
      return false;
    }

    if (percentUsed >= this.DAILY_QUOTA_WARNING_THRESHOLD) {
      debugLogger.warning('TANK01', 'Daily quota warning', {
        used: this.dailyQuota.requestCount,
        remaining: this.MAX_DAILY_REQUESTS - this.dailyQuota.requestCount
      });
    }

    return true;
  }

  private incrementDailyQuota(): void {
    this.dailyQuota.requestCount++;
    try {
      localStorage.setItem('tank01_daily_quota', JSON.stringify(this.dailyQuota));
    } catch (error) {}
  }

  private canMakeRequest(): boolean {
    if (this.circuitBreaker.isOpen) {
      const now = new Date();
      if (this.circuitBreaker.nextRetryTime && now >= this.circuitBreaker.nextRetryTime) {
        this.resetCircuitBreaker();
        return true;
      }
      return false;
    }

    if (!this.checkDailyQuota()) {
      return false;
    }

    const now = new Date();
    const timeSinceReset = now.getTime() - this.requestMetrics.lastMinuteReset.getTime();
    
    if (timeSinceReset >= 60000) {
      this.requestMetrics.requestsThisMinute = 0;
      this.requestMetrics.lastMinuteReset = now;
    }

    if (this.requestMetrics.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
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
    }
  }

  private resetCircuitBreaker(): void {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.circuitBreaker.nextRetryTime = null;
  }

  /**
   * Get service status
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
        requestsThisMinute: this.requestMetrics.requestsThisMinute
      },
      dailyQuota: {
        date: this.dailyQuota.date,
        used: this.dailyQuota.requestCount,
        limit: this.MAX_DAILY_REQUESTS,
        remaining: this.MAX_DAILY_REQUESTS - this.dailyQuota.requestCount,
        percentUsed: (percentUsed * 100).toFixed(1) + '%'
      }
    };
  }
}

// Export singleton
export const tank01NFLDataService = Tank01NFLDataService.getInstance();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).tank01NFLDataService = tank01NFLDataService;
}
