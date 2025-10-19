import { useCallback } from "react";
import { useLiveEventsSystem } from "./useLiveEventsSystem";
import { LeagueConfig } from "../types/config";
import { debugLogger } from "../utils/debugLogger";

interface UseLiveEventsManagerOptions {
  enabled: boolean;
  leagues: LeagueConfig[];
  pollingInterval?: number;
}

export const useLiveEventsManager = ({ enabled, leagues, pollingInterval = 300000 }: UseLiveEventsManagerOptions) => {
  const liveEventsSystem = useLiveEventsSystem({
    leagues,
    enabled,
    pollingInterval
  });

  // Expose to window for debugging
  if (typeof window !== 'undefined') {
    (window as any).liveEventsManager = {
      state: liveEventsSystem.liveState,
      isReady: liveEventsSystem.isSystemReady,
      startSystem: liveEventsSystem.startSystem,
      stopSystem: liveEventsSystem.stopSystem,
      refreshRosters: liveEventsSystem.refreshRosters,
      getRecentEvents: liveEventsSystem.getRecentEvents,
      getCacheStats: liveEventsSystem.getCacheStats,
      triggerTestEvent: liveEventsSystem.triggerTestEvent
    };
  }

  return {
    state: liveEventsSystem.liveState,
    recentEvents: liveEventsSystem.recentEvents,
    isReady: liveEventsSystem.isSystemReady,
    startSystem: liveEventsSystem.startSystem,
    stopSystem: liveEventsSystem.stopSystem,
    refreshRosters: liveEventsSystem.refreshRosters,
    getLeagueEvents: liveEventsSystem.getLeagueEvents,
    getCacheStats: liveEventsSystem.getCacheStats,
    triggerTestEvent: liveEventsSystem.triggerTestEvent,
    getRecentEvents: liveEventsSystem.getRecentEvents,
    getState: liveEventsSystem.getState
  };
};
