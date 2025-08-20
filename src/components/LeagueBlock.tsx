import { LeagueData } from '../types/fantasy';
import { EnhancedScoringEvent } from './EnhancedScoringEvent';
import { useEventAnimations } from '../hooks/useEventAnimations';
import { useEffect, useRef } from 'react';

interface LeagueBlockProps {
  league: LeagueData;
  onClick?: () => void;
}

export const LeagueBlock = ({ league, onClick }: LeagueBlockProps) => {
  const { triggerPulseAnimation } = useEventAnimations();
  const prevEventsRef = useRef<string[]>([]);

  const getStatusClass = () => {
    const scoreDiff = league.myScore - league.opponentScore;
    
    if (scoreDiff >= 25) return 'league-block-winning-big';
    if (scoreDiff >= 10) return 'league-block-winning';
    if (scoreDiff >= -5) return 'league-block-close';
    if (scoreDiff >= -15) return 'league-block-losing';
    return 'league-block-losing-badly';
  };

  const getPlatformClass = () => {
    return `platform-${league.platform.toLowerCase().replace('.com', '')}`;
  };

  // Sort events: most recent first, then by timestamp
  const sortedEvents = [...league.scoringEvents]
    .sort((a, b) => {
      // First, prioritize recent events
      if (a.isRecent && !b.isRecent) return -1;
      if (!a.isRecent && b.isRecent) return 1;
      
      // Then sort by timestamp (newer first)
      const timeA = new Date(`1970/01/01 ${a.timestamp}`).getTime();
      const timeB = new Date(`1970/01/01 ${b.timestamp}`).getTime();
      return timeB - timeA;
    })
    .slice(0, 4);

  // Detect new events and trigger animations
  useEffect(() => {
    const currentEventIds = league.scoringEvents.map(e => e.id);
    const prevEventIds = prevEventsRef.current;
    
    // Find new events
    const newEvents = currentEventIds.filter(id => !prevEventIds.includes(id));
    
    if (newEvents.length > 0) {
      // Find the most recent new event
      const recentEvent = league.scoringEvents.find(e => 
        newEvents.includes(e.id) && e.isRecent
      );
      
      if (recentEvent) {
        // Determine animation color based on score impact
        let color: 'green' | 'red' | 'blue' = 'blue';
        if (recentEvent.scoreImpact > 0) color = 'green';
        else if (recentEvent.scoreImpact < 0) color = 'red';
        
        // Trigger pulse animation on the league block
        triggerPulseAnimation(`league-block-${league.id}`, { 
          color, 
          pulseCount: 2, 
          duration: 1000 
        });
      }
    }
    
    prevEventsRef.current = currentEventIds;
  }, [league.scoringEvents, league.id, triggerPulseAnimation]);

  return (
    <div 
      id={`league-block-${league.id}`}
      className={`league-block ${getStatusClass()} cursor-pointer transition-all duration-300`}
      onClick={onClick}
    >
      <div className="league-overlay" />
      <div className="league-content">
        {/* Header Section - 60px */}
        <div className="h-[60px] flex flex-col justify-between mb-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white leading-tight">
                {league.leagueName}
              </h3>
              <p className="text-sm font-semibold text-white/90">
                {league.teamName}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`platform-badge ${getPlatformClass()}`}>
                {league.platform}
              </span>
            </div>
          </div>
        </div>

        {/* Score Section - 100px */}
        <div className="h-[100px] flex flex-col mb-4">
          {/* Record and position at top */}
          <div className="flex justify-end mb-2">
            <div className="text-right">
              <div className="text-xs font-semibold text-white/90">
                {league.record}
              </div>
              <div className="text-xs text-white/70">
                {league.leaguePosition}
              </div>
            </div>
          </div>
          
          {/* Scores centered */}
          <div className="flex-1 flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-white">
                {league.myScore}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-white/70 mb-1">VS</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">
                {league.opponentScore}
              </div>
            </div>
          </div>
          
          {/* Opponent name at bottom */}
          <div className="text-xs text-white/70 text-center">
            vs {league.opponentName}
          </div>
        </div>

        {/* Scoring Events Section - 290px */}
        <div className="flex-1 flex flex-col">
          <h4 className="text-sm font-bold text-white mb-3">
            Recent Activity
          </h4>
          <div className="flex-1 overflow-y-auto space-y-2">
            {sortedEvents.map((event, index) => (
              <EnhancedScoringEvent 
                key={event.id} 
                event={event} 
                isRecent={index === 0 && event.isRecent}
              />
            ))}
            
            {/* Show placeholder if less than 4 events */}
            {sortedEvents.length < 4 && (
              <>
                {Array.from({ length: 4 - sortedEvents.length }).map((_, i) => (
                  <div key={`placeholder-${i}`} className="opacity-30 text-xs text-white/40 p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-white/10"></div>
                      <span>No recent activity</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          
          {/* Last Updated */}
          <div className="mt-3 pt-2 border-t border-white/20">
            <p className="text-xs text-white/60 text-center">
              Updated {league.lastUpdated}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};