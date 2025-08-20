import { useState } from 'react';
import { LeagueBlock } from './LeagueBlock';
import { LeagueData } from '../types/fantasy';
import { Settings, RefreshCw, Plus, Share2 } from 'lucide-react';
import { Button } from './ui/button';
import { SettingsModal } from './SettingsModal';
import { ExportShareModal } from './ExportShareModal';
import { LoadingScreen } from './LoadingScreen';
import { OfflineBanner } from './OfflineBanner';
import { AccessibilityProvider, useKeyboardNavigation } from './AccessibilityProvider';
import { ConnectionIndicator } from './ConnectionIndicator';
import { useConfig } from '../hooks/useConfig';
import { useSleeperData } from '../hooks/useSleeperData';
import { usePolling } from '../hooks/usePolling';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { mockLeagueData } from '../data/mockData';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';
import { Card } from './ui/card';
import { LoadingOverlay } from './LoadingOverlay';
import { enhancedAPIHandler, getUserFriendlyErrorMessage } from '../utils/enhancedErrorHandling';

const DashboardContent = () => {
  const { config } = useConfig();
  const { leagues: sleeperLeagues, loading, error, lastUpdated, refetch } = useSleeperData(config.leagues);
  const { isOnline } = useNetworkStatus();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportShareOpen, setExportShareOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Use keyboard navigation
  useKeyboardNavigation();

  // Use mock data if no leagues configured, otherwise use real data
  const displayLeagues = config.leagues.length > 0 ? sleeperLeagues : mockLeagueData;

  // EMERGENCY: Disable polling to stop the infinite loop
  const { startPolling, stopPolling, isPolling } = usePolling({
    callback: refetch,
    config: config.polling,
    enabled: false, // DISABLED until dependency loop is fixed
  });

  const handleLeagueClick = (league: LeagueData) => {
    console.log('League clicked:', league.leagueName);
    // TODO: Implement detailed view modal
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatLastUpdate = (date: Date | null) => {
    return date ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Never';
  };

  // Show loading screen on initial load
  if (loading && !displayLeagues.length) {
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

  return (
    <div className="min-h-screen bg-background text-foreground dashboard-container" id="main-content">
      {/* Skip to content link for accessibility */}
      <a 
        href="#main-content" 
        className="skip-to-content"
        tabIndex={1}
      >
        Skip to main content
      </a>
      
      {/* Offline banner */}
      <OfflineBanner onRetry={handleRefresh} />

      {/* Header */}
      <header className="p-6 border-b border-border/50" role="banner">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold text-foreground">
              Fantasy Football Dashboard
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Last updated: {formatLastUpdate(lastUpdated)}</span>
              <ConnectionIndicator 
                lastUpdated={lastUpdated} 
                isPolling={loading} 
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
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

            <Button
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="animate-scale-in"
              aria-label="Open dashboard settings"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="dashboard-grid animate-fade-in-up" role="main" aria-label="Fantasy league dashboard">
        {error ? (
          <div className="col-span-full flex justify-center items-center p-8">
            <Alert variant="destructive" className="max-w-md">
              <AlertDescription>
                {getUserFriendlyErrorMessage(error)}
              </AlertDescription>
            </Alert>
          </div>
        ) : displayLeagues.length > 0 ? (
          displayLeagues.map((league, index) => (
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
                key={league.id}
                league={league}
                onClick={() => handleLeagueClick(league)}
              />
            </div>
          ))
        ) : (
          // Loading skeletons
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="league-block animate-pulse">
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
            className="league-block border-dashed border-2 hover:border-primary/50 transition-colors cursor-pointer animate-scale-in"
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
                <Plus className="h-12 w-12 mx-auto opacity-50" />
                <p className="font-medium">Add League</p>
                <p className="text-sm">Connect another fantasy league</p>
              </div>
            </div>
          </Card>
        )}
      </main>

      {/* Footer */}
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
      {isRefreshing && (
        <LoadingOverlay 
          isVisible={true}
          message="Refreshing data..." 
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