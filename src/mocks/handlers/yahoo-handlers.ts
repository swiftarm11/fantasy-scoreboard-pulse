import { http, HttpResponse } from 'msw';
import { yahooSnapshots, type YahooApiResponse } from '../fixtures/yahoo-snapshots';
import { getSimulationBridge } from '../simulationBridge';

// Get simulation bridge instance
const simulationBridge = getSimulationBridge();

// Subscribe to simulation state changes
simulationBridge.subscribe((event) => {
  console.log(`[YahooHandlers] Received simulation event: ${event.type}`, event.payload);
});

// Helper functions
const isSimulationEnabled = (request: Request): boolean => {
  // Check URL parameter first
  const url = new URL(request.url);
  const urlParam = url.searchParams.get('simulation');
  if (urlParam === 'true') return true;
  if (urlParam === 'false') return false;

  // Check simulation bridge state
  return simulationBridge.isInSimulationMode();
};

const addArtificialLatency = async (): Promise<void> => {
  // Reduced latency for better responsiveness during testing
  const delay = Math.random() * 300 + 100; // 100-400ms
  await new Promise(resolve => setTimeout(resolve, delay));
};

const createSimulationHeaders = (snapshot?: number) => {
  const currentSnapshot = snapshot ?? simulationBridge.getCurrentSnapshot();
  return {
    'X-Simulation-Mode': 'true',
    'X-Simulation-Snapshot': String(currentSnapshot + 1), // Convert to 1-based for display
    'X-Simulation-Total': String(simulationBridge.getState().maxSnapshots),
    'X-Simulation-Bridge-Active': 'true',
    'Content-Type': 'application/json',
  };
};

const createErrorResponse = (message: string, status = 500) => {
  return HttpResponse.json(
    { 
      error: message, 
      simulation: true,
      currentSnapshot: simulationBridge.getCurrentSnapshot()
    },
    { 
      status,
      headers: createSimulationHeaders()
    }
  );
};

// Yahoo OAuth handler
const yahooOAuthHandler = http.post('*/functions/v1/yahoo-oauth', async ({ request }) => {
  if (!isSimulationEnabled(request)) {
    console.log('[YahooHandlers] OAuth request - simulation disabled, passing through');
    return;
  }

  await addArtificialLatency();

  try {
    const body = await request.json() as any;
    
    console.log(`[YahooHandlers] OAuth simulation - action: ${body.action}`);
    
    // Simulate different OAuth flows based on the request
    if (body.action === 'authorize') {
      return HttpResponse.json(
        {
          auth_url: 'https://api.login.yahoo.com/oauth2/request_auth?mock=true',
          state: 'mock_state_123',
          code_verifier: 'mock_verifier',
          simulation: true
        },
        { headers: createSimulationHeaders() }
      );
    }

    if (body.action === 'token') {
      return HttpResponse.json(
        {
          access_token: 'mock_access_token_12345',
          refresh_token: 'mock_refresh_token_67890',
          expires_in: 3600,
          token_type: 'Bearer',
          simulation: true
        },
        { headers: createSimulationHeaders() }
      );
    }

    if (body.action === 'refresh') {
      return HttpResponse.json(
        {
          access_token: 'mock_refreshed_token_54321',
          expires_in: 3600,
          token_type: 'Bearer',
          simulation: true
        },
        { headers: createSimulationHeaders() }
      );
    }

    return createErrorResponse('Unknown OAuth action');

  } catch (error) {
    return createErrorResponse('Invalid request body');
  }
});

// Yahoo API handler for league data - MAIN HANDLER THAT SERVES SNAPSHOT DATA
const yahooApiHandler = http.post('*/functions/v1/yahoo-api', async ({ request }) => {
  if (!isSimulationEnabled(request)) {
    console.log('[YahooHandlers] API request - simulation disabled, passing through');
    return;
  }

  await addArtificialLatency();

  try {
    const body = await request.json() as any;
    const { endpoint, leagueKey, week } = body;
    
    // Get current snapshot from bridge (0-based)
    const currentSnapshotIndex = simulationBridge.getCurrentSnapshot();
    const snapshotNumber = currentSnapshotIndex + 1; // Convert to 1-based for file names
    
    console.log(`[YahooHandlers] API Simulation Request:`, {
      endpoint,
      leagueKey,
      week,
      bridgeSnapshot: currentSnapshotIndex,
      fileSnapshot: snapshotNumber,
      simulationMode: simulationBridge.isInSimulationMode()
    });

    // Handle different endpoints
    switch (endpoint) {
      case 'getLeagueScoreboard': {
        // This is the main endpoint your app uses for live data
        console.log(`[YahooHandlers] Loading snapshot ${snapshotNumber} from bridge state`);
        
        const snapshotData = await yahooSnapshots.getSnapshot(snapshotNumber);
        
        if (!snapshotData) {
          console.error(`[YahooHandlers] Failed to load snapshot ${snapshotNumber}`);
          return createErrorResponse(`Failed to load snapshot ${snapshotNumber}`, 404);
        }

        // Add simulation metadata to the response
        const responseData = {
          ...snapshotData,
          _simulation: {
            enabled: true,
            bridge_snapshot_index: currentSnapshotIndex,
            file_snapshot_number: snapshotNumber,
            total_snapshots: simulationBridge.getState().maxSnapshots,
            timestamp: new Date().toISOString(),
            endpoint: endpoint,
            bridge_state: simulationBridge.getState()
          }
        };

        console.log(`[YahooHandlers] Successfully serving snapshot ${snapshotNumber}:`, {
          matchups: snapshotData.fantasy_content.league[0].scoreboard.matchups.length,
          status: snapshotData.fantasy_content.league[0].scoreboard.matchups[0]?.status,
          teams: snapshotData.fantasy_content.league[0].scoreboard.matchups.reduce((total, m) => total + m.teams.length, 0),
          bridgeSnapshot: currentSnapshotIndex,
          fileSnapshot: snapshotNumber
        });

        return HttpResponse.json(responseData, { 
          headers: createSimulationHeaders(currentSnapshotIndex) 
        });
      }

      case 'getUserLeagues': {
        // Return a simplified league list for simulation
        const mockLeagueList = {
          fantasy_content: {
            users: [{
              user: [{
                games: [{
                  game: [{
                    leagues: [{
                      league: [{
                        league_key: '461.l.1127949',
                        league_id: '1127949', 
                        name: 'Real NFL Week 7 Simulation',
                        season: '2023',
                        league_type: 'private',
                        num_teams: 12,
                        scoring_type: 'head',
                        current_week: '7'
                      }]
                    }]
                  }]
                }]
              }]
            }]
          },
          _simulation: {
            enabled: true,
            endpoint: endpoint,
            timestamp: new Date().toISOString()
          }
        };

        return HttpResponse.json(mockLeagueList, { 
          headers: createSimulationHeaders() 
        });
      }

      case 'getLeagueStandings':
      case 'getLeagueSettings': {
        // For other endpoints, return basic mock data
        const mockResponse = {
          fantasy_content: {
            league: [{
              league_key: leagueKey || '461.l.1127949',
              name: 'Real NFL Week 7 Simulation',
              message: `Simulated response for ${endpoint}`
            }]
          },
          _simulation: {
            enabled: true,
            endpoint: endpoint,
            timestamp: new Date().toISOString()
          }
        };

        return HttpResponse.json(mockResponse, { 
          headers: createSimulationHeaders() 
        });
      }

      default: {
        console.warn(`[MSW] Unknown Yahoo API endpoint: ${endpoint}`);
        return createErrorResponse(`Unknown endpoint: ${endpoint}`, 400);
      }
    }

  } catch (error) {
    console.error('[MSW] Yahoo API handler error:', error);
    return createErrorResponse('Failed to process Yahoo API request');
  }
});

// Simulation control endpoints for testing
const simulationControlHandler = http.post('/api/simulation/control', async ({ request }) => {
  await addArtificialLatency();

  try {
    const body = await request.json() as any;
    
    console.log(`[YahooHandlers] Simulation control request:`, body);
    
    switch (body.action) {
      case 'enable':
        simulationBridge.setSimulationMode(true);
        break;
      case 'disable':
        simulationBridge.setSimulationMode(false);
        break;
      case 'set_snapshot':
        if (typeof body.snapshot === 'number') {
          simulationBridge.setCurrentSnapshot(body.snapshot);
        } else {
          return createErrorResponse('Invalid snapshot index', 400);
        }
        break;
      case 'next':
        simulationBridge.nextSnapshot();
        break;
      case 'previous':
        simulationBridge.previousSnapshot();
        break;
      case 'reset':
        simulationBridge.reset();
        break;
      default:
        return createErrorResponse('Unknown control action', 400);
    }

    return HttpResponse.json(
      { 
        success: true, 
        state: simulationBridge.getState(),
        simulation: true 
      },
      { headers: createSimulationHeaders() }
    );

  } catch (error) {
    return createErrorResponse('Invalid control request');
  }
});

const simulationStatusHandler = http.get('/api/simulation/status', async () => {
  await addArtificialLatency();

  const state = simulationBridge.getState();
  
  console.log(`[YahooHandlers] Simulation status requested:`, state);

  return HttpResponse.json(
    {
      ...state,
      simulation: true,
      timestamp: new Date().toISOString(),
    },
    { headers: createSimulationHeaders() }
  );
});

// Export all Yahoo-related handlers
export const yahooHandlers = [
  yahooOAuthHandler,
  yahooApiHandler,
  simulationControlHandler,
  simulationStatusHandler,
];

// Export helper functions for testing
export const simulationHelpers = {
  getState: () => simulationBridge.getState(),
  setSnapshot: (index: number) => simulationBridge.setCurrentSnapshot(index),
  nextSnapshot: () => simulationBridge.nextSnapshot(),
  previousSnapshot: () => simulationBridge.previousSnapshot(),
  reset: () => simulationBridge.reset(),
  getBridge: () => simulationBridge,
};
