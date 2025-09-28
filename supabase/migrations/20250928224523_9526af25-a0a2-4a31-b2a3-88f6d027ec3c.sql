-- Create RPC function to avoid TypeScript type inference issues
CREATE OR REPLACE FUNCTION get_player_by_platform(
  platform_column TEXT,
  player_id TEXT
)
RETURNS TABLE (
  id UUID,
  tank01_id TEXT,
  tank01_primary_id TEXT,
  sleeper_id TEXT,
  yahoo_id TEXT,
  espn_id TEXT,
  name TEXT,
  team TEXT,
  pos TEXT,
  alternate_names JSONB,
  is_active BOOLEAN,
  last_game_played TEXT,
  last_updated TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  CASE platform_column
    WHEN 'espn_id' THEN
      RETURN QUERY
      SELECT pm.id, pm.tank01_id, pm.tank01_primary_id, pm.sleeper_id, pm.yahoo_id, pm.espn_id,
             pm.name, pm.team, pm.position, pm.alternate_names, pm.is_active, pm.last_game_played,
             pm.last_updated, pm.created_at
      FROM public.player_mappings pm
      WHERE pm.espn_id = player_id AND pm.is_active = true
      LIMIT 1;
    WHEN 'yahoo_id' THEN
      RETURN QUERY
      SELECT pm.id, pm.tank01_id, pm.tank01_primary_id, pm.sleeper_id, pm.yahoo_id, pm.espn_id,
             pm.name, pm.team, pm.position, pm.alternate_names, pm.is_active, pm.last_game_played,
             pm.last_updated, pm.created_at
      FROM public.player_mappings pm
      WHERE pm.yahoo_id = player_id AND pm.is_active = true
      LIMIT 1;
    WHEN 'sleeper_id' THEN
      RETURN QUERY
      SELECT pm.id, pm.tank01_id, pm.tank01_primary_id, pm.sleeper_id, pm.yahoo_id, pm.espn_id,
             pm.name, pm.team, pm.position, pm.alternate_names, pm.is_active, pm.last_game_played,
             pm.last_updated, pm.created_at
      FROM public.player_mappings pm
      WHERE pm.sleeper_id = player_id AND pm.is_active = true
      LIMIT 1;
    ELSE
      -- Invalid column, return empty
      RETURN;
  END CASE;
END;
$$;