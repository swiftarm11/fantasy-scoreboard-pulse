// src/hooks/useSleeperData.ts

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  sleeperAPI,
  SleeperLeague,
  SleeperUser,
  SleeperRoster,
  SleeperMatchup,
} from '../services/SleeperAPI';
import { LeagueData, ScoringEvent } from '../types/fantasy';
import { LeagueConfig } from '../types/config';

interface SleeperLeagueData {
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  currentWeek: number;
}

interface UseSleeperDataReturn {
  leagues: LeagueData[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => void;
}

export const useSleeperData = (leagueConfigs: LeagueConfig[]): UseSleeperDataReturn => {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [previousMatchups, setPreviousMatchups] = useState<Record<string, SleeperMatchup[]>>({});

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTimeRef = useRef<number>(0);

  const processSleeperData = useCallback(
    async (
      leagueData: SleeperLeagueData,
      config: LeagueConfig,
      prevMatchups: Record<string, SleeperMatchup[]>
    ): Promise<LeagueData> => {
      const { users, rosters, matchups, currentWeek } = leagueData;

      // === Updated Team Selection Logic ===
      let userRoster: SleeperRoster;
      if (config.sleeperUserId) {
        userRoster = rosters.find(r => r.owner_id === config.sleeperUserId)!;
        if (!userRoster) {
          throw new Error(
            `Could not find roster for user ${config.sleeperUserId} in league ${config.leagueId}`
          );
        }
      } else {
        // Fallback for leagues added before user selection
        userRoster = rosters[0];
        console.warn(
          `No sleeperUserId configured for league ${config.leagueId}, using first roster as fallback`
        );
      }

      const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id);
      if (!userMatchup) throw new Error('Could not find user matchup');

      const opponentMatchup = matchups.find(
        m => m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
      );
      if (!opponentMatchup) throw new Error('Could not find opponent matchup');

      const opponentRoster = rosters.find(r => r.roster_id === opponentMatchup.roster_id);
      const opponentUser = users.find(u => u.user_id === opponentRoster?.owner_id);

      const myScore = userMatchup.points || 0;
      const opponentScore = opponentMatchup.points || 0;
      const totalScore = myScore + opponentScore;
      const winProbability = totalScore > 0 ? (myScore / totalScore) * 100 : 50;

      // Status
      const scoreDiff = myScore - opponentScore;
      let status: 'winning' | 'losing' | 'neutral' = 'neutral';
      if (scoreDiff >= 10) status = 'winning';
      else if (scoreDiff <= -10) status = 'losing';

      // Scoring events comparison
      const scoringEvents: ScoringEvent[] = await generateScoringEvents(
        userMatchup,
        prevMatchups[config.leagueId] || []
      );

      // Record & position
      const record = `${userRoster.settings.wins}-${userRoster.settings.losses}${
        userRoster.settings.ties > 0 ? `-${userRoster.settings.ties}` : ''
      }`;
      const leaguePosition = calculateLeaguePosition(rosters, userRoster.roster_id);

      return {
        id: config.id,
        leagueName: config.customTeamName || leagueData.league.name,
        platform: 'Sleeper',
        teamName: config.customTeamName || `Team ${userRoster.roster_id}`,
        myScore,
        opponentScore,
        opponentName: opponentUser?.display_name || opponentUser?.username || 'Unknown',
        record,
        leaguePosition,
        status,
        scoringEvents,
        lastUpdated: new Date().toLocaleTimeString(),
      };
    },
    []
  );

  const generateScoringEvents = async (
    currentMatchup: SleeperMatchup,
    previousMatchups: SleeperMatchup[]
  ): Promise<ScoringEvent[]> => {
    // ... unchanged ...
  };

  const calculateLeaguePosition = (rosters: SleeperRoster[], userRosterId: number): string => {
    // ... unchanged ...
  };

  const fetchSleeperData = useCallback(async () => {
    const enabledLeagues = leagueConfigs.filter(l => l.enabled && l.platform === 'Sleeper');
    if (enabledLeagues.length === 0) {
      setLeagues([]);
      return;
    }

    const now = Date.now();
    if (loading || now - lastRequestTimeRef.current < 2000) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    lastRequestTimeRef.current = now;

    setLoading(true);
    setError(null);

    try {
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = setTimeout(() => {
        abortControllerRef.current?.abort();
      }, 30000);

      const currentWeek = await sleeperAPI.getCurrentWeek();
      const leagueDataPromises = enabledLeagues.map(async config => {
        const staticData = await sleeperAPI.getStaticLeagueData(config.leagueId);
        const matchups = await sleeperAPI.getMatchups(config.leagueId, currentWeek);
        return await processSleeperData(
          { ...staticData, matchups, currentWeek },
          config,
          previousMatchups
        );
      });

      const processedLeagues = await Promise.all(leagueDataPromises);
      if (abortControllerRef.current?.signal.aborted) return;

      setLeagues(processedLeagues);
      setLastUpdated(new Date());

      // Update previousMatchups for next comparison
      const newPrev: Record<string, SleeperMatchup[]> = {};
      enabledLeagues.forEach((config, idx) => {
        newPrev[config.leagueId] = processedLeagues[idx]
          ? [] // we already used staticData to build events
          : [];
      });
      if (JSON.stringify(newPrev) !== JSON.stringify(previousMatchups)) {
        setPreviousMatchups(newPrev);
      }
    } catch (err: any) {
      if (abortControllerRef.current?.signal.aborted) return;
      console.error('Error fetching Sleeper data:', err);
      setError(err.message || 'Failed to fetch league data');
    } finally {
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [leagueConfigs, processSleeperData, previousMatchups, loading]);

  useEffect(() => {
    const timer = setTimeout(fetchSleeperData, 100);
    return () => {
      clearTimeout(timer);
      abortControllerRef.current?.abort();
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
    };
  }, [leagueConfigs, fetchSleeperData]);

  return {
    leagues,
    loading,
    error,
    lastUpdated,
    refetch: fetchSleeperData,
  };
};
