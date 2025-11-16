import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupResult {
  success: boolean;
  deletedCount: number;
  currentWeek: number;
  cutoffWeek: number;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('[CLEANUP] Starting scoring events cleanup');

  try {
    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for current week (or use default)
    const { currentWeek, weeksToKeep = 2 } = await req.json().catch(() => ({
      currentWeek: 11, // Default to week 11
      weeksToKeep: 2
    }));

    const cutoffWeek = currentWeek - weeksToKeep;
    const season = 2025;

    console.log('[CLEANUP] Parameters:', {
      currentWeek,
      weeksToKeep,
      cutoffWeek,
      season
    });

    // Delete old events
    const { data, error, count } = await supabase
      .from('scoring_events')
      .delete({ count: 'exact' })
      .eq('season', season)
      .lt('nfl_week', cutoffWeek);

    if (error) {
      console.error('[CLEANUP] Delete failed:', error);
      throw error;
    }

    const result: CleanupResult = {
      success: true,
      deletedCount: count || 0,
      currentWeek,
      cutoffWeek
    };

    console.log('[CLEANUP] Completed successfully:', result);

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('[CLEANUP] Error:', error);

    const result: CleanupResult = {
      success: false,
      deletedCount: 0,
      currentWeek: 0,
      cutoffWeek: 0,
      error: error.message
    };

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
