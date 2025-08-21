import { useState } from 'react';
import { LeagueBlock } from './LeagueBlock';
import { MobileLeagueCard } from './MobileLeagueCard';
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

const DashboardContent = () => {
  const { config } = useConfig();
  const { leagues: sleeperLeagues, loading, error, lastUpdated, refetch } = useSleeperData(config.leagues);
  
  // Yahoo leagues
  const yahooLeagueIds = config.leagues.filter(l => l.platform === 'Yahoo').map(l => l.leagueId);
  const { leagues: yahooLeagues, isLoading: yahooLoading, error: yahooError, refreshData: refreshYahooData } = useYahooData(yahooLeagueIds);
  
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

  // Combine all leagues from different platforms
  const allLeagues = [];
  if (demoLeague) {
    allLeagues.push(demoLeague);
  }
  // Add Sleeper leagues
  if (sleeperLeagues.length > 0) {
    allLeagues.push(...sleeperLeagues);
  }
  // Add Yahoo leagues
  if (yahooLeagues.length > 0) {
    allLeagues.push(...yahooLeagues);
  }
  // Show mock data only if no real leagues configured, no demo league, and no loaded leagues
  if (config.leagues.length === 0 && !demoLeague && sleeperLeagues.length === 0 && yahooLeagues.length === 0) {
    allLeagues.push(...mockLeagueData);
  }

  const displayLeagues = allLeagues;

  // Combine loading and error states from both platforms
  const combinedLoading = loading || yahooLoading;
  const combinedError = error || yahooError;

  const { startPolling, stopPolling, isPolling } = usePolling({
    callback: refetch,
    config: config.polling,
    enabled: true, // Fixed dependency loop issue
  });

  // Pull to refresh for mobile
  const { containerRef, isRefreshing: isPullRefreshing, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      if (hasHaptics) navigator.vibrate?.(50);
      // Refresh both platforms
      await Promise.allSettled([
        refetch(),
        refreshYahooData()
      ]);
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

    return displayLeagues.map((league, index) => (
      <div
        key={league.id}
        className="animate-slide-in-right"
        style={{ animationDelay: `${index * 0.1}s` }}
        tabIndex={0}
        role="region"
        aria-label={`${league.leagueName} league information`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleLeagueClick(league);
          }
        }}
      >
        <LeagueBlock
          league={league}
          onClick={() => handleLeagueClick(league)}
        />
      </div>
    ));
  };

  return (
    <div 
      ref={containerRef}
      className="min-h-screen bg-background text-foreground dashboard-container" 
      id="main-content"
      {...(isMobile ? swipeHandlers : {})}
    >
      {/* Skip to content link for accessibility */}
      <a 
        href="#main-content" 
        className="skip-to-content"
        tabIndex={1}
      >
        Skip to main content
      </a>
      
      {/* Pull to refresh indicator */}
      {isPullRefreshing && (
        <div 
          className="pull-to-refresh-indicator flex items-center justify-center p-4"
          style={{ transform: `translateY(${Math.min(pullDistance, 60)}px)` }}
        >
          <RefreshIcon className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}
      
      {/* Offline banner */}
      <OfflineBanner onRetry={handleRefresh} />

      {/* Compact summary for mobile */}
      {isMobile && displayLeagues.length > 0 && (
        <CompactLeagueSummary 
          leagues={displayLeagues} 
          onLeagueSelect={handleLeagueClick}
        />
      )}

      {/* Header */}
      <header className={`${isMobile ? 'mobile-header' : 'p-6'} border-b border-border/50`} role="banner">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="space-y-1">
            <h1 className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-bold text-foreground`}>
              {isMobile ? 'Fantasy Dashboard' : 'Fantasy Football Dashboard'}
            </h1>
            {!isMobile && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Last updated: {formatLastUpdate(lastUpdated)}</span>
                <ConnectionIndicator 
                  lastUpdated={lastUpdated} 
                  isPolling={combinedLoading} 
                />
              </div>
            )}
          </div>
          
          <div className={`flex items-center ${isMobile ? 'mobile-header-controls' : 'gap-2'}`}>
            {!isMobile && (
              <>
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isRefreshing || !isOnline}
                  className="animate-scale-in"
                  aria-label="Refresh dashboard data"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => setExportShareOpen(true)}
                  className="animate-scale-in"
                  aria-label="Export and share dashboard"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Export & Share
                </Button>
              </>
            )}

            {isMobile ? (
              <MobileSettingsModal>
                <Button
                  variant="ghost"
                  className="w-full justify-start mobile-touch-target"
                  onClick={handleRefresh}
                  disabled={isRefreshing || !isOnline}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button
                  variant="ghost"
                  className="w-full justify-start mobile-touch-target"
                  onClick={() => setExportShareOpen(true)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Export & Share
                </Button>
              </MobileSettingsModal>
            ) : (
              <Button
                variant="outline"
                onClick={() => setSettingsOpen(true)}
                className="animate-scale-in"
                aria-label="Open dashboard settings"
              >
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="dashboard-grid animate-fade-in-up" role="main" aria-label="Fantasy league dashboard">
        {combinedError ? (
          <div className="col-span-full flex justify-center items-center p-8">
            <Alert variant="destructive" className="max-w-md">
              <AlertDescription>
                {getUserFriendlyErrorMessage(combinedError)}
              </AlertDescription>
            </Alert>
          </div>
        ) : displayLeagues.length > 0 ? (
          renderLeagueCards()
        ) : (
          // Loading skeletons
          Array.from({ length: isMobile ? 3 : 6 }).map((_, i) => (
            <Card key={i} className={`${isMobile ? 'mobile-league-card' : 'league-block'} animate-pulse`}>
              <div className="league-content">
                <div className="space-y-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-8 w-1/2" />
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}

        {/* Add new league placeholder */}
        {config.leagues.length < 10 && (
          <Card 
            className={`${isMobile ? 'mobile-league-card' : 'league-block'} border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer animate-scale-in`}
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
            <div className="league-content flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <Plus className={`${isMobile ? 'h-8 w-8' : 'h-12 w-12'} mx-auto opacity-50`} />
                <p className="font-medium">Add League</p>
                <p className="text-sm">Connect another fantasy league</p>
              </div>
            </div>
          </Card>
        )}
      </main>

      {/* Footer - Hidden on mobile */}
      {!isMobile && (
        <footer className="p-6 border-t border-border/50 text-center text-sm text-muted-foreground" role="contentinfo">
          <div className="max-w-7xl mx-auto">
            {config.leagues.length > 0 ? (
              <p>
                Tracking {config.leagues.length} league{config.leagues.length !== 1 ? 's' : ''} • 
                Polling every {config.polling.updateFrequency} seconds
                {config.polling.smartPolling && ' • Smart polling enabled'}
              </p>
            ) : (
              <p>Add your first league to get started!</p>
            )}
          </div>
        </footer>
      )}

      {/* Modals */}
      <SettingsModal 
        open={settingsOpen} 
        onOpenChange={setSettingsOpen} 
      />
      
      <ExportShareModal 
        open={exportShareOpen} 
        onOpenChange={setExportShareOpen}
        dashboardData={dashboardData}
      />

      {/* Loading overlay */}
      {(isRefreshing || isPullRefreshing) && (
        <LoadingOverlay 
          isVisible={true}
          message={isPullRefreshing ? "Pull to refresh..." : "Refreshing data..."} 
        />
      )}
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