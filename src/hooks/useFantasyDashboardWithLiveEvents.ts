import { useState, useEffect, useCallback } from 'react';
import { useYahooData } from './useYahooData';
import { useSleeperData } from './useSleeperData';
import { useLiveEventsManager } from './useLiveEventsManager';
import { useConfig } from './useConfig';
import { useWindowServiceExposure } from './useWindowServiceExposure';
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

  // Get configuration
  const { config } = useConfig();

  // Expose debugging services to window
  useWindowServiceExposure();

  // Yahoo data hook
  const {
    leagues: yahooLeagues,
    isLoading: yahooLoading,
    error: yahooError,
    savedSelections: yahooSelections,
    refreshData: refreshYahooData
  } = useYahooData();

  // Debug the current configuration state
  useEffect(() => {
    debugLogger.info('DASHBOARD', 'Configuration loaded', {
      totalLeagues: config.leagues.length,
      yahooLeagues: config.leagues.filter(l => l.platform === 'yahoo' || l.platform === 'Yahoo').length,
      sleeperLeagues: config.leagues.filter(l => l.platform === 'sleeper' || l.platform === 'Sleeper').length,
      enabledLeagues: config.leagues.filter(l => l.enabled).length
    });
  }, [config.leagues]);

  // Extract Sleeper league configurations from main config
  const sleeperConfigs: LeagueConfig[] = config.leagues.filter(
    league => (league.platform === 'sleeper' || league.platform === 'Sleeper') && league.enabled
  );
  
  // Add helpful logging for debugging
  useEffect(() => {
    if (config.leagues.length === 0) {
      console.log('📋 DASHBOARD: No leagues configured');
      console.log('ℹ️  To add a Sleeper league:');
      console.log('   1. Click Settings button');
      console.log('   2. Go to League Management tab');
      console.log('   3. Select "Sleeper" platform');
      console.log('   4. Enter a valid Sleeper league ID');
      console.log('   5. Optionally enter your Sleeper username');
      console.log('   6. Click "Add League"');
    } else {
      console.log('📋 DASHBOARD: Leagues configured:', config.leagues.map(l => ({ platform: l.platform, enabled: l.enabled, id: l.leagueId })));
    }
  }, [config.leagues]);
  
  debugLogger.info('DASHBOARD', 'Sleeper configs loaded', {
    total: config.leagues.length,
    sleeper: sleeperConfigs.length,
    enabled: sleeperConfigs.filter(c => c.enabled).length
  });
  
  // Sleeper data hook - now gets actual configurations!
  const sleeperDataHook = useSleeperData(sleeperConfigs);
  const sleeperLeagues = sleeperDataHook.leagues || [];
  const sleeperLoading = sleeperDataHook.loading || false;
  const sleeperError = sleeperDataHook.error || null;
  const refreshSleeperData = sleeperDataHook.refetch || (() => Promise.resolve());

  // Get all enabled league configurations from config
  const allLeagueConfigs: LeagueConfig[] = [
    ...yahooSelections.filter(config => config.enabled),
    ...sleeperConfigs // These are already filtered for enabled status
  ];

  debugLogger.info('DASHBOARD', 'All league configs', {
    yahoo: yahooSelections.filter(c => c.enabled).length,
    sleeper: sleeperConfigs.length,
    total: allLeagueConfigs.length
  });

  // Live events system with Tank01 primary polling every 30 seconds
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
    pollingInterval: 30000 // 30 seconds for live games
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
        sleeperConfigs: sleeperConfigs.length,
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
    enrichLeaguesWithLiveEvents,
    config.leagues.length // Add config dependency
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