import { supabase } from '../integrations/supabase/client';
import { debugLogger } from '../utils/debugLogger';
import { ConfigScoringEvent } from './EventStorageService';

export interface ScoringEventRecord {
  id?: string;
  league_id: string;
  team_id?: string;
  player_id: string;
  player_name: string;
  team_abbr: string;
  event_type: string;
  description: string;
  fantasy_points: number;
  nfl_week: number;
  season: number;
  timestamp: string;
  quarter?: number;
  time_remaining?: string;
  nfl_game_id?: string;
}

export class SupabaseScoringEventService {
  private static instance: SupabaseScoringEventService;
  private currentSeason = 2025;

  private constructor() {}

  public static getInstance(): SupabaseScoringEventService {
    if (!SupabaseScoringEventService.instance) {
      SupabaseScoringEventService.instance = new SupabaseScoringEventService();
    }
    return SupabaseScoringEventService.instance;
  }

  /**
   * Save a scoring event to Supabase (fire-and-forget)
   */
  async saveEvent(event: ConfigScoringEvent): Promise<void> {
    try {
      const record: ScoringEventRecord = {
        league_id: event.leagueId,
        player_id: event.playerId,
        player_name: event.playerName,
        team_abbr: event.teamAbbr,
        event_type: event.eventType,
        description: event.description,
        fantasy_points: event.fantasyPoints,
        nfl_week: event.week,
        season: this.currentSeason,
        timestamp: event.timestamp.toISOString()
      };

      const { error } = await supabase
        .from('scoring_events')
        .insert(record);

      if (error) {
        debugLogger.error('SUPABASE_EVENTS', 'Failed to save event to Supabase', {
          error: error.message,
          event: event.id
        });
      } else {
        debugLogger.info('SUPABASE_EVENTS', 'Event saved to Supabase', {
          player: event.playerName,
          points: event.fantasyPoints,
          week: event.week
        });
      }
    } catch (error) {
      debugLogger.error('SUPABASE_EVENTS', 'Exception saving event', error);
    }
  }

  /**
   * Get events for current week across specified leagues
   */
  async getCurrentWeekEvents(leagueIds: string[], currentWeek: number): Promise<ConfigScoringEvent[]> {
    try {
      const { data, error } = await supabase
        .from('scoring_events')
        .select('*')
        .in('league_id', leagueIds)
        .eq('nfl_week', currentWeek)
        .eq('season', this.currentSeason)
        .order('timestamp', { ascending: false });

      if (error) {
        debugLogger.error('SUPABASE_EVENTS', 'Failed to fetch current week events', error);
        return [];
      }

      return this.mapRecordsToEvents(data || []);
    } catch (error) {
      debugLogger.error('SUPABASE_EVENTS', 'Exception fetching events', error);
      return [];
    }
  }

  /**
   * Get events for a specific week and league
   */
  async getEventsByWeek(week: number, leagueIds: string[]): Promise<ConfigScoringEvent[]> {
    try {
      const { data, error } = await supabase
        .from('scoring_events')
        .select('*')
        .in('league_id', leagueIds)
        .eq('nfl_week', week)
        .eq('season', this.currentSeason)
        .order('timestamp', { ascending: false });

      if (error) {
        debugLogger.error('SUPABASE_EVENTS', 'Failed to fetch week events', error);
        return [];
      }

      return this.mapRecordsToEvents(data || []);
    } catch (error) {
      debugLogger.error('SUPABASE_EVENTS', 'Exception fetching week events', error);
      return [];
    }
  }

  /**
   * Clean up old events (keep only current week + 1 previous week)
   */
  async cleanupOldEvents(currentWeek: number, weeksToKeep: number = 2): Promise<void> {
    try {
      const cutoffWeek = currentWeek - weeksToKeep;

      const { error } = await supabase
        .from('scoring_events')
        .delete()
        .eq('season', this.currentSeason)
        .lt('nfl_week', cutoffWeek);

      if (error) {
        debugLogger.error('SUPABASE_EVENTS', 'Failed to cleanup old events', error);
      } else {
        debugLogger.info('SUPABASE_EVENTS', 'Old events cleaned up', {
          cutoffWeek,
          season: this.currentSeason
        });
      }
    } catch (error) {
      debugLogger.error('SUPABASE_EVENTS', 'Exception during cleanup', error);
    }
  }

  /**
   * Get statistics about stored events
   */
  async getStats(): Promise<{
    totalEvents: number;
    eventsByWeek: Record<number, number>;
    eventsByLeague: Record<string, number>;
  }> {
    try {
      const { data, error } = await supabase
        .from('scoring_events')
        .select('league_id, nfl_week')
        .eq('season', this.currentSeason);

      if (error || !data) {
        return {
          totalEvents: 0,
          eventsByWeek: {},
          eventsByLeague: {}
        };
      }

      const eventsByWeek: Record<number, number> = {};
      const eventsByLeague: Record<string, number> = {};

      for (const event of data) {
        eventsByWeek[event.nfl_week] = (eventsByWeek[event.nfl_week] || 0) + 1;
        eventsByLeague[event.league_id] = (eventsByLeague[event.league_id] || 0) + 1;
      }

      return {
        totalEvents: data.length,
        eventsByWeek,
        eventsByLeague
      };
    } catch (error) {
      debugLogger.error('SUPABASE_EVENTS', 'Exception fetching stats', error);
      return {
        totalEvents: 0,
        eventsByWeek: {},
        eventsByLeague: {}
      };
    }
  }

  /**
   * Map database records to ConfigScoringEvent format
   */
  private mapRecordsToEvents(records: any[]): ConfigScoringEvent[] {
    return records.map(record => ({
      id: record.id,
      playerId: record.player_id,
      playerName: record.player_name,
      teamAbbr: record.team_abbr,
      eventType: record.event_type as ConfigScoringEvent['eventType'],
      description: record.description,
      fantasyPoints: parseFloat(record.fantasy_points),
      timestamp: new Date(record.timestamp),
      week: record.nfl_week,
      leagueId: record.league_id
    }));
  }
}

export const supabaseScoringEventService = SupabaseScoringEventService.getInstance();
