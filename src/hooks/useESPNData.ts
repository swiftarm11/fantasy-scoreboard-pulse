import { useState, useEffect } from 'react';
import { globalESPNService, ScoreboardData } from '../services/GlobalESPNService';

export type { ScoreboardGame, ScoreboardData } from '../services/GlobalESPNService';

interface UseESPNDataReturn {
  scoreboardData: ScoreboardData | null;
  loading: boolean;
  error: string | null;
  lastFetch: Date | null;
  isPolling: boolean;
  hasLiveGames: boolean;
  refreshData: () => void;
  // Legacy compatibility methods (deprecated - use refreshData instead)
  fetchScoreboard: (week?: number) => void;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useESPNData = (): UseESPNDataReturn => {
  const [scoreboardData, setScoreboardData] = useState<ScoreboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Get initial data
    const { data, error } = globalESPNService.getCurrentData();
    setScoreboardData(data);
    setError(error);
    setLoading(!data && !error); // Loading if no data and no error

    // Subscribe to updates
    const unsubscribe = globalESPNService.subscribe((data, error) => {
      setScoreboardData(data);
      setError(error);
      setLoading(false); // Stop loading once we get any response
    });

    return unsubscribe;
  }, []);

  return {
    scoreboardData,
    loading,
    error,
    lastFetch: scoreboardData?.lastUpdated || null,
    isPolling: true, // Global service handles polling
    hasLiveGames: globalESPNService.hasLiveGames(),
    refreshData: () => globalESPNService.refreshData(),
    // Legacy compatibility methods (just redirect to global service)
    fetchScoreboard: () => globalESPNService.refreshData(),
    startPolling: () => {}, // No-op since global service handles polling
    stopPolling: () => {}, // No-op since global service handles polling
  };
};
