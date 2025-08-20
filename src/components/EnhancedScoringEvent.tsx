import { ScoringEvent as ScoringEventType } from '../types/fantasy';
import { User, TrendingUp, TrendingDown, Target } from 'lucide-react';

interface EnhancedScoringEventProps {
  event: ScoringEventType;
  isRecent?: boolean;
  compact?: boolean;
}

export const EnhancedScoringEvent = ({ event, isRecent = false, compact = false }: EnhancedScoringEventProps) => {
  const getImpactBadgeStyle = () => {
    if (event.scoreImpact > 0) {
      return 'bg-green-500/20 text-green-400 border border-green-500/30';
    } else if (event.scoreImpact < 0) {
      return 'bg-red-500/20 text-red-400 border border-red-500/30';
    } else {
      return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
    }
  };

  const getPositionIcon = () => {
    switch (event.position) {
      case 'QB':
        return <User className="h-3 w-3" />;
      case 'RB':
      case 'WR':
      case 'TE':
        return <TrendingUp className="h-3 w-3" />;
      case 'K':
        return <Target className="h-3 w-3" />;
      case 'DST':
        return <TrendingDown className="h-3 w-3" />;
      default:
        return <User className="h-3 w-3" />;
    }
  };

  const eventClasses = isRecent 
    ? 'opacity-100 text-sm border border-primary/30 bg-primary/5 rounded-md p-2 recent-event-glow' 
    : 'opacity-80 text-xs';

  const playerNameClasses = isRecent 
    ? 'font-bold text-white' 
    : 'font-medium text-white/90';

  if (compact) {
    return (
      <div className={`scoring-event transition-all duration-300 ${eventClasses}`}>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-primary">
            {getPositionIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-white truncate">
                {event.playerName}
              </p>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${getImpactBadgeStyle()}`}>
                {event.scoreImpact > 0 ? '+' : ''}{event.scoreImpact}
              </span>
            </div>
            <p className="text-xs text-white/60 truncate">
              {event.action}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`scoring-event transition-all duration-300 ${eventClasses}`}>
      <div className="flex items-start gap-2">
        {/* Player Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary">
            {getPositionIcon()}
          </div>
        </div>

        {/* Event Content */}
        <div className="flex-1 min-w-0">
          {/* Player Info Line */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1">
              <span className={playerNameClasses}>
                {event.playerName}
              </span>
              <span className="text-xs text-white/60 font-medium">
                {event.position}
              </span>
              <span className={isRecent ? 'text-sm text-white/80' : 'text-xs text-white/70'}>
                {event.weeklyPoints} pts
              </span>
            </div>
          </div>

          {/* Action Line */}
          <div className="flex items-center justify-between">
            <p className={`text-white/70 truncate pr-2 ${isRecent ? 'text-sm' : 'text-xs'}`}>
              {event.action}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={isRecent ? 'text-xs text-white/60' : 'text-xs text-white/50'}>
                {event.timestamp}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getImpactBadgeStyle()}`}>
                {event.scoreImpact > 0 ? '+' : ''}{event.scoreImpact}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};