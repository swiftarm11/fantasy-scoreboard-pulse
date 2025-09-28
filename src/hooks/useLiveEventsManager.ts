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
  getState: () => LiveEventsManagerState;
  getRecentEvents: () => ScoringEventForDisplay[];
}

export const useLiveEventsManager = ({
  enabled,
  leagues,
  pollingInterval = 30000 // Default to 30 seconds for live games
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

  // Expose this hook's state and methods for easy debugging
  const getState = useCallback(() => state, [state]);
  const getRecentEvents = useCallback(() => recentEvents, [recentEvents]);

  // 🔍 [LIVE_EVENTS] Expose services to window for debugging (later in useEffect)

  // Initialize the system when enabled
  const initializeSystem = useCallback(async () => {
    if (isInitializing.current || !enabled || leagues.length === 0) {
      debugLogger.info('LIVE_EVENTS', 'Skipping initialization', {
        isInitializing: isInitializing.current,
        enabled,
        leaguesCount: leagues.length,
        reason: !enabled ? 'disabled' : leagues.length === 0 ? 'no leagues' : 'already initializing'
      });
      return;
    }

    isInitializing.current = true;
    setState(prev => ({ ...prev, pollingStatus: 'starting', error: null }));

    try {
      debugLogger.info('LIVE_EVENTS', '🚀 Step 1: Starting live events system initialization', {
        enabledLeagues: leagues.filter(l => l.enabled).length,
        totalLeagues: leagues.length,
        timestamp: new Date().toISOString()
      });

      // Step 1: Load rosters for all enabled leagues
      debugLogger.info('LIVE_EVENTS', '📋 Step 2: Loading rosters for enabled leagues');
      await eventAttributionService.loadRosters(leagues.filter(l => l.enabled));

      // Step 2: Get initial stats and verify system readiness
      debugLogger.info('LIVE_EVENTS', '📊 Step 3: Verifying system readiness');
      const cacheStats = eventAttributionService.getCacheStats();
      
      debugLogger.info('LIVE_EVENTS', '🔍 Step 4: Cache statistics retrieved', {
        rostersCount: cacheStats.rostersCount,
        playersCount: cacheStats.playersCount,
        cacheDetails: cacheStats
      });

      setState(prev => ({
        ...prev,
        isInitialized: true,
        connectedLeagues: cacheStats.rostersCount,
        pollingStatus: 'stopped'
      }));

      debugLogger.success('LIVE_EVENTS', '✅ System initialized successfully - ready for live events', {
        rostersLoaded: cacheStats.rostersCount,
        playersCount: cacheStats.playersCount,
        nextStep: 'System ready for startSystem() call'
      });

    } catch (error) {
      debugLogger.error('LIVE_EVENTS', '❌ Failed to initialize system', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        step: 'initialization'
      });
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
      debugLogger.warning('LIVE_EVENTS', 'Cannot start system - prerequisites not met', {
        isInitialized: state.isInitialized,
        isActive: state.isActive,
        reason: !state.isInitialized ? 'not initialized' : 'already active'
      });
      return;
    }

    try {
      debugLogger.info('LIVE_EVENTS', '🚀 Step 1: Starting live events polling system', {
        pollingInterval,
        leagues: leagues.length,
        timestamp: new Date().toISOString()
      });

      setState(prev => ({ ...prev, pollingStatus: 'starting' }));

      // Step 1: Set up hybrid NFL event callbacks (Tank01 primary + ESPN fallback)
      debugLogger.info('LIVE_EVENTS', '🔗 Step 2: Setting up NFL scoring event callbacks');
      const unsubscribeNFL = hybridNFLDataService.onScoringEvent((event: NFLScoringEvent) => {
        debugLogger.info('LIVE_EVENTS', '🏈 Received NFL scoring event from hybrid service', {
          player: event.player.name,
          eventType: event.eventType,
          gameId: event.gameId,
          source: (event as any).source || 'unknown',
          timestamp: event.timestamp
        });

        // Step 2: Attribute event to fantasy teams using our scoring calculator
        debugLogger.info('LIVE_EVENTS', '🎯 Attempting event attribution');
        const attribution = eventAttributionService.attributeEvent(event);
        
        if (attribution) {
          debugLogger.success('LIVE_EVENTS', '✅ Event attribution successful', {
            fantasyEventsCount: attribution.fantasyEvents.length,
            affectedLeagues: attribution.fantasyEvents.map(fe => fe.leagueId)
          });

          // Step 3: Store events for each affected league
          for (const impact of attribution.fantasyEvents) {
            debugLogger.info('LIVE_EVENTS', '💾 Storing fantasy event', {
              leagueId: impact.leagueId,
              player: impact.player.name,
              points: impact.pointsScored,
              eventType: impact.eventType
            });

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

          // Step 4: Update recent events display
          updateRecentEvents();
        } else {
          debugLogger.warning('LIVE_EVENTS', '⚠️ No fantasy attribution for NFL event', {
            player: event.player.name,
            eventType: event.eventType,
            reason: 'Player not found in any roster or no leagues configured'
          });
        }
      });

      eventCallbackRefs.current.push(unsubscribeNFL);

      // Step 2: Set up attribution callbacks for UI updates
      debugLogger.info('LIVE_EVENTS', '📈 Step 3: Setting up attribution event callbacks');
      const unsubscribeAttribution = eventAttributionService.onEventAttribution((attribution: FantasyEventAttribution) => {
        debugLogger.info('LIVE_EVENTS', '📊 Attribution event received for UI update', {
          fantasyEventsCount: attribution.fantasyEvents.length,
          timestamp: attribution.timestamp
        });

        setState(prev => ({
          ...prev,
          totalEvents: prev.totalEvents + attribution.fantasyEvents.length,
          lastEventTime: attribution.timestamp
        }));
      });

      eventCallbackRefs.current.push(unsubscribeAttribution);

      // Step 3: Start hybrid NFL data polling (Tank01 primary + ESPN fallback)
      debugLogger.info('LIVE_EVENTS', '🎮 Step 4: Starting hybrid NFL data polling (Tank01 + ESPN)', {
        pollingInterval,
        primarySource: 'Tank01',
        fallbackSource: 'ESPN'
      });
      
      await hybridNFLDataService.startPolling(pollingInterval);

      setState(prev => ({
        ...prev,
        isActive: true,
        pollingStatus: 'active',
        nflWeek: new Date().getMonth() < 8 ? new Date().getFullYear() - 1 : new Date().getFullYear() // Rough NFL week calculation
      }));

      debugLogger.success('LIVE_EVENTS', '🎉 Live events system started successfully - now monitoring NFL games', {
        pollingInterval,
        connectedLeagues: state.connectedLeagues,
        status: 'ACTIVE'
      });

    } catch (error) {
      debugLogger.error('LIVE_EVENTS', '❌ Failed to start live events system', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      setState(prev => ({
        ...prev,
        pollingStatus: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
    }
  }, [state.isInitialized, state.isActive, pollingInterval, leagues]);

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

  // 🔍 [LIVE_EVENTS] Expose services to window for debugging
  useEffect(() => {
    (window as any).liveEventsManager = {
      getState,
      getRecentEvents,
      startSystem,
      stopSystem,
      refreshRosters,
      getLeagueEvents,
      triggerTestEvent,
      getCacheStats,
      state,
      recentEvents,
      isReady
    };

    debugLogger.info('LIVE_EVENTS', 'Live Events Manager exposed to window for debugging', {
      enabled,
      leagues: leagues.length,
      initialized: state.isInitialized,
      active: state.isActive
    });

    return () => {
      delete (window as any).liveEventsManager;
    };
  }, [state, recentEvents, getState, getRecentEvents, startSystem, stopSystem, refreshRosters, getLeagueEvents, triggerTestEvent, getCacheStats, isReady]);

  return {
    state,
    recentEvents,
    isReady,
    startSystem,
    stopSystem,
    refreshRosters,
    getLeagueEvents,
    triggerTestEvent,
    getCacheStats,
    getState,
    getRecentEvents
  };
};