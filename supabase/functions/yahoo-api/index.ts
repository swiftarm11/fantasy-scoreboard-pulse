import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { endpoint, accessToken, leagueKey, week } = await req.json()
    
    if (!accessToken) {
      throw new Error('Access token is required')
    }

    let apiUrl: string
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'Fantasy Dashboard/1.0'
    }

    switch (endpoint) {
      case 'getUserLeagues':
        // Try multiple game keys for NFL to find active leagues
        // Start with 'nfl' which gets the current active season, then fallback to specific years
        const gameKeys = ['nfl', '449', '448', '447', '423'] // 2025, 2024, 2023, 2022, 2021
        
        // Try each game key until we find leagues
        for (const gameKey of gameKeys) {
          const testUrl = `https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=${gameKey}/leagues?format=json`
          console.log(`Trying game key ${gameKey}: ${testUrl}`)
          
          const testResponse = await fetch(testUrl, { headers })
          if (testResponse.ok) {
            const testData = await testResponse.json()
            console.log(`Game key ${gameKey} response:`, JSON.stringify(testData, null, 2))
            
            // Check if this game key has leagues
            const leagues = testData?.fantasy_content?.users?.[0]?.user?.[0]?.games?.[0]?.game?.[0]?.leagues?.[0]?.league
            if (leagues && leagues.length > 0) {
              console.log(`Found ${leagues.length} leagues with game key ${gameKey}`)
              return new Response(
                JSON.stringify(testData),
                {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 200,
                }
              )
            }
          }
        }
        
        // If no game key worked, use the default 'nfl' key
        apiUrl = 'https://fantasysports.yahooapis.com/fantasy/v2/users;use_login=1/games;game_keys=nfl/leagues?format=json'
        break
        
      case 'getLeagueStandings':
        if (!leagueKey) throw new Error('League key is required for standings')
        apiUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/standings?format=json`
        break
        
      case 'getLeagueScoreboard':
        if (!leagueKey) throw new Error('League key is required for scoreboard')
        const weekParam = week ? `;week=${week}` : ''
        apiUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/scoreboard${weekParam}?format=json`
        break
        
      case 'getLeagueSettings':
        if (!leagueKey) throw new Error('League key is required for settings')
        apiUrl = `https://fantasysports.yahooapis.com/fantasy/v2/league/${leagueKey}/settings?format=json`
        break
        
      default:
        throw new Error(`Unknown endpoint: ${endpoint}`)
    }

    console.log(`Making Yahoo API request to: ${apiUrl}`)

    const response = await fetch(apiUrl, { headers })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Access token expired or invalid')
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded')
      }
      if (response.status === 403) {
        throw new Error('Access forbidden - check permissions')
      }
      
      const errorText = await response.text()
      console.error(`Yahoo API error (${response.status}):`, errorText)
      throw new Error(`Yahoo API request failed: ${response.status}`)
    }

    const data = await response.json()
    console.log(`Yahoo API response for ${endpoint}:`, JSON.stringify(data, null, 2))

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Yahoo API error:', error)
    
    // Return specific error codes for different scenarios
    let statusCode = 400
    if (error.message.includes('token expired') || error.message.includes('Access token expired')) {
      statusCode = 401
    } else if (error.message.includes('Rate limit exceeded')) {
      statusCode = 429
    } else if (error.message.includes('Access forbidden')) {
      statusCode = 403
    }

    return new Response(
      JSON.stringify({ 
        error: error.message,
        endpoint: error.endpoint || 'unknown'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode,
      }
    )
  }
})