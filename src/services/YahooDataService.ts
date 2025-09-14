import { YahooLeague, YahooAPIResponse } from '../types/yahoo';
import { yahooOAuth } from '../utils/yahooOAuth';

export class YahooDataService {
  private static supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  private static supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  /**
   * Parse Yahoo API response into clean league objects
   */
  static parseLeaguesResponse(responseData: YahooAPIResponse): YahooLeague[] {
    try {
      console.log('🔍 [YAHOO_PARSER] Starting to parse leagues response');
      
      const fantasyContent = responseData.fantasy_content;
      
      if (!fantasyContent?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues) {
        console.warn('⚠️ [YAHOO_PARSER] Invalid response structure');
        return [];
      }

      const leaguesData = fantasyContent.users[0].user[1].games[0].game[1].leagues;
      const leagueCount = leaguesData.count || 0;
      
      console.log(`📊 [YAHOO_PARSER] Found ${leagueCount} leagues to parse`);
      
      const leagues: YahooLeague[] = [];

      // Parse each numbered league entry (0, 1, 2, etc.)
      for (let i = 0; i < leagueCount; i++) {
        const leagueContainer = leaguesData[i.toString()];
        
        if (leagueContainer?.league?.[0]) {
          const raw = leagueContainer.league[0];
          
          const league: YahooLeague = {
            league_key: raw.league_key,
            league_id: raw.league_id,
            name: raw.name,
            url: raw.url,
            num_teams: parseInt(raw.num_teams) || 0,
            current_week: parseInt(raw.current_week) || 1,
            start_date: raw.start_date,
            end_date: raw.end_date,
            scoring_type: raw.scoring_type,
            league_type: raw.league_type,
            season: raw.season,
            felo_tier: raw.felo_tier,
            matchup_week: parseInt(raw.matchup_week || '1'),
            draft_status: raw.draft_status,
            platform: 'yahoo'
          };
          
          leagues.push(league);
          console.log(`✅ [YAHOO_PARSER] Parsed league: ${league.name} (${league.league_key})`);
        }
      }

      console.log(`🎉 [YAHOO_PARSER] Successfully parsed ${leagues.length} leagues`);
      return leagues;

    } catch (error) {
      console.error('❌ [YAHOO_PARSER] Failed to parse leagues response:', error);
      return [];
    }
  }

  /**
   * Fetch user leagues from Yahoo API with automatic token refresh
   */
  static async fetchUserLeagues(): Promise<YahooLeague[]> {
    try {
      console.log('🚀 [YAHOO_SERVICE] Starting to fetch user leagues');
      
      // Get valid access token (may trigger refresh)
      const accessToken = await yahooOAuth.getValidAccessToken();
      
      if (!accessToken) {
        throw new Error('No Yahoo access token available');
      }

      console.log('🔑 [YAHOO_SERVICE] Access token found, making API request');
      console.log('🔍 [YAHOO_SERVICE] Token preview:', accessToken.substring(0, 20) + '...');

      const response = await fetch(`${this.supabaseUrl}/functions/v1/yahoo-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseAnonKey,
        },
        body: JSON.stringify({
          endpoint: 'users;use_login=1/games;game_keys=nfl/leagues',
          accessToken: accessToken,
          method: 'GET'
        }),
      });

      console.log('📡 [YAHOO_SERVICE] API response status:', response.status);

      if (response.status === 401) {
        console.log('🔄 [YAHOO_SERVICE] 401 error - attempting token refresh');
        
        // Try to refresh the token
        try {
          await yahooOAuth.refreshAccessToken();
          const newAccessToken = await yahooOAuth.getValidAccessToken();
          
          if (newAccessToken && newAccessToken !== accessToken) {
            console.log('🔄 [YAHOO_SERVICE] Token refreshed, retrying API call');
            
            // Retry with new token
            const retryResponse = await fetch(`${this.supabaseUrl}/functions/v1/yahoo-api`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': this.supabaseAnonKey,
              },
              body: JSON.stringify({
                endpoint: 'users;use_login=1/games;game_keys=nfl/leagues',
                accessToken: newAccessToken,
                method: 'GET'
              }),
            });

            if (!retryResponse.ok) {
              throw new Error(`Yahoo API retry failed: ${retryResponse.status} ${retryResponse.statusText}`);
            }
            
            const responseData = await retryResponse.json();
            console.log('📦 [YAHOO_SERVICE] Raw API response received (after retry)');
            
            const leagues = this.parseLeaguesResponse(responseData);
            console.log(`✅ [YAHOO_SERVICE] Successfully fetched ${leagues.length} leagues (after retry)`);
            return leagues;
          }
        } catch (refreshError) {
          console.error('❌ [YAHOO_SERVICE] Token refresh failed:', refreshError);
          throw new Error('REAUTH_REQUIRED');
        }
        
        throw new Error('Yahoo API authentication failed - please reconnect your account');
      }

      if (!response.ok) {
        throw new Error(`Yahoo API request failed: ${response.status} ${response.statusText}`);
      }

      const responseData = await response.json();
      console.log('📦 [YAHOO_SERVICE] Raw API response received');
      
      // Parse the response using our parser
      const leagues = this.parseLeaguesResponse(responseData);
      
      console.log(`✅ [YAHOO_SERVICE] Successfully fetched ${leagues.length} leagues`);
      return leagues;

    } catch (error) {
      console.error('❌ [YAHOO_SERVICE] Failed to fetch leagues:', error);
      throw error;
    }
  }
}
