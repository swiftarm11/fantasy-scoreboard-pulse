export type Platform = 'Sleeper' | 'Yahoo' | 'NFL.com' | 'ESPN';

export interface ScoringEvent {
  id: string;
  playerName: string;
  position: string;
  weeklyPoints: number;
  action: string;
  scoreImpact: number;
  timestamp: string;
  isRecent?: boolean;
}

export interface LeagueData {
  id: string;
  leagueName: string;
  platform: Platform;
  teamName: string;
  myScore: number;
  opponentScore: number;
  opponentName: string;
  record: string;
  leaguePosition: string;
  status: 'winning' | 'losing' | 'neutral';
  scoringEvents: ScoringEvent[];
  lastUpdated: string;
  // New properties for enhanced features
  week?: number;
  winProbability?: number;
  winProbabilityTrend?: number;
  wins?: number;
  losses?: number;
  rank?: number;
  totalTeams?: number;
  events?: Array<{
    player: string;
    action: string;
    points: number;
  }>;
}