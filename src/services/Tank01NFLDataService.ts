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
  gameTimeepoch: string;
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

// Tank01 Player Stats - NEW STRUCTURE
interface Tank01PlayerStats {
  gameID: string;
  longName?: string;
  playerName?: string;
  pos: string;
  team: string;
  teamAbv: string;
  teamID: string;
  Passing?: {
    passYds: string;
    passTD: string;
    int: string;
    passCompletions: string;
    passAttempts: string;
  };
  Rushing?: {
    rushYds: string;
    rushTD: string;
    carries: string;
    longRush: string;
  };
  Receiving?: {
    receptions: string;
    recYds: string;
    recTD: string;
    targets: string;
    longRec: string;
  };
}

// Tank01 Box Score Response - NEW STRUCTURE
interface Tank01BoxScoreResponse {
  statusCode: number;
  body: {
    gameID: string;
    away: string;
    home: string;
    awayPts: string;
    homePts: string;
    currentPeriod: string;
    gameClock: string;
    gameStatus: string;
    gameStatusCode: string;
    playerStats: Record<string, Tank01PlayerStats>;
    scoringPlays?: any[];
    allPlayByPlay?: any[];
  };
}

interface GamePollingState {
  gameId: string;
  lastPolledAt: number;
  isActive: boolean;
  playerStats: Map<string, PlayerStatSnapshot>;
}

interface PlayerStatSnapshot {
  playerId: string;
  playerName: string;
  position: string;
  team: string;
  passingYards: number;
  passingTDs: number;
  passingInts: number;
  rushingYards: number;
  rushingTDs: number;
  receptions: number;
  receivingYards: number;
  receivingTDs: number;
  totalFantasyPoints: number;
  lastUpdated: number;
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
 * Tank01 NFL Data Service - STAT-BASED TRACKING
 * Polls cumulative player stats and emits events when stats change
 */
export class Tank01NFLDataService {
  private static instance: Tank01NFLDataService;
  
  private pollingInterval: NodeJS.Timeout | null = null;
  private gameStates: Map<string, GamePollingState> = new Map();
  private eventCallbacks: ((event: NFLScoringEvent) => void)[] = [];
  
  private pollingIntervalMs = 90000; // Start with 90 seconds
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
  private readonly MAX_REQUESTS_PER_MINUTE = 10;
  private readonly MAX_DAILY_REQUESTS = 1000;
  private readonly DAILY_QUOTA_WARNING_THRESHOLD = 0.8;
  private readonly MIN_POLL_INTERVAL = 45000; // 45 seconds minimum
  
  // Adaptive polling based on game state
  private readonly POLLING_INTERVALS = {
    Q1_Q2: 90000,      // 90 seconds
    Q3: 75000,          // 75 seconds
    Q4_EARLY: 60000,    // 60 seconds
    Q4_LATE: 45000,     // 45 seconds
    OVERTIME: 30000,    // 30 seconds
    BLOWOUT: 120000     // 2 minutes
  };
  
  private constructor() {
    debugLogger.info('TANK01', 'Tank01NFLDataService initialized with STAT-BASED tracking');
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
   * Poll for active games
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
        body: { endpoint: 'scores' }
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
      const gamesObj = data?.body;
      const gamesArray: Tank01Game[] = Object.values(gamesObj);
      
      this.recordRequestSuccess();
      
      // Find active games
      const activeGames: Tank01Game[] = [];
      for (const game of gamesArray) {
        if (this.isGameActive(game)) {
          activeGames.push(game);
          
          // Initialize or update game state
          if (!this.gameStates.has(game.gameID)) {
            this.gameStates.set(game.gameID, {
              gameId: game.gameID,
              lastPolledAt: now,
              isActive: true,
              playerStats: new Map()
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
   * Fetch player stats for a game and detect changes
   * THIS IS THE KEY METHOD - REPLACES PLAY-BY-PLAY PARSING
   */
  public async fetchGamePlayerStats(gameId: string): Promise<void> {
    if (!this.canMakeRequest()) {
      debugLogger.warning('TANK01', `Cannot fetch stats for ${gameId} - rate limit`);
      return;
    }
    
    try {
      this.recordRequestStart();
      
      debugLogger.api('TANK01', `Fetching player stats for ${gameId}`);
      
      const response = await supabase.functions.invoke('tank01-api', {
        body: {
          endpoint: 'plays',
          gameId: gameId
        }
      });
      
      if (response.error) {
        throw new Error(`API error: ${response.error.message}`);
      }
      
      const data = response.data as Tank01BoxScoreResponse;
      const playerStats = data.body?.playerStats;
      
      if (!playerStats) {
        debugLogger.warning('TANK01', `No player stats for ${gameId}`);
        return;
      }
      
      this.recordRequestSuccess();
      
      // Get game state
      let gameState = this.gameStates.get(gameId);
      if (!gameState) {
        gameState = {
          gameId,
          lastPolledAt: Date.now(),
          isActive: true,
          playerStats: new Map()
        };
        this.gameStates.set(gameId, gameState);
      }
      
      // Process each player's stats
      for (const [playerId, stats] of Object.entries(playerStats)) {
        await this.processPlayerStatChange(playerId, stats, gameState, data.body);
      }
      
      gameState.lastPolledAt = Date.now();
      
    } catch (error) {
      this.recordRequestFailure();
      debugLogger.error('TANK01', `Failed to fetch stats for ${gameId}`, error);
    }
  }
  
  /**
   * Process player stat changes and emit events
   */
  private async processPlayerStatChange(
    playerId: string,
    currentStats: Tank01PlayerStats,
    gameState: GamePollingState,
    gameInfo: any
  ): Promise<void> {
    // Create current snapshot
    const currentSnapshot: PlayerStatSnapshot = {
      playerId,
      playerName: currentStats.longName || currentStats.playerName || 'Unknown',
      position: currentStats.pos,
      team: currentStats.teamAbv,
      passingYards: parseInt(currentStats.Passing?.passYds || '0'),
      passingTDs: parseInt(currentStats.Passing?.passTD || '0'),
      passingInts: parseInt(currentStats.Passing?.int || '0'),
      rushingYards: parseInt(currentStats.Rushing?.rushYds || '0'),
      rushingTDs: parseInt(currentStats.Rushing?.rushTD || '0'),
      receptions: parseInt(currentStats.Receiving?.receptions || '0'),
      receivingYards: parseInt(currentStats.Receiving?.recYds || '0'),
      receivingTDs: parseInt(currentStats.Receiving?.recTD || '0'),
      totalFantasyPoints: 0,
      lastUpdated: Date.now()
    };
    
    // Calculate fantasy points (PPR scoring)
    currentSnapshot.totalFantasyPoints = 
      currentSnapshot.passingYards * 0.04 +
      currentSnapshot.passingTDs * 4 +
      currentSnapshot.passingInts * -2 +
      currentSnapshot.rushingYards * 0.1 +
      currentSnapshot.rushingTDs * 6 +
      currentSnapshot.receptions * 1 +
      currentSnapshot.receivingYards * 0.1 +
      currentSnapshot.receivingTDs * 6;
    
    // Get previous snapshot
    const previousSnapshot = gameState.playerStats.get(playerId);
    
    if (previousSnapshot) {
      // Check if stats changed
      const pointsDelta = currentSnapshot.totalFantasyPoints - previousSnapshot.totalFantasyPoints;
      
      if (pointsDelta > 0) {
        debugLogger.info('TANK01', `Stat change detected for ${currentSnapshot.playerName}`, {
          previousPoints: previousSnapshot.totalFantasyPoints,
          currentPoints: currentSnapshot.totalFantasyPoints,
          delta: pointsDelta
        });
        
        // Create fantasy event
        const event = this.createFantasyEvent(currentSnapshot, previousSnapshot, gameInfo);
        this.emitEvent(event);
      }
    }
    
    // Store current snapshot
    gameState.playerStats.set(playerId, currentSnapshot);
  }
  
  /**
   * Create NFL Scoring Event from stat change
   */
  private createFantasyEvent(
    current: PlayerStatSnapshot,
    previous: PlayerStatSnapshot,
    gameInfo: any
  ): NFLScoringEvent {
    // Build description
    const descParts: string[] = [];
    
    if (current.receptions > previous.receptions) {
      descParts.push(`${current.receptions} rec`);
    }
    if (current.receivingYards > previous.receivingYards) {
      descParts.push(`${current.receivingYards} rec yds`);
    }
    if (current.receivingTDs > previous.receivingTDs) {
      descParts.push(`${current.receivingTDs} rec TD`);
    }
    if (current.rushingYards > previous.rushingYards) {
      descParts.push(`${current.rushingYards} rush yds`);
    }
    if (current.rushingTDs > previous.rushingTDs) {
      descParts.push(`${current.rushingTDs} rush TD`);
    }
    if (current.passingYards > previous.passingYards) {
      descParts.push(`${current.passingYards} pass yds`);
    }
    if (current.passingTDs > previous.passingTDs) {
      descParts.push(`${current.passingTDs} pass TD`);
    }
    
    const description = `${current.playerName} - ${descParts.join(', ')}`;
    
    // Determine event type
    let eventType: NFLScoringEvent['eventType'] = 'receivingyards';
    if (current.receivingTDs > previous.receivingTDs) {
      eventType = 'receivingtd';
    } else if (current.rushingTDs > previous.rushingTDs) {
      eventType = 'rushingtd';
    } else if (current.passingTDs > previous.passingTDs) {
      eventType = 'passingtd';
    }
    
    return {
      id: `${gameInfo.gameID}-${current.playerId}-${Date.now()}`,
      player: {
        id: current.playerId,
        name: current.playerName,
        position: current.position,
        team: current.team
      },
      team: current.team,
      eventType,
      description,
      timestamp: new Date(),
      stats: {
        passingYards: current.passingYards - previous.passingYards,
        passingTouchdowns: current.passingTDs - previous.passingTDs,
        rushingYards: current.rushingYards - previous.rushingYards,
        rushingTouchdowns: current.rushingTDs - previous.rushingTDs,
        receptions: current.receptions - previous.receptions,
        receivingYards: current.receivingYards - previous.receivingYards,
        receivingTouchdowns: current.receivingTDs - previous.receivingTDs
      },
      gameId: gameInfo.gameID,
      period: this.parsePeriod(gameInfo.currentPeriod),
      clock: gameInfo.gameClock || '',
      scoringPlay: true
    };
  }
  
  /**
   * Check if game is active
   */
  private isGameActive(game: Tank01Game): boolean {
    return game.gameStatusCode === '1' || 
           game.gameStatus?.includes('Live') || 
           game.gameStatus?.includes('In Progress');
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
   * Start polling with adaptive intervals
   */
  public async startPolling(intervalMs: number = 90000): Promise<void> {
    if (this.isPolling) {
      debugLogger.warning('TANK01', 'Already polling');
      return;
    }
    
    this.pollingIntervalMs = intervalMs;
    this.isPolling = true;
    
    debugLogger.success('TANK01', `Polling started with ${intervalMs}ms interval`);
    
    // Initial poll
    await this.runPollingCycle();
    
    // Set up recurring poll
    this.pollingInterval = setInterval(async () => {
      await this.runPollingCycle();
    }, this.pollingIntervalMs);
  }
  
  /**
   * Run a single polling cycle
   */
  private async runPollingCycle(): Promise<void> {
    try {
      // Get active games
      const activeGames = await this.pollActiveGames();
      
      // Fetch stats for each active game
      for (const game of activeGames) {
        await this.fetchGamePlayerStats(game.gameID);
        
        // Small delay between games to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      debugLogger.error('TANK01', 'Polling cycle failed', error);
    }
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
    debugLogger.error('TANK01', 'EMERGENCY STOP ACTIVATED');
  }
  
  /**
   * Reset emergency stop
   */
  public resetEmergencyStop(): void {
    this.emergencyStop = false;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failureCount = 0;
    debugLogger.info('TANK01', 'Emergency stop reset');
  }
  
  // Rate limiting methods (preserved from original)
  
  private checkDailyQuota(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.dailyQuota.date !== today) {
      this.dailyQuota = {
        date: today,
        requestCount: 0,
        lastReset: new Date()
      };
    }
  }
  
  private incrementDailyQuota(): void {
    this.checkDailyQuota();
    this.dailyQuota.requestCount++;
    
    if (this.dailyQuota.requestCount >= this.MAX_DAILY_REQUESTS * this.DAILY_QUOTA_WARNING_THRESHOLD) {
      debugLogger.warning('TANK01', `Daily quota at ${this.dailyQuota.requestCount}/${this.MAX_DAILY_REQUESTS}`);
    }
  }
  
  private canMakeRequest(): boolean {
    this.checkDailyQuota();
    
    if (this.dailyQuota.requestCount >= this.MAX_DAILY_REQUESTS) {
      debugLogger.error('TANK01', 'Daily quota exceeded');
      return false;
    }
    
    if (this.circuitBreaker.isOpen) {
      if (this.circuitBreaker.nextRetryTime && new Date() > this.circuitBreaker.nextRetryTime) {
        this.circuitBreaker.isOpen = false;
        this.circuitBreaker.failureCount = 0;
      } else {
        return false;
      }
    }
    
    // Check requests per minute
    const now = new Date();
    if (now.getTime() - this.requestMetrics.lastMinuteReset.getTime() > 60000) {
      this.requestMetrics.requestsThisMinute = 0;
      this.requestMetrics.lastMinuteReset = now;
    }
    
    if (this.requestMetrics.requestsThisMinute >= this.MAX_REQUESTS_PER_MINUTE) {
      debugLogger.warning('TANK01', 'Per-minute rate limit reached');
      return false;
    }
    
    return true;
  }
  
  private recordRequestStart(): void {
    this.requestMetrics.totalRequests++;
    this.requestMetrics.requestsThisMinute++;
    this.incrementDailyQuota();
  }
  
  private recordRequestSuccess(): void {
    this.requestMetrics.successfulRequests++;
    this.requestMetrics.lastRequestTime = new Date();
    this.circuitBreaker.failureCount = 0;
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
      debugLogger.error('TANK01', 'Circuit breaker opened', {
        failureCount: this.circuitBreaker.failureCount,
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
   * Get service status
   */
  public getServiceStatus() {
    this.checkDailyQuota();
    const percentUsed = (this.dailyQuota.requestCount / this.MAX_DAILY_REQUESTS) * 100;
    
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
        percentUsed: `${percentUsed.toFixed(1)}%`
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
