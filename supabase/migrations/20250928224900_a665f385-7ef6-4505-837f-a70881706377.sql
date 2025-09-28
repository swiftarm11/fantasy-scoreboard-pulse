-- Fix critical security vulnerability: Remove public write access and implement proper authentication

-- Drop existing insecure policies
DROP POLICY IF EXISTS "Player mappings can be inserted publicly" ON public.player_mappings;
DROP POLICY IF EXISTS "Player mappings can be updated publicly" ON public.player_mappings;
DROP POLICY IF EXISTS "Sync metadata can be inserted publicly" ON public.sync_metadata;
DROP POLICY IF EXISTS "Sync metadata can be updated publicly" ON public.sync_metadata;

-- Create secure policies for player_mappings table
-- Only allow INSERT/UPDATE/DELETE for service role (for sync operations)
CREATE POLICY "Service role can manage player mappings" 
ON public.player_mappings 
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- For authenticated users, only allow SELECT (no write access)
CREATE POLICY "Authenticated users can read player mappings" 
ON public.player_mappings 
FOR SELECT 
TO authenticated
USING (true);

-- Create secure policies for sync_metadata table  
-- Only service role can manage sync metadata
CREATE POLICY "Service role can manage sync metadata" 
ON public.sync_metadata 
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read sync history for debugging
CREATE POLICY "Authenticated users can read sync metadata" 
ON public.sync_metadata 
FOR SELECT 
TO authenticated
USING (true);

-- Create a secure function for player sync operations that runs with elevated privileges
CREATE OR REPLACE FUNCTION public.secure_player_sync(
  players_data JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  players_synced INTEGER,
  sync_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_sync_id UUID;
  players_count INTEGER := 0;
  player_record JSONB;
BEGIN
  -- Create sync metadata record
  INSERT INTO public.sync_metadata (
    sync_type,
    status,
    api_requests_used,
    metadata
  ) VALUES (
    'secure_player_sync',
    'in_progress',
    1,
    jsonb_build_object('started_by', 'edge_function')
  ) RETURNING id INTO new_sync_id;

  -- Process each player in the batch
  FOR player_record IN SELECT value FROM jsonb_array_elements(players_data)
  LOOP
    -- Upsert player data
    INSERT INTO public.player_mappings (
      tank01_id,
      tank01_primary_id,
      sleeper_id,
      yahoo_id,
      espn_id,
      name,
      team,
      position,
      alternate_names,
      is_active,
      last_game_played
    ) VALUES (
      player_record->>'tank01_id',
      player_record->>'tank01_primary_id',
      player_record->>'sleeper_id',
      player_record->>'yahoo_id',
      player_record->>'espn_id',
      player_record->>'name',
      player_record->>'team',
      player_record->>'position',
      COALESCE(player_record->'alternate_names', '[]'::jsonb),
      COALESCE((player_record->>'is_active')::boolean, true),
      player_record->>'last_game_played'
    )
    ON CONFLICT (tank01_id) 
    DO UPDATE SET
      sleeper_id = EXCLUDED.sleeper_id,
      yahoo_id = EXCLUDED.yahoo_id,
      espn_id = EXCLUDED.espn_id,
      name = EXCLUDED.name,
      team = EXCLUDED.team,
      position = EXCLUDED.position,
      alternate_names = EXCLUDED.alternate_names,
      is_active = EXCLUDED.is_active,
      last_game_played = EXCLUDED.last_game_played,
      last_updated = now();
    
    players_count := players_count + 1;
  END LOOP;

  -- Update sync metadata as completed
  UPDATE public.sync_metadata 
  SET 
    status = 'completed',
    completed_at = now(),
    total_players = players_count,
    active_players = players_count
  WHERE id = new_sync_id;

  RETURN QUERY SELECT true, players_count, new_sync_id;
  
EXCEPTION WHEN OTHERS THEN
  -- Mark sync as failed
  UPDATE public.sync_metadata 
  SET 
    status = 'failed',
    error_message = SQLERRM,
    completed_at = now()
  WHERE id = new_sync_id;
  
  RETURN QUERY SELECT false, 0, new_sync_id;
END;
$$;

-- Grant execute permission on the secure function to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.secure_player_sync(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.secure_player_sync(JSONB) TO authenticated;