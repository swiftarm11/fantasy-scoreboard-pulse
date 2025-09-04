import { debugLogger } from '../utils/debugLogger';
import { safeLower, safeIncludes } from '../utils/strings';

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

export class NFLDataService {
  private static instance: NFLDataService;
  private pollingInterval: NodeJS.Timeout | null = null;
  private gameStates: Map<string, GamePollingState> = new Map();
  private eventCallbacks: ((event: NFLScoringEvent) => void)[] = [];
  private pollingIntervalMs = 30000; // 30 seconds default
  private isPolling = false;
  private currentWeek: number | null = null;
  private readonly ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
  private readonly ESPN_GAME_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

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
  public async startPolling(intervalMs: number = 30000): Promise<void> {
    if (this.isPolling) {
      debugLogger.warning('NFL_DATA', 'Polling already active, skipping start request');
      return;
    }

    this.pollingIntervalMs = intervalMs;
    this.isPolling = true;
    
    debugLogger.info('NFL_DATA', 'Starting NFL game polling', { intervalMs });

    // Initial poll
    await this.pollActiveGames();

    // Set up recurring polling
    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollActiveGames();
      } catch (error) {
        debugLogger.error('NFL_DATA', 'Error during polling cycle', error);
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
   * Fetch current week NFL games from ESPN
   */
  public async pollActiveGames(): Promise<ESPNGame[]> {
    try {
      const url = this.buildScoreboardUrl();
      debugLogger.api('NFL_DATA', `Fetching scoreboard data from ESPN`, { url });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; FantasyScoreboard/1.0)'
        }
      });

      if (!response.ok) {
        throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const games = data.events || [];
      
      debugLogger.success('NFL_DATA', `Fetched ${games.length} games from ESPN`, {
        week: data.week?.number,
        season: data.season?.year
      });

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
      debugLogger.error('NFL_DATA', 'Failed to fetch ESPN scoreboard', error);
      throw error;
    }
  }

  /**
   * Parse play-by-play data from ESPN game data
   */
  public async parsePlayByPlay(gameId: string): Promise<ESPNPlay[]> {
    try {
      const url = `${this.ESPN_GAME_URL}?event=${gameId}`;
      debugLogger.api('NFL_DATA', `Fetching play-by-play for game ${gameId}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch game ${gameId}: ${response.status}`);
      }

      const gameData = await response.json();
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

      debugLogger.success('NFL_DATA', `Parsed ${plays.length} plays for game ${gameId}`);
      return plays;

    } catch (error) {
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
   * Get polling statistics
   */
  public getPollingStats(): {
    isActive: boolean;
    gamesTracked: number;
    intervalMs: number;
    currentWeek: number | null;
  } {
    return {
      isActive: this.isPolling,
      gamesTracked: this.gameStates.size,
      intervalMs: this.pollingIntervalMs,
      currentWeek: this.currentWeek
    };
  }

  // Private helper methods
  
  private buildScoreboardUrl(): string {
    // Use current week if available, otherwise let ESPN determine current week
    if (this.currentWeek) {
      return `${this.ESPN_SCOREBOARD_URL}?week=${this.currentWeek}`;
    }
    return this.ESPN_SCOREBOARD_URL;
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