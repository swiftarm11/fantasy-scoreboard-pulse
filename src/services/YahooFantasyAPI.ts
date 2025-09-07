import { Platform } from '../types/fantasy';
import { debugLogger } from '../utils/debugLogger';

interface YahooRosterResponse {
  team: Array<{
    team_id: string;
    name: string;
    roster: {
      players: {
        player: Array<{
          player_id: string;
          name: {
            full: string;
            display_name?: string;
          };
          position_type?: string;
          primary_position?: string;
          editorial_team_abbr?: string;
          selected_position?: {
            position: string;
          };
          status_full?: string;
        }>;
      };
    };
  }>;
}

export class YahooFantasyAPIService {
  private static instance: YahooFantasyAPIService;
  private activeRequests = new Map<string, Promise<any>>();
  private lastKnownGoodData = new Map<string, { data: any; timestamp: number }>();

  private constructor() {}

  public static getInstance(): YahooFantasyAPIService {
    if (!YahooFantasyAPIService.instance) {
      YahooFantasyAPIService.instance = new YahooFantasyAPIService();
    }
    return YahooFantasyAPIService.instance;
  }

  /**
   * Get team roster for a specific league and team
   */
  async getTeamRoster(leagueId: string, teamId: string): Promise<any> {
    try {
      debugLogger.info('YAHOO_API', 'Fetching team roster', { leagueId, teamId });
      
      // Mock implementation for now - replace with actual API call
      const mockRoster = {
        team_id: teamId,
        team_name: `Team ${teamId}`,
        players: [
          {
            player_id: 'mock-player-1',
            name: { full: 'Mock Player 1', display_name: 'M. Player' },
            position_type: 'RB',
            primary_position: 'RB',
            editorial_team_abbr: 'NFL',
            selected_position: { position: 'RB' },
            status_full: 'Active'
          }
        ]
      };

      debugLogger.success('YAHOO_API', 'Team roster fetched successfully', {
        leagueId,
        teamId,
        playerCount: mockRoster.players.length
      });

      return mockRoster;
    } catch (error) {
      debugLogger.error('YAHOO_API', 'Failed to fetch team roster', { leagueId, teamId, error });
      throw error;
    }
  }

  /**
   * Make API call with error handling and caching
   */
  async makeAPICall(endpoint: string, params: any = {}): Promise<any> {
    const requestKey = `${endpoint}-${JSON.stringify(params)}`;
    
    // Return existing request if in progress
    if (this.activeRequests.has(requestKey)) {
      return this.activeRequests.get(requestKey);
    }

    const requestPromise = this.executeAPICall(endpoint, params)
      .then(data => {
        // Store as last known good data
        this.lastKnownGoodData.set(requestKey, {
          data,
          timestamp: Date.now()
        });
        return data;
      })
      .catch(error => {
        // Try to return cached data if available
        const cached = this.lastKnownGoodData.get(requestKey);
        if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes
          debugLogger.warning('YAHOO_API', `Using cached data due to error: ${error.message}`, {
            cacheAge: Date.now() - cached.timestamp
          });
          return cached.data;
        }
        
        debugLogger.error('YAHOO_API', 'API call failed completely', error);
        throw error;
      })
      .finally(() => {
        // Clean up active request
        this.activeRequests.delete(requestKey);
      });

    this.activeRequests.set(requestKey, requestPromise);
    return requestPromise;
  }

  private async executeAPICall(endpoint: string, params: any = {}): Promise<any> {
    // Mock implementation for now
    debugLogger.info('YAHOO_API', 'Executing API call', { endpoint, params });
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return { success: true, endpoint, params };
  }
}

// Export singleton instance
export const yahooFantasyAPI = YahooFantasyAPIService.getInstance();