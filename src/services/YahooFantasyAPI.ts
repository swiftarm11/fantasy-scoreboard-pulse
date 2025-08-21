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

  private constructor() {}

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

  private async makeSecureAPICall(endpoint: string, params: any = {}): Promise<any> {
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
          // Rate limit exceeded, wait and retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          throw new Error('Rate limit exceeded, retrying...');
        }
        throw new Error(`API call failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      debugLogger.error('YAHOO_API', 'API call failed', { endpoint, error });
      throw error;
    }
  }

  async getUserLeagues(): Promise<YahooLeague[]> {
    return this.queueRequest(async () => {
      const response = await this.makeSecureAPICall('getUserLeagues');
      
      // Handle Yahoo's nested JSON structure
      const leagues = response?.fantasy_content?.users?.user?.games?.game?.leagues?.league || [];
      
      // Ensure we return an array even if single league
      return Array.isArray(leagues) ? leagues : [leagues];
    });
  }

  async getLeagueStandings(leagueKey: string): Promise<any> {
    return this.queueRequest(async () => {
      return this.makeSecureAPICall('getLeagueStandings', { leagueKey });
    });
  }

  async getLeagueScoreboard(leagueKey: string, week?: number): Promise<any> {
    return this.queueRequest(async () => {
      return this.makeSecureAPICall('getLeagueScoreboard', { leagueKey, week });
    });
  }

  async getLeagueSettings(leagueKey: string): Promise<any> {
    return this.queueRequest(async () => {
      return this.makeSecureAPICall('getLeagueSettings', { leagueKey });
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
  getRateLimitStatus(): { queueLength: number; lastRequestTime: number; isProcessing: boolean } {
    return {
      queueLength: this.rateLimitQueue.length,
      lastRequestTime: this.lastRequestTime,
      isProcessing: this.isProcessingQueue
    };
  }
}

export const yahooFantasyAPI = YahooFantasyAPIService.getInstance();