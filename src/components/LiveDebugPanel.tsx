import { useState } from 'react';
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
  Upload, 
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

interface LiveDebugPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const LiveDebugPanel = ({ open, onOpenChange }: LiveDebugPanelProps) => {
  const [rawDataView, setRawDataView] = useState<any>(null);
  const [testResults, setTestResults] = useState<string>('');
  const [isRunningTest, setIsRunningTest] = useState(false);

  const { isConnected: yahooConnected } = useYahooOAuth();
  const yahooData = useYahooData();

  // Test API connections
  const runConnectionTest = async (platform: 'yahoo' | 'sleeper' | 'both') => {
    setIsRunningTest(true);
    setTestResults('Running connection tests...\n\n');
    
    debugLogger.info('DEBUG_PANEL', `Starting connection test for ${platform}`);

    try {
      if (platform === 'yahoo' || platform === 'both') {
        setTestResults(prev => prev + '🔍 Testing Yahoo connection...\n');
        
        if (!yahooConnected) {
          setTestResults(prev => prev + '❌ Yahoo: Not connected\n');
        } else {
          try {
            // Test Yahoo connection by fetching available leagues
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

      if (platform === 'sleeper' || platform === 'both') {
        setTestResults(prev => prev + '\n🔍 Testing Sleeper connection...\n');
        
        try {
          // Test Sleeper API
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

      setTestResults(prev => prev + '\n✨ Test complete!\n');
      
    } catch (error) {
      setTestResults(prev => prev + `\n💥 Test failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    } finally {
      setIsRunningTest(false);
    }
  };

  // View raw API response
  const viewRawData = (platform: 'yahoo' | 'sleeper') => {
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="tests">Connection Tests</TabsTrigger>
            <TabsTrigger value="data">Raw Data</TabsTrigger>
            <TabsTrigger value="emergency">Emergency Controls</TabsTrigger>
            <TabsTrigger value="logs">Debug Logs</TabsTrigger>
          </TabsList>

          {/* Connection Tests Tab */}
          <TabsContent value="tests" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">API Connection Tests</CardTitle>
                <CardDescription>
                  Test connections to fantasy platforms to ensure live data is flowing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
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
                    onClick={() => runConnectionTest('both')}
                    disabled={isRunningTest}
                  >
                    <TestTube className="w-4 h-4 mr-2" />
                    Test All Platforms
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
                  View actual data received from APIs for debugging
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