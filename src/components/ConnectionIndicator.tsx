import { useState, useEffect } from 'react';
import { Badge } from './ui/badge';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { connectionStatus } from '../utils/errorHandling';

interface ConnectionIndicatorProps {
  lastUpdated?: Date | null;
  isPolling?: boolean;
}

export const ConnectionIndicator = ({ lastUpdated, isPolling }: ConnectionIndicatorProps) => {
  const [isOnline, setIsOnline] = useState(connectionStatus.getStatus());

  useEffect(() => {
    const unsubscribe = connectionStatus.subscribe(setIsOnline);
    return unsubscribe;
  }, []);

  const getTimeAgo = (date: Date | null): string => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    } else if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    } else {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant={isOnline ? 'default' : 'destructive'}
        className="flex items-center gap-1"
      >
        {isOnline ? (
          <Wifi className="h-3 w-3" />
        ) : (
          <WifiOff className="h-3 w-3" />
        )}
        {isOnline ? 'Online' : 'Offline'}
      </Badge>
      
      {lastUpdated && (
        <Badge variant="outline" className="flex items-center gap-1">
          {isPolling && <RefreshCw className="h-3 w-3 animate-spin" />}
          {getTimeAgo(lastUpdated)}
        </Badge>
      )}
    </div>
  );
};