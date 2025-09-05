// src/utils/config.ts

export const STORAGE_KEYS = {
  TOKENS: 'yahoo_oauth_tokens',
  USER_INFO: 'yahoo_oauth_user_info',
  STATE: 'yahoo_oauth_state',
  CODE_VERIFIER: 'yahoo_oauth_code_verifier',
};

export interface YahooTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface YahooConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  isConfigured: boolean;
}

// Load and validate environment variables
export const YAHOO_CONFIG: YahooConfig = {
  clientId: import.meta.env.VITE_YAHOO_CLIENT_ID!,
  redirectUri: import.meta.env.VITE_YAHOO_REDIRECT_URI!,
  scopes: ['fspt-r'],
  isConfigured:
    !!import.meta.env.VITE_YAHOO_CLIENT_ID &&
    !!import.meta.env.VITE_YAHOO_REDIRECT_URI,
};

// Helper to throw if misconfigured
export function validateYahooConfig(): void {
  if (!YAHOO_CONFIG.isConfigured) {
    throw new Error(
      'Yahoo OAuth not configured. Set VITE_YAHOO_CLIENT_ID and VITE_YAHOO_REDIRECT_URI.'
/* ─────────────────────────  LIVE-SCORING ADDITIONS  ───────────────────────── */

export interface MatchupTeam {
  team_key: string;
  team_id: string;
  name: string;
  team_points?: {
    coverage_type: string;
    week: string;
    total: string;
  };
  team_projected_points?: {
    coverage_type: string;
    week: string;
    total: string;
  };
}

export interface Matchup {
  week: string;
  week_start: string;
  week_end: string;
  status: string;
  is_playoffs: string;
  is_consolation: string;
  is_tied: number;
  winner_team_key?: string;
  teams: MatchupTeam[];
}

export interface Scoreboard {
  matchups: Matchup[];
}

/* keep existing LeagueData but extend with scoreboard + current scores */
declare module './config' {
  interface LeagueData {
    scoreboard?: Scoreboard;
    user_team?: LeagueData['user_team'] & {
      current_score?: string;
      projected_score?: string;
    };
  }
}
