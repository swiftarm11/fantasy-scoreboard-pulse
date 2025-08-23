import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { ScrollArea } from './ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  ChevronDown, 
  Copy, 
  Trash2, 
  Download, 
  RefreshCw,
  AlertTriangle,
  Info,
  XCircle,
  Bug
} from 'lucide-react';
import { yahooLogger } from '../utils/yahooLogger';
import { yahooOAuth } from '../utils/yahooOAuth';
import { toast } from './ui/use-toast';

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: string;
  message: string;
  data?: any;
}

export const YahooDebugPanel = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');

  useEffect(() => {
    const updateLogs = (newLogs: LogEntry[]) => setLogs(newLogs);
    yahooLogger.addListener(updateLogs);
    setLogs(yahooLogger.getLogs());

    return () => yahooLogger.removeListener(updateLogs);
  }, []);

  // Memoize current status to prevent infinite re-renders
  const currentStatus = useMemo(() => {
    try {
      return {
        isConnected: yahooOAuth.isConnected(),
        isConfigured: yahooOAuth.isConfigured(),
        hasTokens: !!yahooOAuth.getStoredTokens(),
        hasUserInfo: !!yahooOAuth.getStoredUserInfo()
      };
    } catch (error) {
      // Fallback if any of the Yahoo methods fail
      return {
        isConnected: false,
        isConfigured: false,
        hasTokens: false,
        hasUserInfo: false
      };
    }
  }, [logs.length]); // Re-calculate when logs change (which indicates activity)

  const filteredLogs = useMemo(() => 
    logs.filter(log => selectedLevel === 'ALL' || log.level === selectedLevel),
    [logs, selectedLevel]
  );

  const handleClearTokens = useCallback(() => {
    yahooOAuth.disconnect();
    yahooLogger.info('DEBUG_PANEL', 'Manually cleared all Yahoo tokens and data');
    toast({
      title: 'Tokens Cleared',
      description: 'All Yahoo OAuth tokens have been cleared. Re-authentication required.'
    });
  }, []);

  const handleRefreshTokens = useCallback(async () => {
    try {
      yahooLogger.info('DEBUG_PANEL', 'Manual token refresh requested');
      const tokens = await yahooOAuth.refreshTokens();
      toast({
        title: 'Tokens Refreshed',
        description: 'Yahoo OAuth tokens have been successfully refreshed.'
      });
    } catch (error) {
      toast({
        title: 'Refresh Failed',
        description: error instanceof Error ? error.message : 'Token refresh failed',
        variant: 'destructive'
      });
    }
  }, []);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: 'Copied',
        description: 'Debug information copied to clipboard'
      });
    });
  }, []);

  const exportLogs = useCallback(() => {
    const logsJson = yahooLogger.exportLogs();
    const blob = new Blob([logsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yahoo-debug-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const getLogIcon = useCallback((level: string) => {
    switch (level) {
      case 'ERROR': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'WARN': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'INFO': return <Info className="h-4 w-4 text-blue-500" />;
      case 'DEBUG': return <Bug className="h-4 w-4 text-gray-500" />;
      default: return null;
    }
  }, []);

  const getLevelBadgeVariant = useCallback((level: string) => {
    switch (level) {
      case 'ERROR': return 'destructive';
      case 'WARN': return 'secondary';
      case 'INFO': return 'default';
      case 'DEBUG': return 'outline';
      default: return 'outline';
    }
  }, []);

  return (
    <Card className="fixed bottom-4 left-4 w-96 max-h-96 z-50 shadow-lg">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between text-sm">
              Yahoo Debug Panel
              <div className="flex items-center gap-2">
                <Badge variant={currentStatus.isConnected ? 'default' : 'destructive'} className="text-xs">
                  {currentStatus.isConnected ? 'Connected' : 'Disconnected'}
                </Badge>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4 text-xs">
            <Tabs defaultValue="status" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="status">Status</TabsTrigger>
                <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
                <TabsTrigger value="actions">Actions</TabsTrigger>
              </TabsList>
              
              <TabsContent value="status" className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span>Connected:</span>
                    <Badge variant={currentStatus.isConnected ? 'default' : 'destructive'}>
                      {currentStatus.isConnected ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Configured:</span>
                    <Badge variant={currentStatus.isConfigured ? 'default' : 'destructive'}>
                      {currentStatus.isConfigured ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Has Tokens:</span>
                    <Badge variant={currentStatus.hasTokens ? 'default' : 'secondary'}>
                      {currentStatus.hasTokens ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Has User Info:</span>
                    <Badge variant={currentStatus.hasUserInfo ? 'default' : 'secondary'}>
                      {currentStatus.hasUserInfo ? 'Yes' : 'No'}
                    </Badge>
                  </div>
                </div>
                
                {currentStatus.hasTokens && (
                  <div className="mt-2 p-2 bg-muted rounded text-xs">
                    <div className="font-semibold mb-1">Token Info:</div>
                    {useMemo(() => {
                      try {
                        const tokens = yahooOAuth.getStoredTokens();
                        if (!tokens) return null;
                        return (
                          <div className="space-y-1">
                            <div>Expires: {tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toLocaleString() : 'Unknown'}</div>
                            <div>Type: {tokens.token_type || 'Unknown'}</div>
                            <div className="text-orange-600">
                              {tokens.expires_in ? (Date.now() + tokens.expires_in * 1000 <= Date.now() ? 'EXPIRED' : 
                               Date.now() + 300000 >= Date.now() + tokens.expires_in * 1000 ? 'EXPIRES SOON' : 'VALID') : 'UNKNOWN'}
                            </div>
                          </div>
                        );
                      } catch (error) {
                        return <div className="text-destructive">Error loading token info</div>;
                      }
                    }, [currentStatus.hasTokens])}
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="logs" className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    {['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'].map(level => (
                      <Button
                        key={level}
                        size="sm"
                        variant={selectedLevel === level ? 'default' : 'outline'}
                        onClick={() => setSelectedLevel(level)}
                        className="h-6 px-2 text-xs"
                      >
                        {level}
                      </Button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => yahooLogger.clearLogs()}
                    className="h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                
                <ScrollArea className="h-32">
                  <div className="space-y-1">
                    {filteredLogs.map((log, index) => (
                      <div key={index} className="p-2 border rounded text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1">
                            {getLogIcon(log.level)}
                            <Badge variant={getLevelBadgeVariant(log.level)} className="text-xs px-1">
                              {log.level}
                            </Badge>
                            <span className="font-mono text-xs">{log.category}</span>
                          </div>
                          <span className="text-muted-foreground text-xs">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="text-xs">{log.message}</div>
                        {log.data && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-muted-foreground">Data</summary>
                            <pre className="mt-1 p-1 bg-muted rounded text-xs overflow-x-auto">
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              
              <TabsContent value="actions" className="space-y-2">
                <div className="grid grid-cols-1 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleClearTokens}
                    className="flex items-center gap-1"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear All Tokens
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRefreshTokens}
                    className="flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh Tokens
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(yahooLogger.exportLogs())}
                    className="flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copy Logs
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportLogs}
                    className="flex items-center gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Export Logs
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};