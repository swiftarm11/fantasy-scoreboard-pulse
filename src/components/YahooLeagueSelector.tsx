import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { Loader2, RefreshCw } from 'lucide-react';
import { useYahooData } from '../hooks/useYahooData';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { useConfig } from '../hooks/useConfig';
import { LeagueConfig } from '../types/config';
import { toast } from './ui/use-toast';

export const YahooLeagueSelector = () => {
  const { isConnected } = useYahooOAuth();
  const { config, updateConfig } = useConfig();
  const { availableLeagues, isLoading, error, fetchAvailableLeagues } = useYahooData();
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);

  useEffect(() => {
    // Initialize selected leagues from existing config
    const yahooLeagues = config.leagues.filter(l => l.platform === 'Yahoo');
    setSelectedLeagues(yahooLeagues.map(l => l.leagueId));
  }, [config.leagues]);

  const handleLeagueToggle = (leagueKey: string, checked: boolean) => {
    setSelectedLeagues(prev => 
      checked 
        ? [...prev, leagueKey]
        : prev.filter(id => id !== leagueKey)
    );
  };

  const handleAddSelectedLeagues = () => {
    if (selectedLeagues.length === 0) {
      toast({
        title: 'No Leagues Selected',
        description: 'Please select at least one league to add',
        variant: 'destructive'
      });
      return;
    }

    const newLeagues: LeagueConfig[] = selectedLeagues
      .filter(leagueKey => !config.leagues.some(l => l.leagueId === leagueKey))
      .map(leagueKey => {
        const yahooLeague = availableLeagues.find(l => l.league_key === leagueKey);
        return {
          id: `yahoo_${Date.now()}_${Math.random()}`,
          leagueId: leagueKey,
          platform: 'Yahoo' as const,
          enabled: true,
          customTeamName: yahooLeague?.name || `Yahoo League ${leagueKey}`
        };
      });

    if (newLeagues.length === 0) {
      toast({
        title: 'Already Added',
        description: 'Selected leagues are already in your dashboard',
      });
      return;
    }

    const updatedConfig = {
      ...config,
      leagues: [...config.leagues, ...newLeagues]
    };

    updateConfig(updatedConfig);

    toast({
      title: 'Leagues Added',
      description: `Added ${newLeagues.length} Yahoo league${newLeagues.length > 1 ? 's' : ''} to your dashboard`,
    });
  };

  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Yahoo League Selection</CardTitle>
          <CardDescription>
            Connect your Yahoo account to select leagues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please connect your Yahoo Fantasy Sports account first to view and select your leagues.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Yahoo League Selection
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAvailableLeagues}
            disabled={isLoading}
            className="mobile-touch-target"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          Select Yahoo Fantasy leagues to add to your dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            <span className="text-muted-foreground">Loading Yahoo leagues...</span>
          </div>
        )}

        {!isLoading && availableLeagues.length === 0 && !error && (
          <div className="text-center p-6 text-muted-foreground">
            <p>No Yahoo Fantasy leagues found.</p>
            <p className="text-sm mt-1">Make sure you have active NFL fantasy leagues in Yahoo.</p>
          </div>
        )}

        {availableLeagues.length > 0 && (
          <>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {availableLeagues.map((league) => {
                const isSelected = selectedLeagues.includes(league.league_key);
                const isAlreadyAdded = config.leagues.some(l => l.leagueId === league.league_key);
                
                return (
                  <div
                    key={league.league_key}
                    className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-secondary/50 transition-colors"
                  >
                    <Checkbox
                      id={league.league_key}
                      checked={isSelected}
                      onCheckedChange={(checked) => 
                        handleLeagueToggle(league.league_key, checked as boolean)
                      }
                      disabled={isAlreadyAdded}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={league.league_key}
                          className="font-medium text-sm cursor-pointer truncate"
                        >
                          {league.name}
                        </label>
                        {isAlreadyAdded && (
                          <Badge variant="secondary" className="text-xs">
                            Added
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          Season: {league.season}
                        </span>
                        {league.draft_status === 'postdraft' && (
                          <Badge variant="outline" className="text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {selectedLeagues.length} league{selectedLeagues.length !== 1 ? 's' : ''} selected
              </p>
              <Button
                onClick={handleAddSelectedLeagues}
                disabled={selectedLeagues.length === 0}
                className="mobile-touch-target"
              >
                Add Selected Leagues
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};