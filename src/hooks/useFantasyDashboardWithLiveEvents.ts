import { useState, useEffect, useCallback } from "react";
import { useYahooData } from "./useYahooData";
import { useSleeperData } from "./useSleeperData";
import { useLiveEventsSystem } from "./useLiveEventsSystem";
import { useConfig } from "./useConfig";
import { useWindowServiceExposure } from "./useWindowServiceExposure";
import { LeagueData } from "../types/fantasy";
import { LeagueConfig } from "../types/config";
import { debugLogger } from "../utils/debugLogger";
import { FEATURE_FLAGS } from "../config/features";

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
  // 🚨 KILL SWITCH - Completely disable live events
  if (FEATURE_FLAGS.LIVE_EVENTS_DISABLED) {
    debugLogger.warning('DASHBOARD', '🚨 LIVE EVENTS DISABLED BY FEATURE FLAG 🚨');
    
    const { config } = useConfig();
    const { leagues: yahooLeagues, isLoading: yahooLoading, error: yahooError, refreshData: refreshYahooData } = useYahooData();
    const sleeperConfigs = config.leagues.filter(league => 
      (league.platform === 'sleeper' || league.platform === 'Sleeper') && league.enabled
    );
    const { leagues: sleeperLeagues, loading: sleeperLoading, error: sleeperError, refetch: refreshSleeperData } = useSleeperData(sleeperConfigs);
    
    const allStaticLeagues = [...yahooLeagues, ...sleeperLeagues];
    const stillLoading = yahooLoading || sleeperLoading;
    const combinedError = yahooError || sleeperError;
    
    return {
      leagues: allStaticLeagues,
      isLoading: stillLoading,
      error: combinedError,
      lastUpdated: stillLoading ? null : new Date().toISOString(),
      liveEventsState: {
        isActive: false,
        isPolling: false,
        connectedLeagues: 0,
        eventCount: 0,
        lastEventTime: null,
        nflWeek: 1,
        activeGames: 0
      },
      isLiveSystemReady: false,
      startLiveEvents: async () => {
        debugLogger.warning('DASHBOARD', 'Live events disabled - start call ignored');
      },
      stopLiveEvents: () => {
        debugLogger.warning('DASHBOARD', 'Live events disabled - stop call ignored');
      },
      refreshData: async () => {
        await Promise.allSettled([refreshYahooData(), refreshSleeperData()]);
      },
      refreshRosters: async () => {
        debugLogger.warning('DASHBOARD', 'Live events disabled - roster refresh ignored');
      }
    };
  }

  // ✅ NORMAL OPERATION (when kill switch is disabled)
  const [combinedLeagues, setCombinedLeagues] = useState<LeagueData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const { config } = useConfig();
  useWindowServiceExposure();

  const { leagues: yahooLeagues, isLoading: yahooLoading, error: yahooError, savedSelections: yahooSelections, refreshData: refreshYahooData } = useYahooData();

  const sleeperConfigs = config.leagues.filter(league => 
    (league.platform === 'sleeper' || league.platform === 'Sleeper') && league.enabled
  );

  const { leagues: sleeperLeagues, loading: sleeperLoading, error: sleeperError, refetch: refreshSleeperData } = useSleeperData(sleeperConfigs);

  const allLeagueConfigs: LeagueConfig[] = [
    ...yahooSelections.filter(config => config.enabled),
    ...sleeperConfigs
  ];

  const {
    liveState: liveEventsState,
    recentEvents,
    isSystemReady: isLiveSystemReady,
    startSystem: startLiveEvents,
    stopSystem: stopLiveEvents,
    refreshRosters,
    getLeagueEvents
  } = useLiveEventsSystem({
    enabled: allLeagueConfigs.length > 0,
    leagues: allLeagueConfigs,
    pollingInterval: 300000 // 5 minutes
  });

  const enrichLeaguesWithLiveEvents = useCallback((leagues: LeagueData[]): LeagueData[] => {
    return leagues.map(league => {
      const liveEvents = getLeagueEvents(league.id);
      
      const allEvents = [...liveEvents, ...league.scoringEvents];
      const uniqueEvents = allEvents
        .filter((event, index, arr) => arr.findIndex(e => e.id === event.id) === index)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const livePoints = liveEvents.reduce((total, event) => total + event.scoreImpact, 0);
      
      return {
        ...league,
        myScore: league.myScore + livePoints,
        scoringEvents: uniqueEvents.slice(0, 10),
        lastUpdated: liveEvents.length > 0 ? new Date().toISOString() : league.lastUpdated
      };
    });
  }, [getLeagueEvents]);

  useEffect(() => {
    try {
      const allStaticLeagues = [...yahooLeagues, ...sleeperLeagues];
      const enrichedLeagues = isLiveSystemReady ? enrichLeaguesWithLiveEvents(allStaticLeagues) : allStaticLeagues;
      
      setCombinedLeagues(enrichedLeagues);
      
      const stillLoading = yahooLoading || sleeperLoading;
      setIsLoading(stillLoading);
      
      const combinedError = yahooError || sleeperError;
      setError(combinedError);
      
      if (!stillLoading && enrichedLeagues.length > 0) {
        setLastUpdated(new Date().toISOString());
      }
      
      debugLogger.info('DASHBOARD', 'Leagues updated', {
        total: enrichedLeagues.length,
        yahoo: yahooLeagues.length,
        sleeper: sleeperLeagues.length
      });
    } catch (error) {
      debugLogger.error('DASHBOARD', 'Failed to combine league data', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [yahooLeagues, sleeperLeagues, yahooLoading, sleeperLoading, yahooError, sleeperError, isLiveSystemReady, enrichLeaguesWithLiveEvents]);

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await Promise.allSettled([refreshYahooData(), refreshSleeperData()]);
      debugLogger.info('DASHBOARD', 'All data refreshed successfully');
    } catch (error) {
      debugLogger.error('DASHBOARD', 'Error refreshing data', error);
      setError(error instanceof Error ? error.message : 'Refresh failed');
    } finally {
      setIsLoading(false);
    }
  }, [refreshYahooData, refreshSleeperData]);
  // ✅ AUTO-START LIVE EVENTS SYSTEM
  useEffect(() => {
    if (!FEATURE_FLAGS.LIVE_EVENTS_DISABLED && allLeagueConfigs.length > 0 && !isLiveSystemReady) {
      debugLogger.info('DASHBOARD', 'Auto-starting live events system');
      
      // Small delay to ensure rosters are loaded
      const timer = setTimeout(() => {
        startLiveEvents().catch(error => {
          debugLogger.error('DASHBOARD', 'Failed to auto-start live events', error);
        });
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [allLeagueConfigs.length, isLiveSystemReady, startLiveEvents]);
  
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
