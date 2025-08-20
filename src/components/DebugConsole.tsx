import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { Copy, Trash2, ChevronDown, TestTube, Wifi, Info } from 'lucide-react';
import { debugLogger, DebugLogEntry } from '../utils/debugLogger';
import { toast } from './ui/use-toast';

interface DebugConsoleProps {
  debugMode: boolean;
  onToggleDebug: (enabled: boolean) => void;
}

export const DebugConsole = ({ debugMode, onToggleDebug }: DebugConsoleProps) => {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    testing: boolean;
    result?: { success: boolean; message: string; details: any };
  }>({ testing: false });

  useEffect(() => {
    debugLogger.setDebugMode(debugMode);
    const unsubscribe = debugLogger.onLogsUpdate(setLogs);
    setLogs(debugLogger.getLogs());
    return unsubscribe;
  }, [debugMode]);

  const handleCopyLogs = () => {
    const logData = debugLogger.exportLogs();
    navigator.clipboard.writeText(logData).then(() => {
      toast({
        title: 'Success',
        description: 'Debug logs copied to clipboard',
      });
    });
  };

  const handleClearLogs = () => {
    debugLogger.clearLogs();
    toast({
      title: 'Success',
      description: 'Debug logs cleared',
    });
  };

  const handleTestConnection = async () => {
    setConnectionStatus({ testing: true });
    const result = await debugLogger.testConnection();
    setConnectionStatus({ testing: false, result });
  };

  const handleShowEnvironmentInfo = () => {
    const envInfo = debugLogger.logEnvironmentInfo();
    toast({
      title: 'Environment Info',
      description: 'Environment information logged to console',
    });
  };

  const getTypeColor = (type: DebugLogEntry['type']) => {
    switch (type) {
      case 'success': return 'bg-green-100 text-green-800 border-green-200';
      case 'error': return 'bg-red-100 text-red-800 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'api': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: DebugLogEntry['type']) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'api': return '🌐';
      default: return '🔍';
    }
  };

  if (!debugMode) {
    return null;
  }

  return (
    <Card className="w-full">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TestTube className="h-5 w-5" />
                  Debug Console
                  <Badge variant="secondary" className="ml-2">
                    {logs.length} logs
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Real-time logging and network diagnostics
                </CardDescription>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestConnection}
                disabled={connectionStatus.testing}
              >
                <Wifi className="h-4 w-4 mr-2" />
                {connectionStatus.testing ? 'Testing...' : 'Test Connection'}
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleShowEnvironmentInfo}
              >
                <Info className="h-4 w-4 mr-2" />
                Environment Info
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyLogs}
                disabled={logs.length === 0}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Logs
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={handleClearLogs}
                disabled={logs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>

            {/* Connection Status */}
            {connectionStatus.result && (
              <div className={`p-3 rounded-lg border ${
                connectionStatus.result.success 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span>{connectionStatus.result.success ? '✅' : '❌'}</span>
                  <span className="font-medium">Connection Test:</span>
                  <span>{connectionStatus.result.message}</span>
                </div>
              </div>
            )}

            {/* Debug Logs */}
            <ScrollArea className="h-64 w-full border rounded-md p-2">
              {logs.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No debug logs yet. Perform some actions to see logs here.
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="text-sm border rounded p-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg leading-none">{getTypeIcon(log.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant="outline"
                              className={`text-xs ${getTypeColor(log.type)}`}
                            >
                              {log.category}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="font-medium mb-1">{log.message}</div>
                          {log.data && (
                            <details className="text-xs text-muted-foreground">
                              <summary className="cursor-pointer hover:text-foreground">
                                Show details
                              </summary>
                              <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto">
                                {JSON.stringify(log.data, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};