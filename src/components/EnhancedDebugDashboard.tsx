import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { RefreshCw, Database, Activity, Zap, AlertCircle } from 'lucide-react';
import { debugLogger } from '../utils/debugLogger';

interface DebugStats {
  playerMapping: {
    totalMappings: number;
    activeCache: boolean;
    lastSync: string | null;
    cacheSize: number;
  };
  eventAttribution: {
    rosterCacheSize: number;
    scoringCacheSize: number;
    playerMappingCacheSize: number;
    isActive: boolean;
  };
  liveEvents: {
    isPolling: boolean;
    recentEventsCount: number;
    lastEventTime: string | null;
    status: string;
  };
  tank01API: {
    status: 'connected' | 'error' | 'unknown';
    lastCall: string | null;
    errorMessage?: string;
  };
}

export const EnhancedDebugDashboard = () => {
  const [stats, setStats] = useState<DebugStats>({
    playerMapping: {
      totalMappings: 0,
      activeCache: false,
      lastSync: null,
      cacheSize: 0
    },
    eventAttribution: {
      rosterCacheSize: 0,
      scoringCacheSize: 0,
      playerMappingCacheSize: 0,
      isActive: false
    },
    liveEvents: {
      isPolling: false,
      recentEventsCount: 0,
      lastEventTime: null,
      status: 'Not initialized'
    },
    tank01API: {
      status: 'unknown',
      lastCall: null
    }
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStats = async () => {
    setIsRefreshing(true);
    
    try {
      // Get stats from window services if available
      const windowServices = (window as any).liveEventsDebug;
      if (windowServices) {
        const serviceStatus = windowServices.getStatus();
        const cacheDetails = windowServices.getCacheDetails();
        
        setStats({
          playerMapping: {
            totalMappings: cacheDetails.storage?.totalEvents || 0,
            activeCache: cacheDetails.storage?.isActive || false,
            lastSync: cacheDetails.storage?.lastUpdate || null,
            cacheSize: cacheDetails.storage?.cacheSize || 0
          },
          eventAttribution: {
            rosterCacheSize: cacheDetails.attribution?.rosterCacheSize || 0,
            scoringCacheSize: cacheDetails.attribution?.scoringCacheSize || 0,
            playerMappingCacheSize: cacheDetails.attribution?.playerMappingCacheSize || 0,
            isActive: cacheDetails.attribution?.isActive || false
          },
          liveEvents: {
            isPolling: serviceStatus.hybridNFL?.isPolling || false,
            recentEventsCount: windowServices.getRecentEvents()?.length || 0,
            lastEventTime: serviceStatus.liveManager?.lastEventTime || null,
            status: serviceStatus.liveManager?.status || 'Not initialized'
          },
          tank01API: {
            status: serviceStatus.hybridNFL?.tank01Status?.isPolling ? 'connected' : 
                   serviceStatus.hybridNFL?.tank01Status?.emergencyStop ? 'error' : 'unknown',
            lastCall: serviceStatus.hybridNFL?.lastCall || null,
            errorMessage: serviceStatus.hybridNFL?.lastError
          }
        });
      }
      
      debugLogger.info('DEBUG_DASHBOARD', 'Stats refreshed', { timestamp: new Date().toISOString() });
    } catch (error) {
      debugLogger.error('DEBUG_DASHBOARD', 'Failed to refresh stats', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const triggerManualPoll = async () => {
    try {
      const windowServices = (window as any).liveEventsDebug;
      if (windowServices?.manualPoll) {
        await windowServices.manualPoll();
        debugLogger.info('DEBUG_DASHBOARD', 'Manual poll triggered');
        setTimeout(refreshStats, 1000); // Refresh stats after poll
      }
    } catch (error) {
      debugLogger.error('DEBUG_DASHBOARD', 'Failed to trigger manual poll', error);
    }
  };

  const triggerTestEvent = async () => {
    try {
      const windowServices = (window as any).liveEventsDebug;
      if (windowServices?.testEvent) {
        await windowServices.testEvent();
        debugLogger.info('DEBUG_DASHBOARD', 'Test event triggered');
        setTimeout(refreshStats, 1000);
      }
    } catch (error) {
      debugLogger.error('DEBUG_DASHBOARD', 'Failed to trigger test event', error);
    }
  };

  const getStatusBadge = (status: string | boolean, type: 'success' | 'error' | 'warning' = 'success') => {
    if (typeof status === 'boolean') {
      return <Badge variant={status ? 'default' : 'destructive'}>{status ? 'Active' : 'Inactive'}</Badge>;
    }
    
    const variant = type === 'error' ? 'destructive' : type === 'warning' ? 'outline' : 'default';
    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Live Events Debug Dashboard</h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={refreshStats}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attribution">Attribution</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Player Database</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Mappings:</span>
                    <Badge variant="outline">{stats.playerMapping.totalMappings}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Cache:</span>
                    {getStatusBadge(stats.playerMapping.activeCache)}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Cache Size:</span>
                    <Badge variant="outline">{stats.playerMapping.cacheSize}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Live Events</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Polling:</span>
                    {getStatusBadge(stats.liveEvents.isPolling)}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Recent Events:</span>
                    <Badge variant="outline">{stats.liveEvents.recentEventsCount}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Status:</span>
                    {getStatusBadge(stats.liveEvents.status, 'warning')}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Event Attribution</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Rosters:</span>
                    <Badge variant="outline">{stats.eventAttribution.rosterCacheSize}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Scoring:</span>
                    <Badge variant="outline">{stats.eventAttribution.scoringCacheSize}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Players:</span>
                    <Badge variant="outline">{stats.eventAttribution.playerMappingCacheSize}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tank01 API</CardTitle>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Status:</span>
                    {getStatusBadge(stats.tank01API.status, stats.tank01API.status === 'error' ? 'error' : 'success')}
                  </div>
                  {stats.tank01API.lastCall && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Last Call:</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(stats.tank01API.lastCall).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                  {stats.tank01API.errorMessage && (
                    <div className="text-xs text-destructive">
                      {stats.tank01API.errorMessage}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Event Attribution Details</CardTitle>
              <CardDescription>Cache statistics for event-to-player attribution</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Roster Cache Size:</span>
                  <Badge>{stats.eventAttribution.rosterCacheSize} rosters</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Scoring Rules Cached:</span>
                  <Badge>{stats.eventAttribution.scoringCacheSize} leagues</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Player Mappings:</span>
                  <Badge>{stats.eventAttribution.playerMappingCacheSize} players</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Attribution Active:</span>
                  {getStatusBadge(stats.eventAttribution.isActive)}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pipeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Data Pipeline Status</CardTitle>
              <CardDescription>End-to-end data flow monitoring</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium mb-2">1. Player Database</div>
                  <div className="ml-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Mappings:</span>
                      <Badge variant="outline">{stats.playerMapping.totalMappings}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Cache:</span>
                      {getStatusBadge(stats.playerMapping.activeCache)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">2. NFL Data Source</div>
                  <div className="ml-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>API Status:</span>
                      {getStatusBadge(stats.tank01API.status, stats.tank01API.status === 'error' ? 'error' : 'success')}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Polling:</span>
                      {getStatusBadge(stats.liveEvents.isPolling)}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">3. Event Attribution</div>
                  <div className="ml-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Active:</span>
                      {getStatusBadge(stats.eventAttribution.isActive)}
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Recent Events:</span>
                      <Badge variant="outline">{stats.liveEvents.recentEventsCount}</Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">4. Dashboard Display</div>
                  <div className="ml-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Status:</span>
                      {getStatusBadge(stats.liveEvents.status, 'warning')}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manual Controls</CardTitle>
              <CardDescription>Trigger manual operations for testing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={triggerManualPoll} className="w-full">
                <RefreshCw className="h-4 w-4 mr-2" />
                Force Data Refresh
              </Button>
              <Button onClick={triggerTestEvent} variant="outline" className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                Trigger Test Event
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};