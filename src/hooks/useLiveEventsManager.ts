import { useState, useEffect, useCallback, useRef } from 'react';
import { debugLogger } from '../utils/debugLogger';
import { LeagueConfig } from '../types/config';
import { ScoringEvent, ScoringEventForDisplay, LeagueData } from '../types/fantasy';
import { hybridNFLDataService } from '../services/HybridNFLDataService';
import { eventAttributionService, FantasyEventAttribution } from '../services/EventAttributionService';
import { eventStorageService } from '../services/EventStorageService';
import { NFLScoringEvent } from '../services/NFLDataService';

interface LiveEventsManagerState {
  isActive: boolean;
  isInitialized: boolean;
  connectedLeagues: number;
  totalEvents: number;
  lastEventTime: Date | null;
  nflWeek: number | null;
  pollingStatus: 'stopped' | 'starting' | 'active' | 'error';
  error: string | null;
}

interface UseLiveEventsManagerOptions {
  enabled: boolean;
  leagues: LeagueConfig[];
  pollingInterval?: number;
}

export interface UseLiveEventsManagerReturn {
  state: LiveEventsManagerState;
  recentEvents: ScoringEventForDisplay[];
  isReady: boolean;
  startSystem: () => Promise<void>;
  stopSystem: () => void;
  refreshRosters: () => Promise<void>;
  getLeagueEvents: (leagueId: string) => ScoringEventForDisplay[];
  triggerTestEvent: () => void;
  getCacheStats: () => any;
}

export const useLiveEventsManager = ({
  enabled,
  leagues,
  pollingInterval = 25000
}: UseLiveEventsManagerOptions): UseLiveEventsManagerReturn => {
  const [state, setState] = useState<LiveEventsManagerState>({
    isActive: false,
    isInitialized: false,
    connectedLeagues: 0,
    totalEvents: 0,
    lastEventTime: null,
    nflWeek: null,
    pollingStatus: 'stopped',
    error: null
  });

  const [recentEvents, setRecentEvents] = useState<ScoringEventForDisplay[]>([]);
  const isInitializing = useRef(false);
  const eventCallbackRefs = useRef<(() => void)[]>([]);

  // Initialize the system when enabled
  const initializeSystem = useCallback(async () => {
    if (isInitializing.current || !enabled || leagues.length === 0) {
      return;
    }

    isInitializing.current = true;
    setState(prev => ({ ...prev, pollingStatus: 'starting', error: null }));

    try {
      debugLogger.info('LIVE_EVENTS', 'Initializing live events system', {
        enabledLeagues: leagues.filter(l => l.enabled).length,
        totalLeagues: leagues.length
      });

      // Load rosters for all enabled leagues
      await eventAttributionService.loadRosters(leagues.filter(l => l.enabled));

      // Get initial stats
      const cacheStats = eventAttributionService.getCacheStats();
      
      setState(prev => ({
        ...prev,
        isInitialized: true,
        connectedLeagues: cacheStats.rostersCount,
        pollingStatus: 'stopped'
      }));

      debugLogger.success('LIVE_EVENTS', 'System initialized successfully', {
        rostersLoaded: cacheStats.rostersCount,
        playersCount: cacheStats.playersCount
      });

    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to initialize system', error);
      setState(prev => ({
        ...prev,
        pollingStatus: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    } finally {
      isInitializing.current = false;
    }
  }, [enabled, leagues]);

  // Start the live events system
  const startSystem = useCallback(async () => {
    if (!state.isInitialized || state.isActive) {
      return;
    }

    try {
      setState(prev => ({ ...prev, pollingStatus: 'starting' }));

      // Set up hybrid NFL event callbacks (Tank01 + ESPN)
      const unsubscribeNFL = hybridNFLDataService.onScoringEvent((event: NFLScoringEvent) => {
        debugLogger.info('LIVE_EVENTS', 'Received NFL scoring event from hybrid service', {
          player: event.player.name,
          eventType: event.eventType,
          gameId: event.gameId,
          source: (event as any).source || 'unknown'
        });

        // Attribute event to fantasy teams using our scoring calculator
        const attribution = eventAttributionService.attributeEvent(event);
        if (attribution) {
          // Store events for each affected league
          for (const impact of attribution.fantasyEvents) {
            eventStorageService.addEvent(impact.leagueId, {
              id: `${event.id}-${impact.leagueId}`,
              playerId: impact.player.platformPlayerId,
              playerName: impact.player.name,
              teamAbbr: impact.player.team,
              eventType: impact.eventType,
              description: impact.description,
              fantasyPoints: impact.pointsScored,
              timestamp: attribution.timestamp,
              week: 1, // Will be properly calculated from current date
              leagueId: impact.leagueId
            });
          }

          // Update recent events display
          updateRecentEvents();
        }
      });

      eventCallbackRefs.current.push(unsubscribeNFL);

      // Set up attribution callbacks for UI updates
      const unsubscribeAttribution = eventAttributionService.onEventAttribution((attribution: FantasyEventAttribution) => {
        setState(prev => ({
          ...prev,
          totalEvents: prev.totalEvents + attribution.fantasyEvents.length,
          lastEventTime: attribution.timestamp
        }));
      });

      eventCallbackRefs.current.push(unsubscribeAttribution);

      // Start hybrid NFL data polling (Tank01 + ESPN)
      await hybridNFLDataService.startPolling(pollingInterval);

      setState(prev => ({
        ...prev,
        isActive: true,
        pollingStatus: 'active',
        nflWeek: new Date().getMonth() < 8 ? new Date().getFullYear() - 1 : new Date().getFullYear() // Rough NFL week calculation
      }));

      debugLogger.success('LIVE_EVENTS', 'Live events system started successfully');

    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to start live events system', error);
      setState(prev => ({
        ...prev,
        pollingStatus: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, [state.isInitialized, state.isActive, pollingInterval]);

  // Stop the live events system
  const stopSystem = useCallback(() => {
    if (!state.isActive) {
      return;
    }

    // Cleanup hybrid NFL polling
    hybridNFLDataService.stopPolling();

    // Cleanup event callbacks
    eventCallbackRefs.current.forEach(cleanup => cleanup());
    eventCallbackRefs.current = [];

    setState(prev => ({
      ...prev,
      isActive: false,
      pollingStatus: 'stopped'
    }));

    debugLogger.info('LIVE_EVENTS', 'Live events system stopped');
  }, [state.isActive]);

  // Update recent events from storage
  const updateRecentEvents = useCallback(() => {
    const allEvents: ScoringEventForDisplay[] = [];
    
    for (const league of leagues.filter(l => l.enabled)) {
      const leagueEvents = eventStorageService.getEvents(league.leagueId);
      const recentLeagueEvents = leagueEvents
        .slice(-10) // Last 10 events per league
        .map(event => ({
          id: event.id,
          playerName: event.playerName,
          position: event.teamAbbr, // Temporary mapping
          weeklyPoints: event.fantasyPoints,
          action: event.description,
          scoreImpact: event.fantasyPoints,
          timestamp: event.timestamp.toISOString(),
          isRecent: Date.now() - event.timestamp.getTime() < 300000 // 5 minutes
        }));
      
      allEvents.push(...recentLeagueEvents);
    }

    // Sort by timestamp and take most recent 20
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRecentEvents(allEvents.slice(0, 20));
  }, [leagues]);

  // Get events for a specific league
  const getLeagueEvents = useCallback((leagueId: string): ScoringEventForDisplay[] => {
    const events = eventStorageService.getEvents(leagueId);
    return events.map(event => ({
      id: event.id,
      playerName: event.playerName,
      position: event.teamAbbr,
      weeklyPoints: event.fantasyPoints,
      action: event.description,
      scoreImpact: event.fantasyPoints,
      timestamp: event.timestamp.toISOString(),
      isRecent: Date.now() - event.timestamp.getTime() < 300000
    }));
  }, []);

  // Refresh rosters manually
  const refreshRosters = useCallback(async () => {
    if (!enabled || leagues.length === 0) {
      return;
    }

    try {
      await eventAttributionService.refreshRosters(leagues.filter(l => l.enabled));
      const cacheStats = eventAttributionService.getCacheStats();
      
      setState(prev => ({
        ...prev,
        connectedLeagues: cacheStats.rostersCount
      }));

      debugLogger.success('LIVE_EVENTS', 'Rosters refreshed successfully');
    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to refresh rosters', error);
    }
  }, [enabled, leagues]);

  // Trigger test event for debugging
  const triggerTestEvent = useCallback(() => {
    const testEvent: NFLScoringEvent = {
      id: `test-${Date.now()}`,
      player: {
        id: 'test-player',
        name: 'Test Player',
        position: 'RB',
        team: 'TEST'
      },
      team: 'TEST',
      eventType: 'rushing_td',
      description: 'Test Player 5 yard touchdown run',
      timestamp: new Date(),
      stats: { yards: 5, touchdowns: 1 },
      gameId: 'test-game',
      period: 1,
      clock: '10:00',
      scoringPlay: true
    };

    // Manually trigger the event callback to test the flow
    const attribution = eventAttributionService.attributeEvent(testEvent);
    debugLogger.info('LIVE_EVENTS', 'Test event triggered', { attribution });
  }, []);

  // Get cache statistics
  const getCacheStats = useCallback(() => {
    return {
      attribution: eventAttributionService.getCacheStats(),
      storage: eventStorageService.getCacheStats(),
      hybrid: hybridNFLDataService.getServiceStatus()
    };
  }, []);

  // Initialize when conditions are met
  useEffect(() => {
    if (enabled && leagues.length > 0 && !state.isInitialized && !isInitializing.current) {
      initializeSystem();
    }
  }, [enabled, leagues, state.isInitialized, initializeSystem]);

  // Cleanup on unmount or when disabled
  useEffect(() => {
    return () => {
      stopSystem();
    };
  }, [stopSystem]);

  // Update recent events periodically
  useEffect(() => {
    if (state.isActive) {
      const interval = setInterval(updateRecentEvents, 5000); // Update every 5 seconds
      return () => clearInterval(interval);
    }
  }, [state.isActive, updateRecentEvents]);

  const isReady = state.isInitialized && state.connectedLeagues > 0;

  return {
    state,
    recentEvents,
    isReady,
    startSystem,
    stopSystem,
    refreshRosters,
    getLeagueEvents,
    triggerTestEvent,
    getCacheStats
  };
};