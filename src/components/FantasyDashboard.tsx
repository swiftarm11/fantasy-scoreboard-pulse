import { useState } from 'react';
import { LeagueBlock } from './LeagueBlock';
import { mockLeagueData } from '../data/mockData';
import { LeagueData } from '../types/fantasy';
import { Settings, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

export const FantasyDashboard = () => {
  const [leagues] = useState<LeagueData[]>(mockLeagueData);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const handleLeagueClick = (league: LeagueData) => {
    console.log('League clicked:', league.leagueName);
    // TODO: Implement detailed view modal
  };

  const handleRefresh = () => {
    setLastRefresh(new Date());
    // TODO: Implement actual data refresh
  };

  const formatLastUpdate = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
              <p className="text-sm text-muted-foreground">
                Last updated: {formatLastUpdate(lastRefresh)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" 
                size="sm"
                onClick={handleRefresh}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button
                variant="outline" 
                size="sm"
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="dashboard-grid">
        {leagues.map((league) => (
          <LeagueBlock
            key={league.id}
            league={league}
            onClick={() => handleLeagueClick(league)}
          />
        ))}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-card/50 backdrop-blur-sm mt-8">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {leagues.length} leagues • Next refresh in 2 minutes
            </p>
            <p>
              Fantasy Dashboard v1.0
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};