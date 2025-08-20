import { Platform } from './fantasy';

export interface LeagueConfig {
  id: string;
  leagueId: string;
  customTeamName?: string;
  platform: Platform;
  enabled: boolean;
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

export interface DashboardConfig {
  leagues: LeagueConfig[];
  polling: PollingConfig;
  notifications: NotificationConfig;
  version: string;
}

export const DEFAULT_CONFIG: DashboardConfig = {
  leagues: [],
  polling: {
    updateFrequency: 30,
    smartPolling: true,
    gameHourPolling: true,
  },
  notifications: {
    scoringEvents: true,
    winProbabilityChanges: true,
    gameStartReminders: false,
    playSound: false,
  },
  version: '1.0.0',
};

export const GAME_HOURS = {
  sunday: { start: 13, end: 23 }, // 1 PM - 11 PM EST
  monday: { start: 20, end: 23 },  // 8 PM - 11 PM EST
};