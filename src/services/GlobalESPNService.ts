import { supabase } from '../integrations/supabase/client';
import { debugLogger } from '../utils/debugLogger';

export interface ScoreboardGame {
  id: string;
  date: string;
  name: string;
  shortName: string;
  competitors: Array<{
    id: string;
    team: {
      id: string;
      abbreviation: string;
      displayName: string;
      color: string;
      alternateColor: string;
    };
    score: string;
    homeAway: 'home' | 'away';
  }>;
  status: {
    type: {
      id: string;
      name: string;
      state: string;
      completed: boolean;
    };
    period: number;
    clock: string;
  };
}

export interface ScoreboardData {
  games: ScoreboardGame[];
  week: number;
  season: number;
  lastUpdated: Date;
}

type SubscriberCallback = (data: ScoreboardData | null, error: string | null) => void;

class GlobalESPNService {
  private static instance: GlobalESPNService | null = null;
  private subscribers = new Set<SubscriberCallback>();
  private pollingInterval: number | null = null;
  private currentData: ScoreboardData | null = null;
  private lastError: string | null = null;
  private isPolling = false;
  private retryCount = 0;
  private readonly maxRetries = 3;
  private readonly pollingIntervalMs = 20000; // 20 seconds as requested

  static getInstance(): GlobalESPNService {
    if (!GlobalESPNService.instance) {
      GlobalESPNService.instance = new GlobalESPNService();
    }
    return GlobalESPNService.instance;
  }

  subscribe(callback: SubscriberCallback): () => void {
    this.subscribers.add(callback);
    
    // Immediately provide current data to new subscriber
    callback(this.currentData, this.lastError);
    
    // Start polling if this is the first subscriber
    if (this.subscribers.size === 1 && !this.isPolling) {
      this.startPolling();
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
      
      // Stop polling if no subscribers remain
      if (this.subscribers.size === 0) {
        this.stopPolling();
      }
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => {
      callback(this.currentData, this.lastError);
    });
  }

  private async fetchData(): Promise<void> {
    try {
      debugLogger.info('ESPN_SERVICE', 'Fetching NFL scoreboard data');
      
      const { data, error: supabaseError } = await supabase.functions.invoke('espn-api', {
        body: { endpoint: 'scoreboard' }
      });

      // Log detailed error information for debugging
      if (supabaseError) {
        debugLogger.error('ESPN_SERVICE', 'Supabase function error', {
          message: supabaseError.message,
          details: supabaseError.details,
          hint: supabaseError.hint,
          code: supabaseError.code
        });
        throw new Error(`Supabase function failed: ${supabaseError.message} (Code: ${supabaseError.code || 'unknown'})`);
      }

      if (!data) {
        throw new Error('No data returned from ESPN API function');
      }

      // Check if response indicates an error from the edge function
      if (data.error) {
        throw new Error(`ESPN API error: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
      }

      // Process ESPN API response
      const processedData: ScoreboardData = {
        games: data.events?.map((event: any) => ({
          id: event.id,
          date: event.date,
          name: event.name,
          shortName: event.shortName,
          competitors: event.competitions?.[0]?.competitors?.map((comp: any) => ({
            id: comp.id,
            team: {
              id: comp.team.id,
              abbreviation: comp.team.abbreviation,
              displayName: comp.team.displayName,
              color: comp.team.color,
              alternateColor: comp.team.alternateColor,
            },
            score: comp.score,
            homeAway: comp.homeAway,
          })) || [],
          status: {
            type: {
              id: event.status.type.id,
              name: event.status.type.name,
              state: event.status.type.state,
              completed: event.status.type.completed,
            },
            period: event.status.period,
            clock: event.status.displayClock,
          },
        })) || [],
        week: data.week?.number || 1,
        season: data.season?.year || new Date().getFullYear(),
        lastUpdated: new Date(),
      };

      this.currentData = processedData;
      this.lastError = null;
      this.retryCount = 0;

      debugLogger.info('ESPN_SERVICE', 'Data fetched successfully', {
        gamesCount: processedData.games.length,
        week: processedData.week,
        liveGames: processedData.games.filter(g => g.status.type.state === 'in').length
      });

      this.notifySubscribers();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      debugLogger.error('ESPN_SERVICE', 'Failed to fetch data', { error: errorMessage, retryCount: this.retryCount });
      
      this.lastError = errorMessage;
      this.retryCount++;

      // Retry with exponential backoff
      if (this.retryCount <= this.maxRetries) {
        const retryDelay = Math.min(1000 * Math.pow(2, this.retryCount - 1), 10000); // Max 10 seconds
        debugLogger.info('ESPN_SERVICE', `Retrying in ${retryDelay}ms (attempt ${this.retryCount}/${this.maxRetries})`);
        
        setTimeout(() => {
          this.fetchData();
        }, retryDelay);
      } else {
        // Max retries reached, notify subscribers of error
        this.notifySubscribers();
      }
    }
  }

  private startPolling(): void {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    debugLogger.info('ESPN_SERVICE', `Starting polling every ${this.pollingIntervalMs}ms`);

    // Fetch immediately
    this.fetchData();

    // Set up interval
    this.pollingInterval = window.setInterval(() => {
      this.fetchData();
    }, this.pollingIntervalMs);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
    debugLogger.info('ESPN_SERVICE', 'Stopped polling');
  }

  // Public method to force a refresh
  refreshData(): void {
    if (this.isPolling) {
      this.fetchData();
    }
  }

  // Get current data without subscribing
  getCurrentData(): { data: ScoreboardData | null; error: string | null } {
    return {
      data: this.currentData,
      error: this.lastError
    };
  }

  // Check if we have live games
  hasLiveGames(): boolean {
    if (!this.currentData) return false;
    return this.currentData.games.some(game => 
      game.status.type.state === 'in' || game.status.type.state === 'pre'
    );
  }
}

export const globalESPNService = GlobalESPNService.getInstance();