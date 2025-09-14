export interface YahooOAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface YahooTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface YahooUserInfo {
  guid: string;
  nickname: string;
  profile_url: string;
}

export interface YahooOAuthState {
  isConnected: boolean;
  userInfo: YahooUserInfo | null;
  tokens: YahooTokens | null;
  isLoading: boolean;
  error: string | null;
}

// Legacy Yahoo league interface (for backward compatibility)
export interface YahooLeague {
  league_key: string;
  league_id: string;
  name: string;
  url: string;
  logo_url?: string;
  num_teams: number;
  current_week: number;
  season: string;
  scoring_type: string;
  league_type: string;
  draft_status: string;
  start_date?: string;
  end_date?: string;
  start_week?: number;
  end_week?: number;
  felo_tier?: string;
  matchup_week?: number;
  platform?: string;
}

// Legacy Yahoo API Response (for backward compatibility)
export interface YahooAPIResponse {
  fantasy_content: {
    users: {
      [key: string]: {
        user: Array<{
          guid?: string;
          games?: any;
        }>;
      };
    };
  };
}