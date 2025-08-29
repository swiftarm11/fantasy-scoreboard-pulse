import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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

const DashboardContent = () => {
  const { config } = useConfig();
  const location = useLocation();
  const { leagues: sleeperLeagues, loading, error, lastUpdated, refetch } = useSleeperData(config.leagues);

  // FIXED: Yahoo leagues - now properly uses saved selections from localStorage
  const {
    leagues: yahooLeagues,
    isLoading: yahooLoading,
    error: yahooError,
    refreshData: refreshYahooData,
    getEnabledLeagueIds // Get enabled league IDs from saved selections
  } = useYahooData();

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

  // Memoized combined leagues calculation to prevent unnecessary recalculation
  const displayLeagues = useMemo(() => {
    const allLeagues: LeagueData[] = [];

    // Add demo league
    if (demoLeague) {
      allLeagues.push(demoLeague);
    }

    // Add Sleeper leagues
    if (sleeperLeagues.length > 0) {
      allLeagues.push(...sleeperLeagues);
    }

    // FIXED: Add Yahoo leagues from saved selections
    if (yahooLeagues.length > 0) {
      allLeagues.push(...yahooLeagues);
    }

    // Show mock data only if no real leagues configured, no demo league, and no loaded leagues
    if (config.leagues.length === 0 && !demoLeague && sleeperLeagues.length === 0 && yahooLeagues.length === 0) {
      allLeagues.push(...mockLeagueData);
    }

    return allLeagues;
  }, [demoLeague, sleeperLeagues, yahooLeagues, config.leagues.length]);

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
  const lastRefreshRef = useRef(0);

  // Debounced refresh function to prevent rapid successive calls
  const debouncedRefetch = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 2000) {
      console.log('Refresh debounced - too frequent');
      return;
    }

    lastRefreshRef.current = now;
    // Refresh both platforms with error handling
    await Promise.allSettled([
      refetch(),
      refreshYahooData()
    ]);
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
    return <LoadingScreen isLoading={true} loadingStage="Loading leagues..." progress={50} />;
  }

  const dashboardData = {
    leagues: displayLeagues,
    nflState: { week: 3 }, // This should come from your API
    lastUpdated,
  };

  const renderLeagueCards = () => {
    if (isMobile) {
      return displayLeagues.map((league, index) => (
        <MobileLeagueCard
          key={league.id}
          league={league}
          onClick={() => handleLeagueClick(league)}
          onLongPress={() => {
            console.log('Long press on league:', league.leagueName);
            // TODO: Show quick actions menu
          }}
        />
      ));
    }

    return displayLeagues.map((league, index) => {
      if (config.display?.compactView) {
        return (
          <div key={league.id} className="space-y-2">
            <CompactLeagueView
              league={league}
              onClick={() => handleLeagueClick(league)}
            />
            {config.display?.showWinProbabilityTrends && (
              <WinProbabilityTrend league={league} />
            )}
          </div>
        );
      }

      return (
        <div 
          key={league.id}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleLeagueClick(league);
            }
          }}
          aria-label={`League: ${league.leagueName}`}
        >
          <LeagueBlock
            league={league}
            onClick={() => handleLeagueClick(league)}
          />
        </div>
      );
    });
  };

  return (
    <div ref={containerRef} {...swipeHandlers} className="min-h-screen bg-background">
      {/* Skip to content link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50"
      >
        Skip to main content
      </a>

      {/* Pull to refresh indicator */}
      {isPullRefreshing && (
        <div className="fixed top-0 left-0 right-0 bg-blue-500 text-white text-center py-2 z-40">
          <RefreshIcon className="inline-block animate-spin mr-2" size={16} />
          Refreshing...
        </div>
      )}

      {/* Offline banner */}
      <OfflineBanner />

      {/* Compact summary for mobile */}
      {isMobile && displayLeagues.length > 0 && (
        <CompactLeagueSummary
          leagues={displayLeagues}
          onLeagueSelect={handleLeagueClick}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="mr-4 hidden md:flex">
            <h1 className="text-xl font-semibold">Fantasy Dashboard</h1>
          </div>
          
          <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
            <div className="w-full flex-1 md:w-auto md:flex-none">
              <ConnectionIndicator />
            </div>
            
            <nav className="flex items-center space-x-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="h-8 w-8 px-0"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="sr-only">Refresh</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExportShareOpen(true)}
                className="h-8 w-8 px-0"
              >
                <Share2 className="h-4 w-4" />
                <span className="sr-only">Share</span>
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="h-8 w-8 px-0"
              >
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className="container mx-auto px-4 py-6">
        {combinedError ? (
          <Alert className="mb-6">
            <AlertDescription>
              {getUserFriendlyErrorMessage(combinedError)}
            </AlertDescription>
          </Alert>
        ) : displayLeagues.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {renderLeagueCards()}
          </div>
        ) : (
          // Loading skeletons
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: isMobile ? 3 : 6 }).map((_, i) => (
              <SkeletonLoader key={i} />
            ))}
          </div>
        )}

        {/* Add new league placeholder */}
        {config.leagues.length < 10 && (
          <Card
            className="mt-6 p-8 border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer"
            onClick={() => setSettingsOpen(true)}
            role="button"
            tabIndex={0}
            aria-label="Add new fantasy league"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSettingsOpen(true);
              }
            }}
          >
            <div className="text-center text-muted-foreground">
              <Plus className="mx-auto h-12 w-12 mb-4" />
              <h3 className="text-lg font-medium mb-2">Add League</h3>
              <p className="text-sm">Connect another fantasy league</p>
            </div>
          </Card>
        )}
      </main>

      {/* Footer - Hidden on mobile */}
      {!isMobile && (
        <footer className="border-t py-6 md:py-0">
          <div className="container flex flex-col items-center justify-between gap-4 md:h-24 md:flex-row">
            <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
              <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                Last updated: {formatLastUpdate(lastUpdated)}
              </p>
            </div>
          </div>
        </footer>
      )}

      {/* Modals */}
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ExportShareModal open={exportShareOpen} onOpenChange={setExportShareOpen} dashboardData={dashboardData} />

      {/* Loading overlay */}
      {(isRefreshing || isPullRefreshing) && (
        <LoadingOverlay isVisible={true} message="Refreshing leagues..." />
      )}

      {/* Debug Console - Only shows in dev or when there are config issues */}
      <DebugConsole />
    </div>
  );
};

export const FantasyDashboard = () => {
  return (
    <AccessibilityProvider>
      <DashboardContent />
    </AccessibilityProvider>
  );
};
