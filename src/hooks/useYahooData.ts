// useYahooData.ts - Yahoo Fantasy Sports Data Hook
import { useState, useEffect, useCallback } from 'react';
import { LeagueData, ScoringEvent } from '../types/fantasy';
import { LeagueConfig } from '../types/config';
import { useYahooOAuth } from './useYahooOAuth';
import { debugLogger } from '../utils/debugLogger';
import { toast } from '../components/ui/use-toast';

// Interface for saved league selections
interface SavedLeagueSelection {
  leagueId: string;
  leagueName: string;
  enabled: boolean;
  platform: 'Yahoo';
}

const SAVED_LEAGUES_KEY = 'fantasy-dashboard-selected-leagues';

export const useYahooData = () => {
  const { isConnected, getStoredTokens } = useYahooOAuth();
  
  const [state, setState] = useState({
    leagues: [],
    availableLeagues: [],
    isLoading: false,
    error: null,
    lastUpdated: null,
  });

  const [savedSelections, setSavedSelections] = useState<SavedLeagueSelection[]>([]);

  // Load saved selections from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_LEAGUES_KEY);
    if (saved) {
      try {
        const selections = JSON.parse(saved);
        setSavedSelections(selections);
        debugLogger.info('YAHOO_DATA', 'Loaded saved league selections', { count: selections.length });
      } catch (error) {
        debugLogger.error('YAHOO_DATA', 'Failed to parse saved selections', error);
      }
    }
  }, []);

  // Function to save league selections
  const saveLeagueSelections = useCallback((selections: SavedLeagueSelection[]) => {
    localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(selections));
    setSavedSelections(selections);
    debugLogger.info('YAHOO_DATA', 'Saved league selections', { count: selections.length, enabled: selections.filter(s => s.enabled).length });
  }, []);

  const fetchAvailableLeagues = useCallback(async () => {
    if (!isConnected) {
      debugLogger.info('YAHOO_DATA', 'Skipping fetch - not connected');
      return;
    }
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    debugLogger.info('YAHOO_DATA', 'Starting fetchAvailableLeagues');
    
    try {
      const tokens = getStoredTokens();
      if (!tokens?.access_token) throw new Error('Not authenticated');
      
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-api`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            endpoint: 'getUserLeagues',
            accessToken: tokens.access_token
          })
        }
      );
      
      debugLogger.info('YAHOO_DATA', 'API call completed', { status: resp.status, ok: resp.ok });
      
      if (!resp.ok) throw new Error(await resp.text());
      
      const text = await resp.text();
      const data = JSON.parse(text);
      
      // Enhanced parsing with better error handling
      const usersNode = data?.fantasy_content?.users?.["0"]?.user;
      if (!usersNode) throw new Error('Invalid API response structure - no users node');
      
      const gamesNode = usersNode?.[1]?.games?.["0"]?.game;
      if (!gamesNode) throw new Error('Invalid API response structure - no games node');
      
      const leaguesNode = gamesNode?.[1]?.leagues;
      if (!leaguesNode) throw new Error('Invalid API response structure - no leagues node');
      
      debugLogger.info('YAHOO_DATA', 'Parsing leagues', { count: leaguesNode.count, nodeKeys: Object.keys(leaguesNode) });
      
      const availableLeagues = [];
      for (let i = 0; i < leaguesNode.count; i++) {
        const entry = leaguesNode[i.toString()];
        if (entry?.league?.[0]) {
          availableLeagues.push(entry.league[0]);
        }
      }
      
      setState(prev => ({
        ...prev,
        availableLeagues,
        isLoading: false,
        lastUpdated: new Date().toISOString()
      }));
      
      debugLogger.info('YAHOO_DATA', 'Available leagues loaded successfully', { count: availableLeagues.length, leagues: availableLeagues.map(l => ({ key: l.league_key, name: l.name })) });
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch leagues';
      setState(prev => ({ ...prev, error: message, isLoading: false }));
      debugLogger.error('YAHOO_DATA', 'fetchAvailableLeagues failed', { error: message, fullError: error });
      
      if (message.includes('token expired')) {
        toast({
          title: 'Yahoo Token Expired',
          description: 'Please reconnect to Yahoo',
          variant: 'destructive'
        });
      }
    }
  }, [isConnected, getStoredTokens]); // Removed debugLogger from dependencies

  const fetchLeagueData = useCallback(async (leagueIds: string[]) => {
    if (!isConnected || leagueIds.length === 0) {
      debugLogger.info('YAHOO_DATA', 'Skipping league data fetch', { connected: isConnected, leagueCount: leagueIds.length });
      setState(prev => ({ ...prev, leagues: [] }));
      return;
    }
    
    debugLogger.info('YAHOO_DATA', 'Starting fetchLeagueData', { leagueIds });
    setState(prev => ({ ...prev, isLoading: true, error: null
