import { debugLogger } from '../utils/debugLogger';

// Configuration interfaces for scoring events
export interface ConfigScoringEvent {
  id: string;
  playerId: string;
  playerName: string;
  teamAbbr: string;
  eventType: 'rushing_td' | 'passing_td' | 'receiving_td' | 'rushing_yards' | 'passing_yards' | 'receiving_yards' | 'reception' | 'interception' | 'fumble' | 'fumble_lost' | 'field_goal' | 'safety' | 'two_point_conversion';
  description: string;
  fantasyPoints: number;
  timestamp: Date;
  week: number;
  leagueId: string;
}

export interface EventFilter {
  leagueId?: string;
  timeframe?: number; // Minutes to look back
  playerName?: string;
  minPoints?: number;
}

export interface StorageStats {
  totalEvents: number;
  eventsLast24h: number;
  eventsByLeague: Record<string, number>;
  oldestEvent: string | null;
  newestEvent: string | null;
  storageSize: number; // Approximate size in bytes
}

export class EventStorageService {
  private static instance: EventStorageService;
  private readonly storageKey = 'fantasy_scoring_events';
  private readonly maxEvents = 1000;
  private readonly ttlHours = 24;

  private constructor() {}

  public static getInstance(): EventStorageService {
    if (!EventStorageService.instance) {
      EventStorageService.instance = new EventStorageService();
    }
    return EventStorageService.instance;
  }

  /**
   * Add a new fantasy scoring event
   */
  addEvent(leagueId: string, event: ConfigScoringEvent): void {
    try {
      const events = this.getAllEvents();
      events.push(event);
      
      // Keep only last 1000 events to prevent storage bloat
      const trimmedEvents = events.slice(-this.maxEvents);
      
      localStorage.setItem(this.storageKey, JSON.stringify(trimmedEvents));
      
      debugLogger.info('EVENT_STORAGE', 'Event stored successfully', {
        eventId: event.id,
        player: event.playerName,
        points: event.fantasyPoints,
        leagueId
      });
      
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Failed to store event', error);
    }
  }

  /**
   * Legacy method for compatibility
   */
  storeEvent(event: ConfigScoringEvent): void {
    this.addEvent(event.leagueId, event);
  }

  /**
   * Get all events from storage
   */
  getAllEvents(): ConfigScoringEvent[] {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return [];
      
      const events = JSON.parse(stored);
      return events.map((event: any) => ({
        ...event,
        timestamp: new Date(event.timestamp)
      }));
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Failed to load events from storage', error);
      return [];
    }
  }

  /**
   * Get events for a specific league and week
   */
  getEvents(leagueId: string, week?: number): ConfigScoringEvent[] {
    const allEvents = this.getAllEvents();
    
    return allEvents.filter(event => 
      event.leagueId === leagueId && 
      (week === undefined || event.week === week)
    ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Legacy method for compatibility
   */
  getLeagueEvents(leagueId: string, week?: number): ConfigScoringEvent[] {
    return this.getEvents(leagueId, week);
  }

  /**
   * Get recent events across all leagues
   */
  getRecentEvents(limit: number = 20): ConfigScoringEvent[] {
    const allEvents = this.getAllEvents();
    return allEvents
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Filter events by criteria
   */
  filterEvents(filter: EventFilter): ConfigScoringEvent[] {
    let events = this.getAllEvents();

    if (filter.leagueId) {
      events = events.filter(e => e.leagueId === filter.leagueId);
    }

    if (filter.timeframe) {
      const cutoff = new Date(Date.now() - filter.timeframe * 60 * 1000);
      events = events.filter(e => e.timestamp > cutoff);
    }

    if (filter.playerName) {
      const searchTerm = filter.playerName.toLowerCase();
      events = events.filter(e => e.playerName.toLowerCase().includes(searchTerm));
    }

    if (filter.minPoints !== undefined) {
      events = events.filter(e => e.fantasyPoints >= filter.minPoints);
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Clear events for a specific league
   */
  clearLeagueEvents(leagueId: string): void {
    try {
      const allEvents = this.getAllEvents();
      const filteredEvents = allEvents.filter(e => e.leagueId !== leagueId);
      
      localStorage.setItem(this.storageKey, JSON.stringify(filteredEvents));
      
      debugLogger.info('EVENT_STORAGE', 'League events cleared', { leagueId });
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Failed to clear league events', error);
    }
  }

  /**
   * Clear all events
   */
  clearAllEvents(): void {
    try {
      localStorage.removeItem(this.storageKey);
      debugLogger.info('EVENT_STORAGE', 'All events cleared');
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Failed to clear all events', error);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): StorageStats {
    const events = this.getAllEvents();
    const leagues = Array.from(new Set(events.map(e => e.leagueId)));
    
    const timestamps = events.map(e => e.timestamp.getTime());
    const last24h = events.filter(e => 
      Date.now() - e.timestamp.getTime() < 24 * 60 * 60 * 1000
    ).length;

    const eventsByLeague: Record<string, number> = {};
    for (const league of leagues) {
      eventsByLeague[league] = events.filter(e => e.leagueId === league).length;
    }
    
    return {
      totalEvents: events.length,
      eventsLast24h: last24h,
      eventsByLeague,
      oldestEvent: timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : null,
      newestEvent: timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null,
      storageSize: JSON.stringify(events).length
    };
  }

  /**
   * Legacy method for compatibility
   */
  getStats(): StorageStats {
    return this.getCacheStats();
  }

  /**
   * Clean up old events
   */
  cleanup(): void {
    try {
      const cutoff = new Date(Date.now() - this.ttlHours * 60 * 60 * 1000);
      const events = this.getAllEvents();
      const validEvents = events.filter(e => e.timestamp > cutoff);
      
      if (validEvents.length !== events.length) {
        localStorage.setItem(this.storageKey, JSON.stringify(validEvents));
        debugLogger.info('EVENT_STORAGE', 'Cleanup completed', {
          removed: events.length - validEvents.length,
          remaining: validEvents.length
        });
      }
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Cleanup failed', error);
    }
  }
}

// Export singleton instance
export const eventStorageService = EventStorageService.getInstance();
