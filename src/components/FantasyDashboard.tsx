import { useState } from 'react';
import { LeagueBlock } from './LeagueBlock';
import { LeagueData } from '../types/fantasy';
import { Settings, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { SettingsModal } from './SettingsModal';
import { ConnectionIndicator } from './ConnectionIndicator';
import { useConfig } from '../hooks/useConfig';
import { useSleeperData } from '../hooks/useSleeperData';
import { usePolling } from '../hooks/usePolling';
import { mockLeagueData } from '../data/mockData';
import { Skeleton } from './ui/skeleton';
import { Alert, AlertDescription } from './ui/alert';

export const FantasyDashboard = () => {
  const { config } = useConfig();
  const { leagues: sleeperLeagues, loading, error, lastUpdated, refetch } = useSleeperData(config.leagues);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Use mock data if no leagues configured, otherwise use real data
  const displayLeagues = config.leagues.length > 0 ? sleeperLeagues : mockLeagueData;

  // Set up polling for real-time updates
  usePolling({
    callback: refetch,
    config: config.polling,
    enabled: config.leagues.length > 0 && config.leagues.some(l => l.enabled),
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Fantasy Football Dashboard
              </h1>
              <div className="flex items-center gap-4">
                <p className="text-sm text-muted-foreground">
                  Last updated: {formatLastUpdate(lastUpdated)}
                </p>
                <ConnectionIndicator lastUpdated={lastUpdated} isPolling={loading} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" 
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline" 
                size="sm"
                onClick={() => setSettingsOpen(true)}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="dashboard-grid">
        {error && (
          <div className="col-span-full">
            <Alert variant="destructive">
              <AlertDescription>
                Error loading league data: {error}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {loading && displayLeagues.length === 0 && (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="league-block">
                <Skeleton className="h-full w-full rounded-xl" />
              </div>
            ))}
          </>
        )}

        {displayLeagues.map((league) => (
          <LeagueBlock
            key={league.id}
            league={league}
            onClick={() => handleLeagueClick(league)}
          />
        ))}

        {!loading && displayLeagues.length === 0 && !error && (
          <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Leagues Connected</h3>
            <p className="text-muted-foreground mb-4">
              Connect your fantasy leagues to see live scores and updates
            </p>
            <Button onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-2" />
              Open Settings
            </Button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/50 backdrop-blur-sm mt-8">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {displayLeagues.length} leagues • Polling every {config.polling.updateFrequency}s
            </p>
            <p>
              Fantasy Dashboard v1.0
            </p>
          </div>
        </div>
      </footer>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
    </div>
  );
};