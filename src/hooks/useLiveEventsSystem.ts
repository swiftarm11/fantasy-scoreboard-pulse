import { useState, useEffect, useCallback, useRef } from 'react';
import { LeagueData, ScoringEvent } from '../types/fantasy';
import { LeagueConfig } from '../types/config';
import { nflDataService, NFLScoringEvent } from '../services/NFLDataService';
import { eventAttributionService, FantasyEventAttribution } from '../services/EventAttributionService';
import { eventStorageService, StoredEvent } from '../services/EventStorageService';
import { debugLogger } from '../utils/debugLogger';

export interface LiveEventsState {
  isActive: boolean;
  isPolling: boolean;
  connectedLeagues: number;
  lastEventTime: string | null;
  eventCount: number;
  nflWeek: number | null;
  activeGames: number;
}

export interface UseLiveEventsOptions {
  leagues: LeagueConfig[];
  enabled: boolean;
  pollingInterval?: number; // seconds (minimum 20)
}

export const useLiveEventsSystem = ({ 
  leagues, 
  enabled, 
  pollingInterval = 30 
}: UseLiveEventsOptions) => {
  const [liveState, setLiveState] = useState<LiveEventsState>({
    isActive: false,
    isPolling: false,
    connectedLeagues: 0,
    lastEventTime: null,
    eventCount: 0,
    nflWeek: null,
    activeGames: 0
  });

  const [recentEvents, setRecentEvents] = useState<StoredEvent[]>([]);
  const [attributionCallbackCount, setAttributionCallbackCount] = useState(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);

  // Initialize the system
  const initializeSystem = useCallback(async () => {
    if (isInitializedRef.current || !enabled || leagues.length === 0) {
      return;
    }

    debugLogger.info('LIVE_EVENTS', 'Initializing live events system', {
      leagueCount: leagues.length,
      enabledLeagues: leagues.filter(l => l.enabled).length
    });

    try {
      // Load rosters for event attribution
      await eventAttributionService.loadRosters(leagues);
      
      // Get NFL week info
      const nflWeek = await nflDataService.getCurrentWeek();
      
      // Load recent events from storage
      const recent = eventStorageService.getRecentEvents(60); // Last hour
      
      setLiveState(prev => ({
        ...prev,
        isActive: true,
        connectedLeagues: leagues.filter(l => l.enabled).length,
        nflWeek,
        eventCount: recent.length
      }));

      setRecentEvents(recent);
      isInitializedRef.current = true;

      debugLogger.success('LIVE_EVENTS', 'System initialized successfully', {
        nflWeek,
        recentEvents: recent.length,
        connectedLeagues: leagues.filter(l => l.enabled).length
      });

    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to initialize system', error);
      setLiveState(prev => ({ ...prev, isActive: false }));
    }
  }, [leagues, enabled]);

  // Start polling for NFL events
  const startPolling = useCallback(async () => {
    if (!enabled || !liveState.isActive || liveState.isPolling) {
      return;
    }

    debugLogger.info('LIVE_EVENTS', 'Starting NFL event polling', {
      requestedInterval: pollingInterval,
      effectiveInterval: Math.max(pollingInterval, 20)
    });

    setLiveState(prev => ({ ...prev, isPolling: true }));

    try {
      // Start NFL data service polling (enforce 20 second minimum)
      // NFL service handles all API calls internally - no duplicate polling needed
      const effectiveInterval = Math.max(pollingInterval, 20);
      await nflDataService.startPolling(effectiveInterval * 1000);

      // Set up status monitoring only (no additional API calls)
      const monitorStatus = () => {
        try {
          const stats = nflDataService.getPollingStats();
          
          setLiveState(prev => ({
            ...prev,
            activeGames: stats.gamesTracked
          }));

          // Update recent events display
          const recent = eventStorageService.getRecentEvents(60);
          setRecentEvents(recent);

          if (recent.length > 0) {
            setLiveState(prev => ({
              ...prev,
              lastEventTime: recent[0].timestamp,
              eventCount: recent.length
            }));
          }

        } catch (error) {
          debugLogger.error('LIVE_EVENTS', 'Status monitoring error', error);
        }
      };

      // Initial status check
      monitorStatus();

      // Set up status monitoring interval (no API calls, just UI updates)
      pollingIntervalRef.current = setInterval(monitorStatus, 10000); // 10 seconds for UI updates

    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to start NFL polling', error);
      setLiveState(prev => ({ ...prev, isPolling: false }));
    }

  }, [enabled, liveState.isActive, liveState.isPolling, pollingInterval]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Stop NFL data service polling
    nflDataService.stopPolling();

    setLiveState(prev => ({ ...prev, isPolling: false }));
    
    debugLogger.info('LIVE_EVENTS', 'Stopped NFL event polling');
  }, []);

  // Get events for a specific league
  const getLeagueEvents = useCallback((leagueId: string, timeframeMinutes = 60): StoredEvent[] => {
    return eventStorageService.getEventsByLeague(leagueId, timeframeMinutes);
  }, []);

  // Get live events for display in league cards
  const getLiveEventsForLeague = useCallback((league: LeagueData): ScoringEvent[] => {
    const storedEvents = getLeagueEvents(league.id, 30); // Last 30 minutes
    
    // Convert StoredEvent to ScoringEvent format
    return storedEvents.map(event => ({
      id: event.id,
      playerName: event.playerName,
      position: event.position,
      weeklyPoints: event.weeklyPoints,
      action: event.action,
      scoreImpact: event.scoreImpact,
      timestamp: event.timestamp,
      isRecent: event.isRecent
    }));
  }, [getLeagueEvents]);

  // Force refresh rosters
  const refreshRosters = useCallback(async () => {
    debugLogger.info('LIVE_EVENTS', 'Refreshing rosters');
    try {
      await eventAttributionService.refreshRosters(leagues);
      debugLogger.success('LIVE_EVENTS', 'Rosters refreshed');
    } catch (error) {
      debugLogger.error('LIVE_EVENTS', 'Failed to refresh rosters', error);
    }
  }, [leagues]);

  // Manual trigger for testing
  const triggerTestEvent = useCallback(() => {
    const testEvent: ScoringEvent = {
      id: `test-${Date.now()}`,
      playerName: 'Test Player',
      position: 'RB',
      weeklyPoints: 6.0,
      action: 'Manual test event triggered',
      scoreImpact: 6.0,
      timestamp: new Date().toISOString(),
      isRecent: true
    };

    eventStorageService.saveEvent(testEvent, leagues[0]?.leagueId);
    const recent = eventStorageService.getRecentEvents(60);
    setRecentEvents(recent);

    setLiveState(prev => ({
      ...prev,
      lastEventTime: testEvent.timestamp,
      eventCount: recent.length
    }));

    debugLogger.info('LIVE_EVENTS', 'Test event triggered', testEvent);
  }, [leagues]);

  // Set up NFL scoring event callback
  useEffect(() => {
    const unsubscribeNFL = nflDataService.onScoringEvent((nflEvent: NFLScoringEvent) => {
      debugLogger.info('LIVE_EVENTS', 'NFL scoring event detected', {
        player: nflEvent.player.name,
        eventType: nflEvent.eventType,
        description: nflEvent.description
      });

      // Process through attribution service
      const attribution = eventAttributionService.attributeEvent(nflEvent);
      if (attribution) {
        // Convert to fantasy events and store
        const fantasyEvents = eventAttributionService.generateFantasyEvents([attribution]);
        for (const event of fantasyEvents) {
          // Extract league ID from attribution if available
          const leagueId = attribution.fantasyEvents[0]?.leagueId;
          eventStorageService.saveEvent(event, leagueId);
        }

        // Update recent events display
        const recent = eventStorageService.getRecentEvents(60);
        setRecentEvents(recent);
        
        setLiveState(prev => ({
          ...prev,
          lastEventTime: attribution.timestamp.toISOString(),
          eventCount: recent.length
        }));
      }
    });

    return unsubscribeNFL;
  }, []);

  // Set up event attribution callback
  useEffect(() => {
    const unsubscribe = eventAttributionService.onEventAttribution((attribution: FantasyEventAttribution) => {
      debugLogger.info('LIVE_EVENTS', 'New event attribution received', {
        nflPlayer: attribution.nflEvent.player.name,
        fantasyTeamsAffected: attribution.fantasyEvents.length
      });

      setAttributionCallbackCount(prev => prev + 1);

      // Update recent events
      const recent = eventStorageService.getRecentEvents(60);
      setRecentEvents(recent);
      
      setLiveState(prev => ({
        ...prev,
        lastEventTime: attribution.timestamp.toISOString(),
        eventCount: recent.length
      }));
    });

    return unsubscribe;
  }, []);

  // Initialize when conditions are met
  useEffect(() => {
    if (enabled && leagues.length > 0 && !isInitializedRef.current) {
      initializeSystem();
    }
  }, [enabled, leagues.length, initializeSystem]);

  // Start/stop polling based on active state
  useEffect(() => {
    if (liveState.isActive && enabled && !liveState.isPolling) {
      startPolling();
    } else if (!enabled || !liveState.isActive) {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [liveState.isActive, liveState.isPolling, enabled, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      isInitializedRef.current = false;
    };
  }, [stopPolling]);

  // Get cache statistics for debugging
  const getCacheStats = useCallback(() => {
    const attributionStats = eventAttributionService.getCacheStats();
    const storageStats = eventStorageService.getStorageStats();
    
    return {
      attribution: attributionStats,
      storage: storageStats,
      callbacks: attributionCallbackCount
    };
  }, [attributionCallbackCount]);

  return {
    liveState,
    recentEvents,
    isSystemReady: isInitializedRef.current,
    startPolling,
    stopPolling,
    refreshRosters,
    triggerTestEvent,
    getLiveEventsForLeague,
    getLeagueEvents,
    getCacheStats
  };
};