import React from 'react';
import { AlertTriangle, Wifi, WifiOff, Clock, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ConnectionStatusBannerProps {
  isOnline: boolean;
  rateLimitStatus?: {
    queueLength: number;
    isProcessing: boolean;
    activeRequests: number;
  };
  lastUpdated?: Date | null;
  onRetry?: () => void;
  usingCachedData?: boolean;
}

export const ConnectionStatusBanner: React.FC<ConnectionStatusBannerProps> = ({
  isOnline,
  rateLimitStatus,
  lastUpdated,
  onRetry,
  usingCachedData = false,
}) => {
  // Don't show banner if everything is normal
  if (isOnline && !rateLimitStatus?.isProcessing && !usingCachedData && rateLimitStatus?.queueLength === 0) {
    return null;
  }

  const getRateLimitMessage = () => {
    if (!rateLimitStatus) return null;

    if (rateLimitStatus.queueLength > 0) {
      return `Rate limited: ${rateLimitStatus.queueLength} requests queued`;
    }

    if (rateLimitStatus.isProcessing) {
      return 'Processing requests...';
    }

    if (rateLimitStatus.activeRequests > 0) {
      return `${rateLimitStatus.activeRequests} active requests`;
    }

    return null;
  };

  const getAlertVariant = () => {
    if (!isOnline) return 'destructive';
    if (rateLimitStatus?.queueLength && rateLimitStatus.queueLength > 3) return 'destructive';
    if (usingCachedData || rateLimitStatus?.isProcessing) return 'default';
    return 'default';
  };

  const getIcon = () => {
    if (!isOnline) return <WifiOff className="h-4 w-4" />;
    if (rateLimitStatus?.isProcessing) return <RefreshCw className="h-4 w-4 animate-spin" />;
    if (rateLimitStatus?.queueLength && rateLimitStatus.queueLength > 0) return <AlertTriangle className="h-4 w-4" />;
    if (usingCachedData) return <Clock className="h-4 w-4" />;
    return <Wifi className="h-4 w-4" />;
  };

  const getMessage = () => {
    if (!isOnline) {
      return 'Connection lost - showing cached data';
    }

    const rateLimitMsg = getRateLimitMessage();
    if (rateLimitMsg) {
      return rateLimitMsg;
    }

    if (usingCachedData) {
      return `Using cached data${lastUpdated ? ` from ${lastUpdated.toLocaleTimeString()}` : ''}`;
    }

    return 'Connection status';
  };

  return (
    <Alert variant={getAlertVariant()} className="mb-4 border-l-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getIcon()}
          <AlertDescription className="mb-0">
            {getMessage()}
            {lastUpdated && usingCachedData && (
              <span className="text-muted-foreground ml-1">
                • Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </AlertDescription>
        </div>
        
        {!isOnline && onRetry && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={onRetry}
            className="ml-2 h-8"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        )}
      </div>
    </Alert>
  );
};