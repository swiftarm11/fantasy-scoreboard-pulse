import { ScoringEvent as ScoringEventType } from '../types/fantasy';

interface ScoringEventProps {
  event: ScoringEventType;
}

export const ScoringEvent = ({ event }: ScoringEventProps) => {
  const isPositive = event.scoreImpact > 0;
  
  return (
    <div className={`scoring-event ${event.isRecent ? 'scoring-event-recent' : 'scoring-event-old'}`}>
      <div className="flex justify-between items-start mb-1">
        <div className="flex-1">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-white">
              {event.playerName} {event.position}
            </span>
            <span className="text-sm text-white/90">
              {event.weeklyPoints} pts
            </span>
          </div>
          <p className="text-xs text-white/70 mt-1">
            {event.action}
          </p>
        </div>
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className="text-white/60">
          {event.timestamp}
        </span>
        <span className={isPositive ? 'score-impact-positive' : 'score-impact-negative'}>
          {isPositive ? '+' : ''}{event.scoreImpact}
        </span>
      </div>
    </div>
  );
};