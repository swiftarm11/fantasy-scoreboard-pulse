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
  // Yahoo API specific properties
  league_key?: string;
  league_id?: string;
  name?: string;
  num_teams?: number;
  season?: string;
  current_week?: string;
  start_week?: string;
  end_week?: string;
  is_finished?: number | string;
  url?: string;
  logo_url?: string;
  draft_status?: string;
  max_teams?: number;
  weekly_deadline?: string;
  league_update_timestamp?: string;
  scoring_type?: string;
  league_type?: string;
  renew?: string;
  renewed?: string;
  iris_group_chat_id?: string;
  allow_add_to_dl_extra_pos?: number;
  is_pro_league?: string;
  is_cash_league?: string;
  current_week_number?: number;
  teams?: any[];
}

export interface MatchupData {
  id: string;
  week: number;
  teams: Array<{
    team_key: string;
    team_id: string;
    name: string;
    points: number;
  }>;
}

export interface PlayerData {
  player_key: string;
  player_id: string;
  name: {
    full: string;
    first: string;
    last: string;
  };
  position: string;
  team: string;
  points?: number;
}