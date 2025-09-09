// Common league interface used across Yahoo and Sleeper
export interface League {
  id: string;                    // league_key (Yahoo) or league_id (Sleeper)
  platform: 'yahoo' | 'sleeper'; // Platform identifier
  name: string;                   // League name
  season: string;                 // Season year (e.g., "2025")
  
  // League structure
  num_teams: number;              // Number of teams in league
  current_week: number;           // Current NFL week
  
  // League status
  draft_status: 'pre_draft' | 'drafting' | 'post_draft';
  league_type: 'private' | 'public';
  
  // Schedule
  start_date: string;             // League start date (YYYY-MM-DD)
  end_date: string;               // League end date (YYYY-MM-DD)
  start_week: number;             // First week of season
  end_week: number;               // Last week of season
  
  // Scoring
  scoring_type: 'head_to_head' | 'points' | 'roto';
  
  // URLs and metadata
  url?: string;                   // League URL (Yahoo only)
  logo_url?: string;             // League logo
  
  // Platform-specific data (stored as generic object)
  platform_data?: Record<string, any>;
}

// Team within a league
export interface Team {
  id: string;                     // team_key (Yahoo) or roster_id (Sleeper)
  league_id: string;              // Parent league ID
  platform: 'yahoo' | 'sleeper';
  
  // Team identity  
  name: string;                   // Team name
  owner_name?: string;            // Owner display name
  logo_url?: string;             // Team logo
  
  // Team performance
  wins: number;
  losses: number;
  ties: number;
  points_for: number;             // Total points scored
  points_against: number;         // Total points allowed
  
  // Current standings
  rank?: number;                  // Current ranking in league
  playoff_seed?: number;          // Playoff seeding
  
  // Week-specific data
  current_week_points?: number;   // Points this week
  projected_points?: number;      // Projected points this week
  
  // Platform-specific data
  platform_data?: Record<string, any>;
}

// Player on a roster
export interface RosterPlayer {
  id: string;                     // player_key (Yahoo) or player_id (Sleeper)
  platform: 'yahoo' | 'sleeper';
  
  // Player identity
  name: string;                   // Full name
  position: string;               // QB, RB, WR, TE, K, DEF
  team: string;                   // NFL team abbreviation
  
  // Roster status
  roster_position: string;        // Starting lineup position or bench
  is_starter: boolean;            // Currently in starting lineup
  
  // Scoring
  current_week_points?: number;   // Points scored this week
  projected_points?: number;      // Projected points this week
  season_points?: number;         // Total season points
  
  // Platform-specific data (for player mapping)
  platform_data?: Record<string, any>;
}

// Scoring event for real-time updates  
export interface ScoringEvent {
  id: string;                     // Unique event ID
  league_id: string;              // League this event affects
  team_id: string;                // Team that owns the player
  player_id: string;              // Player who scored
  platform: 'yahoo' | 'sleeper';
  
  // Event details
  event_type: 'touchdown' | 'field_goal' | 'interception' | 'fumble' | 'yardage' | 'other';
  description: string;            // Human-readable event description
  points: number;                 // Fantasy points awarded
  timestamp: Date;                // When the event occurred
  nfl_week: number;               // NFL week number
  
  // Game context
  nfl_game_id?: string;           // ESPN game ID
  quarter?: number;               // Game quarter
  time_remaining?: string;        // Time remaining in quarter
  
  // Platform-specific data
  platform_data?: Record<string, any>;
}
