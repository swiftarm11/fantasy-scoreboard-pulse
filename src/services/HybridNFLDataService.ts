import { debugLogger } from '../utils/debugLogger';
import { NFLScoringEvent, NFLDataService } from './NFLDataService';
import { Tank01NFLDataService, tank01NFLDataService } from './Tank01NFLDataService';

/**
 * Hybrid NFL Data Service that combines Tank01 and ESPN data sources
 * Uses Tank01 for accurate player ID mapping and ESPN as fallback/validation
 */
export class HybridNFLDataService {
  private static instance: HybridNFLDataService;
  private nflDataService: NFLDataService;
  private tank01Service: Tank01NFLDataService;
  private eventCallbacks: ((event: NFLScoringEvent) => void)[] = [];
  private isPolling = false;
  private useT01ForPlayerMapping = true; // Always use Tank01 for player mapping
  private useT01ForLiveEvents = true; // Default to Tank01 for live events - more accurate than ESPN
  
  private constructor() {
    this.nflDataService = NFLDataService.getInstance();
    this.tank01Service = tank01NFLDataService;
    
    // Set up event forwarding from both services
    this.setupEventForwarding();

    // 🌐 [HYBRID_NFL] Expose service to window for debugging
    (window as any).hybridNFLDataService = this;
    debugLogger.info('HYBRID_NFL', 'HybridNFLDataService exposed to window for debugging');
  }

  public static getInstance(): HybridNFLDataService {
    if (!HybridNFLDataService.instance) {
      HybridNFLDataService.instance = new HybridNFLDataService();
    }
    return HybridNFLDataService.instance;
  }

  /**
   * Start hybrid polling - Tank01 primary with 90-second intervals for Pro plan quota management
   */
  public async startPolling(intervalMs: number = 90000): Promise<void> {
    if (this.isPolling) {
      debugLogger.warning('HYBRID_NFL', 'Polling already active', {
        currentInterval: intervalMs,
        useT01ForLiveEvents: this.useT01ForLiveEvents
      });
      return;
    }

    this.isPolling = true;
    debugLogger.info('HYBRID_NFL', '🎮 Starting hybrid NFL data polling (Tank01 primary)', {
      tank01PlayerMapping: this.useT01ForPlayerMapping,
      tank01LiveEvents: this.useT01ForLiveEvents,
      interval: intervalMs,
      strategy: 'Tank01 primary with 90s polling (Pro plan quota management), ESPN fallback'
    });

    try {
      // Always start Tank01 - now primary for both player mapping AND live events
      debugLogger.info('HYBRID_NFL', '🏈 Starting Tank01 service for live NFL data');
      await this.tank01Service.startPolling(intervalMs); // 90-second polling for Pro plan

      // Start ESPN as backup with longer interval to reduce API usage
      debugLogger.info('HYBRID_NFL', '📡 Starting ESPN service as backup');
      await this.nflDataService.startPolling(intervalMs + 30000); // 120 second backup polling

      debugLogger.success('HYBRID_NFL', '✅ Hybrid polling started successfully', {
        tank01Interval: intervalMs,
        espnInterval: intervalMs + 15000,
        primarySource: 'Tank01',
        backupSource: 'ESPN'
      });

    } catch (error) {
      this.isPolling = false;
      debugLogger.error('HYBRID_NFL', '❌ Failed to start hybrid polling', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Manual poll trigger for immediate data refresh
   */
  public async manualPoll(): Promise<void> {
    debugLogger.info('HYBRID_NFL', '⚡ Manual poll triggered');
    
    try {
      // Trigger immediate polls from both services
      await Promise.allSettled([
        this.tank01Service.manualPoll?.() || Promise.resolve(),
        this.nflDataService.pollActiveGames?.() || Promise.resolve()
      ]);

      debugLogger.success('HYBRID_NFL', '✅ Manual poll completed');
    } catch (error) {
      debugLogger.error('HYBRID_NFL', '❌ Manual poll failed', error);
      throw error;
    }
  }

  /**
   * Stop all polling
   */
  public stopPolling(): void {
    if (!this.isPolling) return;

    this.tank01Service.stopPolling();
    this.nflDataService.stopPolling();
    this.isPolling = false;
    
    debugLogger.info('HYBRID_NFL', 'Hybrid polling stopped');
  }

  /**
   * Enable Tank01 live events (gradual rollout)
   */
  public enableTank01LiveEvents(): void {
    this.useT01ForLiveEvents = true;
    debugLogger.info('HYBRID_NFL', 'Tank01 live events enabled');
    
    if (this.isPolling) {
      // Restart with new configuration
      this.stopPolling();
      setTimeout(() => this.startPolling(), 1000);
    }
  }

  /**
   * Disable Tank01 live events (rollback to ESPN)
   */
  public disableTank01LiveEvents(): void {
    this.useT01ForLiveEvents = false;
    debugLogger.info('HYBRID_NFL', 'Tank01 live events disabled, using ESPN fallback');
    
    if (this.isPolling) {
      // Restart with ESPN primary
      this.stopPolling();
      setTimeout(() => this.startPolling(), 1000);
    }
  }

  /**
   * Get enhanced player mapping using Tank01 data
   */
  public getPlayerMapping(playerId: string): any {
    if (this.useT01ForPlayerMapping) {
      const tank01Player = this.tank01Service.getPlayerMapping(playerId);
      if (tank01Player) {
        return {
          id: tank01Player.playerID,
          name: tank01Player.longName,
          position: tank01Player.position,
          team: tank01Player.team,
          yahooId: tank01Player.yahooPlayerID,
          sleeperId: tank01Player.sleeperPlayerID,
          source: 'tank01'
        };
      }
    }
    
    // Fallback to existing ESPN-based mapping
    return {
      id: playerId,
      source: 'espn'
    };
  }

  /**
   * Subscribe to scoring events from hybrid sources
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
   * Set up event forwarding from both data sources
   */
  private setupEventForwarding(): void {
    // Forward Tank01 events (when enabled)
    this.tank01Service.onScoringEvent((event) => {
      if (this.useT01ForLiveEvents) {
        this.forwardEvent({ ...event, source: 'tank01' });
      }
    });

    // Forward ESPN events (primary or backup)
    this.nflDataService.onScoringEvent((event) => {
      if (!this.useT01ForLiveEvents) {
        this.forwardEvent({ ...event, source: 'espn' });
      }
    });
  }

  /**
   * Forward events to subscribers with detailed tracking
   */
  private forwardEvent(event: NFLScoringEvent & { source: string }): void {
    debugLogger.info('HYBRID_NFL', '📡 Forwarding NFL scoring event to live events system', {
      eventId: event.id,
      player: event.player.name,
      position: event.player.position,
      team: event.player.team,
      source: event.source,
      eventType: event.eventType,
      gameId: event.gameId,
      timestamp: event.timestamp,
      callbackCount: this.eventCallbacks.length
    });

    if (this.eventCallbacks.length === 0) {
      debugLogger.warning('HYBRID_NFL', '⚠️ No event callbacks registered - event will be lost');
    }

    this.eventCallbacks.forEach((callback, index) => {
      try {
        debugLogger.info('HYBRID_NFL', `🔗 Executing callback ${index + 1}/${this.eventCallbacks.length}`);
        callback(event);
      } catch (error) {
        debugLogger.error('HYBRID_NFL', `❌ Error in hybrid event callback ${index + 1}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          eventId: event.id
        });
      }
    });
  }

  /**
   * Get service status from both sources
   */
  public getServiceStatus() {
    return {
      isPolling: this.isPolling,
      useT01ForPlayerMapping: this.useT01ForPlayerMapping,
      useT01ForLiveEvents: this.useT01ForLiveEvents,
      tank01Status: this.tank01Service.getServiceStatus(),
      espnStatus: {
        // Add ESPN status when available
        isPolling: this.nflDataService['isPolling'] || false
      }
    };
  }

  /**
   * Emergency stop all services
   */
  public emergencyStop(): void {
    this.tank01Service.emergencyStopPolling();
    this.nflDataService.emergencyStopPolling();
    this.isPolling = false;
    debugLogger.warning('HYBRID_NFL', 'Emergency stop activated for all services');
  }

  /**
   * Reset emergency stops
   */
  public resetEmergencyStop(): void {
    this.tank01Service.resetEmergencyStop();
    this.nflDataService.resetEmergencyStop();
    debugLogger.info('HYBRID_NFL', 'Emergency stop reset for all services');
  }
}

// Export singleton instance
export const hybridNFLDataService = HybridNFLDataService.getInstance();