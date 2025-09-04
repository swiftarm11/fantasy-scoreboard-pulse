import { debugLogger } from '../utils/debugLogger';
import { safeLower, safeIncludes } from '../utils/strings';
import { supabase } from '../integrations/supabase/client';

// ESPN API Data Structures
export interface ESPNGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  season: {
    year: number;
    type: number;
  };
  week: {
    number: number;
  };
  competitions: ESPNCompetition[];
  status: {
    clock: number;
    displayClock: string;
    period: number;
    type: {
      id: string;
      name: string;
      state: string;
      completed: boolean;
      description: string;
    };
  };
}

export interface ESPNCompetition {
  id: string;
  date: string;
  attendance: number;
  type: {
    id: string;
    abbreviation: string;
  };
  timeValid: boolean;
  neutralSite: boolean;
  conferenceCompetition: boolean;
  playByPlayAvailable: boolean;
  recent: boolean;
  competitors: ESPNTeam[];
  notes: any[];
  situation?: {
    lastPlay: ESPNPlay;
  };
  status: {
    clock: number;
    displayClock: string;
    period: number;
    type: {
      id: string;
      name: string;
      state: string;
      completed: boolean;
    };
  };
}

export interface ESPNTeam {
  id: string;
  uid: string;
  type: string;
  order: number;
  homeAway: 'home' | 'away';
  winner?: boolean;
  team: {
    id: string;
    uid: string;
    location: string;
    name: string;
    abbreviation: string;
    displayName: string;
    shortDisplayName: string;
    color: string;
    alternateColor: string;
    isActive: boolean;
    venue: {
      id: string;
    };
    links: any[];
    logo: string;
  };
  score: string;
  curatedRank: {
    current: number;
  };
  statistics: any[];
  records: any[];
}

export interface ESPNPlay {
  id: string;
  sequenceNumber: string;
  type: {
    id: string;
    text: string;
    abbreviation: string;
  };
  text: string;
  awayScore: number;
  homeScore: number;
  period: {
    number: number;
  };
  clock: {
    displayValue: string;
  };
  scoringPlay: boolean;
  priority: boolean;
  participants?: ESPNParticipant[];
  statYardage?: number;
  start?: {
    yardLine: number;
    team: {
      id: string;
    };
  };
  end?: {
    yardLine: number;
    team: {
      id: string;
    };
  };
}

export interface ESPNParticipant {
  athlete: {
    id: string;
    fullName: string;
    displayName: string;
    shortName: string;
    position: {
      abbreviation: string;
    };
    team: {
      id: string;
    };
    headshot: {
      href: string;
    };
  };
}

// Scoring Event Structure for Fantasy Integration
export interface NFLScoringEvent {
  id: string;
  player: {
    id: string;
    name: string;
    position: string;
    team: string;
  };
  team: string;
  eventType: 'rushing_td' | 'passing_td' | 'receiving_td' | 'rushing_yards' | 'passing_yards' | 'receiving_yards' | 'field_goal' | 'safety' | 'fumble' | 'interception';
  description: string;
  timestamp: Date;
  stats: {
    yards?: number;
    touchdowns?: number;
    fieldGoalYards?: number;
    [key: string]: number | undefined;
  };
  gameId: string;
  period: number;
  clock: string;
  scoringPlay: boolean;
}

interface GamePollingState {
  gameId: string;
  lastPlayId: string;
  lastSequence: string;
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

export class NFLDataService {
  private static instance: NFLDataService;
  private pollingInterval: NodeJS.Timeout | null = null;
  private gameStates: Map<string, GamePollingState> = new Map();
  private eventCallbacks: ((event: NFLScoringEvent) => void)[] = [];
  private pollingIntervalMs = 20000; // 20 seconds minimum for deduplication
  private isPolling = false;
  private currentWeek: number | null = null;
  private emergencyStop = false;
  
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
  
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
  private readonly MAX_REQUESTS_PER_MINUTE = 10;

  private constructor() {}

  public static getInstance(): NFLDataService {
    if (!NFLDataService.instance) {
      NFLDataService.instance = new NFLDataService();
    }
    return NFLDataService.instance;
  }

  /**
   * Start polling for active NFL games
   */
  public async startPolling(intervalMs: number = 20000): Promise<void> {
    if (this.isPolling) {
      debugLogger.warning('NFL_DATA', 'Polling already active, skipping start request');
      return;
    }

    if (this.emergencyStop) {
      debugLogger.error('NFL_DATA', 'Cannot start polling - emergency stop is active');
      throw new Error('Emergency stop is active. Use resetEmergencyStop() first.');
    }

    if (this.circuitBreaker.isOpen) {
      const now = new Date();
      if (this.circuitBreaker.nextRetryTime && now < this.circuitBreaker.nextRetryTime) {
        debugLogger.warning('NFL_DATA', 'Cannot start polling - circuit breaker is open', {
          nextRetryTime: this.circuitBreaker.nextRetryTime.toISOString()
        });
        throw new Error('Circuit breaker is open. Please wait before retrying.');
      } else {
        // Reset circuit breaker after timeout
        this.resetCircuitBreaker();
      }
    }

    // Enforce minimum 20 second interval for deduplication
    this.pollingIntervalMs = Math.max(intervalMs, 20000);
    this.isPolling = true;
    
    debugLogger.info('NFL_DATA', 'Starting NFL game polling', { 
      requestedInterval: intervalMs,
      actualInterval: this.pollingIntervalMs 
    });

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
        debugLogger.error('NFL_DATA', 'Error during polling cycle', error);
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
    
    debugLogger.info('NFL_DATA', 'NFL game polling stopped');
  }

  /**
   * Emergency stop - immediately halts all polling and prevents restart
   */
  public emergencyStopPolling(): void {
    this.emergencyStop = true;
    this.stopPolling();
    debugLogger.warning('NFL_DATA', 'EMERGENCY STOP ACTIVATED - All polling halted');
  }

  /**
   * Reset emergency stop to allow polling again
   */
  public resetEmergencyStop(): void {
    this.emergencyStop = false;
    this.resetCircuitBreaker();
    debugLogger.info('NFL_DATA', 'Emergency stop reset - Polling can be restarted');
  }

  /**
   * Fetch current week NFL games from ESPN via edge function
   */
  public async pollActiveGames(): Promise<ESPNGame[]> {
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
      
      const url = this.buildScoreboardUrl();
      debugLogger.api('NFL_DATA', `Fetching scoreboard data via edge function`, { url });
      
      const response = await supabase.functions.invoke('espn-api', {
        body: { 
          endpoint: 'scoreboard',
          week: this.currentWeek 
        }
      });

      if (response.error) {
        throw new Error(`Edge function error: ${response.error.message}`);
      }

      const data = response.data;
      const games = data.events || [];
      
      debugLogger.success('NFL_DATA', `Fetched ${games.length} games from ESPN`, {
        week: data.week?.number,
        season: data.season?.year
      });

      this.recordRequestSuccess();

      // Update current week if available
      if (data.week?.number) {
        this.currentWeek = data.week.number;
      }

      // Process each active game
      const activeGames: ESPNGame[] = [];
      for (const game of games) {
        if (this.isGameActive(game)) {
          activeGames.push(game);
          await this.processGameEvents(game);
        }
      }

      debugLogger.info('NFL_DATA', `Processing ${activeGames.length} active games`);
      return activeGames;

    } catch (error) {
      this.recordRequestFailure();
      this.recordFailure();
      debugLogger.error('NFL_DATA', 'Failed to fetch ESPN scoreboard', error);
      throw error;
    }
  }

  /**
   * Parse play-by-play data from ESPN game data via edge function
   */
  public async parsePlayByPlay(gameId: string): Promise<ESPNPlay[]> {
    if (!this.canMakeRequest()) {
      debugLogger.warning('NFL_DATA', 'Skipping play-by-play fetch due to rate limit');
      return [];
    }

    try {
      this.recordRequestStart();
      debugLogger.api('NFL_DATA', `Fetching play-by-play via edge function for game ${gameId}`);

      const response = await supabase.functions.invoke('espn-api', {
        body: { 
          endpoint: 'game-summary',
          gameId: gameId 
        }
      });
      
      if (response.error) {
        throw new Error(`Edge function error: ${response.error.message}`);
      }

      const gameData = response.data;
      const drives = gameData.drives?.previous || [];
      const plays: ESPNPlay[] = [];

      // Extract plays from all drives
      for (const drive of drives) {
        if (drive.plays) {
          plays.push(...drive.plays);
        }
      }

      // Add current drive plays if available
      if (gameData.drives?.current?.plays) {
        plays.push(...gameData.drives.current.plays);
      }

      this.recordRequestSuccess();
      debugLogger.success('NFL_DATA', `Parsed ${plays.length} plays for game ${gameId}`);
      return plays;

    } catch (error) {
      this.recordRequestFailure();
      debugLogger.error('NFL_DATA', `Failed to parse play-by-play for game ${gameId}`, error);
      return [];
    }
  }

  /**
   * Detect scoring events from ESPN play data
   */
  public detectScoringEvents(plays: ESPNPlay[], gameId: string): NFLScoringEvent[] {
    const events: NFLScoringEvent[] = [];
    const gameState = this.gameStates.get(gameId);

    for (const play of plays) {
      // Skip if we've already processed this play
      if (gameState && play.sequenceNumber <= gameState.lastSequence) {
        continue;
      }

      // Only process scoring plays or significant yardage plays
      if (play.scoringPlay || (play.statYardage && play.statYardage >= 20)) {
        const event = this.createScoringEvent(play, gameId);
        if (event) {
          events.push(event);
        }
      }
    }

    // Update game state with latest processed play
    if (plays.length > 0) {
      const latestPlay = plays[plays.length - 1];
      this.gameStates.set(gameId, {
        gameId,
        lastPlayId: latestPlay.id,
        lastSequence: latestPlay.sequenceNumber,
        isActive: true
      });
    }

    return events;
  }

  /**
   * Register callback for new scoring events
   */
  public onScoringEvent(callback: (event: NFLScoringEvent) => void): () => void {
    this.eventCallbacks.push(callback);
    
    return () => {
      this.eventCallbacks = this.eventCallbacks.filter(cb => cb !== callback);
    };
  }

  /**
   * Get current NFL week
   */
  public getCurrentWeek(): number | null {
    return this.currentWeek;
  }

  /**
   * Check if polling is currently active
   */
  public isCurrentlyPolling(): boolean {
    return this.isPolling;
  }

  /**
   * Get comprehensive polling and circuit breaker statistics
   */
  public getPollingStats(): {
    isActive: boolean;
    gamesTracked: number;
    intervalMs: number;
    currentWeek: number | null;
    emergencyStop: boolean;
    circuitBreaker: CircuitBreakerState;
    requestMetrics: RequestMetrics;
  } {
    return {
      isActive: this.isPolling,
      gamesTracked: this.gameStates.size,
      intervalMs: this.pollingIntervalMs,
      currentWeek: this.currentWeek,
      emergencyStop: this.emergencyStop,
      circuitBreaker: { ...this.circuitBreaker },
      requestMetrics: { ...this.requestMetrics }
    };
  }

  // Private helper methods
  
  private buildScoreboardUrl(): string {
    // Use current week if available, otherwise let edge function determine current week
    if (this.currentWeek) {
      return `espn-api?endpoint=scoreboard&week=${this.currentWeek}`;
    }
    return `espn-api?endpoint=scoreboard`;
  }

  private canMakeRequest(): boolean {
    const now = new Date();
    
    // Reset counter if a minute has passed
    if (now.getTime() - this.requestMetrics.lastMinuteReset.getTime() > 60000) {
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
    // Reset circuit breaker on success
    if (this.circuitBreaker.failureCount > 0) {
      this.circuitBreaker.failureCount = Math.max(0, this.circuitBreaker.failureCount - 1);
    }
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
      
      debugLogger.error('NFL_DATA', 'CIRCUIT BREAKER OPENED - Too many failures', {
        failureCount: this.circuitBreaker.failureCount,
        nextRetryTime: this.circuitBreaker.nextRetryTime.toISOString()
      });
      
      // Stop polling when circuit breaker opens
      this.stopPolling();
    }
  }

  private resetCircuitBreaker(): void {
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.lastFailureTime = null;
    this.circuitBreaker.nextRetryTime = null;
    
    debugLogger.info('NFL_DATA', 'Circuit breaker reset');
  }

  private isGameActive(game: ESPNGame): boolean {
    const status = safeLower(game.status?.type?.state);
    return status === 'in' || status === 'halftime' || status === 'delayed';
  }

  private async processGameEvents(game: ESPNGame): Promise<void> {
    try {
      const plays = await this.parsePlayByPlay(game.id);
      const events = this.detectScoringEvents(plays, game.id);
      
      // Emit events to callbacks
      events.forEach(event => {
        this.eventCallbacks.forEach(callback => {
          try {
            callback(event);
          } catch (error) {
            debugLogger.error('NFL_DATA', 'Error in scoring event callback', error);
          }
        });
      });

      if (events.length > 0) {
        debugLogger.success('NFL_DATA', `Detected ${events.length} new scoring events`, {
          gameId: game.id,
          gameName: game.shortName
        });
      }

    } catch (error) {
      debugLogger.error('NFL_DATA', `Failed to process events for game ${game.id}`, error);
    }
  }

  private createScoringEvent(play: ESPNPlay, gameId: string): NFLScoringEvent | null {
    try {
      // Extract primary participant (usually the player who made the play)
      const participant = play.participants?.[0];
      if (!participant) {
        return null;
      }

      const player = {
        id: participant.athlete.id,
        name: participant.athlete.displayName,
        position: participant.athlete.position.abbreviation,
        team: participant.athlete.team.id
      };

      // Determine event type based on play description and type
      const eventType = this.determineEventType(play);
      if (!eventType) {
        return null;
      }

      // Extract stats from the play
      const stats = this.extractPlayStats(play, eventType);

      const event: NFLScoringEvent = {
        id: `${gameId}-${play.id}`,
        player,
        team: participant.athlete.team.id,
        eventType,
        description: play.text,
        timestamp: new Date(),
        stats,
        gameId,
        period: play.period.number,
        clock: play.clock.displayValue,
        scoringPlay: play.scoringPlay || false
      };

      return event;

    } catch (error) {
      debugLogger.error('NFL_DATA', 'Failed to create scoring event from play', { play, error });
      return null;
    }
  }

  private determineEventType(play: ESPNPlay): NFLScoringEvent['eventType'] | null {
    const playText = play.text.toLowerCase();
    const playType = play.type?.text?.toLowerCase() || '';

    // Touchdown detection
    if (playText.includes('touchdown') || playText.includes(' td ')) {
      if (playText.includes('pass') || playType.includes('pass')) {
        return playText.includes('reception') ? 'receiving_td' : 'passing_td';
      }
      if (playText.includes('rush') || playType.includes('rush')) {
        return 'rushing_td';
      }
      // Default to receiving TD for other touchdown types
      return 'receiving_td';
    }

    // Field goal
    if (playText.includes('field goal') || playType.includes('field goal')) {
      return 'field_goal';
    }

    // Safety
    if (playText.includes('safety')) {
      return 'safety';
    }

    // Interception
    if (playText.includes('interception') || playText.includes('intercepted')) {
      return 'interception';
    }

    // Fumble
    if (playText.includes('fumble')) {
      return 'fumble';
    }

    // Big plays (20+ yards)
    if (play.statYardage && play.statYardage >= 20) {
      if (playText.includes('pass') || playType.includes('pass')) {
        return playText.includes('reception') ? 'receiving_yards' : 'passing_yards';
      }
      if (playText.includes('rush') || playType.includes('rush')) {
        return 'rushing_yards';
      }
    }

    return null;
  }

  private extractPlayStats(play: ESPNPlay, eventType: NFLScoringEvent['eventType']): NFLScoringEvent['stats'] {
    const stats: NFLScoringEvent['stats'] = {};

    // Extract yardage
    if (play.statYardage) {
      stats.yards = play.statYardage;
    }

    // Extract field goal distance
    if (eventType === 'field_goal') {
      const fgMatch = play.text.match(/(\d+)\s*yard/i);
      if (fgMatch) {
        stats.fieldGoalYards = parseInt(fgMatch[1], 10);
      }
    }

    // Mark touchdowns
    if (safeIncludes(eventType, '_td')) {
      stats.touchdowns = 1;
    }

    return stats;
  }
}

// Export singleton instance
export const nflDataService = NFLDataService.getInstance();