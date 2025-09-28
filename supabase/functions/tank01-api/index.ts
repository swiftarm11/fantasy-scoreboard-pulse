import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

const TANK01_BASE_URL = "https://tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com"

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 200, 
      headers: corsHeaders 
    })
  }

  try {
    console.log(`[TANK01-API] Request method: ${req.method}`)
    console.log(`[TANK01-API] Request timestamp: ${new Date().toISOString()}`)

    // Check for RapidAPI key
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY')
    if (!rapidApiKey) {
      console.error('[TANK01-API] Missing RAPIDAPI_KEY environment variable')
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    } else {
      console.log('[TANK01-API] Starting function with key: SET')
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const body = await req.json()
    const { endpoint, action, week, season, gameId } = body

    console.log(`[TANK01-API] Parsed parameters:`, { endpoint, action, week, season, gameId })

    let apiUrl: string
    let requestPath: string

    // Route different endpoints
    switch (endpoint) {
      case 'games':
        requestPath = `/getNFLGamesForWeek?week=${week}&season=${season}`
        break
      case 'playByPlay':
      case 'plays':
        requestPath = `/getNFLBoxScore?gameID=${gameId}&playByPlay=true`
        break
      case 'players':
        // New endpoint for player list
        if (action === 'getNFLPlayerList') {
          requestPath = '/getNFLPlayerList'
        } else {
          requestPath = `/getNFLPlayerList` // Default to player list
        }
        break
      case 'scoreboard':
        requestPath = `/getNFLScoreboard?week=${week}&season=${season}`
        break
      default:
        return new Response(
          JSON.stringify({ error: `Unknown endpoint: ${endpoint}` }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }

    apiUrl = `${TANK01_BASE_URL}${requestPath}`
    console.log(`[TANK01-API] Fetching: ${apiUrl}`)

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Host': 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
        'X-RapidAPI-Key': rapidApiKey,
      },
    })

    console.log(`[TANK01-API] Response status: ${response.status}`)
    console.log(`[TANK01-API] Response headers:`, Object.fromEntries(response.headers.entries()))

    if (!response.ok) {
      console.error(`[TANK01-API] API request failed with status ${response.status}`)
      const errorText = await response.text()
      console.error(`[TANK01-API] Error response: ${errorText}`)
      
      return new Response(
        JSON.stringify({ 
          error: `Tank01 API request failed: ${response.status}`,
          details: errorText
        }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const data = await response.text()
    console.log(`[TANK01-API] Success: Returning ${response.status} response with ${data.length} characters`)

    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })

  } catch (error) {
    console.error('[TANK01-API] Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})