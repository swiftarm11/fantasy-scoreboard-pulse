import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { useESPNData } from '../hooks/useESPNData';
import { supabase } from '../integrations/supabase/client';
import { Loader2, RefreshCw, Zap, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export const ESPNTestPanel = () => {
  const [directTestResult, setDirectTestResult] = useState<any>(null);
  const [directTestLoading, setDirectTestLoading] = useState(false);
  const [directTestError, setDirectTestError] = useState<string | null>(null);
  
  const [playsTestResult, setPlaysTestResult] = useState<any>(null);
  const [playsTestLoading, setPlaysTestLoading] = useState(false);
  const [playsTestError, setPlaysTestError] = useState<string | null>(null);

  const { 
    scoreboardData, 
    loading, 
    error, 
    lastFetch, 
    isPolling,
    hasLiveGames,
    refreshData 
  } = useESPNData();

  // Test direct ESPN API call
  const testDirectESPNCall = async () => {
    setDirectTestLoading(true);
    setDirectTestError(null);
    setDirectTestResult(null);

    try {
      console.log('🏈 Testing direct ESPN API call...');
      
      const { data, error } = await supabase.functions.invoke('espn-api', {
        body: { 
          endpoint: 'scoreboard'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log('✅ ESPN API response:', data);
      setDirectTestResult(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ ESPN API test failed:', errorMsg);
      setDirectTestError(errorMsg);
    } finally {
      setDirectTestLoading(false);
    }
  };

  // Test play-by-play API call
  const testPlaysCall = async () => {
    setPlaysTestLoading(true);
    setPlaysTestError(null);
    setPlaysTestResult(null);

    try {
      console.log('🏈 Testing play-by-play API call...');
      
      const { data, error } = await supabase.functions.invoke('espn-api', {
        body: { 
          endpoint: 'test-plays'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log('✅ Plays API response:', data);
      setPlaysTestResult(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Plays API test failed:', errorMsg);
      setPlaysTestError(errorMsg);
    } finally {
      setPlaysTestLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date);
  };

  const getGameStatusColor = (status: string) => {
    switch (status) {
      case 'in': return 'bg-red-500';
      case 'pre': return 'bg-yellow-500';
      case 'post': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            ESPN API Test Panel
            <Badge variant={isPolling ? "default" : "secondary"}>
              {isPolling ? "Live" : "Offline"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Global Service Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium">Global ESPN Service Status</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : error ? (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  )}
                  Status: {loading ? 'Loading...' : error ? 'Error' : 'Connected'}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Last Update: {lastFetch ? formatDate(lastFetch) : 'Never'}
                </div>
                <div>Games: {scoreboardData?.games?.length || 0}</div>
                <div>Live Games: {hasLiveGames ? 'Yes' : 'No'}</div>
                {scoreboardData && (
                  <>
                    <div>Week: {scoreboardData.week}</div>
                    <div>Season: {scoreboardData.season}</div>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Actions</h4>
              <div className="space-y-2">
                <Button 
                  onClick={refreshData} 
                  variant="outline" 
                  size="sm"
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Global Data
                </Button>
                <Button 
                  onClick={testDirectESPNCall} 
                  variant="outline" 
                  size="sm"
                  disabled={directTestLoading}
                  className="w-full"
                >
                  {directTestLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Test Scoreboard API
                </Button>
                <Button 
                  onClick={testPlaysCall} 
                  variant="outline" 
                  size="sm"
                  disabled={playsTestLoading}
                  className="w-full"
                >
                  {playsTestLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  Test Play-by-Play API
                </Button>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {(error || directTestError || playsTestError) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="font-medium text-red-800 mb-1">Errors:</h4>
              {error && <div className="text-sm text-red-700">Global Service: {error}</div>}
              {directTestError && <div className="text-sm text-red-700">Scoreboard Test: {directTestError}</div>}
              {playsTestError && <div className="text-sm text-red-700">Plays Test: {playsTestError}</div>}
            </div>
          )}

          {/* Games Display */}
          {scoreboardData?.games && scoreboardData.games.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Current Games ({scoreboardData.games.length})</h4>
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {scoreboardData.games.slice(0, 8).map((game) => (
                  <div key={game.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{game.shortName}</div>
                      <div className="text-xs text-gray-600">
                        {game.competitors[0]?.team.abbreviation} {game.competitors[0]?.score} - {game.competitors[1]?.score} {game.competitors[1]?.team.abbreviation}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="secondary" 
                        className={`${getGameStatusColor(game.status.type.state)} text-white`}
                      >
                        {game.status.type.name}
                      </Badge>
                      {game.status.type.state === 'in' && (
                        <div className="text-xs">
                          Q{game.status.period} {game.status.clock}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Direct Test Result */}
          {directTestResult && (
            <div className="space-y-2">
              <h4 className="font-medium">Scoreboard API Test Result</h4>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm space-y-1">
                  <div>✅ API call successful</div>
                  <div>Games returned: {directTestResult.events?.length || 0}</div>
                  <div>Week: {directTestResult.week?.number}</div>
                  <div>Season: {directTestResult.season?.year}</div>
                </div>
              </div>
            </div>
          )}

          {/* Plays Test Result */}
          {playsTestResult && (
            <div className="space-y-2">
              <h4 className="font-medium">Play-by-Play API Test Result</h4>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm space-y-1">
                  <div>✅ Plays API call successful</div>
                  <div>Event ID: {playsTestResult.eventId}</div>
                  <div>Competition ID: {playsTestResult.competitionId}</div>
                  <div>Plays returned: {playsTestResult.result?.data?.items?.length || 0}</div>
                  {playsTestResult.result?.data?.items?.length > 0 && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                      Sample play: {JSON.stringify(playsTestResult.result.data.items[0], null, 2).substring(0, 200)}...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};