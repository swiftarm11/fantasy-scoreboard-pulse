import { useState, useEffect, useCallback } from 'react';
import { LeagueData, ScoringEvent } from '../types/fantasy';
import { generateMockScoringEvent } from '../utils/mockEventGenerator';

interface UseDemoLeagueOptions {
  enabled: boolean;
  updateInterval?: number; // seconds
}

export const useDemoLeague = ({ enabled, updateInterval = 15 }: UseDemoLeagueOptions) => {
  const [demoLeague, setDemoLeague] = useState<LeagueData | null>(null);
  const [isActive, setIsActive] = useState(false);

  const createInitialDemoLeague = useCallback((): LeagueData => {
    return {
      id: 'demo-league',
      leagueName: '🎮 DEMO: Live Scoring Test',
      platform: 'Sleeper',
      teamName: 'UI Test Squad',
      myScore: 94.7,
      opponentScore: 91.2,
      opponentName: 'Animation Testers',
      record: '6-3',
      leaguePosition: '3rd place',
      status: 'winning',
      scoringEvents: [
        {
          id: 'demo-1',
          playerName: 'Demo Player',
          position: 'QB',
          weeklyPoints: 18.4,
          action: 'Welcome to the demo!',
          scoreImpact: 2.0,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isRecent: true
        }
      ],
      lastUpdated: 'Live Demo'
    };
  }, []);

  const addNewScoringEvent = useCallback(() => {
    if (!demoLeague) return;

    const newEvent = generateMockScoringEvent();
    
    setDemoLeague(prev => {
      if (!prev) return prev;

      // Update scores based on event impact
      const newScore = Math.max(0, prev.myScore + newEvent.scoreImpact);
      const scoreDiff = newScore - prev.opponentScore;
      
      let newStatus: 'winning' | 'losing' | 'neutral' = 'neutral';
      if (scoreDiff >= 10) newStatus = 'winning';
      else if (scoreDiff <= -10) newStatus = 'losing';
      else newStatus = 'neutral';

      // Add new event and keep only the 4 most recent
      const updatedEvents = [newEvent, ...prev.scoringEvents.map(e => ({ ...e, isRecent: false }))]
        .slice(0, 4);

      return {
        ...prev,
        myScore: Number(newScore.toFixed(1)),
        status: newStatus,
        scoringEvents: updatedEvents,
        lastUpdated: 'Just now'
      };
    });
  }, [demoLeague]);

  // Initialize demo league when enabled
  useEffect(() => {
    if (enabled && !demoLeague) {
      setDemoLeague(createInitialDemoLeague());
      setIsActive(true);
    } else if (!enabled) {
      setDemoLeague(null);
      setIsActive(false);
    }
  }, [enabled, demoLeague, createInitialDemoLeague]);

  // Set up auto-updating events
  useEffect(() => {
    if (!enabled || !isActive) return;

    const interval = setInterval(() => {
      // Random chance to generate event (50% every interval)
      if (Math.random() > 0.5) {
        addNewScoringEvent();
      }
    }, updateInterval * 1000);

    return () => clearInterval(interval);
  }, [enabled, isActive, updateInterval, addNewScoringEvent]);

  const triggerManualEvent = useCallback(() => {
    if (enabled && demoLeague) {
      addNewScoringEvent();
    }
  }, [enabled, demoLeague, addNewScoringEvent]);

  const resetDemo = useCallback(() => {
    if (enabled) {
      setDemoLeague(createInitialDemoLeague());
    }
  }, [enabled, createInitialDemoLeague]);

  return {
    demoLeague,
    isActive,
    triggerManualEvent,
    resetDemo,
  };
};
