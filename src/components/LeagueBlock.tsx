import React, { useCallback, useRef, useMemo, useEffect } from 'react';
import { LeagueData } from '../types/fantasy';
import { EnhancedScoringEvent } from './EnhancedScoringEvent';
import { useEventAnimations } from '../hooks/useEventAnimations';
import { safeLower } from '../utils/strings';

interface LeagueBlockProps {
  league: LeagueData;
  onClick?: () => void;
}

// Memoized LeagueBlock component to prevent unnecessary re-renders
export const LeagueBlock = React.memo(({ league, onClick }: LeagueBlockProps) => {
  const { triggerPulseAnimation, cleanup } = useEventAnimations();
  const prevEventsRef = useRef<string[]>([]);

  // Memoized calculations to prevent recalculation on every render
  const statusClass = useMemo(() => {
    const scoreDiff = league.myScore - league.opponentScore;
    
    if (scoreDiff >= 25) return 'league-block-winning-big';
    if (scoreDiff >= 10) return 'league-block-winning';
    if (scoreDiff >= -5) return 'league-block-close';
    if (scoreDiff >= -15) return 'league-block-losing';
    return 'league-block-losing-badly';
  }, [league.myScore, league.opponentScore]);

  const platformClass = useMemo(() => {
    return `platform-${safeLower(league.platform).replace('.com', '')}`;
  }, [league.platform]);

  // Memoized sorted events to prevent sorting on every render
  const sortedEvents = useMemo(() => {
    return [...league.scoringEvents]
      .sort((a, b) => {
        // Recent events first
        if (a.isRecent !== b.isRecent) {
          return a.isRecent ? -1 : 1;
        }
        // Then by timestamp (most recent first)
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, 4); // Only show top 4 events for performance
  }, [league.scoringEvents]);

  // Debounced animation trigger to prevent excessive animations
  const triggerAnimation = useCallback(() => {
    const currentEvents = league.scoringEvents.map(e => e.id);
    const prevEvents = prevEventsRef.current;
    
    // Check if there are new events (debounced)
    const newEvents = currentEvents.filter(id => !prevEvents.includes(id));
    if (newEvents.length > 0) {
      // Only trigger animation if it's been at least 2 seconds since last animation
      triggerPulseAnimation(league.id, { 
        color: league.status === 'winning' ? 'green' : league.status === 'losing' ? 'red' : 'blue' 
      });
    }
    
    prevEventsRef.current = currentEvents;
  }, [league.scoringEvents, league.id, league.status, triggerPulseAnimation]);

  // Effect to trigger animations when events change
  useEffect(() => {
    if (league.scoringEvents.length > 0) {
      triggerAnimation();
    }
  }, [triggerAnimation]);

  // Cleanup animations on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return (
    <div
      id={league.id}
      className={`league-block ${statusClass} ${platformClass} cursor-pointer transition-all duration-300 hover-scale animate-fade-in h-full`}
      onClick={onClick}
    >
      <div className="league-overlay" />
      <div className="league-content">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white mb-1 truncate">{league.leagueName}</h2>
            <div className="flex items-center gap-2 text-sm text-white/90">
              <span className="truncate">{league.teamName}</span>
              <span>•</span>
              <span>{league.record}</span>
              <span>•</span>
              <span>{league.leaguePosition}</span>
            </div>
          </div>
          <div className={`platform-badge ${platformClass}`}>
            <span className="text-xs font-semibold">{league.platform}</span>
          </div>
        </div>

        {/* Scores */}
        <div className="flex items-center justify-between mb-4 bg-white/10 rounded-lg p-4 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-sm text-white/80">My Team</div>
            <div className="text-2xl font-bold text-white">{league.myScore.toFixed(1)}</div>
          </div>
          <div className="text-white/60 font-bold text-lg">VS</div>
          <div className="text-center">
            <div className="text-sm text-white/80">{league.opponentName}</div>
            <div className="text-2xl font-bold text-white">{league.opponentScore.toFixed(1)}</div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="flex-1 overflow-hidden">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
            <span className="text-xs text-white/60">{league.scoringEvents.length} events</span>
          </div>
          <div className="space-y-2 max-h-[180px] overflow-y-auto">
            {sortedEvents.length > 0 ? (
              sortedEvents.map((event) => (
                <EnhancedScoringEvent key={event.id} event={event} />
              ))
            ) : (
              <div className="text-center py-4 text-white/60 text-sm">
                No recent scoring events
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-auto pt-3 text-xs text-white/60 text-center">
          Updated: {league.lastUpdated}
        </div>
      </div>
    </div>
  );
});

// Display name for debugging
LeagueBlock.displayName = 'LeagueBlock';