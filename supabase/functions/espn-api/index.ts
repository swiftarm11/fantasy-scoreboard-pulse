/**
 * ESPN NFL proxy – Supabase Edge Function
 * Supported endpoints:
 *   • scoreboard      (default)  →  Core API events endpoint
 *   • game-summary    →  /apis/v2/sports/football/nfl/summary
 *   • plays           →  Core API plays endpoint (requires eventId and competitionId)
 *   • test-plays      →  Test endpoint for play-by-play validation
 *
 *   Body payload examples:
 *     { "endpoint": "scoreboard", "dates": "20250905" }
 *     { "endpoint": "game-summary", "gameId": "401547439" }
 *     { "endpoint": "plays", "eventId": "401547439", "competitionId": "401547439" }
 *     { "endpoint": "test-plays" }
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
    let eventId = null;
    let competitionId = null;

    if (req.method === "GET") {
      // Handle GET requests with query parameters
      const url = new URL(req.url);
      endpoint = url.searchParams.get("endpoint") || "scoreboard";
      dates = url.searchParams.get("dates");
      gameId = url.searchParams.get("gameId");
      eventId = url.searchParams.get("eventId");
      competitionId = url.searchParams.get("competitionId");
    } else if (req.method === "POST") {
      // Handle POST requests with JSON body
      const body = await req.json();
      endpoint = body.endpoint || "scoreboard";
      dates = body.dates;
      gameId = body.gameId;
      eventId = body.eventId;
      competitionId = body.competitionId;
    }

    /* ----------------------------------------------------------------
       Build ESPN URL
    ---------------------------------------------------------------- */
    let apiUrl = "";
    switch (endpoint) {
      case "scoreboard": {
        // Use Core API for consistent event/competition ID structure
        const now = new Date();
        const utcDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const year = utcDate.getFullYear();
        const month = String(utcDate.getMonth() + 1).padStart(2, '0');
        const day = String(utcDate.getDate()).padStart(2, '0');
        const todayFormatted = `${year}${month}${day}`;
        
        const queryDate = dates ?? todayFormatted;
        apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events?dates=${queryDate}`;
        
        console.log(`[ESPN-API] Using Core API scoreboard with date: ${queryDate} (today: ${todayFormatted})`);
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
        if (!eventId && !gameId) {
          throw new Error("eventId (or gameId for backwards compatibility) is required for plays endpoint");
        }
        if (!competitionId) {
          throw new Error("competitionId is required for plays endpoint");
        }
        
        // Use eventId if provided, fallback to gameId for backwards compatibility
        const useEventId = eventId || gameId;
        apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${useEventId}/competitions/${competitionId}/plays?limit=300`;
        
        console.log(`[ESPN-API] PLAYS: Using eventId=${useEventId}, competitionId=${competitionId}`);
        break;
      }
      case "test-plays": {
        // Special test endpoint: fetch Core API scoreboard first, extract proper IDs, then fetch plays
        const now = new Date();
        const utcDate = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const year = utcDate.getFullYear();
        const month = String(utcDate.getMonth() + 1).padStart(2, '0');
        const day = String(utcDate.getDate()).padStart(2, '0');
        const todayFormatted = `${year}${month}${day}`;
        
        console.log(`[ESPN-API] TEST-PLAYS: Fetching Core API scoreboard to find live games`);
        const scoreboardUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events?dates=${todayFormatted}`;
        
        const scoreboardRes = await fetch(scoreboardUrl, {
          headers: {
            Accept: "application/json",
            "User-Agent": "Fantasy-Scoreboard-Pulse/1.0",
          },
        });
        
        if (!scoreboardRes.ok) {
          throw new Error(`Failed to fetch Core API scoreboard for live game detection: ${scoreboardRes.status}`);
        }
        
        const scoreboardData = await scoreboardRes.json();
        const events = scoreboardData.items || [];
        console.log(`[ESPN-API] TEST-PLAYS: Found ${events.length} events from Core API`);
        
        if (events.length === 0) {
          throw new Error("No events found in Core API scoreboard");
        }
        
        // Find a live game or use the first available game
        let selectedEvent = null;
        for (const event of events) {
          // Check if event has status indicating it's live
          if (event.status?.type?.state === 'in' || event.status?.type?.name === 'STATUS_IN_PROGRESS') {
            selectedEvent = event;
            console.log(`[ESPN-API] TEST-PLAYS: Found live event: ${event.id}`);
            break;
          }
        }
        
        if (!selectedEvent) {
          selectedEvent = events[0];
          console.log(`[ESPN-API] TEST-PLAYS: No live events found, using first available: ${selectedEvent.id}`);
          console.log(`[ESPN-API] TEST-PLAYS: Available events:`, 
            events.map((e: any) => ({
              id: e.id,
              name: e.name || e.shortName,
              status: e.status?.type?.name,
              state: e.status?.type?.state
            }))
          );
        }
        
        // Extract event ID
        const testEventId = selectedEvent.id;
        if (!testEventId) {
          throw new Error("Selected event missing ID");
        }
        
        // Extract competition ID - check competitions array
        const competitions = selectedEvent.competitions;
        if (!competitions || competitions.length === 0) {
          throw new Error(`Event ${testEventId} has no competitions array`);
        }
        
        const competition = competitions[0];
        const testCompetitionId = competition.id;
        if (!testCompetitionId) {
          throw new Error(`Event ${testEventId} competition missing ID`);
        }
        
        console.log(`[ESPN-API] TEST-PLAYS: Extracted IDs - eventId: ${testEventId}, competitionId: ${testCompetitionId}`);
        apiUrl = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${testEventId}/competitions/${testCompetitionId}/plays?limit=50`;
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