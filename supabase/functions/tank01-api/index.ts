import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

const RAPIDAPI_KEY = Deno.env.get('RAPIDAPI_KEY');
const TANK01_BASE_URL = 'https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com';

console.log(`[TANK01-API] Starting function with key: ${RAPIDAPI_KEY ? 'SET' : 'NOT SET'}`);

serve(async (req) => {
  console.log(`[TANK01-API] Request method: ${req.method}`);
  console.log(`[TANK01-API] Request timestamp: ${new Date().toISOString()}`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse request
    const params = req.method === 'GET' 
      ? Object.fromEntries(new URL(req.url).searchParams)
      : await req.json().catch(() => ({}));

    console.log(`[TANK01-API] Parsed parameters:`, params);

    const { endpoint } = params;

    if (!endpoint) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing endpoint parameter',
          availableEndpoints: ['players', 'games', 'plays', 'test-connection']
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!RAPIDAPI_KEY) {
      return new Response(
        JSON.stringify({ 
          error: 'RAPIDAPI_KEY not configured in Supabase secrets'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let apiUrl: string;
    const headers = {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
      'Accept': 'application/json'
    };

    // Route to appropriate Tank01 endpoint
    switch (endpoint) {
      case 'test-connection':
        // Test basic connectivity with a simple endpoint
        apiUrl = `${TANK01_BASE_URL}/getNFLTeams?getNFLTeams=true`;
        break;

      case 'players':
        // Get player data with IDs
        const { team, position } = params;
        apiUrl = `${TANK01_BASE_URL}/getNFLPlayerList`;
        if (team) apiUrl += `?teamAbv=${team}`;
        if (position) apiUrl += `${team ? '&' : '?'}pos=${position}`;
        break;

      case 'games':
        // Get current week's games
        const { week, season } = params;
        const currentSeason = season || new Date().getFullYear().toString();
        
        // Calculate current NFL week if not provided
        let currentWeek = week;
        if (!currentWeek) {
          const now = new Date();
          const currentYear = now.getFullYear();
          
          // NFL season typically starts the second Tuesday after Labor Day (first Monday in September)
          // For simplicity, assume season starts September 8th each year
          const seasonStart = new Date(currentYear, 8, 8); // September 8th (month is 0-indexed)
          
          // If we're before the season starts, use previous year's week 18 or current year week 1
          if (now < seasonStart) {
            currentWeek = '1';
          } else {
            // Calculate weeks since season start
            const daysSinceStart = Math.floor((now.getTime() - seasonStart.getTime()) / (1000 * 60 * 60 * 24));
            const calculatedWeek = Math.min(Math.floor(daysSinceStart / 7) + 1, 18);
            currentWeek = calculatedWeek.toString();
          }
          
          console.log(`[TANK01-API] Auto-calculated current NFL week: ${currentWeek} for season ${currentSeason}`);
        }
        
        apiUrl = `${TANK01_BASE_URL}/getNFLGamesForWeek?week=${currentWeek}&season=${currentSeason}`;
        break;

      case 'plays':
        // Get box score data with play-by-play information
        const { gameId } = params;
        if (!gameId) {
          return new Response(
            JSON.stringify({ error: 'gameId parameter required for plays endpoint' }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        apiUrl = `${TANK01_BASE_URL}/getNFLBoxScore?gameID=${gameId}&playByPlay=true&fantasyPoints=true`;
        break;

      case 'player-stats':
        // Get player statistics
        const { playerId, gameID } = params;
        if (!playerId) {
          return new Response(
            JSON.stringify({ error: 'playerId parameter required for player-stats endpoint' }),
            { 
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        apiUrl = `${TANK01_BASE_URL}/getNFLPlayerStats?playerID=${playerId}`;
        if (gameID) apiUrl += `&gameID=${gameID}`;
        break;

      default:
        return new Response(
          JSON.stringify({ 
            error: `Unknown endpoint: ${endpoint}`,
            availableEndpoints: ['players', 'games', 'plays', 'player-stats', 'test-connection']
          }),
          { 
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
    }

    console.log(`[TANK01-API] Fetching: ${apiUrl}`);

    // Make request to Tank01 API
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: headers
    });

    console.log(`[TANK01-API] Response status: ${response.status}`);
    console.log(`[TANK01-API] Response headers:`, Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`[TANK01-API] JSON parse error:`, parseError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid JSON response from Tank01 API',
          rawResponse: responseText.substring(0, 500),
          parseError: parseError instanceof Error ? parseError.message : 'Parse error'
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    if (!response.ok) {
      console.error(`[TANK01-API] API Error:`, responseData);
      return new Response(
        JSON.stringify({ 
          error: `Tank01 API error: ${response.status}`,
          details: responseData,
          endpoint: endpoint,
          url: apiUrl
        }),
        { 
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[TANK01-API] Success: Returning ${response.status} response with ${JSON.stringify(responseData).length} characters`);

    // Return successful response
    return new Response(JSON.stringify({
      success: true,
      endpoint: endpoint,
      url: apiUrl,
      data: responseData,
      meta: {
        timestamp: new Date().toISOString(),
        responseSize: JSON.stringify(responseData).length
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(`[TANK01-API] Function error:`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});