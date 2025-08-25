import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom'; // Already imported - no change needed
import { LeagueBlock } from './LeagueBlock';
import { MobileLeagueCard } from './MobileLeagueCard';
import { CompactLeagueView } from './CompactLeagueView';
import { WinProbabilityTrend } from './WinProbabilityTrend';
import { CompactLeagueSummary } from './CompactLeagueSummary';
import { MobileSettingsModal } from './MobileSettingsModal';
import { LeagueData } from '../types/fantasy';
import { Settings, RefreshCw, Plus, Share2, Menu } from 'lucide-react';
import { Button } from './ui/button';
import { SettingsModal } from './SettingsModal';
import { ExportShareModal } from './ExportShareModal';
import { LoadingScreen } from './LoadingScreen';
import { OfflineBanner } from './OfflineBanner';
import { AccessibilityProvider, useKeyboardNavigation } from './AccessibilityProvider';
import { ConnectionIndicator } from './ConnectionIndicator';
import { SkeletonLoader } from './ui/skeleton-loader';
import { toast } from './ui/enhanced-toast';
import { useHapticFeedback } from '../hooks/useHapticFeedback';
import { DeleteLeagueConfirmation } from './ui/confirmation-dialog';
import { useConfig } from '../hooks/useConfig';
import { useYahooData } from '../hooks/useYahooData';
import { useSleeperData } from '../hooks/useSleeperData';
import { usePolling } from '../hooks/usePolling';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useDemoLeague } from '../hooks/useDemoLeague';
import { useIsMobile, useResponsiveBreakpoint, useDeviceCapabilities } from '../hooks/use-mobile';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { mockLeagueData } from '../data/mockData';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import { Card } from './ui/card';
import { LoadingOverlay } from './LoadingOverlay';
import { enhancedAPIHandler, getUserFriendlyErrorMessage } from '../utils/enhancedErrorHandling';
import { useSwipeable } from 'react-swipeable';
import { RefreshCw as RefreshIcon } from 'lucide-react';
import { DebugConsole } from './DebugConsole';
import { YahooDebugPanel } from './YahooDebugPanel';

const DashboardContent = () => {
  const { config } = useConfig();
  const location = useLocation(); // Already imported - using existing import
  const { leagues: sleeperLeagues, loading, error, lastUpdated, refetch } = useSleeperData(config.leagues);
  
  // UPDATED: Yahoo leagues - no longer pass parameters, hook manages its own state
  const { 
    leagues: yahooLeagues, 
    isLoading: yahooLoading, 
    error: yahooError, 
    refetch: refreshYahooData,
    savedSelections
  } = useYahooData(); // Removed parameter - hook manages selections internally
  
  const { isOnline } = useNetworkStatus();
  const { demoLeague, triggerManualEvent } = useDemoLeague({ 
    enabled: config.demoMode.enabled,
    updateInterval: config.demoMode.updateInterval 
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportShareOpen, setExportShareOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentLeagueIndex, setCurrentLeagueIndex] = useState(0);
  
  // Mobile and responsive hooks
  const isMobile = useIsMobile();
  const breakpoint = useResponsiveBreakpoint();
  const { hasHaptics, isTouch } = useDeviceCapabilities();
  
  // Use keyboard navigation
  useKeyboardNavigation();

  // UPDATED: Memoized combined leagues calculation with debug logging
  const displayLeagues = useMemo(() => {
    const allLeagues: LeagueData[] = [];
    
    // Add demo league first
    if (demoLeague) {
      allLeagues.push(demoLeague);
      console.log('Dashboard: Added demo league', { name: demoLeague.leagueName });
    }
    
    // Add Sleeper leagues
    if (sleeperLeagues.length > 0) {
      allLeagues.push(...sleeperLeagues);
      console.log('Dashboard: Added Sleeper leagues', { count: sleeperLeagues.length, leagues: sleeperLeagues.map(l => l.leagueName) });
    }
    
    // Add Yahoo leagues (these come from saved selections, not config)
    if (yahooLeagues.length > 0) {
      allLeagues.push(...yahooLeagues);
      console.log('Dashboard: Added Yahoo leagues', { count: yahooLeagues.length, leagues: yahooLeagues.map(l => l.leagueName) });
    }
    
    // Show mock data only if no real leagues configured, no demo league, and no loaded leagues
    const hasRealConfig = config.leagues.length > 0 || savedSelections.some(s => s.enabled);
    if (!hasRealConfig && !demoLeague && sleeperLeagues.length === 0 && yahooLeagues.length === 0) {
      allLeagues.push(...mockLeagueData);
      console.log('Dashboard: Added mock data as fallback');
    }
    
    console.log('Dashboard: Final displayLeagues', { 
      total: allLeagues.length, 
      demo: !!demoLeague, 
      sleeper: sleeperLeagues.length,
      yahoo: yahooLeagues.length,
      mock: hasRealConfig ? 0 : mockLeagueData.length
    });
    
    return allLeagues;
  }, [demoLeague, sleeperLeagues, yahooLeagues, config.leagues.length, savedSelections]);

  // Memoized combined loading and error states
  const { combinedLoading, combinedError } = useMemo(() => ({
    combinedLoading: loading || yahooLoading,
    combinedError: error || yahooError
  }), [loading, yahooLoading, error, yahooError]);

  // CHANGE: Disable polling during OAuth callback to prevent interference
  const isOnOAuthCallback = location.pathname === '/auth/yahoo/callback';
  
  const { startPolling, stopPolling, isPolling } = usePolling({
    callback: refetch,
    config: config.polling,
    enabled: !isOnOAuthCallback, // CHANGE: Disable polling on OAuth callback route
  });

  // Log when polling is disabled
  React.useEffect(() => {
    if (isOnOAuthCallback) {
      console.log('Polling disabled - on OAuth callback page');
    }
  }, [isOnOAuthCallback]);

  // Add ref to track last refresh time
  const lastRefreshRef = useRef<number>(0);

  // UPDATED: Debounced refresh function to prevent rapid successive calls
  const debouncedRefetch = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 2000) {
      console.log('Refresh debounced - too frequent');
      return;
    }
    
    lastRefreshRef.current = now;
    console.log('Dashboard: Starting refresh for both platforms');
    
    // Refresh both platforms with error handling
    const results = await Promise.allSettled([
      refetch(),
      refreshYahooData()
    ]);
    
    results.forEach((result, index) => {
      const platform = index === 0 ? 'Sleeper' : 'Yahoo';
      if (result.status === 'rejected') {
        console.error(`Dashboard: ${platform} refresh failed:`, result.reason);
      } else {
        console.log(`Dashboard: ${platform} refresh completed successfully`);
      }
    });
  }, [refetch, refreshYahooData]);

  // Pull to refresh for mobile with throttling
  const { containerRef, isRefreshing: isPullRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      if (hasHaptics) navigator.vibrate?.(50);
      await debouncedRefetch();
    },
    threshold: 120,
    distanceToRefresh: 80,
  });

  // Swipe navigation for mobile
  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (isMobile && displayLeagues.length > 1) {
        setCurrentLeagueIndex((prev) => 
          prev < displayLeagues.length - 1 ? prev + 1 : 0
        );
        if (hasHaptics) navigator.vibrate?.(25);
      }
    },
    onSwipedRight: () => {
      if (isMobile && displayLeagues.length > 1) {
        setCurrentLeagueIndex((prev) => 
          prev > 0 ? prev - 1 : displayLeagues.length - 1
        );
        if (hasHaptics) navigator.vibrate?.(25);
      }
    },
    trackMouse: false,
    preventScrollOnSwipe: true,
  });

  const handleLeagueClick = (league: LeagueData) => {
    console.log('League clicked:', league.leagueName);
    if (hasHaptics) navigator.vibrate?.(50);
    // TODO: Implement detailed view modal
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      // Refresh both Sleeper and Yahoo data in parallel
      await Promise.allSettled([
        refetch(),
        refreshYahooData()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatLastUpdate = (date: Date | null) => {
    return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';
  };

  // Show loading screen on initial load
  if (combinedLoading && !displayLeagues.length) {
    return (
      <LoadingScreen 
        isLoading={true}
        loadingStage="Loading your fantasy leagues..."
        progress={20}
        leagues={config.leagues}
      />
    );
  }

  const dashboardData = {
    leagues: displayLeagues,
    nflState: { week: 3 }, // This should come from your API
    lastUpdated,
  };

  const renderLeagueCards = () => {
    if (isMobile) {
      return displayLeagues.map((league, index) => (
        <div
          key={league.id}
          className="animate-slide-in-right"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <MobileLeagueCard
            league={league}
            onClick={() => handleLeagueClick(league)}
            onLongPress={() => {
              console.log('Long press on league:', league.leagueName);
              // TODO: Show quick actions menu
            }}
          />
        </div>
      ));
    }

    return displayLeagues.map((league, index) => {
      if (config.display?.compactView) {
        return (
          <div
            key={league.id}
            className="animate-slide-in-right"
            style={{ animationDelay: `${index * 0.1}s` }}
            tabIndex={0}
            role="region"
            aria-label={`${league.leagueName} league information`}
          >
            <CompactLeagueView
              league={league}
              className="hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => handleLeagueClick(league)}
            />
            {config.display?.showWinProbabilityTrends
