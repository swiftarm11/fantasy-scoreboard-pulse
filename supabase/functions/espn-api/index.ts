import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Cache configuration
const CACHE_DURATION_MS = 20000; // 20 seconds minimum
const cache = new Map<string, { data: any; timestamp: number; expires: number }>();

// ESPN API endpoints
const ESPN_SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_GAME_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary';

function getCacheKey(endpoint: string, params: Record<string, string>): string {
  const sortedParams = Object.keys(params).sort().map(key => `${key}=${params[key]}`).join('&');
  return `${endpoint}?${sortedParams}`;
}

function getCachedData(cacheKey: string) {
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    console.log(`Cache HIT for ${cacheKey}`);
    return cached.data;
  }
  
  if (cached) {
    console.log(`Cache EXPIRED for ${cacheKey}`);
    cache.delete(cacheKey);
  }
  
  return null;
}

function setCachedData(cacheKey: string, data: any) {
  const now = Date.now();
  cache.set(cacheKey, {
    data,
    timestamp: now,
    expires: now + CACHE_DURATION_MS
  });
  console.log(`Cache SET for ${cacheKey}, expires in ${CACHE_DURATION_MS}ms`);
}

async function fetchESPNData(url: string, headers: HeadersInit = {}) {
  console.log(`Fetching from ESPN: ${url}`);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (compatible; FantasyScoreboard/1.0)',
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(`ESPN API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  console.log(`ESPN API success: ${url} - ${response.status}`);
  return data;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const endpoint = url.searchParams.get('endpoint');
    
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    let targetUrl: string;
    const params: Record<string, string> = {};

    // Build target URL and extract parameters
    switch (endpoint) {
      case 'scoreboard':
        targetUrl = ESPN_SCOREBOARD_URL;
        // Add optional week parameter
        const week = url.searchParams.get('week');
        if (week) {
          targetUrl += `?week=${week}`;
          params.week = week;
        }
        break;
        
      case 'game-summary':
        const gameId = url.searchParams.get('gameId');
        if (!gameId) {
          return new Response(
            JSON.stringify({ error: 'Missing gameId parameter for game-summary endpoint' }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          );
        }
        targetUrl = `${ESPN_GAME_URL}?event=${gameId}`;
        params.event = gameId;
        break;
        
      default:
        return new Response(
          JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
    }

    // Check cache first
    const cacheKey = getCacheKey(endpoint, params);
    const cachedData = getCachedData(cacheKey);
    
    if (cachedData) {
      return new Response(
        JSON.stringify(cachedData),
        {
          status: 200,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'X-Cache': 'HIT'
          }
        }
      );
    }

    // Fetch fresh data from ESPN
    const data = await fetchESPNData(targetUrl);
    
    // Cache the response
    setCachedData(cacheKey, data);
    
    // Clean up old cache entries (simple cleanup)
    if (cache.size > 100) {
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        if (now > entry.expires) {
          cache.delete(key);
        }
      }
    }

    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'X-Cache': 'MISS'
        }
      }
    );

  } catch (error) {
    console.error('ESPN API Error:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch ESPN data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
})