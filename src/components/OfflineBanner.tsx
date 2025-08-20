import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { WifiOff, Wifi, RefreshCw, AlertTriangle } from 'lucide-react';

interface OfflineBannerProps {
  onRetry?: () => void;
}

export const OfflineBanner = ({ onRetry }: OfflineBannerProps) => {
  const { isOnline, isSlowConnection, reconnectAttempts, lastConnected, resetReconnectAttempts } = useNetworkStatus();

  if (isOnline && !isSlowConnection) return null;

  const handleRetry = () => {
    resetReconnectAttempts();
    onRetry?.();
  };

  const getTimeAgo = (date: Date | null): string => {
    if (!date) return 'never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-40 p-4">
      <Alert 
        variant={!isOnline ? "destructive" : "default"}
        className="max-w-4xl mx-auto border-2 shadow-lg backdrop-blur-sm bg-background/90"
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            {!isOnline ? (
              <WifiOff className="h-5 w-5 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-orange-500" />
            )}
            
            <div className="flex-1">
              <AlertDescription className="flex items-center gap-2 text-sm">
                {!isOnline ? (
                  <>
                    <span className="font-semibold">No internet connection</span>
                    <Badge variant="destructive" className="text-xs">
                      Offline
                    </Badge>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Slow connection detected</span>
                    <Badge variant="secondary" className="text-xs">
                      Limited
                    </Badge>
                  </>
                )}
                
                {lastConnected && (
                  <span className="text-muted-foreground">
                    Last connected {getTimeAgo(lastConnected)}
                  </span>
                )}
              </AlertDescription>
              
              {reconnectAttempts > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {reconnectAttempts === 1 
                    ? 'Attempting to reconnect...' 
                    : `${reconnectAttempts} reconnection attempts`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="outline" className="text-xs hidden sm:flex">
                <Wifi className="h-3 w-3 mr-1" />
                Waiting for connection
              </Badge>
            )}
            
            <Button 
              onClick={handleRetry}
              size="sm"
              variant="outline"
              className="text-xs"
              disabled={reconnectAttempts > 5}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
};