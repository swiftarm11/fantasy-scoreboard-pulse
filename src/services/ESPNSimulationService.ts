import { debugLogger } from '../utils/debugLogger';
import { safeLower, safeIncludes } from '../utils/strings';
import { ESPNPlay, ESPNParticipant, NFLScoringEvent } from './NFLDataService';
import { eventAttributionService } from './EventAttributionService';
import { eventStorageService } from './EventStorageService';
import { LeagueConfig } from '../types/config';

interface SimulationPlayer {
  id: string;
  name: string;
  position: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';
  team: string;
  leagueIds: string[];
}

interface PlayTemplate {
  eventType: NFLScoringEvent['eventType'];
  playTypes: string[];
  pointsRange: [number, number];
  yardsRange?: [number, number];
  description: (player: SimulationPlayer, yards?: number) => string;
  weight: number; // Probability weight
}

export class ESPNSimulationService {
  private static instance: ESPNSimulationService;
  private isSimulating = false;
  private simulationTimeout: NodeJS.Timeout | null = null;
  
  // Safety utility methods
  // Remove this method - using shared safeLower from utils/strings

  private safeGetProperty(obj: any, path: string, defaultValue: any = undefined): any {
    try {
      if (!obj || typeof obj !== 'object') return defaultValue;
      
      const keys = path.split('.');
      let current = obj;
      
      for (const key of keys) {
        if (current === null || current === undefined || !(key in current)) {
          return defaultValue;
        }
        current = current[key];
      }
      
      return current !== undefined ? current : defaultValue;
    } catch (error) {
      debugLogger.error('ESPN_SIMULATION', 'safeGetProperty failed', { path, error });
      return defaultValue;
    }
  }

  private validatePlayer(player: any): player is SimulationPlayer {
    try {
      return player && 
             typeof player.id === 'string' && 
             typeof player.name === 'string' && 
             typeof player.position === 'string' && 
             typeof player.team === 'string' && 
             Array.isArray(player.leagueIds);
    } catch (error) {
      debugLogger.error('ESPN_SIMULATION', 'validatePlayer failed', { player, error });
      return false;
    }
  }

  private validateTemplate(template: any): template is PlayTemplate {
    try {
      return template && 
             typeof template.eventType === 'string' && 
             Array.isArray(template.playTypes) && 
             Array.isArray(template.pointsRange) && 
             typeof template.description === 'function' && 
             typeof template.weight === 'number';
    } catch (error) {
      debugLogger.error('ESPN_SIMULATION', 'validateTemplate failed', { template, error });
      return false;
    }
  }
  
  // Play templates based on real NFL scoring events
  private readonly playTemplates: PlayTemplate[] = [
    // Rushing TDs
    {
      eventType: 'rushing_td',
      playTypes: ['Rush', 'Rushing Touchdown'],
      pointsRange: [6, 6.1],
      yardsRange: [1, 25],
      description: (player, yards) => `${player.name} rushes for ${yards} yards for a touchdown.`,
      weight: 15
    },
    // Passing TDs
    {
      eventType: 'passing_td',
      playTypes: ['Pass', 'Passing Touchdown'],
      pointsRange: [4, 6.5],
      yardsRange: [1, 80],
      description: (player, yards) => `${player.name} throws a ${yards}-yard touchdown pass.`,
      weight: 20
    },
    // Receiving TDs  
    {
      eventType: 'receiving_td',
      playTypes: ['Pass', 'Receiving Touchdown'],
      pointsRange: [6, 6.5],
      yardsRange: [1, 75],
      description: (player, yards) => `${player.name} catches a ${yards}-yard touchdown pass.`,
      weight: 18
    },
    // Long rushing gains
    {
      eventType: 'rushing_yards',
      playTypes: ['Rush'],
      pointsRange: [2, 8],
      yardsRange: [20, 85],
      description: (player, yards) => `${player.name} rushes for ${yards} yards.`,
      weight: 10
    },
    // Long passing gains
    {
      eventType: 'passing_yards',
      playTypes: ['Pass'],
      pointsRange: [3, 12],
      yardsRange: [25, 95],
      description: (player, yards) => `${player.name} completes a ${yards}-yard pass.`,
      weight: 12
    },
    // Long receiving gains
    {
      eventType: 'receiving_yards',
      playTypes: ['Pass'],
      pointsRange: [2, 10],
      yardsRange: [20, 85],
      description: (player, yards) => `${player.name} catches a ${yards}-yard pass.`,
      weight: 12
    },
    // Field goals
    {
      eventType: 'field_goal',
      playTypes: ['Field Goal'],
      pointsRange: [3, 5],
      yardsRange: [25, 55],
      description: (player, yards) => `${player.name} makes a ${yards}-yard field goal.`,
      weight: 8
    },
    // Turnovers (negative events)
    {
      eventType: 'interception',
      playTypes: ['Interception'],
      pointsRange: [-2, -1.5],
      description: (player) => `${player.name} throws an interception.`,
      weight: 3
    },
    {
      eventType: 'fumble',
      playTypes: ['Fumble'],
      pointsRange: [-2, -1.5],
      description: (player) => `${player.name} fumbles the ball.`,
      weight: 2
    }
  ];

  private constructor() {}

  public static getInstance(): ESPNSimulationService {
    if (!ESPNSimulationService.instance) {
      ESPNSimulationService.instance = new ESPNSimulationService();
    }
    return ESPNSimulationService.instance;
  }

  /**
   * Start ESPN play-by-play simulation
   */
  public async startSimulation(
    leagues: LeagueConfig[],
    eventCount: number = 100,
    durationMinutes: number = 20
  ): Promise<void> {
    if (this.isSimulating) {
      throw new Error('Simulation already running');
    }

    debugLogger.info('ESPN_SIMULATION', 'Starting ESPN play-by-play simulation', {
      leagues: leagues.length,
      eventCount,
      durationMinutes
    });

    this.isSimulating = true;

    try {
      // Load rosters to get realistic players
      await eventAttributionService.loadRosters(leagues);
      
      // Get roster players that we can simulate events for
      const simulationPlayers = this.extractRosterPlayers(leagues);
      
      if (simulationPlayers.length === 0) {
        throw new Error('No roster players found for simulation');
      }

      debugLogger.success('ESPN_SIMULATION', `Found ${simulationPlayers.length} roster players for simulation`);

      // Generate and schedule events
      await this.scheduleSimulationEvents(simulationPlayers, eventCount, durationMinutes);

    } catch (error) {
      this.isSimulating = false;
      debugLogger.error('ESPN_SIMULATION', 'Failed to start simulation', error);
      throw error;
    }
  }

  /**
   * Stop running simulation
   */
  public stopSimulation(): void {
    if (this.simulationTimeout) {
      clearTimeout(this.simulationTimeout);
      this.simulationTimeout = null;
    }
    
    this.isSimulating = false;
    debugLogger.info('ESPN_SIMULATION', 'ESPN simulation stopped');
  }

  /**
   * Check if simulation is currently running
   */
  public isRunning(): boolean {
    return this.isSimulating;
  }

  /**
   * Generate single realistic ESPN play
   */
  public generateESPNPlay(player: SimulationPlayer, gameId: string, playId: string): ESPNPlay {
    try {
      // Validate inputs
      if (!this.validatePlayer(player)) {
        debugLogger.error('ESPN_SIMULATION', 'Invalid player provided to generateESPNPlay', { player });
        throw new Error('Invalid player object provided');
      }

      if (!gameId || !playId) {
        debugLogger.error('ESPN_SIMULATION', 'Missing required IDs for play generation', { gameId, playId });
        throw new Error('gameId and playId are required');
      }

      const template = this.selectPlayTemplate();
      if (!template) {
        debugLogger.error('ESPN_SIMULATION', 'Failed to select play template');
        throw new Error('Unable to select play template');
      }

      const yards = template.yardsRange ? 
        Math.floor(Math.random() * (template.yardsRange[1] - template.yardsRange[0] + 1)) + template.yardsRange[0] : 
        undefined;

      // Safe string operations for player name
      const playerName = String(player.name || 'Unknown Player');
      const nameParts = playerName.split(' ').filter(part => part.length > 0);
      const shortName = nameParts.length > 1 ? 
        `${nameParts[0].charAt(0)}. ${nameParts[nameParts.length - 1]}` : 
        playerName;

      const participant: ESPNParticipant = {
        athlete: {
          id: String(player.id || 'unknown'),
          fullName: playerName,
          displayName: playerName,
          shortName: shortName,
          position: {
            abbreviation: String(player.position || 'UNKNOWN')
          },
          team: {
            id: String(player.team || 'UNKNOWN')
          },
          headshot: {
            href: `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id || 'default'}.png`
          }
        }
      };

      const isScoring = safeIncludes(template.eventType, 'td') || 
        template.eventType === 'field_goal';
      const period = Math.floor(Math.random() * 4) + 1;
      const clock = this.generateClock();

      // Safe play type selection
      const playTypes = Array.isArray(template.playTypes) ? template.playTypes : ['Unknown'];
      const selectedPlayType = playTypes[Math.floor(Math.random() * playTypes.length)] || 'Unknown';

      let playDescription: string;
      try {
        playDescription = template.description(player, yards);
      } catch (error) {
        debugLogger.error('ESPN_SIMULATION', 'Error generating play description', { error, player, yards });
        playDescription = `${playerName} makes a play.`;
      }

      const play: ESPNPlay = {
        id: String(playId),
        sequenceNumber: String(parseInt(String(playId).split('-').pop() || '0') + Math.floor(Math.random() * 1000)),
        type: {
          id: String(Math.floor(Math.random() * 100)),
          text: selectedPlayType,
          abbreviation: safeLower(selectedPlayType).substring(0, 3).toUpperCase()
        },
        text: playDescription,
        awayScore: Math.floor(Math.random() * 35),
        homeScore: Math.floor(Math.random() * 35),
        period: {
          number: period
        },
        clock: {
          displayValue: clock
        },
        scoringPlay: isScoring,
        priority: isScoring,
        participants: [participant],
        statYardage: yards,
        start: yards ? {
          yardLine: Math.floor(Math.random() * 50) + 1,
          team: { id: String(player.team || 'UNKNOWN') }
        } : undefined,
        end: yards ? {
          yardLine: Math.floor(Math.random() * 50) + 1,
          team: { id: String(player.team || 'UNKNOWN') }
        } : undefined
      };

      return play;

    } catch (error) {
      debugLogger.error('ESPN_SIMULATION', 'Critical error in generateESPNPlay', { error, player, gameId, playId });
      
      // Return a minimal safe play object
      return {
        id: String(playId || 'error-play'),
        sequenceNumber: '0',
        type: {
          id: '0',
          text: 'Error Play',
          abbreviation: 'ERR'
        },
        text: 'Error generating play',
        awayScore: 0,
        homeScore: 0,
        period: { number: 1 },
        clock: { displayValue: '00:00' },
        scoringPlay: false,
        priority: false,
        participants: [],
        statYardage: undefined
      };
    }
  }

  // Private helper methods

  private extractRosterPlayers(leagues: LeagueConfig[]): SimulationPlayer[] {
    const players: SimulationPlayer[] = [];
    
    // For now, use mock roster data since we need to implement roster cache access
    // This would normally come from eventAttributionService.getRosterCache()
    const mockRosterPlayers = this.generateMockRosterPlayers(leagues);
    
    debugLogger.info('ESPN_SIMULATION', 'Using mock roster data for simulation', {
      totalPlayers: mockRosterPlayers.length,
      leagueCount: leagues.length
    });
    
    return mockRosterPlayers;
  }

  private generateMockRosterPlayers(leagues: LeagueConfig[]): SimulationPlayer[] {
    const players: SimulationPlayer[] = [];
    const mockPlayers = [
      { name: 'Josh Allen', position: 'QB' as const, team: 'BUF' },
      { name: 'Lamar Jackson', position: 'QB' as const, team: 'BAL' },
      { name: 'Christian McCaffrey', position: 'RB' as const, team: 'SF' },
      { name: 'Derrick Henry', position: 'RB' as const, team: 'BAL' },
      { name: 'Austin Ekeler', position: 'RB' as const, team: 'LAC' },
      { name: 'Justin Jefferson', position: 'WR' as const, team: 'MIN' },
      { name: 'Stefon Diggs', position: 'WR' as const, team: 'HOU' },
      { name: 'Tyreek Hill', position: 'WR' as const, team: 'MIA' },
      { name: 'Travis Kelce', position: 'TE' as const, team: 'KC' },
      { name: 'Mark Andrews', position: 'TE' as const, team: 'BAL' },
      { name: 'Justin Tucker', position: 'K' as const, team: 'BAL' },
      { name: 'San Francisco DST', position: 'DST' as const, team: 'SF' },
      { name: 'Dallas DST', position: 'DST' as const, team: 'DAL' },
      { name: 'Ja\'Marr Chase', position: 'WR' as const, team: 'CIN' },
      { name: 'Cooper Kupp', position: 'WR' as const, team: 'LAR' },
      { name: 'Davante Adams', position: 'WR' as const, team: 'LV' },
      { name: 'Saquon Barkley', position: 'RB' as const, team: 'PHI' },
      { name: 'Jonathan Taylor', position: 'RB' as const, team: 'IND' },
      { name: 'Patrick Mahomes', position: 'QB' as const, team: 'KC' },
      { name: 'Aaron Rodgers', position: 'QB' as const, team: 'NYJ' }
    ];

    // Distribute players across leagues, ensuring each league has representation
    const enabledLeagues = leagues.filter(l => l.enabled);
    
    mockPlayers.forEach((player, index) => {
      // Each player appears in 1-3 leagues (simulate cross-league ownership)
      const leagueCount = Math.min(Math.floor(Math.random() * 3) + 1, enabledLeagues.length);
      const playerLeagues: string[] = [];
      
      // Always include at least one league, distribute across all leagues
      for (let i = 0; i < leagueCount; i++) {
        const leagueIndex = (index + i) % enabledLeagues.length;
        const league = enabledLeagues[leagueIndex];
        if (league && !playerLeagues.includes(league.leagueId)) {
          playerLeagues.push(league.leagueId);
        }
      }

      players.push({
        id: `mock-player-${index}`,
        name: player.name,
        position: player.position,
        team: player.team,
        leagueIds: playerLeagues
      });
    });

    // Ensure every league has at least 5 players
    enabledLeagues.forEach(league => {
      const playersInLeague = players.filter(p => p.leagueIds.includes(league.leagueId));
      if (playersInLeague.length < 5) {
        // Add more players to this league
        const additionalNeeded = 5 - playersInLeague.length;
        for (let i = 0; i < additionalNeeded; i++) {
          const basePlayer = mockPlayers[i % mockPlayers.length];
          players.push({
            id: `mock-extra-${league.leagueId}-${i}`,
            name: `${basePlayer.name} (${league.leagueId})`,
            position: basePlayer.position,
            team: basePlayer.team,
            leagueIds: [league.leagueId]
          });
        }
      }
    });

    debugLogger.info('ESPN_SIMULATION', 'Generated mock roster distribution', {
      totalPlayers: players.length,
      leaguesRepresented: enabledLeagues.length,
      playersByPosition: {
        QB: players.filter(p => p.position === 'QB').length,
        RB: players.filter(p => p.position === 'RB').length,
        WR: players.filter(p => p.position === 'WR').length,
        TE: players.filter(p => p.position === 'TE').length,
        K: players.filter(p => p.position === 'K').length,
        DST: players.filter(p => p.position === 'DST').length
      }
    });

    return players;
  }

  private async scheduleSimulationEvents(
    players: SimulationPlayer[],
    totalEvents: number,
    durationMinutes: number
  ): Promise<void> {
    try {
      // Validate inputs
      if (!Array.isArray(players) || players.length === 0) {
        throw new Error('No valid players provided for simulation');
      }

      if (totalEvents <= 0 || durationMinutes <= 0) {
        throw new Error('Invalid simulation parameters: events and duration must be positive');
      }

      const intervalMs = (durationMinutes * 60 * 1000) / totalEvents; // Spread events evenly
      let eventCount = 0;

      const generateEvent = () => {
        if (!this.isSimulating || eventCount >= totalEvents) {
          this.isSimulating = false;
          debugLogger.success('ESPN_SIMULATION', `Completed simulation with ${eventCount} events`);
          return;
        }

        try {
          // Select random player, prefer players in multiple leagues
          const player = this.selectWeightedPlayer(players);
          
          if (!this.validatePlayer(player)) {
            debugLogger.error('ESPN_SIMULATION', 'Invalid player selected during event generation', { player });
            eventCount++;
            this.scheduleNextEvent(eventCount, totalEvents, intervalMs, generateEvent);
            return;
          }

          const gameId = `sim-game-${Math.floor(Date.now() / 1000000)}`;
          const playId = `sim-play-${eventCount}-${Date.now()}`;

          // Generate ESPN formatted play
          const espnPlay = this.generateESPNPlay(player, gameId, playId);

          if (!espnPlay || !espnPlay.text) {
            debugLogger.error('ESPN_SIMULATION', 'Failed to generate valid ESPN play', { player, gameId, playId });
            eventCount++;
            this.scheduleNextEvent(eventCount, totalEvents, intervalMs, generateEvent);
            return;
          }

          // Get template for consistent event type
          let selectedTemplate: PlayTemplate;
          try {
            selectedTemplate = this.selectPlayTemplate();
          } catch (error) {
            debugLogger.error('ESPN_SIMULATION', 'Failed to select template for NFL event', error);
            eventCount++;
            this.scheduleNextEvent(eventCount, totalEvents, intervalMs, generateEvent);
            return;
          }

          // Convert to NFL scoring event
          const nflEvent: NFLScoringEvent = {
            id: `sim-${gameId}-${playId}`,
            player: {
              id: String(player.id || 'unknown'),
              name: String(player.name || 'Unknown Player'),
              position: player.position || 'UNKNOWN',
              team: String(player.team || 'UNKNOWN')
            },
            team: String(player.team || 'UNKNOWN'),
            eventType: selectedTemplate.eventType,
            description: String(espnPlay.text || 'Simulated play'),
            timestamp: new Date(),
            stats: this.generateEventStats(espnPlay),
            gameId: String(gameId),
            period: espnPlay.period?.number || 1,
            clock: espnPlay.clock?.displayValue || '00:00',
            scoringPlay: Boolean(espnPlay.scoringPlay)
          };

          // Process through attribution service (this will trigger the normal flow)
          let attribution;
          try {
            attribution = eventAttributionService.attributeEvent(nflEvent);
          } catch (error) {
            debugLogger.error('ESPN_SIMULATION', 'Failed to attribute event', { error, nflEvent });
            eventCount++;
            this.scheduleNextEvent(eventCount, totalEvents, intervalMs, generateEvent);
            return;
          }
          
          if (attribution) {
            try {
              // Generate fantasy events and store them
              const fantasyEvents = eventAttributionService.generateFantasyEvents([attribution]);
              
              if (Array.isArray(fantasyEvents) && fantasyEvents.length > 0) {
                for (const event of fantasyEvents) {
                  if (Array.isArray(player.leagueIds)) {
                    for (const leagueId of player.leagueIds) {
                      if (leagueId && typeof leagueId === 'string') {
                        try {
                          eventStorageService.addEvent(leagueId, {
                            id: event.id,
                            playerId: 'simulation-player',
                            playerName: event.playerName,
                            teamAbbr: 'SIM',
                            eventType: 'rushing_td',
                            description: event.action,
                            fantasyPoints: event.scoreImpact,
                            timestamp: new Date(event.timestamp),
                            week: 1,
                            leagueId
                          });
                        } catch (storageError) {
                          debugLogger.error('ESPN_SIMULATION', 'Failed to save event to storage', { storageError, event, leagueId });
                        }
                      }
                    }
                  }
                }

                debugLogger.info('ESPN_SIMULATION', `Generated event ${eventCount + 1}/${totalEvents}`, {
                  player: player.name || 'Unknown',
                  eventType: nflEvent.eventType,
                  description: nflEvent.description,
                  affectedLeagues: Array.isArray(player.leagueIds) ? player.leagueIds.length : 0
                });
              }
            } catch (error) {
              debugLogger.error('ESPN_SIMULATION', 'Error processing fantasy events', { error, attribution });
            }
          }

          eventCount++;
          this.scheduleNextEvent(eventCount, totalEvents, intervalMs, generateEvent);

        } catch (error) {
          debugLogger.error('ESPN_SIMULATION', `Error generating event ${eventCount}`, error);
          eventCount++;
          this.scheduleNextEvent(eventCount, totalEvents, intervalMs, generateEvent);
        }
      };

      // Start generating events
      generateEvent();

    } catch (error) {
      this.isSimulating = false;
      debugLogger.error('ESPN_SIMULATION', 'Critical error in scheduleSimulationEvents', error);
      throw error;
    }
  }

  private scheduleNextEvent(
    eventCount: number, 
    totalEvents: number, 
    intervalMs: number, 
    generateEvent: () => void
  ): void {
    try {
      if (eventCount < totalEvents && this.isSimulating) {
        const jitter = Math.random() * 2000 - 1000; // Add some jitter (-1s to +1s)
        const nextInterval = Math.max(100, intervalMs + jitter); // Minimum 100ms interval
        this.simulationTimeout = setTimeout(generateEvent, nextInterval);
      } else {
        this.isSimulating = false;
        debugLogger.info('ESPN_SIMULATION', 'Simulation completed or stopped', { 
          finalEventCount: eventCount, 
          targetEvents: totalEvents 
        });
      }
    } catch (error) {
      debugLogger.error('ESPN_SIMULATION', 'Error scheduling next event', error);
      this.isSimulating = false;
    }
  }

  private selectPlayTemplate(): PlayTemplate {
    try {
      if (!Array.isArray(this.playTemplates) || this.playTemplates.length === 0) {
        debugLogger.error('ESPN_SIMULATION', 'Play templates array is invalid or empty');
        throw new Error('No play templates available');
      }

      // Validate all templates before selection
      const validTemplates = this.playTemplates.filter(template => this.validateTemplate(template));
      
      if (validTemplates.length === 0) {
        debugLogger.error('ESPN_SIMULATION', 'No valid play templates found');
        throw new Error('All play templates are invalid');
      }

      const totalWeight = validTemplates.reduce((sum, t) => sum + (t.weight || 0), 0);
      
      if (totalWeight <= 0) {
        debugLogger.error('ESPN_SIMULATION', 'Total weight is zero or negative', { totalWeight });
        return validTemplates[0]; // Return first valid template as fallback
      }

      const random = Math.random() * totalWeight;
      let weightSum = 0;
      
      for (const template of validTemplates) {
        weightSum += (template.weight || 0);
        if (random <= weightSum) {
          return template;
        }
      }
      
      // Fallback to first valid template
      return validTemplates[0];

    } catch (error) {
      debugLogger.error('ESPN_SIMULATION', 'Error in selectPlayTemplate', error);
      
      // Ultimate fallback - create a minimal safe template
      return {
        eventType: 'rushing_yards',
        playTypes: ['Rush'],
        pointsRange: [1, 2],
        yardsRange: [1, 10],
        description: (player) => `${player?.name || 'Player'} makes a play.`,
        weight: 1
      };
    }
  }

  private selectWeightedPlayer(players: SimulationPlayer[]): SimulationPlayer {
    try {
      if (!Array.isArray(players) || players.length === 0) {
        debugLogger.error('ESPN_SIMULATION', 'Players array is invalid or empty');
        throw new Error('No players available for selection');
      }

      // Validate and filter players
      const validPlayers = players.filter(player => this.validatePlayer(player));
      
      if (validPlayers.length === 0) {
        debugLogger.error('ESPN_SIMULATION', 'No valid players found');
        throw new Error('All players are invalid');
      }

      // Create weighted players with safe property access
      const weightedPlayers = validPlayers.map(p => {
        try {
          const leagueCount = Array.isArray(p.leagueIds) ? p.leagueIds.length : 0;
          const positionBonus = (p.position === 'QB' || p.position === 'RB') ? 2 : 1;
          const weight = Math.max(1, leagueCount * 2 + positionBonus); // Ensure minimum weight of 1
          
          return {
            player: p,
            weight: weight
          };
        } catch (error) {
          debugLogger.error('ESPN_SIMULATION', 'Error calculating player weight', { player: p, error });
          return {
            player: p,
            weight: 1 // Fallback weight
          };
        }
      });

      const totalWeight = weightedPlayers.reduce((sum, wp) => sum + (wp.weight || 0), 0);
      
      if (totalWeight <= 0) {
        debugLogger.error('ESPN_SIMULATION', 'Total player weight is zero or negative');
        return validPlayers[0]; // Return first valid player
      }

      const random = Math.random() * totalWeight;
      let weightSum = 0;
      
      for (const wp of weightedPlayers) {
        weightSum += (wp.weight || 0);
        if (random <= weightSum && wp.player) {
          return wp.player;
        }
      }
      
      // Fallback to first valid player
      return validPlayers[0];

    } catch (error) {
      debugLogger.error('ESPN_SIMULATION', 'Critical error in selectWeightedPlayer', error);
      
      // Create emergency fallback player if all else fails
      return {
        id: 'emergency-player',
        name: 'Emergency Player',
        position: 'QB',
        team: 'NFL',
        leagueIds: ['emergency-league']
      };
    }
  }

  private generateClock(): string {
    const minutes = Math.floor(Math.random() * 15);
    const seconds = Math.floor(Math.random() * 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private generateEventStats(play: ESPNPlay): { [key: string]: number | undefined } {
    const stats: { [key: string]: number | undefined } = {};
    
    // Add null checks for play.type.text
    const playTypeText = safeLower(play.type?.text);
    
    if (play.statYardage) {
      if (safeIncludes(playTypeText, 'rush')) {
        stats.rushingYards = play.statYardage;
        if (play.scoringPlay) stats.rushingTouchdowns = 1;
      } else if (safeIncludes(playTypeText, 'pass')) {
        stats.passingYards = play.statYardage;
        if (play.scoringPlay) {
          stats.passingTouchdowns = 1;
          stats.receivingYards = play.statYardage;
          stats.receivingTouchdowns = 1;
        }
      }
    }

    if (safeIncludes(playTypeText, 'field goal')) {
      stats.fieldGoalYards = play.statYardage;
      stats.fieldGoals = 1;
    }

    return stats;
  }
}

// Export singleton instance
export const espnSimulationService = ESPNSimulationService.getInstance();