import { useState, useEffect, useCallback } from 'react';
import { useYahooData } from './useYahooData';
import { useSleeperData } from './useSleeperData';
import { useLiveEventsManager } from './useLiveEventsManager';
import { LeagueData } from '../types/fantasy';
import { LeagueConfig } from '../types/config';
import { debugLogger } from '../utils/debugLogger';

interface UseFantasyDashboardReturn {
  leagues: LeagueData[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  liveEventsState: any;
  isLiveSystemReady: boolean;
  startLiveEvents: () => Promise<void>;
  stopLiveEvents: () => void;
  refreshData: () => Promise<void>;
  refreshRosters: () => Promise<void>;
}

export const useFantasyDashboardWithLiveEvents = (): UseFantasyDashboardReturn => {
  const [combinedLeagues, setCombinedLeagues] = useState<LeagueData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Yahoo data hook
  const {
    leagues: yahooLeagues,
    isLoading: yahooLoading,
    error: yahooError,
    savedSelections: yahooSelections,
    refreshData: refreshYahooData
  } = useYahooData();

  // Sleeper data hook - using minimal interface
  const sleeperDataHook = useSleeperData([]);
  const sleeperLeagues = sleeperDataHook.leagues || [];
  const sleeperLoading = false; // Sleeper hook doesn't expose loading state
  const sleeperError = sleeperDataHook.error || null;
  const refreshSleeperData = sleeperDataHook.refetch || (() => Promise.resolve());

  // Get all enabled league configurations
  const allLeagueConfigs: LeagueConfig[] = [
    ...yahooSelections.filter(config => config.enabled),
    // Add Sleeper configs when available
  ];

  // Live events system
  const {
    state: liveEventsState,
    recentEvents,
    isReady: isLiveSystemReady,
    startSystem: startLiveEvents,
    stopSystem: stopLiveEvents,
    refreshRosters,
    getLeagueEvents
  } = useLiveEventsManager({
    enabled: allLeagueConfigs.length > 0,
    leagues: allLeagueConfigs,
    pollingInterval: 25000 // 25 seconds
  });

  // Combine leagues with live events
  const enrichLeaguesWithLiveEvents = useCallback((leagues: LeagueData[]): LeagueData[] => {
    return leagues.map(league => {
      // Get live scoring events for this league
      const liveEvents = getLeagueEvents(league.id);
      
      // Merge with existing scoring events, prioritizing live events
      const allEvents = [...liveEvents, ...league.scoringEvents];
      
      // Remove duplicates and sort by timestamp
      const uniqueEvents = allEvents.filter((event, index, arr) => 
        arr.findIndex(e => e.id === event.id) === index
      ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Calculate additional points from live events
      const livePoints = liveEvents.reduce((total, event) => total + event.scoreImpact, 0);

      return {
        ...league,
        myScore: league.myScore + livePoints,
        scoringEvents: uniqueEvents.slice(0, 10), // Keep most recent 10 events
        lastUpdated: liveEvents.length > 0 ? new Date().toISOString() : league.lastUpdated
      };
    });
  }, [getLeagueEvents]);

  // Combine and enrich data
  useEffect(() => {
    try {
      // Combine static data from both platforms
      const allStaticLeagues = [...yahooLeagues, ...sleeperLeagues];
      
      // Enrich with live events if system is ready
      const enrichedLeagues = isLiveSystemReady 
        ? enrichLeaguesWithLiveEvents(allStaticLeagues)
        : allStaticLeagues;

      setCombinedLeagues(enrichedLeagues);
      
      // Update loading state
      const stillLoading = yahooLoading || sleeperLoading;
      setIsLoading(stillLoading);

      // Combine errors
      const combinedError = yahooError || sleeperError;
      setError(combinedError);

      // Update timestamp
      if (!stillLoading && enrichedLeagues.length > 0) {
        setLastUpdated(new Date().toISOString());
      }

      debugLogger.info('DASHBOARD', 'Leagues updated', {
        total: enrichedLeagues.length,
        yahoo: yahooLeagues.length,
        sleeper: sleeperLeagues.length,
        withLiveEvents: isLiveSystemReady,
        liveSystemState: liveEventsState.pollingStatus
      });

    } catch (error) {
      debugLogger.error('DASHBOARD', 'Failed to combine league data', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [
    yahooLeagues, 
    sleeperLeagues, 
    yahooLoading, 
    sleeperLoading, 
    yahooError, 
    sleeperError,
    isLiveSystemReady,
    liveEventsState.pollingStatus,
    enrichLeaguesWithLiveEvents
  ]);

  // Start live events when leagues are available
  useEffect(() => {
    if (allLeagueConfigs.length > 0 && isLiveSystemReady && !liveEventsState.isActive) {
      debugLogger.info('DASHBOARD', 'Auto-starting live events system');
      startLiveEvents().catch(error => {
        debugLogger.error('DASHBOARD', 'Failed to auto-start live events', error);
      });
    }
  }, [allLeagueConfigs.length, isLiveSystemReady, liveEventsState.isActive, startLiveEvents]);

  // Refresh all data
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Refresh both platform data
      await Promise.allSettled([
        refreshYahooData(),
        refreshSleeperData()
      ]);

      debugLogger.info('DASHBOARD', 'All data refreshed successfully');
    } catch (error) {
      debugLogger.error('DASHBOARD', 'Error refreshing data', error);
      setError(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, [refreshYahooData, refreshSleeperData]);

  return {
    leagues: combinedLeagues,
    isLoading,
    error,
    lastUpdated,
    liveEventsState,
    isLiveSystemReady,
    startLiveEvents,
    stopLiveEvents,
    refreshData,
    refreshRosters
  };
};