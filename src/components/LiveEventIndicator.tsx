import React from 'react';
import { Badge } from './ui/badge';
import { Activity, Wifi, Clock, Target } from 'lucide-react';
import { LiveEventsState } from '../hooks/useLiveEventsSystem';

interface LiveEventIndicatorProps {
  liveState: LiveEventsState;
  className?: string;
}

export const LiveEventIndicator: React.FC<LiveEventIndicatorProps> = ({ liveState, className = '' }) => {
  if (!liveState.isActive) {
    return null;
  }

  const formatLastEventTime = (timestamp: string | null): string => {
    if (!timestamp) return 'No events yet';
    
    const eventTime = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - eventTime.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    return `${diffHours}h ago`;
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Live Polling Status */}
      <Badge 
        variant={liveState.isPolling ? "default" : "secondary"}
        className={`flex items-center gap-1 ${
          liveState.isPolling ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''
        }`}
      >
        <Wifi className={`h-3 w-3 ${liveState.isPolling ? 'animate-pulse' : ''}`} />
        {liveState.isPolling ? 'Live' : 'Paused'}
      </Badge>

      {/* Active Games Count */}
      {liveState.activeGames > 0 && (
        <Badge variant="outline" className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {liveState.activeGames} games
        </Badge>
      )}

      {/* Recent Events Count */}
      {liveState.eventCount > 0 && (
        <Badge variant="outline" className="flex items-center gap-1">
          <Target className="h-3 w-3" />
          {liveState.eventCount} events
        </Badge>
      )}

      {/* Last Event Time */}
      {liveState.lastEventTime && (
        <Badge variant="outline" className="flex items-center gap-1 text-xs">
          <Clock className="h-3 w-3" />
          {formatLastEventTime(liveState.lastEventTime)}
        </Badge>
      )}

      {/* NFL Week */}
      {liveState.nflWeek && (
        <Badge variant="secondary" className="text-xs">
          Week {liveState.nflWeek}
        </Badge>
      )}
    </div>
  );
};