import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, Settings, Share2, ArrowDown, ArrowUp, Zap, Download, User, Target, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfig } from '../hooks/useConfig';
import { useFantasyDashboardWithLiveEvents } from '../hooks/useFantasyDashboardWithLiveEvents';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useDemoLeague } from '../hooks/useDemoLeague';
import { useLiveEventsSystem } from '../hooks/useLiveEventsSystem';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { useResponsiveBreakpoint, useIsMobile, useDeviceCapabilities } from '../hooks/use-mobile';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useHapticFeedback } from '../hooks/useHapticFeedback';
import { useEventAnimations } from '../hooks/useEventAnimations';
import { LeagueBlock } from './LeagueBlock';
import { SettingsModal } from './SettingsModal';
import { ExportShareModal } from './ExportShareModal';
import { ConnectionStatusBanner } from './ConnectionStatusBanner';
import { LiveEventIndicator } from './LiveEventIndicator';
import { PerformanceDashboard } from './PerformanceDashboard';
import { LoadingScreen } from './LoadingScreen';
import { LoadingOverlay } from './LoadingOverlay';
import { OfflineBanner } from './OfflineBanner';
import { MobileLeagueCard } from './MobileLeagueCard';
import { MobileSettingsModal } from './MobileSettingsModal';

import { LeagueData } from '../types/fantasy';

const DashboardContent = () => {
  const { config } = useConfig();
  const location = useLocation();

  // Enhanced dashboard with live events - this replaces individual Yahoo/Sleeper hooks
  const {
    leagues: enhancedLeagues,
    isLoading: dashboardLoading,
    error: dashboardError,
    lastUpdated: dashboardLastUpdated,
    liveEventsState,
    isLiveSystemReady,
    startLiveEvents,
    stopLiveEvents,
    refreshData: refreshAllData,
    refreshRosters
  } = useFantasyDashboardWithLiveEvents();

  // Network status and demo league hooks
  const { isOnline } = useNetworkStatus();
  const {
    demoLeague,
    triggerManualEvent
  } = useDemoLeague({
    enabled: config.demoMode.enabled,
    updateInterval: config.demoMode.updateInterval
  });

  // Live events system integration
  const {
    liveState,
    recentEvents,
    isSystemReady,
    getLiveEventsForLeague,
    triggerTestEvent
  } = useLiveEventsSystem({
    leagues: config.leagues,
    enabled: !config.demoMode.enabled && config.leagues.length > 0,
    pollingInterval: config.polling?.interval || 30
  });

  // UI State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportShareOpen, setExportShareOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentLeagueIndex, setCurrentLeagueIndex] = useState(0);

  // Mobile and responsive hooks
  const isMobile = useIsMobile();
  const breakpoint = useResponsiveBreakpoint();
  const { hasHaptics, isTouch } = useDeviceCapabilities();

  // Use enhanced leagues from the new hook
  const displayLeagues = useMemo(() => {
    const allLeagues: LeagueData[] = [];

    // Add demo league if enabled
    if (demoLeague) {
      allLeagues.push(demoLeague);
    }

    // Add enhanced leagues (contains both Yahoo and Sleeper with live events)
    allLeagues.push(...enhancedLeagues);

    // No fallback to mock data - only show configured leagues and demo
    return allLeagues;
  }, [demoLeague, enhancedLeagues]);

  // Loading and error states from enhanced dashboard
  const isLoading = dashboardLoading;
  const error = dashboardError;

  // Debounced refresh to prevent spam
  const lastRefreshRef = useRef(0);
  const debouncedRefetch = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshRef.current < 2000) {
      console.log('Refresh debounced - too frequent');
      return;
    }
    lastRefreshRef.current = now;
    try {
      setIsRefreshing(true);
      await Promise.allSettled([
        refreshAllData(),
        triggerManualEvent ? triggerManualEvent() : Promise.resolve()
      ]);
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshAllData, triggerManualEvent]);

  // Pull to refresh for mobile with throttling
  const {
    containerRef,
    isRefreshing: isPullRefreshing,
    pullDistance
  } = usePullToRefresh({
    onRefresh: async () => {
      if (hasHaptics) navigator.vibrate?.(50);
      await debouncedRefetch();
    },
    threshold: 120,
    distanceToRefresh: 80
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshAllData();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate optimal grid layout based on number of leagues
  const getGridLayout = useMemo(() => {
    const leagueCount = enhancedLeagues.length;
    if (isMobile) {
      return "grid grid-cols-1 gap-4";
    }

    if (leagueCount <= 2) return "grid grid-cols-1 lg:grid-cols-2 gap-6";
    if (leagueCount <= 4) return "grid grid-cols-1 md:grid-cols-2 gap-4";
    if (leagueCount <= 6) return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4";
    return "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3";
  }, [enhancedLeagues.length, isMobile]);

  const handleLeagueClick = (league: LeagueData) => {
    console.log('League clicked:', league.leagueName);
    if (hasHaptics) navigator.vibrate?.(50);
  };

  // Performance monitoring
  const performanceHook = usePerformanceMonitor();

  if (isLoading && displayLeagues.length === 0) {
    return <LoadingScreen isLoading={true} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/95 to-background/90">
      {/* Network Status */}
      {!isOnline && <OfflineBanner />}

      {/* Live Events Status */}
      {isSystemReady && liveState.isActive && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4">
          <p className="text-sm text-primary">
            Live Events: {liveState.eventCount} events • Last: {liveState.lastEventTime || 'None'}
          </p>
        </div>
      )}

      {/* Main Container */}
      <div 
        ref={containerRef}
        className="container mx-auto px-4 py-6 space-y-6 relative"
        style={{
          transform: isPullRefreshing ? `translateY(${Math.min(pullDistance * 0.5, 50)}px)` : undefined,
          transition: isPullRefreshing ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Fantasy Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              {displayLeagues.length} league{displayLeagues.length !== 1 ? 's' : ''} • 
              {isSystemReady && liveState.isActive ? (
                <span className="text-primary ml-1">Live</span>
              ) : (
                <span className="ml-1">Updated {dashboardLastUpdated ? new Date(dashboardLastUpdated).toLocaleTimeString() : 'never'}</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="transition-all duration-200 hover:scale-105"
            >
              <RotateCcw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportShareOpen(true)}
              className="transition-all duration-200 hover:scale-105"
            >
              <Share2 className="h-4 w-4 mr-2" />
              Export
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSettingsOpen(true)}
              className="transition-all duration-200 hover:scale-105"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <Alert className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Leagues Grid */}
        {isMobile ? (
          // Mobile: Card-based layout with swipe navigation
          <div className="space-y-4">
            {displayLeagues.map((league) => (
              <MobileLeagueCard
                key={league.id}
                league={league}
                onClick={() => handleLeagueClick(league)}
              />
            ))}
          </div>
        ) : (
          // Desktop: Grid layout
          <div className={getGridLayout}>
            {displayLeagues.map((league) => (
              <LeagueBlock
                key={league.id}
                league={league}
                onClick={() => handleLeagueClick(league)}
              />
            ))}
          </div>
        )}

        {/* Performance Dashboard (Debug Mode) */}
        {config.debug.enabled && (
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Debug Mode Active</p>
          </div>
        )}

        {/* Loading Overlay */}
        {(isRefreshing || isPullRefreshing) && <LoadingOverlay isVisible={true} />}
      </div>

      {/* Modals */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      <ExportShareModal
        open={exportShareOpen}
        onOpenChange={setExportShareOpen}
      />
    </div>
  );
};

export const FantasyDashboard = () => {
  return <DashboardContent />;
};