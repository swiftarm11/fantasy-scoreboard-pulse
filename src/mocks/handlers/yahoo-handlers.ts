import { http, HttpResponse } from 'msw';
import { yahooSnapshots, type YahooApiResponse } from '../fixtures/yahoo-snapshots';

interface SimulationConfig {
  enabled: boolean;
  latencyMin: number;
  latencyMax: number;
  currentSnapshot: number;
  totalSnapshots: number;
}

// Default simulation configuration
const defaultConfig: SimulationConfig = {
  enabled: false,
  latencyMin: 200,
  latencyMax: 500,
  currentSnapshot: 0,
  totalSnapshots: 25,
};

// Global simulation state
let simulationConfig = { ...defaultConfig };

// Helper functions
const isSimulationEnabled = (request: Request): boolean => {
  // Check URL parameter first
  const url = new URL(request.url);
  const urlParam = url.searchParams.get('simulation');
  if (urlParam === 'true') return true;
  if (urlParam === 'false') return false;

  // Check environment variable
  const envVar = import.meta.env.VITE_YAHOO_SIMULATION;
  if (envVar === 'true') return true;

  // Check global config
  return simulationConfig.enabled;
};

const addArtificialLatency = async (): Promise<void> => {
  const delay = Math.random() * (simulationConfig.latencyMax - simulationConfig.latencyMin) + simulationConfig.latencyMin;
  await new Promise(resolve => setTimeout(resolve, delay));
};

const createSimulationHeaders = (snapshot?: number) => ({
  'X-Simulation-Mode': 'true',
  'X-Simulation-Snapshot': String(snapshot ?? simulationConfig.currentSnapshot),
  'X-Simulation-Total': String(simulationConfig.totalSnapshots),
  'X-Simulation-Latency': `${simulationConfig.latencyMin}-${simulationConfig.latencyMax}ms`,
  'Content-Type': 'application/json',
});

const createErrorResponse = (message: string, status = 500) => {
  return HttpResponse.json(
    { error: message, simulation: true },
    { 
      status,
      headers: createSimulationHeaders()
    }
  );
};

// Yahoo OAuth handler
const yahooOAuthHandler = http.post('*/functions/v1/yahoo-oauth', async ({ request }) => {
  if (!isSimulationEnabled(request)) {
    // Pass through to real API
    return;
  }

  await addArtificialLatency();

  try {
    const body = await request.json() as any;
    
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

// Yahoo API handler for league data
const yahooApiHandler = http.post('*/functions/v1/yahoo-api', async ({ request }) => {
  if (!isSimulationEnabled(request)) {
    // Pass through to real API
    return;
  }

  await addArtificialLatency();

  try {
    const body = await request.json() as any;
    const { endpoint, leagueKey, week } = body;
    
    console.log(`[MSW] Yahoo API Simulation - Endpoint: ${endpoint}, League: ${leagueKey}, Week: ${week}, Snapshot: ${simulationConfig.currentSnapshot + 1}`);

    // Handle different endpoints
    switch (endpoint) {
      case 'getLeagueScoreboard': {
        // This is the main endpoint your app uses for live data
        const snapshotIndex = simulationConfig.currentSnapshot + 1; // Convert to 1-based
        const snapshotData = await yahooSnapshots.getSnapshot(snapshotIndex);
        
        if (!snapshotData) {
          console.error(`[MSW] Failed to load snapshot ${snapshotIndex}`);
          return createErrorResponse(`Failed to load snapshot ${snapshotIndex}`, 404);
        }

        // Add simulation metadata to the response
        const responseData = {
          ...snapshotData,
          _simulation: {
            enabled: true,
            snapshot_index: simulationConfig.currentSnapshot,
            total_snapshots: simulationConfig.totalSnapshots,
            timestamp: new Date().toISOString(),
            endpoint: endpoint
          }
        };

        console.log(`[MSW] Returning snapshot ${snapshotIndex} data:`, {
          matchups: snapshotData.fantasy_content.league[0].scoreboard.matchups.length,
          status: snapshotData.fantasy_content.league[0].scoreboard.matchups[0]?.status,
          teams: snapshotData.fantasy_content.league[0].scoreboard.matchups.reduce((total, m) => total + m.teams.length, 0)
        });

        return HttpResponse.json(responseData, { 
          headers: createSimulationHeaders(simulationConfig.currentSnapshot) 
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

// Simulation control endpoints
const simulationControlHandler = http.post('/api/simulation/control', async ({ request }) => {
  await addArtificialLatency();

  try {
    const body = await request.json() as any;
    
    switch (body.action) {
      case 'enable':
        simulationConfig.enabled = true;
        break;
      case 'disable':
        simulationConfig.enabled = false;
        break;
      case 'set_snapshot':
        if (typeof body.snapshot === 'number' && body.snapshot >= 0 && body.snapshot < simulationConfig.totalSnapshots) {
          simulationConfig.currentSnapshot = body.snapshot;
        } else {
          return createErrorResponse('Invalid snapshot index', 400);
        }
        break;
      case 'set_latency':
        if (body.min && body.max && body.min < body.max) {
          simulationConfig.latencyMin = body.min;
          simulationConfig.latencyMax = body.max;
        } else {
          return createErrorResponse('Invalid latency range', 400);
        }
        break;
      case 'reset':
        simulationConfig = { ...defaultConfig };
        break;
      default:
        return createErrorResponse('Unknown control action', 400);
    }

    return HttpResponse.json(
      { 
        success: true, 
        config: simulationConfig,
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

  return HttpResponse.json(
    {
      ...simulationConfig,
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
  getConfig: () => ({ ...simulationConfig }),
  setConfig: (config: Partial<SimulationConfig>) => {
    simulationConfig = { ...simulationConfig, ...config };
  },
  resetConfig: () => {
    simulationConfig = { ...defaultConfig };
  },
  isEnabled: () => simulationConfig.enabled,
  getCurrentSnapshot: () => simulationConfig.currentSnapshot,
  setSnapshot: (index: number) => {
    if (index >= 0 && index < simulationConfig.totalSnapshots) {
      simulationConfig.currentSnapshot = index;
      return true;
    }
    return false;
  },
};
