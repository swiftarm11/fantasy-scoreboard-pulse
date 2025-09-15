// Yahoo Fantasy API snapshot data loader
export interface YahooPlayer {
  player_key: string;
  player_id: string;
  name: {
    full: string;
    first: string;
    last: string;
    ascii_first: string;
    ascii_last: string;
  };
  status: string;
  position_type: string;
  eligible_positions: string[];
  selected_position: {
    coverage_type: string;
    week: string;
    position: string;
  };
  player_points: {
    coverage_type: string;
    week: string;
    total: string;
  };
  player_stats?: {
    coverage_type: string;
    week: string;
    stats: Array<{
      stat_id: string;
      value: string;
    }>;
  };
}

export interface YahooTeam {
  team_key: string;
  team_id: string;
  name: string;
  team_logo?: string;
  managers: Array<{
    manager_id: string;
    nickname: string;
  }>;
  points: {
    coverage_type: string;
    week: string;
    total: string;
  };
  roster: {
    coverage_type: string;
    week: string;
    players: YahooPlayer[];
  };
}

export interface YahooMatchup {
  week: string;
  week_start: string;
  week_end: string;
  status: 'midevent' | 'postevent' | 'preevent';
  is_playoffs: string;
  is_consolation: string;
  is_tied: number;
  teams: YahooTeam[];
}

export interface YahooLeague {
  league_key: string;
  league_id: string;
  name: string;
  draft_status: string;
  num_teams: number;
  current_week: string;
  start_week: string;
  end_week: string;
  scoring_type: string;
  league_type: string;
  is_finished: number;
  scoreboard: {
    week: string;
    matchups: YahooMatchup[];
  };
}

export interface YahooApiResponse {
  fantasy_content: {
    league: YahooLeague[];
  };
}

// Snapshot loading utilities
export class SnapshotLoader {
  private static snapshots: Map<number, YahooApiResponse> = new Map();
  private static maxSnapshots = 25;

  static async getSnapshot(index: number): Promise<YahooApiResponse | null> {
    // Ensure index is valid
    if (index < 1 || index > this.maxSnapshots) {
      console.warn(`Invalid snapshot index: ${index}. Must be between 1 and ${this.maxSnapshots}`);
      return null;
    }

    // Check cache first
    if (this.snapshots.has(index)) {
      return this.snapshots.get(index)!;
    }

    try {
      // Load snapshot from public folder
      const response = await fetch(`/testdata/snapshot_${index.toString().padStart(2, '0')}.json`);
      
      if (!response.ok) {
        console.error(`Failed to load snapshot ${index}: ${response.status}`);
        return null;
      }

      const data: YahooApiResponse = await response.json();
      
      // Validate data structure
      if (!this.validateSnapshot(data)) {
        console.error(`Invalid snapshot data structure for snapshot ${index}`);
        return null;
      }

      // Cache the snapshot
      this.snapshots.set(index, data);
      
      console.log(`Loaded snapshot ${index} with ${data.fantasy_content.league[0].scoreboard.matchups.length} matchups`);
      return data;

    } catch (error) {
      console.error(`Error loading snapshot ${index}:`, error);
      return null;
    }
  }

  static validateSnapshot(data: any): data is YahooApiResponse {
    return (
      data &&
      data.fantasy_content &&
      Array.isArray(data.fantasy_content.league) &&
      data.fantasy_content.league.length > 0 &&
      data.fantasy_content.league[0].scoreboard &&
      Array.isArray(data.fantasy_content.league[0].scoreboard.matchups)
    );
  }

  static async preloadSnapshots(indices: number[] = []): Promise<void> {
    const toLoad = indices.length > 0 ? indices : Array.from({ length: this.maxSnapshots }, (_, i) => i + 1);
    
    console.log(`Preloading ${toLoad.length} snapshots...`);
    
    const promises = toLoad.map(index => this.getSnapshot(index));
    await Promise.allSettled(promises);
    
    console.log(`Preloaded ${this.snapshots.size} snapshots successfully`);
  }

  static getLoadedSnapshotCount(): number {
    return this.snapshots.size;
  }

  static getMaxSnapshots(): number {
    return this.maxSnapshots;
  }

  static clearCache(): void {
    this.snapshots.clear();
    console.log('Snapshot cache cleared');
  }

  // Helper to get snapshot status summary
  static async getSnapshotSummary(index: number): Promise<{
    index: number;
    status: string;
    totalPoints: number;
    matchupCount: number;
    timestamp: string;
  } | null> {
    const snapshot = await this.getSnapshot(index);
    if (!snapshot) return null;

    const league = snapshot.fantasy_content.league[0];
    const matchups = league.scoreboard.matchups;
    
    const totalPoints = matchups.reduce((total, matchup) => {
      return total + matchup.teams.reduce((teamTotal, team) => {
        return teamTotal + parseFloat(team.points.total || '0');
      }, 0);
    }, 0);

    return {
      index,
      status: matchups[0]?.status || 'unknown',
      totalPoints,
      matchupCount: matchups.length,
      timestamp: new Date().toISOString()
    };
  }
}

// Export for direct use (alias removed to fix duplicate exports)