import React, { useCallback, useRef, useMemo, useEffect } from 'react';
import { LeagueData } from '../types/fantasy';
import { EnhancedScoringEvent } from './EnhancedScoringEvent';
import { useEventAnimations } from '../hooks/useEventAnimations';

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
    return `platform-${league.platform.toLowerCase().replace('.com', '')}`;
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
      className={`league-block ${statusClass} ${platformClass} cursor-pointer transition-all duration-300 hover-scale animate-fade-in`}
      onClick={onClick}
    >
      <div className="league-overlay">
        <div className="league-header">
          <div className="league-info">
            <h2 className="league-name">{league.leagueName}</h2>
            <div className="league-details">
              <span className="team-name">{league.teamName}</span>
              <span className="record">{league.record}</span>
              <span className="position">{league.leaguePosition}</span>
            </div>
          </div>
          <div className="platform-badge">
            <span className="platform-name">{league.platform}</span>
          </div>
        </div>

        <div className="scores-container">
          <div className="score-display">
            <div className="my-score">
              <span className="score-label">My Team</span>
              <span className="score-value">{league.myScore.toFixed(1)}</span>
            </div>
            <div className="vs-divider">VS</div>
            <div className="opponent-score">
              <span className="score-label">{league.opponentName}</span>
              <span className="score-value">{league.opponentScore.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <div className="events-container">
          <div className="events-header">
            <h3>Recent Activity</h3>
            <span className="events-count">{league.scoringEvents.length} events</span>
          </div>
          <div className="events-list">
            {sortedEvents.length > 0 ? (
              sortedEvents.map((event) => (
                <EnhancedScoringEvent key={event.id} event={event} />
              ))
            ) : (
              <div className="no-events">
                <span>No recent scoring events</span>
              </div>
            )}
          </div>
        </div>

        <div className="league-footer">
          <span className="last-updated">
            Updated: {league.lastUpdated}
          </span>
        </div>
      </div>
    </div>
  );
});

// Display name for debugging
LeagueBlock.displayName = 'LeagueBlock';