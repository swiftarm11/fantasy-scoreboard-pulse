/**
 * Yahoo Fantasy Sports proxy – Supabase Edge Function
 * Endpoints:
 *  • getUserLeagues       – all leagues for the logged-in user
 *  • getLeagueStandings   – season standings for a league
 *  • getLeagueSettings    – league rules/settings
 *  • getLeagueScoreboard  – WEEKLY scoreboard (live scoring)   ← NEW
 *
 * PKCE public app – no client secret.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

/* Utility: try a list of NFL game-keys until leagues are found. */
async function fetchUserLeagues(headers: HeadersInit, gameKeys: string[]) {
  for (const g of gameKeys) {
    const url =
      `https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=${g}/leagues?format=json`;
    console.log("Yahoo-API: testing gameKey", g);
    const r = await fetch(url, { headers });
    if (!r.ok) continue;
    const data = await r.json();
    const leagues =
      data?.fantasy_content?.users?.[0]?.user?.[0]?.games?.[0]?.game?.[0]
        ?.leagues?.[0]?.league ?? [];
    if (leagues.length) return data;
  }
  return null;
}

serve(async (req) => {
  /* CORS pre-flight */
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { endpoint, accessToken, leagueKey, week } = await req.json();
    if (!accessToken) throw new Error("Access token is required");

    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "User-Agent": "Fantasy Dashboard/1.0",
    };

    let apiUrl = "";
    let payload: unknown;

    switch (endpoint) {
      /* ─────────────── USER LEAGUES ─────────────── */
      case "getUserLeagues": {
        const gameKeys = ["nfl", "449", "448", "447", "423"]; // 2025-2021
        const data = await fetchUserLeagues(headers, gameKeys);
        if (!data) {
          /* Fallback – single generic request (rarely needed) */
          apiUrl =
            "https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json";
          break;
        }
        payload = data; // already have leagues; skip extra request
        break;
      }

      /* ─────────────── STANDINGS ─────────────── */
      case "getLeagueStandings":
        if (!leagueKey) throw new Error("League key is required for standings");
        apiUrl =
          `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/standings?format=json`;
        break;

      /* ─────────────── SCOREBOARD (live week) ─────────────── */
      case "getLeagueScoreboard":
        if (!leagueKey) throw new Error("League key is required for scoreboard");
        apiUrl =
          `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/scoreboard${week ? `;week=${week}` : ""}?format=json`;
        break;

      /* ─────────────── SETTINGS ─────────────── */
      case "getLeagueSettings":
        if (!leagueKey) throw new Error("League key is required for settings");
        apiUrl =
          `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/settings?format=json`;
        break;

      default:
        throw new Error(`Unknown endpoint: ${endpoint}`);
    }

    /* If payload already prepared (user leagues shortcut) just return it. */
    if (payload) {
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log("Yahoo-API request →", apiUrl);

    const yres = await fetch(apiUrl, { headers });
    const body = await yres.text(); // JSON even on errors

    /* Forward Yahoo’s status so the client can handle 401/429/etc. */
    return new Response(body, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: yres.status,
    });
  } catch (err) {
    /* Map common errors to sensible HTTP codes */
    let status = 400;
    if (err.message.match(/token.*expired|invalid/i)) status = 401;
    else if (err.message.includes("Rate limit")) status = 429;
    else if (err.message.includes("forbidden")) status = 403;

    return new Response(
      JSON.stringify({ error: err.message, endpoint }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status },
    );
  }
});
