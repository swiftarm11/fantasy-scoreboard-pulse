import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { databasePlayerMappingService, DatabasePlayerMapping, SyncMetadata } from '@/services/DatabasePlayerMappingService';
import { Loader2, Database, Search, RefreshCw, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface SyncStats {
  lastSync: Date | null;
  totalPlayers: number;
  activePlayers: number;
  syncHistory: SyncMetadata[];
  needsSync: boolean;
}

export const PlayerMappingDebugPanel: React.FC = () => {
  const [stats, setStats] = useState<SyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPlatform, setSearchPlatform] = useState<'espn' | 'yahoo' | 'sleeper'>('espn');
  const [searchResult, setSearchResult] = useState<DatabasePlayerMapping | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      await databasePlayerMappingService.initialize();
      const syncStats = await databasePlayerMappingService.getSyncStats();
      setStats(syncStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
      toast.error('Failed to load player mapping stats');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (forceUpdate = false) => {
    setSyncing(true);
    try {
      const result = await databasePlayerMappingService.syncAllPlayers(forceUpdate);
      toast.success(`Player sync completed! ${result.active_players} active players synced.`);
      await loadStats(); // Refresh stats
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error(error instanceof Error ? error.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setSearchLoading(true);
    try {
      const result = await databasePlayerMappingService.findPlayerByPlatformId(searchPlatform, searchQuery.trim());
      setSearchResult(result);
      
      if (!result) {
        toast.info(`No player found for ${searchPlatform.toUpperCase()} ID: ${searchQuery}`);
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Player search failed');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleCleanup = async () => {
    try {
      const deletedCount = await databasePlayerMappingService.cleanupInactivePlayers();
      toast.success(`Cleaned up ${deletedCount} inactive players`);
      await loadStats();
    } catch (error) {
      console.error('Cleanup failed:', error);
      toast.error('Cleanup failed');
    }
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
  };

  const getSyncStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
      case 'in_progress': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading player mapping stats...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Player Mapping Database Status
          </CardTitle>
          <CardDescription>
            Monitor and manage the Tank01 player mapping database
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats && (
            <div className="space-y-6">
              {/* Status Overview */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{stats.totalPlayers}</div>
                  <div className="text-sm text-muted-foreground">Total Players</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{stats.activePlayers}</div>
                  <div className="text-sm text-muted-foreground">Active Players</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-muted-foreground">Last Sync</div>
                  <div className="text-sm font-medium">{formatDate(stats.lastSync)}</div>
                </div>
                <div className="text-center">
                  <Badge variant={stats.needsSync ? "destructive" : "default"}>
                    {stats.needsSync ? "Sync Needed" : "Up to Date"}
                  </Badge>
                </div>
              </div>

              {/* Sync Controls */}
              <div className="flex gap-2 flex-wrap">
                <Button 
                  onClick={() => handleSync(false)} 
                  disabled={syncing || !stats.needsSync}
                  className="flex items-center gap-2"
                >
                  {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {syncing ? 'Syncing...' : 'Sync Players'}
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={() => handleSync(true)} 
                  disabled={syncing}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Force Sync
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={handleCleanup}
                  className="flex items-center gap-2"
                >
                  <Database className="h-4 w-4" />
                  Cleanup
                </Button>
                
                <Button 
                  variant="outline" 
                  onClick={loadStats}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {/* Sync Progress Alert */}
              {syncing && (
                <Alert>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <AlertDescription>
                    Syncing player data from Tank01 API. This may take a few minutes...
                    <div className="mt-2">
                      <Progress value={33} className="w-full" />
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Tabs defaultValue="search" className="w-full">
                <TabsList>
                  <TabsTrigger value="search">Player Search</TabsTrigger>
                  <TabsTrigger value="history">Sync History</TabsTrigger>
                </TabsList>
                
                <TabsContent value="search" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Search className="h-4 w-4" />
                        Player Lookup Tester
                      </CardTitle>
                      <CardDescription>
                        Test player ID lookups across platforms
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex gap-2">
                        <select 
                          value={searchPlatform} 
                          onChange={(e) => setSearchPlatform(e.target.value as 'espn' | 'yahoo' | 'sleeper')}
                          className="border rounded px-3 py-2"
                        >
                          <option value="espn">ESPN ID</option>
                          <option value="yahoo">Yahoo ID</option>
                          <option value="sleeper">Sleeper ID</option>
                        </select>
                        <Input 
                          placeholder={`Enter ${searchPlatform.toUpperCase()} player ID`}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        />
                        <Button onClick={handleSearch} disabled={searchLoading}>
                          {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        </Button>
                      </div>
                      
                      {searchResult && (
                        <Card>
                          <CardContent className="p-4">
                            <div className="space-y-2">
                              <div><strong>Name:</strong> {searchResult.name}</div>
                              <div><strong>Team:</strong> {searchResult.team}</div>
                              <div><strong>Position:</strong> {searchResult.position}</div>
                              <div><strong>Tank01 ID:</strong> {searchResult.tank01_id}</div>
                              <div><strong>ESPN ID:</strong> {searchResult.espn_id || 'N/A'}</div>
                              <div><strong>Yahoo ID:</strong> {searchResult.yahoo_id || 'N/A'}</div>
                              <div><strong>Sleeper ID:</strong> {searchResult.sleeper_id || 'N/A'}</div>
                              <div><strong>Active:</strong> {searchResult.is_active ? 'Yes' : 'No'}</div>
                              <div><strong>Last Game:</strong> {searchResult.last_game_played || 'N/A'}</div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                
                <TabsContent value="history" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Recent Sync History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {stats.syncHistory.length === 0 ? (
                          <div className="text-muted-foreground text-center py-4">
                            No sync history available
                          </div>
                        ) : (
                          stats.syncHistory.map((sync) => (
                            <div key={sync.id} className="flex items-center justify-between p-3 border rounded">
                              <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${getSyncStatusColor(sync.status)}`} />
                                <div>
                                  <div className="font-medium">{formatDate(sync.started_at)}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {sync.total_players ? `${sync.total_players} total, ${sync.active_players} active` : 'In progress...'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {sync.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                                {sync.status === 'failed' && <AlertCircle className="h-4 w-4 text-red-500" />}
                                {sync.status === 'in_progress' && <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />}
                                <Badge variant="outline">{sync.status}</Badge>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};