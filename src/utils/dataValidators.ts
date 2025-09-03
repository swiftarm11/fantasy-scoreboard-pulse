export interface DataValidationResult {
  isValid: boolean;
  issues: string[];
  severity: 'info' | 'warning' | 'error';
  humanMessage: string;
}

export interface PlatformHealthStatus {
  platform: 'Yahoo' | 'Sleeper';
  isConnected: boolean;
  lastSuccessfulFetch: string | null;
  dataFreshness: 'fresh' | 'stale' | 'very_stale' | 'unknown';
  formatValidation: DataValidationResult;
  completenessCheck: DataValidationResult;
}

/**
 * Validates Yahoo API response structure
 */
export function validateYahooData(data: any): DataValidationResult {
  const issues: string[] = [];
  
  if (!data) {
    return {
      isValid: false,
      issues: ['No data received'],
      severity: 'error',
      humanMessage: 'Yahoo API returned no data - this could mean the service is down or your connection expired.'
    };
  }

  // Check for fantasy_content structure
  if (!data.fantasy_content) {
    issues.push('Missing fantasy_content wrapper');
  }

  // Check for league data
  if (!data.fantasy_content?.league?.[0]) {
    issues.push('No league data found in response');
  }

  // Check for scoreboard/matchup data during live games
  const league = data.fantasy_content?.league?.[0];
  if (league && !league.scoreboard?.matchups) {
    issues.push('No live scoring data (matchups) found - this is expected outside of game time');
  }

  // Check for team data
  if (league && !league.teams) {
    issues.push('No team roster data found');
  }

  const isValid = issues.length === 0;
  const severity = issues.some(i => i.includes('No data received') || i.includes('fantasy_content')) ? 'error' : 
                   issues.some(i => i.includes('scoreboard')) ? 'warning' : 'info';

  return {
    isValid,
    issues,
    severity,
    humanMessage: isValid ? 
      'Yahoo data looks good! All expected fields are present.' :
      `Yahoo data issue: ${issues[0]}. ${severity === 'error' ? 'This needs immediate attention.' : 'This might be normal depending on game schedule.'}`
  };
}

/**
 * Validates Sleeper API response structure
 */
export function validateSleeperData(data: any, type: 'league' | 'matchups' | 'rosters'): DataValidationResult {
  const issues: string[] = [];
  
  if (!data) {
    return {
      isValid: false,
      issues: ['No data received'],
      severity: 'error',
      humanMessage: `Sleeper API returned no ${type} data - this could mean the service is down or league ID is invalid.`
    };
  }

  switch (type) {
    case 'league':
      if (!data.name) issues.push('League missing name');
      if (!data.league_id) issues.push('League missing ID');
      if (data.status !== 'in_season' && data.status !== 'complete') {
        issues.push(`League status is "${data.status}" - may not have active games`);
      }
      break;

    case 'matchups':
      if (!Array.isArray(data)) {
        issues.push('Matchups should be an array');
      } else if (data.length === 0) {
        issues.push('No matchups found - this might be normal between weeks');
      } else {
        const hasPoints = data.some((m: any) => typeof m.points === 'number');
        if (!hasPoints) {
          issues.push('No scoring data found in matchups - games may not have started');
        }
      }
      break;

    case 'rosters':
      if (!Array.isArray(data)) {
        issues.push('Rosters should be an array');
      } else if (data.length === 0) {
        issues.push('No roster data found');
      }
      break;
  }

  const isValid = issues.length === 0;
  const severity = issues.some(i => i.includes('No data received') || i.includes('missing')) ? 'error' : 'warning';

  return {
    isValid,
    issues,
    severity,
    humanMessage: isValid ? 
      `Sleeper ${type} data looks good!` :
      `Sleeper ${type} issue: ${issues[0]}. ${severity === 'error' ? 'This needs immediate attention.' : 'This might be normal depending on timing.'}`
  };
}

/**
 * Checks if data is fresh enough for live games
 */
export function checkDataFreshness(lastUpdated: string | null): 'fresh' | 'stale' | 'very_stale' | 'unknown' {
  if (!lastUpdated) return 'unknown';
  
  const now = Date.now();
  const updated = new Date(lastUpdated).getTime();
  const ageMinutes = (now - updated) / (1000 * 60);
  
  if (ageMinutes < 2) return 'fresh';
  if (ageMinutes < 10) return 'stale';
  return 'very_stale';
}

/**
 * Human-readable freshness messages
 */
export function getFreshnessMessage(freshness: string): string {
  switch (freshness) {
    case 'fresh': return 'Data is current (updated within 2 minutes)';
    case 'stale': return 'Data is getting old (2-10 minutes) - refresh recommended during live games';
    case 'very_stale': return 'Data is very old (10+ minutes) - immediate refresh needed for live games';
    case 'unknown': return 'Last update time unknown';
    default: return 'Data freshness unclear';
  }
}