import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0'
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
    console.log(`[PLAYER-SYNC] Request method: ${req.method}`)
    console.log(`[PLAYER-SYNC] Request timestamp: ${new Date().toISOString()}`)

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check for required environment variables
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!rapidApiKey || !supabaseUrl || !supabaseServiceKey) {
      console.error('[PLAYER-SYNC] Missing required environment variables')
      return new Response(
        JSON.stringify({ 
          error: 'Server configuration error - missing required environment variables' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Initialize Supabase client with service role (elevated privileges)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json()
    const { action, forceSync = false } = body

    console.log(`[PLAYER-SYNC] Action: ${action}, Force sync: ${forceSync}`)

    if (action !== 'sync_players') {
      return new Response(
        JSON.stringify({ error: 'Invalid action. Expected: sync_players' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Check if sync is needed (unless force sync is requested)
    if (!forceSync) {
      const { data: lastSync } = await supabase
        .from('sync_metadata')
        .select('completed_at')
        .eq('sync_type', 'secure_player_sync')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastSync?.completed_at) {
        const lastSyncTime = new Date(lastSync.completed_at)
        const twentyFourHours = 24 * 60 * 60 * 1000
        const timeSinceLastSync = Date.now() - lastSyncTime.getTime()
        
        if (timeSinceLastSync < twentyFourHours) {
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Sync not needed - last sync was within 24 hours',
              lastSyncTime: lastSync.completed_at
            }),
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }
      }
    }

    console.log('[PLAYER-SYNC] Fetching player data from Tank01 API')

    // Fetch player data from Tank01 API
    const tank01Response = await fetch(`${TANK01_BASE_URL}/getNFLPlayerList`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Host': 'tank01-nfl-live-in-game-real-time-statistics-nfl.p.rapidapi.com',
        'X-RapidAPI-Key': rapidApiKey,
      },
    })

    if (!tank01Response.ok) {
      console.error(`[PLAYER-SYNC] Tank01 API request failed: ${tank01Response.status}`)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Tank01 API request failed: ${tank01Response.status}` 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const tank01Data = await tank01Response.json()
    
    if (tank01Data.statusCode !== 200 || !Array.isArray(tank01Data.body)) {
      console.error('[PLAYER-SYNC] Invalid Tank01 API response format')
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Invalid Tank01 API response format' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const allPlayers = tank01Data.body
    console.log(`[PLAYER-SYNC] Fetched ${allPlayers.length} players from Tank01`)

    // Filter to active players only (reduce database size)
    const activePlayers = allPlayers.filter((player: any) => {
      // Keep if not a free agent
      if (player.isFreeAgent !== 'True') return true;
      
      // Keep if has recent game activity (within last season)
      if (player.lastGamePlayed) {
        const gameDate = player.lastGamePlayed;
        return gameDate.includes('2024') || gameDate.includes('2025');
      }
      
      // Keep if has essential fantasy platform IDs
      return player.sleeperBotID || player.yahooPlayerID || player.espnID;
    })

    console.log(`[PLAYER-SYNC] Filtered to ${activePlayers.length} active players`)

    // Transform players to database format
    const playersData = activePlayers.map((player: any) => ({
      tank01_id: player.playerID,
      tank01_primary_id: player.playerID,
      sleeper_id: player.sleeperBotID || null,
      yahoo_id: player.yahooPlayerID || null,
      espn_id: player.espnID || null,
      name: player.longName || player.espnName,
      team: player.team,
      position: player.pos,
      alternate_names: [player.espnName, player.longName].filter(Boolean),
      is_active: player.isFreeAgent !== 'True',
      last_game_played: player.lastGamePlayed || null
    }))

    // Process players in batches to avoid timeout
    const batchSize = 500
    let totalSynced = 0
    const syncResults = []

    for (let i = 0; i < playersData.length; i += batchSize) {
      const batch = playersData.slice(i, i + batchSize)
      
      console.log(`[PLAYER-SYNC] Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} players)`)

      const { data: syncResult, error } = await supabase
        .rpc('secure_player_sync', { players_data: batch })

      if (error) {
        console.error(`[PLAYER-SYNC] Batch ${Math.floor(i / batchSize) + 1} failed:`, error)
        throw error
      }

      if (syncResult && syncResult.length > 0) {
        const result = syncResult[0]
        totalSynced += result.players_synced
        syncResults.push(result)
        console.log(`[PLAYER-SYNC] Batch ${Math.floor(i / batchSize) + 1} completed: ${result.players_synced} players`)
      }
    }

    console.log(`[PLAYER-SYNC] Sync completed successfully: ${totalSynced} total players synced`)

    return new Response(
      JSON.stringify({
        success: true,
        totalPlayers: allPlayers.length,
        activePlayers: activePlayers.length,
        playersSynced: totalSynced,
        batches: syncResults.length,
        syncIds: syncResults.map(r => r.sync_id)
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('[PLAYER-SYNC] Function error:', error)
    return new Response(
      JSON.stringify({ 
        success: false,
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
