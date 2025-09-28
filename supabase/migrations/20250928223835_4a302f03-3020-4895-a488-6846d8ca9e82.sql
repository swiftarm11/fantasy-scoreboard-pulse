-- Create player_mappings table for Tank01 NFL player database
CREATE TABLE IF NOT EXISTS public.player_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tank01_id TEXT NOT NULL UNIQUE,
  tank01_primary_id TEXT,
  sleeper_id TEXT,
  yahoo_id TEXT,
  espn_id TEXT,
  name TEXT NOT NULL,
  team TEXT NOT NULL,
  position TEXT NOT NULL,
  alternate_names JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  last_game_played TEXT,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_player_mappings_tank01_id ON public.player_mappings(tank01_id);
CREATE INDEX IF NOT EXISTS idx_player_mappings_sleeper_id ON public.player_mappings(sleeper_id);
CREATE INDEX IF NOT EXISTS idx_player_mappings_yahoo_id ON public.player_mappings(yahoo_id);
CREATE INDEX IF NOT EXISTS idx_player_mappings_espn_id ON public.player_mappings(espn_id);
CREATE INDEX IF NOT EXISTS idx_player_mappings_name_team_pos ON public.player_mappings(name, team, position);
CREATE INDEX IF NOT EXISTS idx_player_mappings_is_active ON public.player_mappings(is_active);

-- Create sync_metadata table for tracking API usage and sync history
CREATE TABLE IF NOT EXISTS public.sync_metadata (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sync_type TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  total_players INTEGER,
  active_players INTEGER,
  api_requests_used INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create index for sync metadata
CREATE INDEX IF NOT EXISTS idx_sync_metadata_sync_type ON public.sync_metadata(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_started_at ON public.sync_metadata(started_at DESC);

-- Enable RLS on both tables
ALTER TABLE public.player_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (no auth required for player data)
CREATE POLICY "Player mappings are publicly readable" 
ON public.player_mappings 
FOR SELECT 
USING (true);

CREATE POLICY "Sync metadata is publicly readable" 
ON public.sync_metadata 
FOR SELECT 
USING (true);

-- Create policies for insert/update (public for this use case)
CREATE POLICY "Player mappings can be inserted publicly" 
ON public.player_mappings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Player mappings can be updated publicly" 
ON public.player_mappings 
FOR UPDATE 
USING (true);

CREATE POLICY "Sync metadata can be inserted publicly" 
ON public.sync_metadata 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Sync metadata can be updated publicly" 
ON public.sync_metadata 
FOR UPDATE 
USING (true);

-- Create function to update last_updated timestamp
CREATE OR REPLACE FUNCTION public.update_player_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_player_mappings_updated_at
  BEFORE UPDATE ON public.player_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_player_mappings_updated_at();