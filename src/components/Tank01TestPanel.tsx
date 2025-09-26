import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Database, Users, Gamepad2, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TestResult {
  success: boolean;
  endpoint: string;
  data: any;
  meta?: {
    timestamp: string;
    responseSize: number;
  };
  error?: string;
}

export function Tank01TestPanel() {
  const [connectionResult, setConnectionResult] = useState<TestResult | null>(null);
  const [connectionLoading, setConnectionLoading] = useState(false);
  
  const [playersResult, setPlayersResult] = useState<TestResult | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  
  const [gamesResult, setGamesResult] = useState<TestResult | null>(null);
  const [gamesLoading, setGamesLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // Test basic API connection
  const testConnection = async () => {
    setConnectionLoading(true);
    setError(null);
    setConnectionResult(null);

    try {
      console.log('🏈 Testing Tank01 API connection...');
      
      const { data, error } = await supabase.functions.invoke('tank01-api', {
        body: { 
          endpoint: 'test-connection'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log('✅ Tank01 connection test response:', data);
      setConnectionResult(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Tank01 connection test failed:', errorMsg);
      setError(errorMsg);
    } finally {
      setConnectionLoading(false);
    }
  };

  // Test player data with ID mapping
  const testPlayers = async () => {
    setPlayersLoading(true);
    setError(null);
    setPlayersResult(null);

    try {
      console.log('🏈 Testing Tank01 player data...');
      
      const { data, error } = await supabase.functions.invoke('tank01-api', {
        body: { 
          endpoint: 'players',
          team: 'KC', // Test with Chiefs as example
          position: 'QB'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log('✅ Tank01 players response:', data);
      setPlayersResult(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Tank01 players test failed:', errorMsg);
      setError(errorMsg);
    } finally {
      setPlayersLoading(false);
    }
  };

  // Test current games data
  const testGames = async () => {
    setGamesLoading(true);
    setError(null);
    setGamesResult(null);

    try {
      console.log('🏈 Testing Tank01 games data...');
      
      const { data, error } = await supabase.functions.invoke('tank01-api', {
        body: { 
          endpoint: 'games',
          week: '1',
          season: '2025'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log('✅ Tank01 games response:', data);
      setGamesResult(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Tank01 games test failed:', errorMsg);
      setError(errorMsg);
    } finally {
      setGamesLoading(false);
    }
  };

  const getPlayerIdSummary = (playerData: any) => {
    if (!playerData?.data?.body) return 'No player data';
    
    const players = Array.isArray(playerData.data.body) ? playerData.data.body : [playerData.data.body];
    const samplePlayer = players[0];
    
    if (!samplePlayer) return 'No players found';
    
    return {
      total: players.length,
      sample: {
        name: samplePlayer.longName || samplePlayer.espnName || 'Unknown',
        sleeperID: samplePlayer.sleeperBotID || 'Not found',
        yahooID: samplePlayer.yahooPlayerID || 'Not found',
        espnID: samplePlayer.espnID || 'Not found'
      }
    };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Tank01 NFL API Testing
            <Badge variant="outline">Phase 1</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Testing Tank01 API capabilities for player ID mapping and live data integration
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Test Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button 
              onClick={testConnection} 
              variant="outline" 
              size="sm"
              disabled={connectionLoading}
              className="w-full"
            >
              {connectionLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Test Connection
            </Button>
            
            <Button 
              onClick={testPlayers} 
              variant="outline" 
              size="sm"
              disabled={playersLoading}
              className="w-full"
            >
              {playersLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Users className="h-4 w-4 mr-2" />
              )}
              Test Player IDs
            </Button>
            
            <Button 
              onClick={testGames} 
              variant="outline" 
              size="sm"
              disabled={gamesLoading}
              className="w-full"
            >
              {gamesLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Gamepad2 className="h-4 w-4 mr-2" />
              )}
              Test Games
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="font-medium text-red-800 mb-1">Error:</h4>
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {/* Connection Test Result */}
          {connectionResult && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Connection Test Result
              </h4>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm space-y-1">
                  <div>✅ Tank01 API connection successful</div>
                  <div>Teams returned: {Array.isArray(connectionResult.data?.body) ? connectionResult.data.body.length : 'N/A'}</div>
                  <div>Response size: {connectionResult.meta?.responseSize} bytes</div>
                  <div>Timestamp: {connectionResult.meta?.timestamp}</div>
                </div>
              </div>
            </div>
          )}

          {/* Players Test Result */}
          {playersResult && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Player ID Mapping Test Result
              </h4>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm space-y-2">
                  <div>✅ Player data retrieved successfully</div>
                  {(() => {
                    const summary = getPlayerIdSummary(playersResult);
                    if (typeof summary === 'string') return <div>{summary}</div>;
                    
                    return (
                      <>
                        <div>Total players: {summary.total}</div>
                        <div className="space-y-1">
                          <div className="font-medium">Sample player mapping:</div>
                          <div className="ml-2 space-y-1">
                            <div>Name: {summary.sample.name}</div>
                            <div>Sleeper ID: {summary.sample.sleeperID}</div>
                            <div>Yahoo ID: {summary.sample.yahooID}</div>
                            <div>ESPN ID: {summary.sample.espnID}</div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Games Test Result */}
          {gamesResult && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Gamepad2 className="h-4 w-4" />
                Games Data Test Result
              </h4>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-sm space-y-1">
                  <div>✅ Games data retrieved successfully</div>
                  <div>Games found: {gamesResult.data?.body?.length || 0}</div>
                  <div>Response size: {gamesResult.meta?.responseSize} bytes</div>
                  {gamesResult.data?.body?.length > 0 && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
                      Sample game: {gamesResult.data.body[0]?.away || 'Unknown'} @ {gamesResult.data.body[0]?.home || 'Unknown'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* API Evaluation Summary */}
          <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Evaluation Criteria
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="font-medium">✓ Direct Player ID Mapping</div>
                <div className="text-muted-foreground">Sleeper & Yahoo IDs included</div>
              </div>
              <div>
                <div className="font-medium">✓ Live Game Data</div>
                <div className="text-muted-foreground">Real-time scoring events</div>
              </div>
              <div>
                <div className="font-medium">? Rate Limits</div>
                <div className="text-muted-foreground">Need to monitor usage</div>
              </div>
              <div>
                <div className="font-medium">? Data Accuracy</div>
                <div className="text-muted-foreground">Compare vs ESPN</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}