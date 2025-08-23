import { Platform } from './fantasy';

export interface LeagueConfig {
  id: string;
  leagueId: string;
  platform: Platform;
  enabled: boolean;
  customTeamName?: string;
  sleeperUserId?: string; // Add this line
}
export interface PollingConfig {
  updateFrequency: 15 | 30 | 60; // seconds
  smartPolling: boolean;
  gameHourPolling: boolean;
}

export interface NotificationConfig {
  scoringEvents: boolean;
  winProbabilityChanges: boolean;
  gameStartReminders: boolean;
  playSound: boolean;
}

export interface DebugConfig {
  enabled: boolean;
  showInProduction: boolean;
}

export interface DemoModeConfig {
  enabled: boolean;
  updateInterval: number; // seconds
}

export interface DisplayConfig {
  compactView: boolean;
  showWinProbabilityTrends: boolean;
  showPerformanceMetrics: boolean;
}

export interface AdvancedPollingConfig extends PollingConfig {
  gameHourIntervals: {
    sunday: number; // seconds
    monday: number; // seconds
    normal: number; // seconds
  };
}

export interface DashboardConfig {
  leagues: LeagueConfig[];
  polling: AdvancedPollingConfig;
  notifications: NotificationConfig;
  debug: DebugConfig;
  demoMode: DemoModeConfig;
  display: DisplayConfig;
  version: string;
}

export const DEFAULT_CONFIG: DashboardConfig = {
  leagues: [],
  polling: {
    updateFrequency: 30,
    smartPolling: true,
    gameHourPolling: true,
    gameHourIntervals: {
      sunday: 15,    // 15 seconds during Sunday games
      monday: 15,    // 15 seconds during Monday games  
      normal: 60,    // 60 seconds otherwise
    },
  },
  notifications: {
    scoringEvents: true,
    winProbabilityChanges: true,
    gameStartReminders: false,
    playSound: false,
  },
  debug: {
    enabled: false,
    showInProduction: false,
  },
  demoMode: {
    enabled: false,
    updateInterval: 20, // 20 seconds
  },
  display: {
    compactView: false,
    showWinProbabilityTrends: true,
    showPerformanceMetrics: false,
  },
  version: '1.0.0',
};

export const GAME_HOURS = {
  sunday: { start: 13, end: 23 }, // 1 PM - 11 PM EST
  monday: { start: 20, end: 23 },  // 8 PM - 11 PM EST
};
