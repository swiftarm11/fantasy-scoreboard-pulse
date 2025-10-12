import { useState, useEffect, useCallback, useRef } from "react";
import { debugLogger } from "../utils/debugLogger";
import { tank01NFLDataService } from "../services/Tank01NFLDataService";
import { eventAttributionService } from "../services/EventAttributionService";
import { eventStorageService } from "../services/EventStorageService";
import { LeagueConfig } from "../types/config";
import { ScoringEvent } from "../types/fantasy";

export interface LiveEventsState {
  isActive: boolean;
  isPolling: boolean;
  connectedLeagues: number;
  eventCount: number;
  lastEventTime: string | null;
  nflWeek: number;
  activeGames: number;
}

interface UseLiveEventsOptions {
  leagues: LeagueConfig[];
  enabled: boolean;
  pollingInterval?: number;
}

export const useLiveEventsSystem = ({ leagues, enabled, pollingInterval = 300000 }: UseLiveEventsOptions) => {
  const [liveState, setLiveState] = useState<LiveEventsState>({
    isActive: false,
    isPolling: false,
    connectedLeagues: 0,
    eventCount: 0,
    lastEventTime: null,
    nflWeek: 1,
    activeGames: 0
  });

  const [recentEvents, setRecentEvents] = useState<ScoringEvent[]>([]);
  const isInitialized = useRef(false);
  const isInitializing = useRef(false);

  // Initialize the system
  const initializeSystem = useCallback(async () => {
    if (isInitializing.current || !enabled || leagues.length === 0 || isInitialized.current) {
      debugLogger.info('LIVEEVENTS', 'Skipping initialization', {
        isInitializing: isInitializing.current,
        enabled,
        leagueCount: leagues.length,
        alreadyInitialized: isInitialized.current
      });
      return;
    }

    isInitializing.current = true;

    try {
      debugLogger.info('LIVEEVENTS', 'Initializing live events system', {
        leagueCount: leagues.length,
        enabled
      });

      // Load rosters for enabled leagues
      const enabledLeagues = leagues.filter(l => l.enabled);
      if (enabledLeagues.length > 0) {
        await eventAttributionService.loadRosters(enabledLeagues);
      }

      // REMOVED: Event callback registration
      // The Tank01 service doesn't emit events via callbacks anymore
      // Events are polled and stored directly

      // Get cache stats
      const cacheStats = eventAttributionService.getCacheStats();

      isInitialized.current = true;

      setLiveState(prev => ({
        ...prev,
        connectedLeagues: cacheStats.rostersCount
      }));

      debugLogger.success('LIVEEVENTS', 'System initialized successfully', {
        rostersLoaded: cacheStats.rostersCount,
        playersCount: cacheStats.playersCount
      });

    } catch (error) {
      debugLogger.error('LIVEEVENTS', 'Failed to initialize system', error);
      throw error;
    } finally {
      isInitializing.current = false;
    }
  }, [enabled, leagues]);

  // Start the live events system
  const startSystem = useCallback(async () => {
    if (!isInitialized.current) {
      await initializeSystem();
    }

    if (liveState.isActive) {
      debugLogger.warning('LIVEEVENTS', 'System already active');
      return;
    }

    try {
      debugLogger.info('LIVEEVENTS', 'Starting Tank01 polling', { pollingInterval });

      // Start Tank01 NFL data polling
      await tank01NFLDataService.startPolling(pollingInterval);

      setLiveState(prev => ({
        ...prev,
        isActive: true,
        isPolling: true
      }));

      debugLogger.success('LIVEEVENTS', 'Live events system started');

    } catch (error) {
      debugLogger.error('LIVEEVENTS', 'Failed to start live events system', error);
      throw error;
    }
  }, [initializeSystem, pollingInterval, liveState.isActive]);

  // Stop the live events system
  const stopSystem = useCallback(() => {
    if (!liveState.isActive) {
      return;
    }

    // Stop Tank01 polling
    tank01NFLDataService.stopPolling();

    setLiveState(prev => ({
      ...prev,
      isActive: false,
      isPolling: false
    }));

    debugLogger.info('LIVEEVENTS', 'Live events system stopped');
  }, [liveState.isActive]);

  // Update recent events from storage
  const updateRecentEvents = useCallback(() => {
    const allEvents: ScoringEvent[] = [];

    for (const league of leagues.filter(l => l.enabled)) {
      const leagueEvents = eventStorageService.getEvents(league.leagueId);
      const recentLeagueEvents = leagueEvents
        .slice(-10) // Last 10 events per league
        .map(event => ({
          id: event.id,
          playerName: event.playerName,
          position: event.teamAbbr,
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
  const getLeagueEvents = useCallback((leagueId: string): ScoringEvent[] => {
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

      setLiveState(prev => ({
        ...prev,
        connectedLeagues: cacheStats.rostersCount
      }));

      debugLogger.success('LIVEEVENTS', 'Rosters refreshed successfully');
    } catch (error) {
      debugLogger.error('LIVEEVENTS', 'Failed to refresh rosters', error);
    }
  }, [enabled, leagues]);

  // Trigger test event for debugging
  const triggerTestEvent = useCallback(() => {
    debugLogger.info('LIVEEVENTS', 'Test event triggered (manual mode - no automatic event emission)');
    
    // Manual test event flow (for future implementation)
    updateRecentEvents();
  }, [updateRecentEvents]);

  // Initialize on mount if enabled
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (enabled && leagues.length > 0 && !isInitialized.current) {
        initializeSystem();
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [enabled, leagues.length, initializeSystem]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSystem();
    };
  }, [stopSystem]);

  // Periodically update Tank01 stats
  useEffect(() => {
    if (!liveState.isActive) return;

    const interval = setInterval(() => {
      const status = tank01NFLDataService.getServiceStatus();
      setLiveState(prev => ({
        ...prev,
        isPolling: status.isPolling,
        activeGames: status.activeGames
      }));
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [liveState.isActive]);

  // Get debugging statistics
  const getCacheStats = useCallback(() => {
    return {
      storage: eventStorageService.getCacheStats(),
      attribution: eventAttributionService.getCacheStats(),
      tank01Data: tank01NFLDataService.getServiceStatus()
    };
  }, []);

  const getState = useCallback(() => liveState, [liveState]);
  const getRecentEvents = useCallback(() => recentEvents, [recentEvents]);

  return {
    liveState,
    recentEvents,
    isSystemReady: isInitialized.current,
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
