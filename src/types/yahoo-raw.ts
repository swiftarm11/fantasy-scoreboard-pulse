// Import dependencies
import { League } from './fantasy';

// Raw Yahoo API response types - INTERNAL USE ONLY
// These match the exact structure you showed me earlier

export interface YahooAPIResponse {
  fantasy_content: {
    users: {
      [key: string]: {
        user: Array<{
          guid?: string;
          games?: {
            [key: string]: {
              game: Array<{
                game_key?: string;
                leagues?: {
                  [key: string]: {
                    league: YahooLeagueRaw[];
                  } | number;
                };
              }>;
            };
          };
        }>;
      };
    };
    time?: string;
    copyright?: string;
    refresh_rate?: string;
  };
}

export interface YahooLeagueRaw {
  league_key: string;
  league_id: string;
  name: string;
  url: string;
  logo_url?: string;
  num_teams: string;           // Yahoo returns as string
  current_week: string;        // Yahoo returns as string  
  start_date: string;
  end_date: string;
  start_week: string;          // Yahoo returns as string
  end_week: string;            // Yahoo returns as string
  scoring_type: string;
  league_type: string;
  season: string;
  draft_status: string;
  felo_tier?: string;
  matchup_week: string;        // Yahoo returns as string
  weekly_deadline?: string;
  league_update_timestamp?: string;
  // ... other Yahoo-specific fields
}

// Conversion function from raw Yahoo to common League interface
export const convertYahooLeague = (raw: YahooLeagueRaw): League => ({
  id: raw.league_key,
  platform: 'yahoo',
  name: raw.name,
  season: raw.season,
  num_teams: parseInt(raw.num_teams) || 0,
  current_week: parseInt(raw.current_week) || 1,
  draft_status: raw.draft_status === 'postdraft' ? 'post_draft' : 
                raw.draft_status === 'predraft' ? 'pre_draft' : 'drafting',
  league_type: raw.league_type as 'private' | 'public',
  start_date: raw.start_date,
  end_date: raw.end_date, 
  start_week: parseInt(raw.start_week) || 1,
  end_week: parseInt(raw.end_week) || 17,
  scoring_type: raw.scoring_type === 'head' ? 'head_to_head' : 'points',
  url: raw.url,
  logo_url: raw.logo_url,
  platform_data: {
    felo_tier: raw.felo_tier,
    matchup_week: parseInt(raw.matchup_week || '1'),
    league_update_timestamp: raw.league_update_timestamp
  }
});
