import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
import { AlertCircle, CheckCircle, Clock, RefreshCw, ChevronDown } from 'lucide-react';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { useYahooData } from '../hooks/useYahooData';
import { 
  validateYahooData, 
  validateSleeperData, 
  checkDataFreshness, 
  getFreshnessMessage,
  PlatformHealthStatus 
} from '../utils/dataValidators';
import { debugLogger } from '../utils/debugLogger';
import { toast } from './ui/use-toast';

interface DataHealthMonitorProps {
  isVisible: boolean;
}

export const DataHealthMonitor = ({ isVisible }: DataHealthMonitorProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [platformStatus, setPlatformStatus] = useState<PlatformHealthStatus[]>([]);
  const [lastCheck, setLastCheck] = useState<string>('');
  
  const { isConnected: yahooConnected } = useYahooOAuth();
  const yahooData = useYahooData();

  // Check platform health
  const checkPlatformHealth = async () => {
    debugLogger.info('DATA_HEALTH', 'Running platform health check');
    
    const statuses: PlatformHealthStatus[] = [];
    
    // Yahoo Health Check
    if (yahooConnected && yahooData) {
      const lastUpdated = yahooData.lastUpdated || null;
      const freshness = checkDataFreshness(lastUpdated);
      
      // Get recent yahoo data for validation
      const recentData = yahooData.leagues?.[0]; // Sample first league for validation
      const formatValidation = recentData ? validateYahooData(recentData) : {
        isValid: false,
        issues: ['No Yahoo data to validate'],
        severity: 'warning' as const,
        humanMessage: 'No Yahoo data loaded yet - try refreshing or check connection'
      };

      statuses.push({
        platform: 'Yahoo',
        isConnected: yahooConnected,
        lastSuccessfulFetch: lastUpdated,
        dataFreshness: freshness,
        formatValidation,
        completenessCheck: {
          isValid: yahooData.leagues && yahooData.leagues.length > 0,
          issues: yahooData.leagues?.length === 0 ? ['No leagues loaded'] : [],
          severity: 'info' as const,
          humanMessage: yahooData.leagues?.length > 0 ? 
            `${yahooData.leagues.length} Yahoo leagues loaded` : 
            'No Yahoo leagues found - check your selections in settings'
        }
      });
    } else {
      statuses.push({
        platform: 'Yahoo',
        isConnected: false,
        lastSuccessfulFetch: null,
        dataFreshness: 'unknown',
        formatValidation: {
          isValid: false,
          issues: ['Not connected to Yahoo'],
          severity: 'warning' as const,
          humanMessage: 'Yahoo not connected - go to settings to connect'
        },
        completenessCheck: {
          isValid: false,
          issues: ['Not connected'],
          severity: 'info' as const,
          humanMessage: 'Connect to Yahoo to see league data'
        }
      });
    }

    // Sleeper Health Check (simplified - would need actual sleeper data)
    statuses.push({
      platform: 'Sleeper',
      isConnected: true, // Assuming always available via API
      lastSuccessfulFetch: new Date().toISOString(), // Would need actual tracking
      dataFreshness: 'fresh',
      formatValidation: {
        isValid: true,
        issues: [],
        severity: 'info' as const,
        humanMessage: 'Sleeper API format validation not yet implemented'
      },
      completenessCheck: {
        isValid: true,
        issues: [],
        severity: 'info' as const,
        humanMessage: 'Sleeper completeness check not yet implemented'
      }
    });

    setPlatformStatus(statuses);
    setLastCheck(new Date().toLocaleTimeString());
    
    debugLogger.success('DATA_HEALTH', 'Platform health check completed', { 
      statusCount: statuses.length,
      issues: statuses.flatMap(s => [...s.formatValidation.issues, ...s.completenessCheck.issues])
    });
  };

  // Auto-refresh during live games
  useEffect(() => {
    if (isVisible) {
      checkPlatformHealth();
      const interval = setInterval(checkPlatformHealth, 30000); // Check every 30s
      return () => clearInterval(interval);
    }
  }, [isVisible, yahooConnected]);

  const getStatusIcon = (status: PlatformHealthStatus) => {
    if (!status.isConnected) return <AlertCircle className="w-4 h-4 text-destructive" />;
    if (status.formatValidation.severity === 'error') return <AlertCircle className="w-4 h-4 text-destructive" />;
    if (status.dataFreshness === 'very_stale') return <Clock className="w-4 h-4 text-warning" />;
    return <CheckCircle className="w-4 h-4 text-success" />;
  };

  const getStatusColor = (status: PlatformHealthStatus) => {
    if (!status.isConnected || status.formatValidation.severity === 'error') return 'destructive';
    if (status.formatValidation.severity === 'warning' || status.dataFreshness === 'very_stale') return 'secondary';
    return 'default';
  };

  const handleForceRefresh = async (platform: string) => {
    debugLogger.info('DATA_HEALTH', `Force refresh requested for ${platform}`);
    
    if (platform === 'Yahoo' && yahooData?.fetchAvailableLeagues) {
      try {
        await yahooData.fetchAvailableLeagues();
        toast({
          title: 'Yahoo Data Refreshed',
          description: 'Successfully fetched latest Yahoo data',
        });
      } catch (error) {
        toast({
          title: 'Refresh Failed',
          description: 'Could not refresh Yahoo data - check connection',
          variant: 'destructive',
        });
      }
    }
    
    // Force health recheck
    setTimeout(checkPlatformHealth, 1000);
  };

  if (!isVisible) return null;

  return (
    <Card className="mb-4 border-muted">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <div className="flex items-center gap-2">
                <span>Live Data Health Monitor</span>
                {platformStatus.some(s => !s.isConnected || s.formatValidation.severity === 'error') && (
                  <Badge variant="destructive" className="text-xs">Issues Detected</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Last check: {lastCheck}</span>
                <ChevronDown className="w-4 h-4" />
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {platformStatus.map((status) => (
              <div key={status.platform} className="p-3 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(status)}
                    <span className="font-medium">{status.platform}</span>
                    <Badge variant={getStatusColor(status)} className="text-xs">
                      {status.isConnected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleForceRefresh(status.platform)}
                    className="h-7 px-2"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Refresh
                  </Button>
                </div>
                
                <div className="text-sm space-y-1">
                  {/* Data Freshness */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data Age:</span>
                    <span className={
                      status.dataFreshness === 'fresh' ? 'text-success' : 
                      status.dataFreshness === 'stale' ? 'text-warning' : 
                      status.dataFreshness === 'very_stale' ? 'text-destructive' : ''
                    }>
                      {getFreshnessMessage(status.dataFreshness)}
                    </span>
                  </div>
                  
                  {/* Format Validation */}
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Data Format:</span>
                    <div className="text-right">
                      <Badge variant={status.formatValidation.severity === 'error' ? 'destructive' : 'secondary'} className="text-xs mb-1">
                        {status.formatValidation.isValid ? 'Valid' : 'Issues'}
                      </Badge>
                      <div className="text-xs">{status.formatValidation.humanMessage}</div>
                    </div>
                  </div>
                  
                  {/* Completeness Check */}
                  <div className="flex justify-between items-start">
                    <span className="text-muted-foreground">Data Complete:</span>
                    <div className="text-right">
                      <div className="text-xs">{status.completenessCheck.humanMessage}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            <div className="pt-2 text-xs text-muted-foreground">
              💡 This monitor automatically checks data quality every 30 seconds during live games.
              Red badges indicate issues that need attention, yellow badges are warnings.
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};