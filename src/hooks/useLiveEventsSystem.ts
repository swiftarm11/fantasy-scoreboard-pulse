import { useState, useEffect, useCallback, useRef } from 'react';
import { debugLogger } from '../utils/debugLogger';
import { useESPNData } from './useESPNData';
import { NFLScoringEvent } from '../services/NFLDataService';
import { hybridNFLDataService } from '../services/HybridNFLDataService';
import { eventAttributionService, FantasyEventAttribution } from '../services/EventAttributionService';
import { eventStorageService, ConfigScoringEvent } from '../services/EventStorageService';
import { LeagueConfig } from '../types/config';
import { ScoringEvent, ScoringEventForDisplay, LeagueData } from '../types/fantasy';

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

export const useLiveEventsSystem = ({
  leagues,
  enabled,
  pollingInterval = 30000
}: UseLiveEventsOptions) => {
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
  const eventCallbacks = useRef<(() => void)[]>([]);
  const isInitialized = useRef(false);

  // Initialize ESPN data polling
  const { fetchScoreboard, startPolling: startESPNPolling, stopPolling: stopESPNPolling } = useESPNData();

  // Initialize system
  const initializeSystem = useCallback(async () => {
    if (!enabled || leagues.length === 0 || isInitialized.current) {
      debugLogger.info('LIVE_EVENTS', 'Skipping initialization', {
        enabled,
        leagueCount: leagues.length,
        alreadyInitialized: isInitialized.current
      });
      return;
    }

    try {
      debugLogger.info('LIVE_EVENTS', 'Initializing live events system', {
        leagueCount: leagues.length,
        enabled
      });

      // Load rosters for enabled leagues
      const enabledLeagues = leagues.filter(l => l.enabled);
      if (enabledLeagues.length > 0) {
        await eventAttributionService.loadRosters(enabledLeagues);
      }

      // Set up NFL scoring event callbacks using hybrid service
      const unsubscribeNFL = hybridNFLDataService.onScoringEvent((nflEvent: NFLScoringEvent) => {
        debugLogger.info('LIVE_EVENTS', 'Processing NFL scoring event', {
          player: nflEvent.player.name,
          eventType: nflEvent.eventType
        });

        // Attribute event to fantasy teams
        const attribution = eventAttributionService.attributeEvent(nflEvent);
        if (attribution) {
          // Store events for each affected league
          attribution.fantasyEvents.forEach(impact => {
            const eventToStore: ConfigScoringEvent = {
              id: `${nflEvent.id}-${impact.leagueId}`,
              playerId: impact.player.platformPlayerId,
              playerName: impact.player.name,
              teamAbbr: impact.player.team,
              eventType: impact.eventType,
              description: impact.description,
              fantasyPoints: impact.pointsScored,
              timestamp: attribution.timestamp,
              week: hybridNFLDataService.getServiceStatus().tank01Status?.currentWeek || 1,
              leagueId: impact.leagueId
            };
            
            eventStorageService.addEvent(impact.leagueId, eventToStore);
          });

          // Update state
          setLiveState(prev => ({
            ...prev,
            lastEventTime: new Date().toISOString(),
            eventCount: prev.eventCount + attribution.fantasyEvents.length
          }));

          // Update recent events
          updateRecentEvents();
        }
      });

      eventCallbacks.current.push(unsubscribeNFL);
      isInitialized.current = true;

      // Update state
      const cacheStats = eventAttributionService.getCacheStats();
      setLiveState(prev => ({
        ...prev,
        connectedLeagues: cacheStats.rostersCount,
        nflWeek: hybridNFLDataService.getServiceStatus().tank01Status?.currentWeek || 1
      }));

      debugLogger.success('LIVE_EVENTS', 'Live events system initialized', {
        connectedLeagues: cacheStats.rostersCount
      });

    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to initialize live events system', error);
    }
  }, [enabled, leagues]);

  // Update recent events from storage
  const updateRecentEvents = useCallback(() => {
    const allEvents: ScoringEvent[] = [];
    
    for (const league of leagues.filter(l => l.enabled)) {
      const leagueEvents = eventStorageService.getEvents(league.leagueId);
      const recentLeagueEvents = leagueEvents
        .slice(-5) // Last 5 events per league
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

    // Sort by timestamp and take most recent 10
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setRecentEvents(allEvents.slice(0, 10));
  }, [leagues]);

  // Get live events for a specific league
  const getLiveEventsForLeague = useCallback((league: LeagueData): ScoringEvent[] => {
    const events = eventStorageService.getEvents(league.id);
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

  // Start live polling
  const startSystem = useCallback(async () => {
    if (!isInitialized.current) {
      await initializeSystem();
    }

    try {
      // Start hybrid NFL data polling (Tank01 + ESPN)
      await hybridNFLDataService.startPolling(pollingInterval);
      
      // Start ESPN data polling for scoreboard
      startESPNPolling();

      setLiveState(prev => ({
        ...prev,
        isActive: true,
        isPolling: true
      }));

      debugLogger.success('LIVE_EVENTS', 'Live events system started');
    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to start live events system', error);
    }
  }, [initializeSystem, pollingInterval, startESPNPolling]);

  // Stop live polling
  const stopSystem = useCallback(() => {
    // Stop hybrid NFL data polling
    hybridNFLDataService.stopPolling();
    stopESPNPolling();

    // Cleanup callbacks
    eventCallbacks.current.forEach(cleanup => cleanup());
    eventCallbacks.current = [];

    setLiveState(prev => ({
      ...prev,
      isActive: false,
      isPolling: false
    }));

    debugLogger.info('LIVE_EVENTS', 'Live events system stopped');
  }, [stopESPNPolling]);

  // Trigger a test event for debugging
  const triggerTestEvent = useCallback(() => {
    const testEvent: ConfigScoringEvent = {
      id: `test-${Date.now()}`,
      playerId: 'test-player',
      playerName: 'Test Player',
      teamAbbr: 'TEST',
      eventType: 'rushing_td',
      description: 'Test Player 5 yard touchdown run',
      fantasyPoints: 6,
      timestamp: new Date(),
      week: hybridNFLDataService.getServiceStatus().tank01Status?.currentWeek || 1,
      leagueId: 'test-league'
    };

    eventStorageService.addEvent('test-league', testEvent);
    updateRecentEvents();
    debugLogger.info('LIVE_EVENTS', 'Test event triggered manually');
  }, [updateRecentEvents]);

  // Initialize on mount if enabled - with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (enabled && leagues.length > 0 && !isInitialized.current) {
        initializeSystem();
      }
    }, 1000); // Delay initialization to prevent conflicts

    return () => clearTimeout(timeoutId);
  }, [enabled, leagues.length]); // Only depend on primitive values

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSystem();
    };
  }, [stopSystem]);

  // Get debugging statistics
  const getCacheStats = useCallback(() => {
    return {
      storage: eventStorageService.getCacheStats(),
      attribution: eventAttributionService.getCacheStats(),
      hybridData: hybridNFLDataService.getServiceStatus()
    };
  }, []);

  return {
    liveState,
    recentEvents,
    isSystemReady: isInitialized.current,
    getLiveEventsForLeague,
    startSystem,
    stopSystem,
    triggerTestEvent,
    getCacheStats
  };
};