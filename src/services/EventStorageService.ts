import { ScoringEvent } from '../types/fantasy';
import { debugLogger } from '../utils/debugLogger';

export interface StoredEvent extends ScoringEvent {
  storedAt: string; // ISO timestamp when stored
  ttl: number; // Time to live in milliseconds
  leagueId?: string; // Optional league association
  hash: string; // Unique hash for deduplication
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
  private readonly STORAGE_KEY = 'fantasy_events_store';
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_EVENTS = 1000; // Prevent unlimited growth
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour cleanup interval
  
  private events: Map<string, StoredEvent> = new Map();
  private lastCleanup = 0;
  
  private constructor() {
    this.loadFromStorage();
    this.scheduleCleanup();
  }

  public static getInstance(): EventStorageService {
    if (!EventStorageService.instance) {
      EventStorageService.instance = new EventStorageService();
    }
    return EventStorageService.instance;
  }

  /**
   * Save a fantasy event with automatic deduplication
   */
  public saveEvent(fantasyEvent: ScoringEvent, leagueId?: string, customTTL?: number): boolean {
    try {
      // Generate unique hash for deduplication
      const hash = this.generateEventHash(fantasyEvent);
      
      // Check if event already exists
      if (this.events.has(hash)) {
        debugLogger.info('EVENT_STORAGE', 'Duplicate event ignored', {
          hash,
          playerName: fantasyEvent.playerName,
          action: fantasyEvent.action
        });
        return false;
      }

      const now = new Date();
      const ttl = customTTL || this.DEFAULT_TTL;
      
      const storedEvent: StoredEvent = {
        ...fantasyEvent,
        storedAt: now.toISOString(),
        ttl,
        leagueId,
        hash
      };

      this.events.set(hash, storedEvent);
      
      // Enforce max events limit
      this.enforceStorageLimit();
      
      // Save to localStorage
      this.saveToStorage();
      
      debugLogger.success('EVENT_STORAGE', 'Event saved successfully', {
        hash,
        playerName: fantasyEvent.playerName,
        scoreImpact: fantasyEvent.scoreImpact,
        leagueId,
        totalEvents: this.events.size
      });

      // Trigger cleanup if needed
      this.conditionalCleanup();
      
      return true;
      
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Failed to save event', {
        error: error.message,
        event: fantasyEvent
      });
      return false;
    }
  }

  /**
   * Get recent events within specified timeframe (in minutes)
   */
  public getRecentEvents(timeframeMinutes = 60): StoredEvent[] {
    const now = Date.now();
    const cutoffTime = now - (timeframeMinutes * 60 * 1000);
    
    const recentEvents = Array.from(this.events.values())
      .filter(event => {
        const eventTime = new Date(event.timestamp).getTime();
        return eventTime >= cutoffTime;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    debugLogger.info('EVENT_STORAGE', 'Retrieved recent events', {
      timeframeMinutes,
      eventCount: recentEvents.length,
      totalEvents: this.events.size
    });

    return recentEvents;
  }

  /**
   * Clear events older than specified hours (default 24 hours)
   */
  public clearOldEvents(hoursBack = 24): number {
    const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
    let removedCount = 0;

    for (const [hash, event] of this.events.entries()) {
      const eventTime = new Date(event.timestamp).getTime();
      const storedTime = new Date(event.storedAt).getTime();
      
      // Remove if event is older than cutoff or TTL has expired
      if (eventTime < cutoffTime || (storedTime + event.ttl) < Date.now()) {
        this.events.delete(hash);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.saveToStorage();
      debugLogger.info('EVENT_STORAGE', 'Cleared old events', {
        removedCount,
        hoursBack,
        remainingEvents: this.events.size
      });
    }

    return removedCount;
  }

  /**
   * Get events for a specific league
   */
  public getEventsByLeague(leagueId: string, timeframeMinutes?: number): StoredEvent[] {
    let events = Array.from(this.events.values())
      .filter(event => event.leagueId === leagueId);

    if (timeframeMinutes) {
      const cutoffTime = Date.now() - (timeframeMinutes * 60 * 1000);
      events = events.filter(event => {
        const eventTime = new Date(event.timestamp).getTime();
        return eventTime >= cutoffTime;
      });
    }

    const sortedEvents = events.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    debugLogger.info('EVENT_STORAGE', 'Retrieved league events', {
      leagueId,
      eventCount: sortedEvents.length,
      timeframeMinutes
    });

    return sortedEvents;
  }

  /**
   * Get filtered events based on criteria
   */
  public getFilteredEvents(filter: EventFilter): StoredEvent[] {
    let events = Array.from(this.events.values());

    // Apply league filter
    if (filter.leagueId) {
      events = events.filter(event => event.leagueId === filter.leagueId);
    }

    // Apply timeframe filter
    if (filter.timeframe) {
      const cutoffTime = Date.now() - (filter.timeframe * 60 * 1000);
      events = events.filter(event => {
        const eventTime = new Date(event.timestamp).getTime();
        return eventTime >= cutoffTime;
      });
    }

    // Apply player name filter
    if (filter.playerName) {
      const searchTerm = filter.playerName.toLowerCase();
      events = events.filter(event => 
        event.playerName.toLowerCase().includes(searchTerm)
      );
    }

    // Apply minimum points filter
    if (filter.minPoints !== undefined) {
      events = events.filter(event => 
        Math.abs(event.scoreImpact) >= filter.minPoints
      );
    }

    const sortedEvents = events.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    debugLogger.info('EVENT_STORAGE', 'Retrieved filtered events', {
      filter,
      eventCount: sortedEvents.length
    });

    return sortedEvents;
  }

  /**
   * Get storage statistics
   */
  public getStorageStats(): StorageStats {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    
    const events = Array.from(this.events.values());
    const eventsLast24h = events.filter(event => 
      new Date(event.timestamp).getTime() >= last24h
    ).length;

    const eventsByLeague: Record<string, number> = {};
    events.forEach(event => {
      if (event.leagueId) {
        eventsByLeague[event.leagueId] = (eventsByLeague[event.leagueId] || 0) + 1;
      }
    });

    const timestamps = events.map(e => new Date(e.timestamp).getTime());
    const oldestEvent = timestamps.length > 0 
      ? new Date(Math.min(...timestamps)).toISOString() 
      : null;
    const newestEvent = timestamps.length > 0 
      ? new Date(Math.max(...timestamps)).toISOString() 
      : null;

    // Approximate storage size
    const storageSize = this.getStorageSize();

    return {
      totalEvents: this.events.size,
      eventsLast24h,
      eventsByLeague,
      oldestEvent,
      newestEvent,
      storageSize
    };
  }

  /**
   * Batch save multiple events
   */
  public batchSaveEvents(events: ScoringEvent[], leagueId?: string): number {
    let savedCount = 0;
    
    for (const event of events) {
      if (this.saveEvent(event, leagueId)) {
        savedCount++;
      }
    }

    debugLogger.info('EVENT_STORAGE', 'Batch save completed', {
      totalEvents: events.length,
      savedCount,
      duplicatesSkipped: events.length - savedCount
    });

    return savedCount;
  }

  /**
   * Clear all events
   */
  public clearAllEvents(): void {
    const eventCount = this.events.size;
    this.events.clear();
    this.saveToStorage();
    
    debugLogger.info('EVENT_STORAGE', 'Cleared all events', {
      clearedCount: eventCount
    });
  }

  /**
   * Export events as JSON
   */
  public exportEvents(filter?: EventFilter): string {
    const events = filter ? this.getFilteredEvents(filter) : Array.from(this.events.values());
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      eventCount: events.length,
      filter,
      events
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import events from JSON
   */
  public importEvents(jsonData: string, mergeMode = true): number {
    try {
      const importData = JSON.parse(jsonData);
      const events: StoredEvent[] = importData.events || [];
      
      if (!mergeMode) {
        this.events.clear();
      }

      let importedCount = 0;
      for (const event of events) {
        // Validate event structure
        if (this.isValidStoredEvent(event)) {
          this.events.set(event.hash, event);
          importedCount++;
        }
      }

      this.saveToStorage();
      
      debugLogger.info('EVENT_STORAGE', 'Import completed', {
        totalEvents: events.length,
        importedCount,
        mergeMode
      });

      return importedCount;
      
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Import failed', {
        error: error.message
      });
      throw error;
    }
  }

  // Private helper methods

  private generateEventHash(event: ScoringEvent): string {
    // Create unique hash from event properties to prevent duplicates
    const hashInput = `${event.playerName}_${event.action}_${event.timestamp}_${event.scoreImpact}`;
    return btoa(hashInput).replace(/[^a-zA-Z0-9]/g, '');
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const events: StoredEvent[] = JSON.parse(stored);
        this.events.clear();
        
        events.forEach(event => {
          if (this.isValidStoredEvent(event)) {
            this.events.set(event.hash, event);
          }
        });

        debugLogger.info('EVENT_STORAGE', 'Loaded events from storage', {
          eventCount: this.events.size
        });
      }
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Failed to load from storage', {
        error: error.message
      });
      this.events.clear();
    }
  }

  private saveToStorage(): void {
    try {
      const events = Array.from(this.events.values());
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      debugLogger.error('EVENT_STORAGE', 'Failed to save to storage', {
        error: error.message,
        eventCount: this.events.size
      });
    }
  }

  private enforceStorageLimit(): void {
    if (this.events.size <= this.MAX_EVENTS) {
      return;
    }

    // Sort events by timestamp and remove oldest
    const events = Array.from(this.events.values())
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const toRemove = this.events.size - this.MAX_EVENTS;
    for (let i = 0; i < toRemove; i++) {
      this.events.delete(events[i].hash);
    }

    debugLogger.info('EVENT_STORAGE', 'Enforced storage limit', {
      removedEvents: toRemove,
      maxEvents: this.MAX_EVENTS,
      currentEvents: this.events.size
    });
  }

  private conditionalCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup >= this.CLEANUP_INTERVAL) {
      this.clearOldEvents();
      this.lastCleanup = now;
    }
  }

  private scheduleCleanup(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.clearOldEvents();
    }, this.CLEANUP_INTERVAL);

    // Run initial cleanup on startup
    setTimeout(() => {
      this.clearOldEvents();
    }, 5000); // 5 second delay on startup
  }

  private isValidStoredEvent(event: any): event is StoredEvent {
    return event &&
           typeof event.id === 'string' &&
           typeof event.playerName === 'string' &&
           typeof event.timestamp === 'string' &&
           typeof event.storedAt === 'string' &&
           typeof event.hash === 'string' &&
           typeof event.ttl === 'number';
  }

  private getStorageSize(): number {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? new Blob([stored]).size : 0;
    } catch {
      return 0;
    }
  }
}

// Export singleton instance
export const eventStorageService = EventStorageService.getInstance();