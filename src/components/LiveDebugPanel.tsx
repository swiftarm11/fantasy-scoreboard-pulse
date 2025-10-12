import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Bug, 
  RefreshCw, 
  Download, 
  TestTube, 
  AlertTriangle,
  CheckCircle,
  Copy,
  Zap
} from 'lucide-react';
import { toast } from './ui/use-toast';
import { debugLogger } from '../utils/debugLogger';
import { useYahooData } from '../hooks/useYahooData';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { tank01NFLDataService } from '../services/Tank01NFLDataService';
import { useConfig } from '../hooks/useConfig';

interface LiveDebugPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LiveDebugPanel = ({ open, onOpenChange }: LiveDebugPanelProps) => {
  const [rawDataView, setRawDataView] = useState<any>(null);
  const [testResults, setTestResults] = useState<string>('');
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [tank01Stats, setTank01Stats] = useState(tank01NFLDataService.getServiceStatus());

  const { isConnected: yahooConnected } = useYahooOAuth();
  const yahooData = useYahooData();
  const { config } = useConfig();

  // Update Tank01 stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setTank01Stats(tank01NFLDataService.getServiceStatus());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Test API connections
  const runConnectionTest = async (platform: 'yahoo' | 'sleeper' | 'tank01' | 'all') => {
    setIsRunningTest(true);
    setTestResults('Running connection tests...\n\n');

    try {
      if (platform === 'yahoo' || platform === 'all') {
        setTestResults(prev => prev + '🔍 Testing Yahoo connection...\n');
        
        if (yahooConnected) {
          try {
            if (yahooData?.fetchAvailableLeagues) {
              await yahooData.fetchAvailableLeagues();
              setTestResults(prev => prev + '✅ Yahoo: Connection successful\n');
            } else {
              setTestResults(prev => prev + '⚠️ Yahoo: Connected but no data fetcher available\n');
            }
          } catch (error) {
            setTestResults(prev => prev + `❌ Yahoo: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
          }
        }
      }

      if (platform === 'sleeper' || platform === 'all') {
        setTestResults(prev => prev + '\n🔍 Testing Sleeper connection...\n');
        
        try {
          const testResult = await debugLogger.testConnection();
          if (testResult.success) {
            setTestResults(prev => prev + `✅ Sleeper: ${testResult.message}\n`);
          } else {
            setTestResults(prev => prev + `❌ Sleeper: ${testResult.message}\n`);
          }
        } catch (error) {
          setTestResults(prev => prev + `❌ Sleeper: Connection failed - ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        }
      }

      if (platform === 'tank01' || platform === 'all') {
        setTestResults(prev => prev + '\n🔍 Testing Tank01 connection...\n');
        
        try {
          const status = tank01NFLDataService.getServiceStatus();
          setTestResults(prev => prev + `✅ Tank01: Service active (${status.playerCache.size} players cached)\n`);
          setTestResults(prev => prev + `📊 Polling Status: ${status.isPolling ? 'Active' : 'Inactive'}\n`);
          setTestResults(prev => prev + `📅 Current NFL Week: ${status.currentWeek || 'Unknown'}\n`);
        } catch (error) {
          setTestResults(prev => prev + `❌ Tank01: Connection failed - ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        }
      }

      setTestResults(prev => prev + '\n✨ Test complete!\n');
      
    } catch (error) {
      setTestResults(prev => prev + `\n💥 Test failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    } finally {
      setIsRunningTest(false);
    }
  };

  // View raw API response
  const viewRawData = (platform: 'yahoo' | 'sleeper' | 'tank01') => {
    debugLogger.info('DEBUG_PANEL', `Viewing raw data for ${platform}`);
    
    if (platform === 'yahoo' && yahooData) {
      setRawDataView({
        platform: 'Yahoo',
        data: {
          leagues: yahooData.leagues || [],
          availableLeagues: yahooData.availableLeagues || [],
          lastUpdated: yahooData.lastUpdated,
          error: yahooData.error
        }
      });
    } else if (platform === 'tank01') {
      setRawDataView({
        platform: 'Tank01 (Play-by-Play)',
        data: tank01NFLDataService.getServiceStatus()
      });
    } else {
      setRawDataView({
        platform: platform,
        data: 'Raw data viewing not yet implemented for this platform'
      });
    }
  };

  // Copy debug info to clipboard
  const copyDebugInfo = async () => {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      yahooConnected,
      yahooData: yahooData ? {
        hasLeagues: !!yahooData.leagues?.length,
        leagueCount: yahooData.leagues?.length || 0,
        lastUpdated: yahooData.lastUpdated,
        error: yahooData.error
      } : null,
      tank01Data: tank01NFLDataService.getServiceStatus(),
      logs: debugLogger.getLogs().slice(0, 10) // Last 10 logs
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
      toast({
        title: 'Debug Info Copied',
        description: 'Debug information copied to clipboard',
      });
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy debug info to clipboard',
        variant: 'destructive',
      });
    }
  };

  // Emergency force refresh all data
  const emergencyRefresh = async () => {
    debugLogger.warning('DEBUG_PANEL', 'Emergency refresh triggered');
    
    try {
      if (yahooConnected && yahooData?.fetchAvailableLeagues) {
        await yahooData.fetchAvailableLeagues();
      }
      
      // Refresh Tank01 data
      try {
        await tank01NFLDataService.manualPoll();
      } catch (error) {
        debugLogger.error('DEBUG_PANEL', 'Tank01 refresh failed', error);
      }
      
      toast({
        title: 'Emergency Refresh Complete',
        description: 'All available data has been refreshed',
      });
    } catch (error) {
      toast({
        title: 'Emergency Refresh Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Start/Stop Tank01 polling
  const toggleTank01Polling = async () => {
    try {
      if (tank01NFLDataService.getServiceStatus().isPolling) {
        tank01NFLDataService.stopPolling();
        toast({
          title: 'Tank01 Polling Stopped',
          description: 'NFL game monitoring has been stopped'
        });
      } else {
        await tank01NFLDataService.startPolling();
        toast({
          title: 'Tank01 Polling Started',
          description: 'Now monitoring NFL games for live scoring events'
        });
      }
      setTank01Stats(tank01NFLDataService.getServiceStatus());
    } catch (error) {
      toast({
        title: 'Tank01 Polling Error',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive'
      });
    }
  };

  // Emergency stop all polling
  const emergencyStopPolling = () => {
    tank01NFLDataService.emergencyStopPolling();
    setTank01Stats(tank01NFLDataService.getServiceStatus());
    toast({
      title: 'EMERGENCY STOP ACTIVATED',
      description: 'All API polling has been immediately halted',
      variant: 'destructive'
    });
  };

  // Reset emergency stop
  const resetEmergencyStop = () => {
    tank01NFLDataService.resetEmergencyStop();
    setTank01Stats(tank01NFLDataService.getServiceStatus());
    toast({
      title: 'Emergency Stop Reset',
      description: 'Polling can now be restarted',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5" />
            Live Game Debug Panel
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="tests" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="tests">Connection Tests</TabsTrigger>
            <TabsTrigger value="data">Raw Data</TabsTrigger>
            <TabsTrigger value="tank01">Tank01</TabsTrigger>
            <TabsTrigger value="emergency">Emergency</TabsTrigger>
            <TabsTrigger value="logs">Debug Logs</TabsTrigger>
          </TabsList>

          {/* Connection Tests Tab */}
          <TabsContent value="tests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform Connection Tests</CardTitle>
                <CardDescription>
                  Test API connections to Yahoo, Sleeper, and Tank01 services
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Button 
                    onClick={() => runConnectionTest('yahoo')}
                    disabled={isRunningTest}
                    variant="outline"
                  >
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Yahoo
                  </Button>
                  <Button 
                    onClick={() => runConnectionTest('sleeper')}
                    disabled={isRunningTest}
                    variant="outline"
                  >
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Sleeper
                  </Button>
                  <Button 
                    onClick={() => runConnectionTest('tank01')}
                    disabled={isRunningTest}
                    variant="outline"
                  >
                    <TestTube className="w-4 h-4 mr-2" />
                    Test Tank01
                  </Button>
                  <Button 
                    onClick={() => runConnectionTest('all')}
                    disabled={isRunningTest}
                  >
                    <TestTube className="w-4 h-4 mr-2" />
                    Test All
                  </Button>
                </div>

                {testResults && (
                  <div className="mt-4">
                    <ScrollArea className="h-48 w-full border rounded-lg p-3 bg-muted/30">
                      <pre className="text-sm whitespace-pre-wrap font-mono">
                        {testResults}
                      </pre>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Raw Data Tab */}
          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Raw API Responses</CardTitle>
                <CardDescription>
                  View raw JSON responses from each platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={() => viewRawData('yahoo')} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    View Yahoo Data
                  </Button>
                  <Button onClick={() => viewRawData('sleeper')} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    View Sleeper Data
                  </Button>
                  <Button onClick={() => viewRawData('tank01')} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    View Tank01 Data
                  </Button>
                </div>

                {rawDataView && (
                  <Card className="bg-muted/30">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        {rawDataView.platform} Raw Data
                        <Button size="sm" variant="ghost" onClick={() => setRawDataView(null)}>
                          ✕
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="h-64 w-full">
                        <pre className="text-xs font-mono whitespace-pre-wrap">
                          {JSON.stringify(rawDataView.data, null, 2)}
                        </pre>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tank01 Data Tab */}
          <TabsContent value="tank01" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tank01 NFL Data Service</CardTitle>
                <CardDescription>
                  Monitor Tank01 play-by-play data polling and player mapping
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="text-sm font-medium">Live Events Manager</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Status: {(window as any).liveEventsManager ? 
                        <Badge variant="secondary">Ready</Badge> : 
                        <Badge variant="destructive">Not Initialized</Badge>
                      }
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="text-sm font-medium">Tank01 NFL Service</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Status: {(window as any).tank01NFLDataService ? 
                        <Badge variant="secondary">Ready</Badge> : 
                        <Badge variant="destructive">Not Initialized</Badge>
                      }
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="text-sm font-medium">Event Attribution</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Status: {(window as any).eventAttributionService ? 
                        <Badge variant="secondary">Ready</Badge> : 
                        <Badge variant="destructive">Not Initialized</Badge>
                      }
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={() => {
                      if ((window as any).tank01NFLDataService?.manualPoll) {
                        (window as any).tank01NFLDataService.manualPoll();
                        toast({ title: 'Manual Poll Triggered', description: 'Fetching latest NFL data...' });
                      } else {
                        toast({ title: 'Service Not Ready', description: 'Tank01 service not initialized', variant: 'destructive' });
                      }
                    }}
                    variant="outline"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Manual Poll Now
                  </Button>
                  <Button 
                    onClick={() => {
                      if ((window as any).liveEventsManager?.triggerTestEvent) {
                        (window as any).liveEventsManager.triggerTestEvent();
                        toast({ title: 'Test Event Triggered', description: 'Check console for attribution results' });
                      } else {
                        toast({ title: 'Service Not Ready', description: 'Live events manager not initialized', variant: 'destructive' });
                      }
                    }}
                    variant="outline"
                  >
                    <TestTube className="w-4 h-4 mr-2" />
                    Trigger Test Event
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <h4 className="font-medium text-sm mb-2">Polling Status</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Status:</span>
                        <Badge variant={tank01Stats.isPolling ? 'default' : 'secondary'}>
                          {tank01Stats.emergencyStop ? 'EMERGENCY STOP' : tank01Stats.isPolling ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Players Cached:</span>
                        <span>{tank01Stats.playerCache.size}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Current Week:</span>
                        <span>{tank01Stats.currentWeek || 'Unknown'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <h4 className="font-medium text-sm mb-2">Request Metrics</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Total Requests:</span>
                        <span>{tank01Stats.requestMetrics.totalRequests}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Daily Quota:</span>
                        <span>{tank01Stats.dailyQuota.used} / {tank01Stats.dailyQuota.limit}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mb-4">
                  <Button 
                    onClick={toggleTank01Polling}
                    variant={tank01Stats.isPolling ? 'destructive' : 'default'}
                    disabled={tank01Stats.emergencyStop}
                  >
                    {tank01Stats.isPolling ? (
                      <>
                        <AlertTriangle className="w-4 h-4 mr-2" />
                        Stop Polling
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Start Polling
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    onClick={emergencyStopPolling}
                    variant="destructive"
                    disabled={tank01Stats.emergencyStop}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    EMERGENCY STOP
                  </Button>
                  
                  {tank01Stats.emergencyStop && (
                    <Button 
                      onClick={resetEmergencyStop}
                      variant="outline"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reset Emergency Stop
                    </Button>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-muted/30 border">
                  <h4 className="font-medium text-sm mb-2">Live Game Detection</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Tank01 API is polled during game hours to detect scoring events in real-time. 
                    Events are matched to fantasy rosters using player ID mappings.
                  </p>
                  <div className="text-xs space-y-1">
                    <div>• Scoring plays (TDs, FGs, safeties)</div>
                    <div>• Big plays (20+ yard gains)</div>
                    <div>• Turnovers (fumbles, interceptions)</div>
                    <div>• Statistical milestones</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Emergency Controls Tab */}
          <TabsContent value="emergency" className="space-y-4">
            <Card className="border-warning">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Emergency Controls
                </CardTitle>
                <CardDescription>
                  Use these controls if data stops flowing during live games
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={emergencyRefresh}
                  variant="outline"
                  className="w-full"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Emergency Refresh All Data
                </Button>

                <Button 
                  onClick={copyDebugInfo}
                  variant="outline" 
                  className="w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Debug Info for Support
                </Button>

                <div className="p-3 rounded-lg bg-muted/50 border">
                  <h4 className="font-medium text-sm mb-2">Quick Status Check:</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                      {yahooConnected ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      )}
                      <span>Yahoo: {yahooConnected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span>Sleeper: Available (public API)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {tank01Stats.isPolling ? (
                        <CheckCircle className="w-4 h-4 text-success" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-warning" />
                      )}
                      <span>Tank01: {tank01Stats.isPolling ? `Polling (${tank01Stats.playerCache.size} players)` : 'Not polling'}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Debug Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Debug Logs</CardTitle>
                <CardDescription>
                  Real-time logging from the application - useful for tracking down issues
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64 w-full border rounded-lg p-3 bg-muted/30">
                  <div className="space-y-2 text-xs font-mono">
                    {debugLogger.getLogs().slice(0, 20).map((log) => (
                      <div key={log.id} className="flex gap-2">
                        <span className="text-muted-foreground">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <Badge variant={
                          log.type === 'error' ? 'destructive' : 
                          log.type === 'warning' ? 'secondary' : 
                          'outline'
                        } className="text-xs">
                          {log.type}
                        </Badge>
                        <span className="text-primary font-medium">{log.category}</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
