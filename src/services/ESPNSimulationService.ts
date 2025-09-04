import { debugLogger } from '../utils/debugLogger';
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
    const template = this.selectPlayTemplate();
    const yards = template.yardsRange ? 
      Math.floor(Math.random() * (template.yardsRange[1] - template.yardsRange[0] + 1)) + template.yardsRange[0] : 
      undefined;

    const participant: ESPNParticipant = {
      athlete: {
        id: player.id,
        fullName: player.name,
        displayName: player.name,
        shortName: player.name.split(' ').map(n => n[0]).join('. ') + player.name.split(' ').pop(),
        position: {
          abbreviation: player.position
        },
        team: {
          id: player.team
        },
        headshot: {
          href: `https://a.espncdn.com/i/headshots/nfl/players/full/${player.id}.png`
        }
      }
    };

    const isScoring = template.eventType.includes('td') || template.eventType === 'field_goal';
    const period = Math.floor(Math.random() * 4) + 1;
    const clock = this.generateClock();

    const play: ESPNPlay = {
      id: playId,
      sequenceNumber: String(parseInt(playId.split('-').pop() || '0') + Math.floor(Math.random() * 1000)),
      type: {
        id: String(Math.floor(Math.random() * 100)),
        text: template.playTypes[Math.floor(Math.random() * template.playTypes.length)],
        abbreviation: template.playTypes[0].substring(0, 3).toUpperCase()
      },
      text: template.description(player, yards),
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
        team: { id: player.team }
      } : undefined,
      end: yards ? {
        yardLine: Math.floor(Math.random() * 50) + 1,
        team: { id: player.team }
      } : undefined
    };

    return play;
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
        const gameId = `sim-game-${Math.floor(Date.now() / 1000000)}`;
        const playId = `sim-play-${eventCount}-${Date.now()}`;

        // Generate ESPN formatted play
        const espnPlay = this.generateESPNPlay(player, gameId, playId);

        // Convert to NFL scoring event
        const nflEvent: NFLScoringEvent = {
          id: `sim-${gameId}-${playId}`,
          player: {
            id: player.id,
            name: player.name,
            position: player.position,
            team: player.team
          },
          team: player.team,
          eventType: this.selectPlayTemplate().eventType,
          description: espnPlay.text,
          timestamp: new Date(),
          stats: this.generateEventStats(espnPlay),
          gameId,
          period: espnPlay.period.number,
          clock: espnPlay.clock.displayValue,
          scoringPlay: espnPlay.scoringPlay
        };

        // Process through attribution service (this will trigger the normal flow)
        const attribution = eventAttributionService.attributeEvent(nflEvent);
        
        if (attribution) {
          // Generate fantasy events and store them
          const fantasyEvents = eventAttributionService.generateFantasyEvents([attribution]);
          
          for (const event of fantasyEvents) {
            for (const leagueId of player.leagueIds) {
              eventStorageService.saveEvent(event, leagueId);
            }
          }

          debugLogger.info('ESPN_SIMULATION', `Generated event ${eventCount + 1}/${totalEvents}`, {
            player: player.name,
            eventType: nflEvent.eventType,
            description: nflEvent.description,
            affectedLeagues: player.leagueIds.length
          });
        }

        eventCount++;

        // Schedule next event
        if (eventCount < totalEvents && this.isSimulating) {
          this.simulationTimeout = setTimeout(generateEvent, intervalMs + Math.random() * 2000 - 1000); // Add some jitter
        } else {
          this.isSimulating = false;
        }

      } catch (error) {
        debugLogger.error('ESPN_SIMULATION', `Error generating event ${eventCount}`, error);
        eventCount++;
        
        // Continue with next event
        if (eventCount < totalEvents && this.isSimulating) {
          this.simulationTimeout = setTimeout(generateEvent, intervalMs);
        }
      }
    };

    // Start generating events
    generateEvent();
  }

  private selectPlayTemplate(): PlayTemplate {
    const totalWeight = this.playTemplates.reduce((sum, t) => sum + t.weight, 0);
    const random = Math.random() * totalWeight;
    
    let weightSum = 0;
    for (const template of this.playTemplates) {
      weightSum += template.weight;
      if (random <= weightSum) {
        return template;
      }
    }
    
    return this.playTemplates[0]; // Fallback
  }

  private selectWeightedPlayer(players: SimulationPlayer[]): SimulationPlayer {
    // Prefer players that are in multiple leagues (more impact)
    const weightedPlayers = players.map(p => ({
      player: p,
      weight: p.leagueIds.length * 2 + (p.position === 'QB' || p.position === 'RB' ? 2 : 1)
    }));

    const totalWeight = weightedPlayers.reduce((sum, wp) => sum + wp.weight, 0);
    const random = Math.random() * totalWeight;
    
    let weightSum = 0;
    for (const wp of weightedPlayers) {
      weightSum += wp.weight;
      if (random <= weightSum) {
        return wp.player;
      }
    }
    
    return players[0]; // Fallback
  }

  private generateClock(): string {
    const minutes = Math.floor(Math.random() * 15);
    const seconds = Math.floor(Math.random() * 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  private generateEventStats(play: ESPNPlay): { [key: string]: number | undefined } {
    const stats: { [key: string]: number | undefined } = {};
    
    if (play.statYardage) {
      if (play.type.text.toLowerCase().includes('rush')) {
        stats.rushingYards = play.statYardage;
        if (play.scoringPlay) stats.rushingTouchdowns = 1;
      } else if (play.type.text.toLowerCase().includes('pass')) {
        stats.passingYards = play.statYardage;
        if (play.scoringPlay) {
          stats.passingTouchdowns = 1;
          stats.receivingYards = play.statYardage;
          stats.receivingTouchdowns = 1;
        }
      }
    }

    if (play.type.text.toLowerCase().includes('field goal')) {
      stats.fieldGoalYards = play.statYardage;
      stats.fieldGoals = 1;
    }

    return stats;
  }
}

// Export singleton instance
export const espnSimulationService = ESPNSimulationService.getInstance();