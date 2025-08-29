// src/hooks/useYahooData.ts
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { LeagueData } from '../types/fantasy';
import { useYahooOAuth } from './useYahooOAuth';
import { debugLogger } from '../utils/debugLogger';
import { toast } from '../components/ui/use-toast';
import { yahooLogger } from '../utils/yahooLogger';

interface YahooDataState {
  leagues: LeagueData[];
  availableLeagues: any[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
}

interface YahooLeagueSelection {
  leagueId: string;
  leagueName: string;
  enabled: boolean;
  platform: string;
}

const STORAGE_KEY = 'yahoo_league_selections';

export const useYahooData = () => {
  const { isConnected } = useYahooOAuth();

  const initialState = useMemo<YahooDataState>(() => ({
    leagues: [],
    availableLeagues: [],
    isLoading: false,
    error: null,
    lastUpdated: null,
  }), []);

  const [state, setState] = useState<YahooDataState>(initialState);
  const [savedSelections, setSavedSelections] = useState<YahooLeagueSelection[]>([]);
  const hasInitializedRef = useRef(false);
  const fetchLeaguesInFlightRef = useRef(false);
  const fetchDetailsInFlightRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  // Refs to break dependency loops
  const availableLeaguesRef = useRef<any[]>([]);
  const enabledIdsRef = useRef<string[]>([]);
  const lastDetailsKeyRef = useRef<string>(''); // guards fetchDetails scheduling key

  // Load saved selections on mount
  useEffect(() => {
    if (!hasInitializedRef.current) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setSavedSelections(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved selections', e);
      } finally {
        hasInitializedRef.current = true;
      }
    }
  }, []);

  // Persist selections helper
  const saveLeagueSelections = useCallback((selections: YahooLeagueSelection[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
      setSavedSelections(selections);
      debugLogger.info('YAHOO_LEAGUES', 'League selections saved', { count: selections.length });
    } catch (e) {
      console.error('Failed to save selections', e);
    }
  }, []);

  // Enabled league IDs (memo + ref sync)
  const enabledIds = useMemo(
    () => savedSelections.filter(s => s.enabled).map(s => s.leagueId),
    [savedSelections]
  );
  useEffect(() => {
    enabledIdsRef.current = enabledIds;
  }, [enabledIds]);

  // Correct Yahoo response parsing (uses "0" string indices)
  const parseYahooLeaguesResponse = useCallback((data: any): any[] => {
    const fc = data?.fantasy_content;
    if (!fc) throw new Error('Missing fantasy_content');

    const users = fc.users;
    const user = users?.['0']?.user;
    if (!user?.[40]?.games) throw new Error('Missing user[40].games');

    const game = user[40].games?.['0']?.game;
    if (!game?.[40]?.leagues) throw new Error('Missing game[40].leagues');

    const leagues = game[40].leagues;
    const count = leagues.count || 0;
    const out: any[] = [];
    for (let i = 0; i < count; i++) {
      const entry = leagues[i.toString()];
      const leagueObj = entry?.league?.;
      if (leagueObj) out.push(leagueObj);
    }
    return out;
  }, []);

  // Shallow equality guard for arrays of primitives/flat objects (small lists)
  const arraysEqualByJSON = (a: any[], b: any[]) => {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  };

  // Fetch available leagues (idempotent + guarded)
  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) return;
    if (fetchLeaguesInFlightRef.current) return;
    fetchLeaguesInFlightRef.current = true;

    setState(prev => prev.isLoading ? prev : { ...prev, isLoading: true, error: null });

    try {
      const raw = localStorage.getItem('yahoo_oauth_tokens');
      const tokens = raw ? JSON.parse(raw) : null;
      if (!tokens?.access_token) throw new Error('Not authenticated');

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ endpoint: 'getUserLeagues', accessToken: tokens.access_token }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API Error: ${resp.status} - ${text}`);
      }

      const text = await resp.text();
      const data = JSON.parse(text);
      const parsed = parseYahooLeaguesResponse(data);

      // Equality guard: avoid setting identical arrays
      if (!arraysEqualByJSON(parsed, availableLeaguesRef.current)) {
        availableLeaguesRef.current = parsed;
        setState(prev => ({
          ...prev,
          availableLeagues: parsed,
          isLoading: false,
          lastUpdated: new Date().toISOString(),
        }));
      } else {
        setState(prev => (prev.isLoading ? { ...prev, isLoading: false } : prev));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      if (message.includes('token') || message.includes('401')) {
        toast({
          title: 'Yahoo Token Issue',
          description: 'Please reconnect to Yahoo',
          variant: 'destructive',
        });
      }
    } finally {
      fetchLeaguesInFlightRef.current = false;
    }
  }, [isConnected, parseYahooLeaguesResponse]);

  // Sync ref with state.availableLeagues (one-way)
  useEffect(() => {
    if (!arraysEqualByJSON(state.availableLeagues, availableLeaguesRef.current)) {
      availableLeaguesRef.current = state.availableLeagues;
    }
  }, [state.availableLeagues]);

  // Fetch scoreboard/details (debounced + guarded + no state deps)
  const fetchLeagueDetails = useCallback(async () => {
    if (!isConnected) return;
    const leagueIds = enabledIdsRef.current;
    if (leagueIds.length === 0) {
      // Only update if needed
      setState(prev => (prev.leagues.length ? { ...prev, leagues: [] } : prev));
      return;
    }
    if (availableLeaguesRef.current.length === 0) return;
    if (fetchDetailsInFlightRef.current) return;

    // Build a stable key to avoid duplicate runs for same inputs
    const nextKey = JSON.stringify({
      ids: leagueIds.slice().sort(),
      have: availableLeaguesRef.current.length,
    });
    if (nextKey === lastDetailsKeyRef.current) return;
    lastDetailsKeyRef.current = nextKey;

    fetchDetailsInFlightRef.current = true;
    setState(prev => prev.isLoading ? prev : { ...prev, isLoading: true, error: null });

    try {
      const raw = localStorage.getItem('yahoo_oauth_tokens');
      const tokens = raw ? JSON.parse(raw) : null;
      if (!tokens?.access_token) throw new Error('Not authenticated');

      const results: LeagueData[] = [];

      for (const leagueKey of leagueIds) {
        const leagueInfo = availableLeaguesRef.current.find((l: any) => l.league_key === leagueKey);
        if (!leagueInfo) continue;

        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'apikey': `${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            endpoint: 'getLeagueScoreboard',
            accessToken: tokens.access_token,
            leagueKey,
          }),
        });

        if (!resp.ok) continue;
        const sbText = await resp.text();
        const sb = JSON.parse(sbText);

        // Minimal viable mapping; expand as needed
        const league: LeagueData = {
          id: leagueInfo.league_key,
          platform: 'Yahoo',
          leagueName: leagueInfo.name,
          teamName: 'My Team',
          myScore: 0,
          opponentName: 'TBD',
          opponentScore: 0,
          record: '0-0-0',
          leaguePosition: 1,
          status: sb?.fantasy_content?.league?.scoreboard?.status ?? 'active',
          scoringEvents: [],
          lastUpdated: new Date().toISOString(),
        };

        results.push(league);
      }

      // Equality guard
      if (!arraysEqualByJSON(results, state.leagues)) {
        setState(prev => ({
          ...prev,
          leagues: results,
          isLoading: false,
          lastUpdated: new Date().toISOString(),
        }));
      } else {
        setState(prev => (prev.isLoading ? { ...prev, isLoading: false } : prev));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch league data';
      setState(prev => ({ ...prev, error: msg, isLoading: false }));
    } finally {
      fetchDetailsInFlightRef.current = false;
    }
  }, [isConnected, state.leagues]);

  // Auto-fetch leagues when connected
  useEffect(() => {
    if (!hasInitializedRef.current || !isConnected) return;
    fetchAvailableLeagues();
  }, [isConnected, fetchAvailableLeagues]);

  // Debounced details fetch when inputs change (without depending on state we set)
  useEffect(() => {
    if (!hasInitializedRef.current || !isConnected) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      fetchLeagueDetails();
    }, 500);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [isConnected, enabledIds.join(','), state.availableLeagues.length, fetchLeagueDetails]);

  const refreshData = useCallback(async () => {
    await fetchAvailableLeagues();
    // Details will be scheduled by effect once leagues arrive
  }, [fetchAvailableLeagues]);

  return {
    ...state,
    savedSelections,
    saveLeagueSelections,
    refreshData,
  };
};
