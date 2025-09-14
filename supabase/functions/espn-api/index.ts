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
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  /* ------------------------------------------------------------------
     Handle CORS pre-flight
  ------------------------------------------------------------------ */
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    /* ----------------------------------------------------------------
       Parse request
    ---------------------------------------------------------------- */
    const { endpoint = "scoreboard", dates, gameId } = await req.json();

    /* ----------------------------------------------------------------
       Build ESPN URL
    ---------------------------------------------------------------- */
    let apiUrl = "";
    switch (endpoint) {
      case "scoreboard": {
        // Fix date calculation - ensure we get today's date correctly
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayFormatted = `${year}${month}${day}`;
        
        const queryDate = dates ?? todayFormatted;
        apiUrl = `https://site.api.espn.com/apis/v2/sports/football/nfl/scoreboard?dates=${queryDate}`;
        break;
      }
      case "game-summary": {
        if (!gameId) {
          throw new Error("gameId is required for game-summary endpoint");
        }
        apiUrl = `https://site.api.espn.com/apis/v2/sports/football/nfl/summary?event=${gameId}`;
        break;
      }
      default:
        throw new Error(`Unknown ESPN endpoint: ${endpoint}`);
    }

    console.log(`Fetching ESPN API: ${apiUrl} (Date: ${new Date().toISOString()})`);

    /* ----------------------------------------------------------------
       Make upstream request
    ---------------------------------------------------------------- */
    const espnRes = await fetch(apiUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Fantasy-Scoreboard-Pulse/1.0",
      },
    });

    const bodyText = await espnRes.text(); // always JSON, even on errors

    /* ----------------------------------------------------------------
       Return ESPN response verbatim (status + body)
    ---------------------------------------------------------------- */
    return new Response(bodyText, {
      status: espnRes.status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        Vary: "Accept",
        "Cache-Control": "public, max-age=20", // Cache for 20 seconds as requested
      },
    });
  } catch (err) {
    /* ----------------------------------------------------------------
       Local failure (parsing etc.)
    ---------------------------------------------------------------- */
    console.error("ESPN API proxy error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});