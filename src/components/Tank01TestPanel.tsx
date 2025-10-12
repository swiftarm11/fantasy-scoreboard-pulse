import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, Database, Users, Gamepad2, BarChart3, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { tank01NFLDataService } from '@/services/Tank01NFLDataService';
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
  const [playsResult, setPlaysResult] = useState<TestResult | null>(null);
  const [playsLoading, setPlaysLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [callCount, setCallCount] = useState(0);
  const [serviceStatus, setServiceStatus] = useState<any>(null);
  const [isT01LiveEnabled, setIsT01LiveEnabled] = useState(false);

  // Test basic API connection - USER INITIATED ONLY
  const testConnection = async () => {
    setConnectionLoading(true);
    setError(null);
    setConnectionResult(null);
    setCallCount(prev => prev + 1);
    try {
      console.log(`🏈 [MANUAL TEST ${callCount + 1}] Testing Tank01 API connection...`);
      console.warn('⚠️ Tank01 API call initiated by user - counting against free tier');
      const {
        data,
        error
      } = await supabase.functions.invoke('tank01-api', {
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

  // Test player data with ID mapping - USER INITIATED ONLY
  const testPlayers = async () => {
    setPlayersLoading(true);
    setError(null);
    setPlayersResult(null);
    setCallCount(prev => prev + 1);
    try {
      console.log(`🏈 [MANUAL TEST ${callCount + 1}] Testing Tank01 player data...`);
      console.warn('⚠️ Tank01 API call initiated by user - counting against free tier');
      const {
        data,
        error
      } = await supabase.functions.invoke('tank01-api', {
        body: {
          endpoint: 'players',
          team: 'KC',
          // Test with Chiefs as example
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

  // Test current games data - USER INITIATED ONLY
  const testGames = async () => {
    setGamesLoading(true);
    setError(null);
    setGamesResult(null);
    setCallCount(prev => prev + 1);
    try {
      console.log(`🏈 [MANUAL TEST ${callCount + 1}] Testing Tank01 games data for current week...`);
      console.warn('⚠️ Tank01 API call initiated by user - counting against free tier');
      const {
        data,
        error
      } = await supabase.functions.invoke('tank01-api', {
        body: {
          endpoint: 'games'
          // No week/season specified - let API auto-calculate current week
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

  // Test play-by-play data - USER INITIATED ONLY
  const testPlays = async () => {
    if (!gamesResult?.data?.body?.[0]?.gameID) {
      setError('No game ID available. Run games test first.');
      return;
    }
    setPlaysLoading(true);
    setError(null);
    setPlaysResult(null);
    setCallCount(prev => prev + 1);
    try {
      const gameId = gamesResult.data.body[0].gameID;
      console.log(`🏈 [MANUAL TEST ${callCount + 1}] Testing Tank01 plays data for game ${gameId}...`);
      console.warn('⚠️ Tank01 API call initiated by user - counting against free tier');
      const {
        data,
        error
      } = await supabase.functions.invoke('tank01-api', {
        body: {
          endpoint: 'plays',
          gameId: gameId
        }
      });
      if (error) {
        throw new Error(error.message);
      }
      console.log('✅ Tank01 plays response:', data);
      setPlaysResult(data);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ Tank01 plays test failed:', errorMsg);
      setError(errorMsg);
    } finally {
      setPlaysLoading(false);
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
  return <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Tank01 NFL API Testing
            <Badge variant="outline">Phase 1</Badge>
            <Badge variant="destructive">Manual Only</Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Testing Tank01 API capabilities - API calls are user-initiated only to preserve free tier usage
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">API Calls Made: {callCount}</Badge>
            <span className="text-xs text-amber-600">⚠️ Each call counts against free tier</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Tank01 API provides both Sleeper and Yahoo player IDs, eliminating the need for fuzzy name matching.
            </div>
            
            <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">Tank01 Service Status</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setServiceStatus(tank01NFLDataService.getServiceStatus())} disabled={connectionLoading || playersLoading || gamesLoading || playsLoading}>
                Check Status
              </Button>
            </div>

            {serviceStatus && <div className="p-3 bg-muted/20 rounded-lg text-xs space-y-2">
                <div className="flex justify-between">
                  <span>Tank01 Service Active:</span>
                  <Badge variant={serviceStatus.isPolling ? "default" : "secondary"}>
                    {serviceStatus.isPolling ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span>Players Cached:</span>
                  <span>{serviceStatus.playersCached}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current NFL Week:</span>
                  <span>{serviceStatus.currentWeek || 'Unknown'}</span>
                </div>
              </div>}
          </div>
          {/* Test Controls - Manual Only */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button onClick={testConnection} variant="outline" size="sm" disabled={connectionLoading || playersLoading || gamesLoading || playsLoading} className="w-full">
              {connectionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              Test Connection
            </Button>
            
            <Button onClick={testPlayers} variant="outline" size="sm" disabled={playersLoading || connectionLoading || gamesLoading || playsLoading} className="w-full">
              {playersLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Users className="h-4 w-4 mr-2" />}
              Test Player IDs (KC QBs)
            </Button>
            
            <Button onClick={testGames} variant="outline" size="sm" disabled={gamesLoading || connectionLoading || playersLoading || playsLoading} className="w-full">
              {gamesLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Gamepad2 className="h-4 w-4 mr-2" />}
              Test Games (Current Week)
            </Button>
            
            <Button onClick={testPlays} variant="outline" size="sm" disabled={playsLoading || connectionLoading || playersLoading || gamesLoading || !gamesResult?.data?.body?.[0]?.gameID} className="w-full">
              {playsLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-2" />}
              Test Plays Data
            </Button>
          </div>

          {/* Usage Warning */}
          <div className="p-3 border border-amber-200 rounded-lg bg-slate-800">
            <h4 className="font-medium text-amber-800 mb-1 flex items-center gap-2">
              ⚠️ API Usage Limits
            </h4>
            <div className="text-sm text-amber-700 space-y-1">
              <div>• All API calls are manual only - no automatic polling</div>
              <div>• Each button click makes 1 API call against your free tier</div>
              <div>• Test systematically to avoid wasting calls</div>
              <div>• Plays data requires a game ID from the Games test first</div>
            </div>
          </div>

          {/* Error Display */}
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <h4 className="font-medium text-red-800 mb-1">Error:</h4>
              <div className="text-sm text-red-700">{error}</div>
            </div>}

          {/* Connection Test Result */}
          {connectionResult && <div className="space-y-2">
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
            </div>}

          {/* Players Test Result */}
          {playersResult && <div className="space-y-2">
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
                return <>
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
                      </>;
              })()}
                </div>
              </div>
            </div>}

          {/* Games Test Result */}
          {gamesResult && <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <Gamepad2 className="h-4 w-4" />
                Games Data Test Result
              </h4>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-sm space-y-2">
                  <div>✅ Games data retrieved successfully</div>
                  <div>Games found: {gamesResult.data?.body?.length || 0}</div>
                  <div>Response size: {gamesResult.meta?.responseSize} bytes</div>
                  
                  {gamesResult.data?.body?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <div className="font-medium text-purple-800">All Games:</div>
                      <div className="max-h-64 overflow-y-auto space-y-2">
                        {gamesResult.data.body.map((game: any, index: number) => (
                          <div key={index} className="p-2 bg-white rounded border border-purple-200">
                            <div className="flex justify-between items-center">
                              <div className="font-medium">
                                {game.away || 'Away'} @ {game.home || 'Home'}
                              </div>
                              <Badge variant={game.gameStatus === 'Completed' ? 'secondary' : game.gameStatus === 'InProgress' ? 'default' : 'outline'}>
                                {game.gameStatus || 'Scheduled'}
                              </Badge>
                            </div>
                            
                            <div className="text-xs text-gray-600 mt-1 space-y-1">
                              <div className="flex justify-between">
                                <span>Game ID: {game.gameID}</span>
                                {game.gameTime && <span>Time: {game.gameTime}</span>}
                              </div>
                              
                              {(game.awayResult || game.homeResult) && (
                                <div className="flex justify-between font-medium text-gray-800">
                                  <span>{game.away}: {game.awayResult || 0}</span>
                                  <span>{game.home}: {game.homeResult || 0}</span>
                                </div>
                              )}
                              
                              {game.gameWeek && (
                                <div>Week {game.gameWeek} • {game.seasonType || 'Regular'}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      <div className="text-xs text-green-600 mt-2 p-2 bg-green-50 rounded">
                        ✓ First game ID available for plays test: {gamesResult.data.body[0]?.gameID}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>}

          {/* Plays Test Result */}
          {playsResult && <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Play-by-Play Test Result
              </h4>
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div className="text-sm space-y-2">
                  <div>✅ Play-by-play data retrieved successfully</div>
                  <div>Response size: {playsResult.meta?.responseSize} bytes</div>
                  
                  {(() => {
                    // Handle Tank01 API specific data structure
                    let plays = [];
                    let scoringPlays = [];
                    let gameData = null;
                    const data = playsResult.data;
                    
                    // Tank01 API structure: data.body.allPlayByPlay
                    if (data?.body?.allPlayByPlay) {
                      plays = data.body.allPlayByPlay;
                      scoringPlays = data.body.scoringPlays || [];
                      gameData = {
                        home: data.body.home,
                        away: data.body.away,
                        teamIDHome: data.body.teamIDHome,
                        teamIDAway: data.body.teamIDAway
                      };
                    } else if (data?.body?.plays) {
                      plays = data.body.plays;
                    } else if (data?.body?.gameData?.plays) {
                      plays = data.body.gameData.plays;
                    } else if (Array.isArray(data?.body)) {
                      plays = data.body;
                    } else if (data?.plays) {
                      plays = data.plays;
                    }
                    
                    if (!plays || plays.length === 0) {
                      return (
                        <div className="text-amber-600">
                          No plays found. Available keys: {Object.keys(data?.body || {}).join(', ')}
                        </div>
                      );
                    }
                    
                    // Helper function to resolve team name from teamID
                    const getTeamName = (teamID: string) => {
                      if (!gameData) return teamID;
                      if (teamID === gameData.teamIDHome) return gameData.home;
                      if (teamID === gameData.teamIDAway) return gameData.away;
                      return teamID;
                    };
                    
                    // Helper function to check if play is a scoring play
                    const isScoringPlay = (play: any) => {
                      if (!scoringPlays?.length) return false;
                      return scoringPlays.some((scoringPlay: any) => 
                        scoringPlay.scoreTime === play.playClock &&
                        scoringPlay.scorePeriod === play.playPeriod
                      );
                    };
                    
                    // Helper function to extract raw stats from Tank01 playerStats
                    const extractRawStats = (play: any) => {
                      const stats: any = {};
                      if (!play.playerStats) return stats;
                      
                      Object.entries(play.playerStats).forEach(([playerId, playerData]: [string, any]) => {
                        if (playerData.Passing) {
                          stats[playerId] = {
                            ...stats[playerId],
                            passingYards: parseInt(playerData.Passing.passYds || '0'),
                            passingTDs: parseInt(playerData.Passing.passTD || '0'),
                            passingAttempts: parseInt(playerData.Passing.passAttempts || '0'),
                            passingCompletions: parseInt(playerData.Passing.passCompletions || '0')
                          };
                        }
                        if (playerData.Rushing) {
                          stats[playerId] = {
                            ...stats[playerId],
                            rushingYards: parseInt(playerData.Rushing.rushYds || '0'),
                            rushingTDs: parseInt(playerData.Rushing.rushTD || '0'),
                            carries: parseInt(playerData.Rushing.carries || '0')
                          };
                        }
                        if (playerData.Receiving) {
                          stats[playerId] = {
                            ...stats[playerId],
                            receivingYards: parseInt(playerData.Receiving.recYds || '0'),
                            receivingTDs: parseInt(playerData.Receiving.recTD || '0'),
                            receptions: parseInt(playerData.Receiving.receptions || '0'),
                            targets: parseInt(playerData.Receiving.targets || '0')
                          };
                        }
                        if (playerData.Kicking) {
                          stats[playerId] = {
                            ...stats[playerId],
                            fieldGoalsMade: parseInt(playerData.Kicking.fgMade || '0'),
                            extraPointsMade: parseInt(playerData.Kicking.xpMade || '0'),
                            kickingYards: parseInt(playerData.Kicking.fgYds || playerData.Kicking.kickYards || '0')
                          };
                        }
                      });
                      return stats;
                    };
                    
                    // Get the 5 most recent plays
                    const recentPlays = plays.slice(-5).reverse();
                    
                    return (
                      <div className="space-y-3">
                        <div>Plays found: {plays.length}</div>
                        <div>
                          <div className="font-medium text-indigo-800 mb-2">5 Most Recent Plays:</div>
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {recentPlays.map((play: any, index: number) => {
                              const isScoring = isScoringPlay(play);
                              const rawStats = extractRawStats(play);
                              const teamName = getTeamName(play.teamID);
                              
                              // Parse down and distance from Tank01 format
                              const downAndDistance = play.downAndDistance || '';
                              const downMatch = downAndDistance.match(/(\d+)(st|nd|rd|th)\s*&\s*(\d+)/);
                              const down = downMatch ? downMatch[1] : '';
                              const distance = downMatch ? downMatch[3] : '';
                              
                              return (
                                <div key={index} className="p-3 bg-white rounded border border-indigo-200">
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="font-medium text-sm">
                                      {play.playPeriod} {play.playClock}
                                    </div>
                                    <div className="text-xs text-gray-600">
                                      {down && distance ? `${down} & ${distance}` : downAndDistance}
                                    </div>
                                  </div>
                                  
                                  <div className="text-sm text-gray-800 mb-2">
                                    {play.play || 'No description available'}
                                  </div>
                                  
                                  <div className="flex justify-between text-xs text-gray-600">
                                    <span>{teamName}</span>
                                  </div>
                                  
                                  {Object.keys(rawStats).length > 0 && (
                                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                                      <div className="font-medium text-gray-700 mb-1">Raw NFL Stats (for fantasy calculation):</div>
                                      {Object.entries(rawStats).map(([playerId, stats]: [string, any]) => (
                                        <div key={playerId} className="text-gray-600">
                                          Player {playerId}: {Object.entries(stats)
                                            .filter(([_, value]) => typeof value === 'number' && value > 0)
                                            .map(([key, value]) => `${key}: ${value}`)
                                            .join(', ')}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  
                                  {isScoring && (
                                    <div className="mt-2 p-1 bg-green-100 rounded text-xs text-green-800 font-medium">
                                      🏈 Scoring Play
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        
                        <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-700">
                          <div className="font-medium mb-1">Fantasy Integration Ready:</div>
                          <div>• Raw NFL stats extracted from Tank01 playerStats</div>
                          <div>• Fantasy points calculated using league-specific scoring rules</div>
                          <div>• Tank01's fantasy points ignored (league scoring varies)</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>}

          {/* API Evaluation Summary */}
          <div className="p-4 border border-gray-200 rounded-lg bg-slate-800">
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
    </div>;
}