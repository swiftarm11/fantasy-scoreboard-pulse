import { useState, useEffect, useCallback, useRef } from 'react';
import { sleeperAPI, SleeperLeague, SleeperUser, SleeperRoster, SleeperMatchup } from '../services/SleeperAPI';
import { LeagueData, ScoringEvent } from '../types/fantasy';
import { LeagueConfig } from '../types/config';
import { safeLower } from '../utils/strings';

interface SleeperLeagueData {
  league: SleeperLeague;
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  currentWeek: number;
}

interface UseSleeperDataReturn {
  leagues: LeagueData[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refetch: () => void;
}

export const useSleeperData = (leagueConfigs: LeagueConfig[]): UseSleeperDataReturn => {
  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [previousMatchups, setPreviousMatchups] = useState<Record<string, SleeperMatchup[]>>({});
  
  // Add request cancellation support
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestTimeRef = useRef<number>(0);

  const processSleeperData = useCallback(async (leagueData: SleeperLeagueData, config: LeagueConfig, prevMatchups: Record<string, SleeperMatchup[]>): Promise<LeagueData> => {
    const { league, users, rosters, matchups, currentWeek } = leagueData;
    
    // Find user's roster based on username if provided, otherwise use first roster
    let userRoster = rosters[0]; // Default fallback
    
    if (config.sleeperUsername) {
      // Find user by username
      const user = users.find(u => 
        safeLower(u.username) === safeLower(config.sleeperUsername) ||
        safeLower(u.display_name) === safeLower(config.sleeperUsername)
      );
      
      if (user) {
        // Find roster owned by this user
        const foundRoster = rosters.find(r => r.owner_id === user.user_id);
        if (foundRoster) {
          userRoster = foundRoster;
        }
      }
    }
    if (!userRoster) {
      throw new Error('Could not find user roster - league has no rosters');
    }

    const userMatchup = matchups.find(m => m.roster_id === userRoster.roster_id);
    if (!userMatchup) {
      throw new Error('Could not find user matchup');
    }

    const opponentMatchup = matchups.find(m => 
      m.matchup_id === userMatchup.matchup_id && m.roster_id !== userRoster.roster_id
    );
    if (!opponentMatchup) {
      throw new Error('Could not find opponent matchup');
    }

    const opponentRoster = rosters.find(r => r.roster_id === opponentMatchup.roster_id);
    const opponentUser = users.find(u => u.user_id === opponentRoster?.owner_id);

    // Calculate win probability
    const myScore = userMatchup.points || 0;
    const opponentScore = opponentMatchup.points || 0;
    const totalScore = myScore + opponentScore;
    const winProbability = totalScore > 0 ? (myScore / totalScore) * 100 : 50;

    // Determine status based on score difference
    const scoreDiff = myScore - opponentScore;
    let status: 'winning' | 'losing' | 'neutral' = 'neutral';
    if (scoreDiff >= 10) status = 'winning';
    else if (scoreDiff <= -10) status = 'losing';
    else status = 'neutral';

    // Generate scoring events by comparing with previous data
    const scoringEvents = await generateScoringEvents(
      userMatchup,
      prevMatchups[config.leagueId] || []
    );

    // Calculate record and position (simplified)
    const record = `${userRoster.settings.wins}-${userRoster.settings.losses}${userRoster.settings.ties > 0 ? `-${userRoster.settings.ties}` : ''}`;
    const leaguePosition = calculateLeaguePosition(rosters, userRoster.roster_id);

    // Generate team names using roster metadata or user display names
    const userTeamName = userRoster.metadata?.team_name || 
                         `${users.find(u => u.user_id === userRoster.owner_id)?.display_name || 'Unknown'}'s Team`;
    
    const opponentTeamName = opponentRoster?.metadata?.team_name || 
                            `${opponentUser?.display_name || opponentUser?.username || 'Unknown'}'s Team`;

    return {
      id: config.leagueId,  // ✅ Use platform ID for consistency with event storage
      leagueName: config.customTeamName || league.name,
      platform: 'Sleeper',
      teamName: config.customTeamName || userTeamName,
      myScore,
      opponentScore,
      opponentName: opponentTeamName,
      record,
      leaguePosition,
      status,
      scoringEvents,
      lastUpdated: new Date().toLocaleTimeString(),
    };
  }, []); // Empty dependency array to prevent recreation

  const generateScoringEvents = async (
    currentMatchup: SleeperMatchup,
    previousMatchups: SleeperMatchup[]
  ): Promise<ScoringEvent[]> => {
    const events: ScoringEvent[] = [];
    const previousMatchup = previousMatchups.find(m => m.roster_id === currentMatchup.roster_id);
    
    if (!previousMatchup) {
      return events; // No previous data to compare
    }

    // Compare player points to detect scoring events
    for (const [playerId, currentPoints] of Object.entries(currentMatchup.players_points || {})) {
      const previousPoints = previousMatchup.players_points?.[playerId] || 0;
      const pointDifference = currentPoints - previousPoints;
      
      if (pointDifference > 0.5) { // Significant point change
        try {
          const playerName = await sleeperAPI.getPlayerName(playerId);
          const players = await sleeperAPI.getPlayers();
          const player = players[playerId];
          
          events.push({
            id: `${currentMatchup.roster_id}-${playerId}-${Date.now()}`,
            playerName: playerName || `Player ${playerId}`,
            position: player?.position || 'UNKNOWN',
            weeklyPoints: currentPoints,
            action: generateActionText(pointDifference),
            scoreImpact: pointDifference,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isRecent: true,
          });
        } catch (error) {
          console.error('Error generating scoring event:', error);
        }
      }
    }

    return events.slice(0, 4); // Limit to 4 most recent events
  };

  const generateActionText = (points: number): string => {
    if (points >= 6) return 'Touchdown';
    if (points >= 3) return 'Field Goal';
    if (points >= 2) return 'Big Play';
    if (points >= 1) return 'Good Play';
    return 'Minor Play';
  };

  const calculateLeaguePosition = (rosters: SleeperRoster[], userRosterId: number): string => {
    const sortedRosters = rosters
      .sort((a, b) => {
        const aWinPct = a.settings.wins / (a.settings.wins + a.settings.losses + a.settings.ties);
        const bWinPct = b.settings.wins / (b.settings.wins + b.settings.losses + b.settings.ties);
        return bWinPct - aWinPct;
      });

    const position = sortedRosters.findIndex(r => r.roster_id === userRosterId) + 1;
    return `${position}${getOrdinalSuffix(position)} place`;
  };

  const getOrdinalSuffix = (num: number): string => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
  };

  const fetchSleeperData = useCallback(async () => {
    const enabledLeagues = leagueConfigs.filter(l => l.enabled && l.platform === 'Sleeper');
    if (enabledLeagues.length === 0) {
      setLeagues([]);
      return;
    }

    // Prevent concurrent fetches with debouncing (minimum 2 seconds between requests)
    const now = Date.now();
    if (loading || (now - lastRequestTimeRef.current < 2000)) {
      console.log('Request debounced - too frequent or already loading');
      return;
    }

    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    lastRequestTimeRef.current = now;

    setLoading(true);
    setError(null);

    try {
      // Clear any existing request timeout
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }

      // Set request timeout (30 seconds)
      requestTimeoutRef.current = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }, 30000);

      const currentWeek = await sleeperAPI.getCurrentWeek();
      const leagueDataPromises = enabledLeagues.map(async (config) => {
        try {
          // OPTIMIZATION: Use cached static data (league, users, rosters) and only fetch fresh matchups
          // This reduces API calls from 4 per league to 1 per league for regular updates
          const staticData = await sleeperAPI.getStaticLeagueData(config.leagueId);
          const matchups = await sleeperAPI.getMatchups(config.leagueId, currentWeek);

          const sleeperLeagueData: SleeperLeagueData = {
            league: staticData.league,
            users: staticData.users,
            rosters: staticData.rosters,
            matchups,
            currentWeek,
          };

          return await processSleeperData(sleeperLeagueData, config, previousMatchups);
        } catch (error) {
          console.error(`Error fetching data for league ${config.leagueId}:`, error);
          throw error;
        }
      });

      const processedLeagues = await Promise.all(leagueDataPromises);
      
      // Check if request was cancelled
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      setLeagues(processedLeagues);
      setLastUpdated(new Date());

      // Store matchups for next comparison (no additional API calls needed)
      const newPreviousMatchups: Record<string, SleeperMatchup[]> = {};
      
      // Extract matchups from the processed leagues data we already have
      enabledLeagues.forEach((config, index) => {
        try {
          // Get the matchups from the league data we already fetched
          // We can extract this from the API calls we made above
          if (processedLeagues[index]) {
            // For now, just use empty array to prevent the loop
            // TODO: Extract matchups from existing data instead of making new API calls
            newPreviousMatchups[config.leagueId] = [];
          }
        } catch (error) {
          console.error(`Error storing matchups for ${config.leagueId}:`, error);
        }
      });
      
      // Only update if different to prevent unnecessary re-renders
      if (JSON.stringify(newPreviousMatchups) !== JSON.stringify(previousMatchups)) {
        setPreviousMatchups(newPreviousMatchups);
      }

    } catch (error) {
      // Don't set error if request was cancelled
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      
      console.error('Error fetching Sleeper data:', error);
      console.log('Active leagues attempting to fetch:', enabledLeagues.map(l => ({ id: l.id, leagueId: l.leagueId })));
      setError(error.message || 'Failed to fetch league data');
    } finally {
      // Clear timeout and reset abort controller
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [leagueConfigs, processSleeperData, previousMatchups]); // Fixed dependency loop issue

  const refetch = () => {
    fetchSleeperData();
  };

  // Initial fetch with debouncing and cleanup
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchSleeperData();
    }, 100); // Small delay to prevent rapid consecutive calls

    return () => {
      clearTimeout(timeoutId);
      // Cancel ongoing requests on unmount or dependency change
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
    };
  }, [leagueConfigs]); // Only depend on leagueConfigs, not fetchSleeperData

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }
    };
  }, []);

  return {
    leagues,
    loading,
    error,
    lastUpdated,
    refetch,
  };
};