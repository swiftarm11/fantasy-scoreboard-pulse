import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    const leagueId = url.searchParams.get('leagueId');
    const week = url.searchParams.get('week');

    if (!endpoint) {
      throw new Error('Missing endpoint parameter');
    }

    let sleeperUrl = '';
    
    switch (endpoint) {
      case 'league':
        if (!leagueId) throw new Error('Missing leagueId for league endpoint');
        sleeperUrl = `https://api.sleeper.app/v1/league/${leagueId}`;
        break;
      
      case 'users':
        if (!leagueId) throw new Error('Missing leagueId for users endpoint');
        sleeperUrl = `https://api.sleeper.app/v1/league/${leagueId}/users`;
        break;
      
      case 'rosters':
        if (!leagueId) throw new Error('Missing leagueId for rosters endpoint');
        sleeperUrl = `https://api.sleeper.app/v1/league/${leagueId}/rosters`;
        break;
      
      case 'matchups':
        if (!leagueId || !week) throw new Error('Missing leagueId or week for matchups endpoint');
        sleeperUrl = `https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`;
        break;
      
      case 'players':
        sleeperUrl = 'https://api.sleeper.app/v1/players/nfl';
        break;
      
      case 'state':
        sleeperUrl = 'https://api.sleeper.app/v1/state/nfl';
        break;
      
      default:
        throw new Error(`Unknown endpoint: ${endpoint}`);
    }

    console.log(`Fetching Sleeper API: ${sleeperUrl}`);
    
    const response = await fetch(sleeperUrl, {
      headers: {
        'User-Agent': 'Fantasy Dashboard/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Sleeper API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('Sleeper API Error:', error);
    
    return new Response(
      JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});