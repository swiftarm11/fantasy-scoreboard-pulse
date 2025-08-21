import { yahooOAuth } from '../utils/yahooOAuth';
import { LeagueData, ScoringEvent } from '../types/fantasy';
import { debugLogger } from '../utils/debugLogger';

interface YahooLeagueResponse {
  fantasy_content: {
    users: {
      user: {
        games: {
          game: {
            leagues: {
              league: YahooLeague[];
            };
          };
        };
      };
    };
  };
}

interface YahooLeague {
  league_key: string;
  name: string;
  season: string;
  game_key: string;
  url: string;
  logo_url?: string;
  is_finished: string;
  current_week: string;
}

interface YahooScoreboardResponse {
  fantasy_content: {
    league: {
      scoreboard: {
        matchups: {
          matchup: YahooMatchup[];
        };
      };
    };
  };
}

interface YahooMatchup {
  week: string;
  teams: {
    team: YahooTeam[];
  };
}

interface YahooTeam {
  team_key: string;
  name: string;
  is_owned_by_current_login: string;
  team_points?: {
    total: string;
  };
  team_projected_points?: {
    total: string;
  };
}

class YahooFantasyAPIService {
  private static instance: YahooFantasyAPIService;
  private rateLimitQueue: Array<() => Promise<any>> = [];
  private isProcessingQueue = false;
  private lastRequestTime = 0;
  private readonly REQUEST_INTERVAL = 1100; // 1.1 seconds to be safe with rate limits
  
  // Enhanced error handling and request deduplication
  private activeRequests = new Map<string, Promise<any>>();
  private lastKnownGoodData = new Map<string, { data: any; timestamp: number }>();
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly DATA_PRESERVATION_KEY = 'yahoo_fantasy_cache';

  private constructor() {
    // Load preserved data on initialization
    this.loadPreservedData();
  }

  static getInstance(): YahooFantasyAPIService {
    if (!YahooFantasyAPIService.instance) {
      YahooFantasyAPIService.instance = new YahooFantasyAPIService();
    }
    return YahooFantasyAPIService.instance;
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.rateLimitQueue.length === 0) return;

    this.isProcessingQueue = true;

    while (this.rateLimitQueue.length > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      
      if (timeSinceLastRequest < this.REQUEST_INTERVAL) {
        await new Promise(resolve => 
          setTimeout(resolve, this.REQUEST_INTERVAL - timeSinceLastRequest)
        );
      }

      const request = this.rateLimitQueue.shift();
      if (request) {
        try {
          this.lastRequestTime = Date.now();
          await request();
        } catch (error) {
          debugLogger.error('YAHOO_API', 'Queue request failed', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  private async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedRequest = async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      this.rateLimitQueue.push(wrappedRequest);
      this.processQueue();
    });
  }

  private async handleRateLimitError(retryCount = 0): Promise<void> {
    if (retryCount >= 4) {
      throw new Error('Rate limit exceeded - please wait a few minutes and try again');
    }

    const delay = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s, 16s
    
    debugLogger.warning('YAHOO_API', `Rate limited, waiting ${delay/1000}s before retry (attempt ${retryCount + 1}/4)`, {
      retryCount,
      delay,
      nextRetryIn: delay
    });

    await new Promise(resolve => setTimeout(resolve, delay));
  }

  private async makeSecureAPICallWithTimeout(endpoint: string, params: any = {}): Promise<any> {
    return Promise.race([
      this.makeSecureAPICall(endpoint, params),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout - please check your connection')), this.REQUEST_TIMEOUT)
      )
    ]);
  }

  private getRequestKey(endpoint: string, params: any = {}): string {
    return `${endpoint}_${JSON.stringify(params)}`;
  }

  private async makeSecureAPICallWithDeduplication(endpoint: string, params: any = {}): Promise<any> {
    const requestKey = this.getRequestKey(endpoint, params);
    
    // Return existing promise if request is already in flight
    if (this.activeRequests.has(requestKey)) {
      debugLogger.info('YAHOO_API', `Deduplicating request: ${requestKey}`);
      return this.activeRequests.get(requestKey);
    }

    // Create new request promise
    const requestPromise = this.makeSecureAPICallWithTimeout(endpoint, params)
      .then(data => {
        // Store as last known good data
        this.lastKnownGoodData.set(requestKey, {
          data,
          timestamp: Date.now()
        });
        this.preserveData();
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
        throw error;
      })
      .finally(() => {
        // Clean up active request
        this.activeRequests.delete(requestKey);
      });

    this.activeRequests.set(requestKey, requestPromise);
    return requestPromise;
  }

  private async makeSecureAPICall(endpoint: string, params: any = {}, retryCount = 0): Promise<any> {
    const maxRetries = 2;
    
    try {
      const accessToken = await yahooOAuth.getValidAccessToken();
      
      const response = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-api', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          endpoint,
          accessToken,
          ...params
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Enhanced rate limit handling with exponential backoff
          await this.handleRateLimitError(retryCount);
          return this.makeSecureAPICall(endpoint, params, retryCount + 1);
        }
        
        if (response.status === 401) {
          // Handle 401 errors by attempting token refresh
          console.log('Received 401 from Yahoo API, attempting token refresh...');
          try {
            await yahooOAuth.refreshTokens();
            if (retryCount < maxRetries) {
              return this.makeSecureAPICall(endpoint, params, retryCount + 1);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            throw new Error('REAUTH_REQUIRED: Please reconnect your Yahoo account');
          }
        }
        
        throw new Error(`API call failed: ${response.status} - ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      debugLogger.error('YAHOO_API', 'API call failed', { 
        endpoint, 
        error: error instanceof Error ? error.message : error,
        retryCount 
      });
      
      if (error instanceof Error) {
        // Handle re-authentication requirement
        if (error.message === 'REAUTH_REQUIRED' || error.message.includes('REAUTH_REQUIRED')) {
          throw error;
        }
        
        // Retry logic for temporary failures (but not auth failures)
        if (retryCount < maxRetries && !error.message.includes('401') && !error.message.includes('REAUTH_REQUIRED')) {
          console.warn(`Yahoo API call failed, retrying (${retryCount + 1}/${maxRetries}):`, error.message);
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
          return this.makeSecureAPICall(endpoint, params, retryCount + 1);
        }
      }
      
      throw error;
    }
  }

  async getUserLeagues(): Promise<YahooLeague[]> {
    return this.queueRequest(async () => {
      const response = await this.makeSecureAPICallWithDeduplication('getUserLeagues');
      
      // Handle Yahoo's nested JSON structure
      const leagues = response?.fantasy_content?.users?.user?.games?.game?.leagues?.league || [];
      
      // Ensure we return an array even if single league
      return Array.isArray(leagues) ? leagues : [leagues];
    });
  }

  async getLeagueStandings(leagueKey: string): Promise<any> {
    return this.queueRequest(async () => {
      return this.makeSecureAPICallWithDeduplication('getLeagueStandings', { leagueKey });
    });
  }

  async getLeagueScoreboard(leagueKey: string, week?: number): Promise<any> {
    return this.queueRequest(async () => {
      return this.makeSecureAPICallWithDeduplication('getLeagueScoreboard', { leagueKey, week });
    });
  }

  async getLeagueSettings(leagueKey: string): Promise<any> {
    return this.queueRequest(async () => {
      return this.makeSecureAPICallWithDeduplication('getLeagueSettings', { leagueKey });
    });
  }

  // Data transformation methods
  yahooToCommonFormat(yahooLeague: YahooLeague, scoreboardData?: any): LeagueData {
    const userTeam = scoreboardData?.fantasy_content?.league?.scoreboard?.matchups?.matchup
      ?.find((m: YahooMatchup) => 
        m.teams.team.some((t: YahooTeam) => t.is_owned_by_current_login === '1')
      )?.teams.team.find((t: YahooTeam) => t.is_owned_by_current_login === '1');

    const opponentTeam = scoreboardData?.fantasy_content?.league?.scoreboard?.matchups?.matchup
      ?.find((m: YahooMatchup) => 
        m.teams.team.some((t: YahooTeam) => t.is_owned_by_current_login === '1')
      )?.teams.team.find((t: YahooTeam) => t.is_owned_by_current_login !== '1');

    const myScore = parseFloat(userTeam?.team_points?.total || '0');
    const opponentScore = parseFloat(opponentTeam?.team_points?.total || '0');

    let status: 'winning' | 'losing' | 'neutral' = 'neutral';
    if (myScore > opponentScore) status = 'winning';
    else if (myScore < opponentScore) status = 'losing';

    return {
      id: yahooLeague.league_key,
      leagueName: yahooLeague.name,
      platform: 'Yahoo',
      teamName: userTeam?.name || 'Your Team',
      myScore,
      opponentScore,
      opponentName: opponentTeam?.name || 'Opponent',
      record: '0-0', // Would need additional API call to get actual record
      leaguePosition: '1st', // Would need standings data
      status,
      scoringEvents: [], // Would need additional API calls for detailed scoring events
      lastUpdated: new Date().toISOString(),
    };
  }

  // Calculate win probability based on current scores
  private calculateWinProbability(myScore: number, opponentScore: number): number {
    if (myScore === 0 && opponentScore === 0) return 0.5;
    
    const scoreDiff = myScore - opponentScore;
    const totalScore = myScore + opponentScore;
    
    if (totalScore === 0) return 0.5;
    
    // Simple probability calculation based on score difference
    const probability = 0.5 + (scoreDiff / totalScore) * 0.4;
    return Math.max(0.1, Math.min(0.9, probability));
  }

  // Get rate limit status for debugging
  getRateLimitStatus(): { 
    queueLength: number; 
    lastRequestTime: number; 
    isProcessing: boolean;
    activeRequests: number;
    cacheSize: number;
  } {
    return {
      queueLength: this.rateLimitQueue.length,
      lastRequestTime: this.lastRequestTime,
      isProcessing: this.isProcessingQueue,
      activeRequests: this.activeRequests.size,
      cacheSize: this.lastKnownGoodData.size
    };
  }

  // Offline data preservation methods
  private preserveData(): void {
    try {
      const dataToPreserve = Array.from(this.lastKnownGoodData.entries());
      localStorage.setItem(this.DATA_PRESERVATION_KEY, JSON.stringify(dataToPreserve));
    } catch (error) {
      debugLogger.warning('YAHOO_API', 'Failed to preserve data to localStorage', error);
    }
  }

  private loadPreservedData(): void {
    try {
      const preserved = localStorage.getItem(this.DATA_PRESERVATION_KEY);
      if (preserved) {
        const data = JSON.parse(preserved);
        this.lastKnownGoodData = new Map(data);
        debugLogger.info('YAHOO_API', `Loaded ${data.length} preserved data entries`);
      }
    } catch (error) {
      debugLogger.warning('YAHOO_API', 'Failed to load preserved data from localStorage', error);
    }
  }

  // Get last known good data timestamp for UI display
  getLastUpdateTimestamp(endpoint: string, params: any = {}): number | null {
    const requestKey = this.getRequestKey(endpoint, params);
    const cached = this.lastKnownGoodData.get(requestKey);
    return cached ? cached.timestamp : null;
  }

  // Clear old cached data
  clearOldCache(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    let cleared = 0;
    
    for (const [key, value] of this.lastKnownGoodData.entries()) {
      if (now - value.timestamp > maxAge) {
        this.lastKnownGoodData.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      debugLogger.info('YAHOO_API', `Cleared ${cleared} old cache entries`);
      this.preserveData();
    }
  }
}

export const yahooFantasyAPI = YahooFantasyAPIService.getInstance();