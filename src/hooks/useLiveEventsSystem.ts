import { useState, useEffect, useCallback, useRef } from "react";
import { debugLogger } from "../utils/debugLogger";
import { tank01NFLDataService, NFLScoringEvent } from "../services/Tank01NFLDataService";
import { eventAttributionService } from "../services/EventAttributionService";
import { eventStorageService, ConfigScoringEvent } from "../services/EventStorageService";
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
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize the system
  const initializeSystem = useCallback(async () => {
    if (isInitializing.current || !enabled || leagues.length === 0 || isInitialized.current) {
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

      // ✅ Register callback to save attributed events to storage
      eventAttributionService.onEventAttribution((attribution) => {
        debugLogger.info('LIVEEVENTS', 'Attribution callback: Saving to storage', {
          player: attribution.nflEvent.player.name,
          impacts: attribution.fantasyEvents.length
        });

        // Save each fantasy impact to storage
        for (const impact of attribution.fantasyEvents) {
          // Map NFL event types to ConfigScoringEvent types
          const eventTypeMap: Record<string, ConfigScoringEvent['eventType']> = {
            'passingtd': 'passing_td',
            'passing_td': 'passing_td',
            'rushingtd': 'rushing_td',
            'rushing_td': 'rushing_td',
            'receivingtd': 'receiving_td',
            'receiving_td': 'receiving_td',
            'passingyards': 'passing_yards',
            'rushingyards': 'rushing_yards',
            'receivingyards': 'receiving_yards',
            'reception': 'reception',
            'interception': 'interception',
            'fumble': 'fumble',
            'fumble_lost': 'fumble_lost',
            'field_goal': 'field_goal',
            'safety': 'safety',
            'two_point_conversion': 'two_point_conversion'
          };

          const configEventType = eventTypeMap[impact.eventType.toLowerCase()] || 'rushing_td';

          const storageEvent: ConfigScoringEvent = {
            id: `${attribution.nflEvent.id}-${impact.leagueId}-${impact.teamId}`,
            playerId: attribution.nflEvent.player.id,
            playerName: impact.player.name,
            teamAbbr: attribution.nflEvent.team,
            eventType: configEventType,
            description: impact.description,
            fantasyPoints: impact.pointsScored,
            timestamp: attribution.timestamp,
            week: liveState.nflWeek,
            leagueId: impact.leagueId
          };

          eventStorageService.addEvent(impact.leagueId, storageEvent);
        }

        // Update recent events display
        updateRecentEvents();
      });

      // ✅ Subscribe to Tank01 scoring events
      unsubscribeRef.current = tank01NFLDataService.onScoringEvent((nflEvent: NFLScoringEvent) => {
        debugLogger.info('LIVEEVENTS', 'Received NFL scoring event', {
          player: nflEvent.player.name,
          type: nflEvent.eventType,
          gameId: nflEvent.gameId
        });

        // Try to attribute to leagues
        const attribution = eventAttributionService.attributeEvent(nflEvent);
        
        if (attribution) {
          debugLogger.info('LIVEEVENTS', `Event attributed to ${attribution.fantasyEvents.length} fantasy impacts`);
        }

        // Update state
        setLiveState(prev => ({
          ...prev,
          eventCount: prev.eventCount + (attribution?.fantasyEvents.length || 0),
          lastEventTime: new Date().toISOString()
        }));

        // Update recent events display
        updateRecentEvents();
      });

      const cacheStats = eventAttributionService.getCacheStats();
      isInitialized.current = true;

      setLiveState(prev => ({
        ...prev,
        connectedLeagues: cacheStats.rostersCount
      }));

      debugLogger.success('LIVEEVENTS', 'System initialized successfully', {
        rostersLoaded: cacheStats.rostersCount
      });

    } catch (error) {
      debugLogger.error('LIVEEVENTS', 'Failed to initialize system', error);
      throw error;
    } finally {
      isInitializing.current = false;
    }
  }, [enabled, leagues, liveState.nflWeek]);

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

    // Unsubscribe from events
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

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
        .slice(-10)
        .map(event => ({
          id: event.id,
          playerName: event.playerName,
          position: event.teamAbbr,
          weeklyPoints: event.fantasyPoints,
          action: event.description,
          scoreImpact: event.fantasyPoints,
          timestamp: event.timestamp.toISOString(),
          isRecent: Date.now() - event.timestamp.getTime() < 300000
        }));

      allEvents.push(...recentLeagueEvents);
    }

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
    debugLogger.info('LIVEEVENTS', 'Triggering test event');
    
    // Create a fake test event
    const testEvent: NFLScoringEvent = {
      id: `test-${Date.now()}`,
      player: {
        id: '4696981',
        name: 'Test Player',
        position: 'RB',
        team: 'TEST'
      },
      team: 'TEST',
      eventType: 'rushingtd',
      description: 'Test rushing touchdown',
      timestamp: new Date(),
      stats: { rushingTouchdowns: 1, rushingYards: 5 },
      gameId: 'test-game',
      period: 1,
      clock: '10:00',
      scoringPlay: true
    };

    // Emit it through the system
    if (unsubscribeRef.current) {
      // Event will be processed by our callback
      const attribution = eventAttributionService.attributeEvent(testEvent);
      if (attribution) {
        debugLogger.info('LIVEEVENTS', `Test event generated ${attribution.fantasyEvents.length} impacts`);
      }
      updateRecentEvents();
    }
  }, [updateRecentEvents]);

  // Initialize on mount if enabled (with 1 second delay for safety)
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
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
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
    }, 5000);

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
