/**
 * ESPN NFL proxy – Supabase Edge Function
 * Supported endpoints:
 *   • scoreboard      (default)  →  /apis/v2/sports/football/nfl/scoreboard
 *   • game-summary    →  /apis/v2/sports/football/nfl/summary
 *
 *   Body payload examples:
 *     { "endpoint": "scoreboard", "dates": "20250905" }
 *     { "endpoint": "game-summary", "gameId": "401547439" }
 *
 * If no `dates` is supplied, today's date (UTC) is used.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

serve(async (req) => {
  /* ------------------------------------------------------------------
     Handle CORS pre-flight
  ------------------------------------------------------------------ */
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    /* ----------------------------------------------------------------
       Parse request - handle both GET query params and POST JSON body
    ---------------------------------------------------------------- */
    let endpoint = "scoreboard";
    let dates = null;
    let gameId = null;

    if (req.method === "GET") {
      // Handle GET requests with query parameters
      const url = new URL(req.url);
      endpoint = url.searchParams.get("endpoint") || "scoreboard";
      dates = url.searchParams.get("dates");
      gameId = url.searchParams.get("gameId");
    } else if (req.method === "POST") {
      // Handle POST requests with JSON body
      const body = await req.json();
      endpoint = body.endpoint || "scoreboard";
      dates = body.dates;
      gameId = body.gameId;
    }

    /* ----------------------------------------------------------------
       Build ESPN URL
    ---------------------------------------------------------------- */
    let apiUrl = "";
    switch (endpoint) {
      case "scoreboard": {
        // Fix date calculation with proper timezone handling
        const now = new Date();
        // Use UTC to avoid timezone issues
        const utcDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const year = utcDate.getFullYear();
        const month = String(utcDate.getMonth() + 1).padStart(2, '0');
        const day = String(utcDate.getDate()).padStart(2, '0');
        const todayFormatted = `${year}${month}${day}`;
        
        const queryDate = dates ?? todayFormatted;
        apiUrl = `https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${queryDate}`;
        
        console.log(`[ESPN-API] Using date: ${queryDate} (today: ${todayFormatted})`);
        break;
      }
      case "game-summary": {
        if (!gameId) {
          throw new Error("gameId is required for game-summary endpoint");
        }
        apiUrl = `https://site.api.espn.com/apis/v2/sports/football/nfl/summary?event=${gameId}`;
        break;
      }
      case "plays": {
        if (!gameId) {
          throw new Error("gameId is required for plays endpoint");
        }
        apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${gameId}/competitions/${gameId}/plays?limit=300`;
        break;
      }
      case "test-plays": {
        // Special test endpoint: fetch scoreboard first, find live game, then fetch plays
        const now = new Date();
        const utcDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const year = utcDate.getFullYear();
        const month = String(utcDate.getMonth() + 1).padStart(2, '0');
        const day = String(utcDate.getDate()).padStart(2, '0');
        const todayFormatted = `${year}${month}${day}`;
        
        console.log(`[ESPN-API] TEST-PLAYS: Fetching scoreboard first to find live games`);
        const scoreboardUrl = `https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${todayFormatted}`;
        
        const scoreboardRes = await fetch(scoreboardUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Fantasy-Scoreboard-Pulse/1.0",
          },
        });
        
        if (!scoreboardRes.ok) {
          throw new Error(`Failed to fetch scoreboard for live game detection: ${scoreboardRes.status}`);
        }
        
        const scoreboardData = await scoreboardRes.json();
        console.log(`[ESPN-API] TEST-PLAYS: Found ${scoreboardData.events?.length || 0} games`);
        
        // Find a live game (status.type.state === 'in')
        const liveGame = scoreboardData.events?.find((game: any) => 
          game.status?.type?.state === 'in' || game.status?.type?.name === 'STATUS_IN_PROGRESS'
        );
        
        if (!liveGame) {
          console.log(`[ESPN-API] TEST-PLAYS: No live games found. Available games:`, 
            scoreboardData.events?.map((g: any) => ({
              id: g.id,
              name: g.name,
              status: g.status?.type?.name,
              state: g.status?.type?.state
            })) || []
          );
          
          // Use the first available game for testing
          const testGame = scoreboardData.events?.[0];
          if (!testGame) {
            throw new Error("No games found in scoreboard for testing");
          }
          
          console.log(`[ESPN-API] TEST-PLAYS: Using first available game for testing: ${testGame.id} (${testGame.name})`);
          apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${testGame.id}/competitions/${testGame.id}/plays?limit=50`;
        } else {
          console.log(`[ESPN-API] TEST-PLAYS: Found live game: ${liveGame.id} (${liveGame.name})`);
          apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${liveGame.id}/competitions/${liveGame.id}/plays?limit=50`;
        }
        break;
      }
      default:
        throw new Error(`Unknown ESPN endpoint: ${endpoint}`);
    }

    console.log(`[ESPN-API] Fetching: ${apiUrl}`);
    console.log(`[ESPN-API] Request timestamp: ${new Date().toISOString()}`);

    /* ----------------------------------------------------------------
       Make upstream request
    ---------------------------------------------------------------- */
    const espnRes = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Fantasy-Scoreboard-Pulse/1.0",
      },
    });

    console.log(`[ESPN-API] Response status: ${espnRes.status}`);
    console.log(`[ESPN-API] Response headers:`, Object.fromEntries(espnRes.headers.entries()));

    const bodyText = await espnRes.text();

    /* ----------------------------------------------------------------
       Parse and validate response before returning
    ---------------------------------------------------------------- */
    let parsedData;
    try {
      parsedData = JSON.parse(bodyText);
    } catch (parseError) {
      console.error(`[ESPN-API] Failed to parse response as JSON:`, parseError);
      console.error(`[ESPN-API] Raw response body:`, bodyText.substring(0, 500));
      
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON response from ESPN API",
          details: parseError.message,
          statusCode: espnRes.status
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[ESPN-API] Success: Returning ${espnRes.status} response with ${bodyText.length} characters`);
    
    return new Response(bodyText, {
      status: espnRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=20",
      },
    });
  } catch (err) {
    /* ----------------------------------------------------------------
       Local failure (parsing etc.)
    ---------------------------------------------------------------- */
    console.error("[ESPN-API] Proxy error:", err);
    console.error("[ESPN-API] Error stack:", err.stack);
    
    return new Response(
      JSON.stringify({ 
        error: err.message || "Unknown error",
        timestamp: new Date().toISOString(),
        endpoint: endpoint || "unknown"
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});