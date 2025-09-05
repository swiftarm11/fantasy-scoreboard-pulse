import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';

export interface ScoreboardGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  competitors: Array<{
    id: string;
    team: {
      id: string;
      abbreviation: string;
      displayName: string;
      color: string;
      alternateColor: string;
    };
    score: string;
    homeAway: 'home' | 'away';
  }>;
  status: {
    type: {
      id: string;
      name: string;
      state: string;
      completed: boolean;
    };
    period: number;
    clock: string;
  };
}

export interface ScoreboardData {
  games: ScoreboardGame[];
  week: number;
  season: number;
}

const DEBOUNCE_DELAY = 2000; // 2 seconds
const POLLING_INTERVAL = 60000; // 1 minute
const MAX_RETRIES = 3;

export const useESPNData = () => {
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();
  const pollingIntervalRef = useRef<NodeJS.Timeout>();
  const retryCountRef = useRef(0);

  // Debounced fetch function
  const debouncedFetch = useCallback((endpoint: string, params: Record<string, string> = {}) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(async () => {
      await fetchESPNData(endpoint, params);
    }, DEBOUNCE_DELAY);
  }, []);

  const fetchESPNData = useCallback(async (endpoint: string, params: Record<string, string> = {}, retryCount = 0) => {
    if (retryCount === 0) {
      setLoading(true);
      setError(null);
    }

    try {
      const { data, error: supabaseError } = await supabase.functions.invoke('espn-api', {
        body: { endpoint, ...params }
      });

      if (supabaseError) {
        throw new Error(supabaseError.message);
      }

      if (endpoint === 'scoreboard') {
        setScoreboardData({
          games: data.events?.map((event: any) => ({
            id: event.id,
            date: event.date,
            name: event.name,
            shortName: event.shortName,
            competitors: event.competitions?.[0]?.competitors?.map((comp: any) => ({
              id: comp.id,
              team: {
                id: comp.team.id,
                abbreviation: comp.team.abbreviation,
                displayName: comp.team.displayName,
                color: comp.team.color,
                alternateColor: comp.team.alternateColor,
              },
              score: comp.score,
              homeAway: comp.homeAway,
            })) || [],
            status: {
              type: {
                id: event.status.type.id,
                name: event.status.type.name,
                state: event.status.type.state,
                completed: event.status.type.completed,
              },
              period: event.status.period,
              clock: event.status.displayClock,
            },
          })) || [],
          week: data.week?.number || 1,
          season: data.season?.year || new Date().getFullYear(),
        });
      }

      setLastFetch(new Date());
      retryCountRef.current = 0;

    } catch (err) {
      console.error('ESPN API error:', err);
      
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying ESPN API call (${retryCount + 1}/${MAX_RETRIES})`);
        setTimeout(() => {
          fetchESPNData(endpoint, params, retryCount + 1);
        }, 1000 * (retryCount + 1)); // Exponential backoff
        return;
      }

      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      retryCountRef.current = 0;
    } finally {
      if (retryCount === 0) {
        setLoading(false);
      }
    }
  }, []);

  // Fetch current scoreboard
  const fetchScoreboard = useCallback((week?: number) => {
    const params = week ? { week: week.toString() } : {};
    debouncedFetch('scoreboard', params);
  }, [debouncedFetch]);

  // Start live polling
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    pollingIntervalRef.current = setInterval(() => {
      fetchScoreboard();
    }, POLLING_INTERVAL);
  }, [fetchScoreboard]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = undefined;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  return {
    scoreboardData,
    loading,
    error,
    lastFetch,
    fetchScoreboard,
    startPolling,
    stopPolling,
    // Utility functions
    isPolling: !!pollingIntervalRef.current,
  };
};
