import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Loader2, ExternalLink, AlertCircle, CheckCircle2, Settings } from 'lucide-react';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { useYahooAuthRecovery } from '../hooks/useYahooAuthRecovery';
import { yahooOAuth, validateYahooConfig } from '../utils/yahooOAuth';
import { yahooFantasyAPI } from '../services/YahooFantasyAPI';
import { toast } from './ui/use-toast';
import { YahooLeagueSelector } from './YahooLeagueSelector';

type FlowState = 'idle' | 'configCheck' | 'authCheck' | 'connecting' | 'fetchingLeagues' | 'ready' | 'error';

interface FlowMessage {
  text: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export const YahooIntegrationFlow = () => {
  const { isConnected, userInfo, isLoading: oauthLoading, connect, disconnect } = useYahooOAuth();
  const { handleAuthError } = useYahooAuthRecovery();
  const [flowState, setFlowState] = useState<FlowState>('idle');
  const [flowMessage, setFlowMessage] = useState<FlowMessage | null>(null);
  const [showLeagueSelector, setShowLeagueSelector] = useState(false);

  // Check configuration on mount
  useEffect(() => {
    const config = validateYahooConfig();
    if (!config.isValid) {
      setFlowState('error');
      setFlowMessage({
        text: `Yahoo OAuth not configured. Missing: ${config.missing.join(', ')}`,
        type: 'error'
      });
    } else if (isConnected) {
      setFlowState('ready');
      setFlowMessage({
        text: `Connected as ${userInfo?.nickname || 'Yahoo User'}`,
        type: 'success'
      });
    }
  }, [isConnected, userInfo]);

  const handleAddYahooLeague = useCallback(async () => {
    try {
      setFlowState('configCheck');
      setFlowMessage({ text: 'Checking configuration...', type: 'info' });

      // Check if Yahoo OAuth is configured
      const config = validateYahooConfig();
      if (!config.isValid) {
        setFlowState('error');
        setFlowMessage({
          text: `Yahoo OAuth not configured. Missing: ${config.missing.join(', ')}`,
          type: 'error'
        });
        return;
      }

      setFlowState('authCheck');
      setFlowMessage({ text: 'Checking authentication status...', type: 'info' });

      // Check if user is authenticated
      const isAuthenticated = yahooOAuth.isConnected();
      if (!isAuthenticated) {
        setFlowState('connecting');
        setFlowMessage({ text: 'Redirecting to Yahoo for authentication...', type: 'info' });
        
        // Start OAuth flow
        connect();
        return;
      }

      // User is authenticated, fetch leagues
      setFlowState('fetchingLeagues');
      setFlowMessage({ text: 'Fetching your Yahoo leagues...', type: 'info' });
      
      const leagues = await yahooFantasyAPI.getUserLeagues();

      if (leagues.length === 0) {
        setFlowState('ready');
        setFlowMessage({
          text: 'No Yahoo Fantasy leagues found for current season.',
          type: 'warning'
        });
        toast({
          title: 'No Leagues Found',
          description: 'No active Yahoo Fantasy leagues found. Make sure you have joined leagues for the current season.',
          variant: 'default'
        });
      } else {
        setFlowState('ready');
        setFlowMessage({
          text: `Found ${leagues.length} league${leagues.length > 1 ? 's' : ''}. Select leagues to add:`,
          type: 'success'
        });
        setShowLeagueSelector(true);
      }
    } catch (error) {
      console.error('Yahoo league addition error:', error);
      
      if (error instanceof Error) {
        // Use the auth recovery hook to handle auth errors
        const handled = handleAuthError(error, 'adding Yahoo leagues');
        
        if (handled) {
          setFlowState('error');
          setFlowMessage({
            text: 'Authentication required. Please reconnect your Yahoo account.',
            type: 'error'
          });
        } else {
          setFlowState('error');
          setFlowMessage({
            text: `Failed to connect to Yahoo: ${error.message}`,
            type: 'error'
          });
          
          toast({
            title: 'Connection Error',
            description: `Failed to connect to Yahoo: ${error.message}`,
            variant: 'destructive'
          });
        }
      }
    }
  }, [connect, handleAuthError]);

  const handleReconnect = useCallback(() => {
    setFlowState('idle');
    setFlowMessage(null);
    setShowLeagueSelector(false);
    disconnect();
    // Allow UI to update before starting new flow
    setTimeout(() => {
      handleAddYahooLeague();
    }, 100);
  }, [disconnect, handleAddYahooLeague]);

  const getStatusIcon = () => {
    switch (flowState) {
      case 'ready':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'configCheck':
      case 'authCheck':
      case 'connecting':
      case 'fetchingLeagues':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const getStatusBadge = () => {
    if (isConnected) {
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
          Connected
        </Badge>
      );
    }
    
    const config = validateYahooConfig();
    if (!config.isValid) {
      return <Badge variant="destructive">Not Configured</Badge>;
    }
    
    return <Badge variant="outline">Disconnected</Badge>;
  };

  const isProcessing = oauthLoading || ['configCheck', 'authCheck', 'connecting', 'fetchingLeagues'].includes(flowState);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <CardTitle className="text-base">Yahoo Fantasy Sports</CardTitle>
              {getStatusBadge()}
            </div>
          </div>
          <CardDescription>
            Connect your Yahoo account to add fantasy leagues to your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {flowMessage && (
            <Alert className={flowMessage.type === 'error' ? 'border-destructive/50 bg-destructive/5' : 
                             flowMessage.type === 'warning' ? 'border-warning/50 bg-warning/5' :
                             flowMessage.type === 'success' ? 'border-emerald-500/50 bg-emerald-500/5' : ''}>
              <AlertDescription className="flex items-center gap-2">
                {flowMessage.type === 'error' && <AlertCircle className="h-4 w-4 text-destructive" />}
                {flowMessage.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                {flowMessage.text}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-2">
            {!isConnected ? (
              <Button
                onClick={handleAddYahooLeague}
                disabled={isProcessing}
                className="mobile-touch-target"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {flowState === 'connecting' ? 'Connecting...' : 
                     flowState === 'fetchingLeagues' ? 'Loading Leagues...' : 'Processing...'}
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Connect Yahoo Fantasy
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => setShowLeagueSelector(!showLeagueSelector)}
                  disabled={isProcessing}
                  className="mobile-touch-target"
                >
                  {showLeagueSelector ? 'Hide League Selection' : 'Manage Leagues'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReconnect}
                  disabled={isProcessing}
                  className="mobile-touch-target"
                >
                  Reconnect
                </Button>
                <Button
                  variant="outline"
                  onClick={disconnect}
                  disabled={isProcessing}
                  className="mobile-touch-target"
                >
                  Disconnect
                </Button>
              </>
            )}
          </div>

          {/* User info section */}
          {isConnected && userInfo && (
            <div className="p-3 bg-secondary/50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                <span className="text-sm font-medium">Connected as {userInfo.nickname}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Yahoo Fantasy Sports account linked successfully
              </p>
            </div>
          )}

          {/* Configuration help */}
          {flowState === 'error' && flowMessage?.text.includes('not configured') && (
            <div className="p-3 bg-muted/50 rounded-lg space-y-2">
              <h4 className="text-sm font-medium">Setup Required:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Create a Yahoo Developer application</li>
                <li>Configure environment variables</li>
                <li>Restart your application</li>
              </ol>
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://developer.yahoo.com/apps/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  Yahoo Developer Console
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* League selector */}
      {showLeagueSelector && isConnected && (
        <YahooLeagueSelector />
      )}
    </div>
  );
};