-- Create scoring_events table for persistent storage
CREATE TABLE IF NOT EXISTS public.scoring_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id text NOT NULL,
  team_id text,
  player_id text NOT NULL,
  player_name text NOT NULL,
  team_abbr text NOT NULL,
  event_type text NOT NULL,
  description text NOT NULL,
  fantasy_points numeric NOT NULL,
  nfl_week integer NOT NULL,
  season integer NOT NULL DEFAULT 2025,
  timestamp timestamptz NOT NULL,
  quarter integer,
  time_remaining text,
  nfl_game_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_scoring_events_league_week 
  ON public.scoring_events(league_id, nfl_week);

CREATE INDEX IF NOT EXISTS idx_scoring_events_timestamp 
  ON public.scoring_events(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_scoring_events_player 
  ON public.scoring_events(player_id);

-- Enable RLS
ALTER TABLE public.scoring_events ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth system)
CREATE POLICY "Scoring events are publicly readable"
  ON public.scoring_events
  FOR SELECT
  USING (true);

-- Service role can insert/update/delete
CREATE POLICY "Service role can manage scoring events"
  ON public.scoring_events
  FOR ALL
  USING (true)
  WITH CHECK (true);