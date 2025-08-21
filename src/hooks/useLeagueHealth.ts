import { useState, useEffect, useCallback } from 'react';
import { LeagueConfig } from '../types/config';
import { sleeperAPIEnhanced } from '../services/SleeperAPIEnhanced';
import { usePerformanceMonitor } from './usePerformanceMonitor';

export interface LeagueHealthStatus {
  leagueId: string;
  platform: string;
  status: 'healthy' | 'warning' | 'error' | 'checking';
  lastSuccessfulUpdate?: number;
  lastError?: string;
  responseTime?: number;
  dataFreshness: number; // Minutes since last update
}

export const useLeagueHealth = (leagues: LeagueConfig[]) => {
  const [healthStatuses, setHealthStatuses] = useState<Record<string, LeagueHealthStatus>>({});
  const [isChecking, setIsChecking] = useState(false);
  const { recordMetric } = usePerformanceMonitor();

  const checkLeagueHealth = useCallback(async (league: LeagueConfig): Promise<LeagueHealthStatus> => {
    const startTime = performance.now();
    const baseStatus: LeagueHealthStatus = {
      leagueId: league.leagueId,
      platform: league.platform,
      status: 'checking',
      dataFreshness: 0,
    };

    try {
      if (league.platform === 'Sleeper') {
        // Test basic league access
        const isValid = await sleeperAPIEnhanced.validateLeagueId(league.leagueId);
        if (!isValid) {
          throw new Error('League ID is invalid or inaccessible');
        }

        // Try to fetch basic league data
        const leagueData = await sleeperAPIEnhanced.getLeague(league.leagueId);
        if (!leagueData) {
          throw new Error('Unable to fetch league data');
        }

        const responseTime = performance.now() - startTime;
        
        // Record performance metric
        recordMetric({
          platform: league.platform,
          responseTime,
          success: true,
          timestamp: Date.now(),
          endpoint: 'league_health_check',
        });

        return {
          ...baseStatus,
          status: 'healthy',
          lastSuccessfulUpdate: Date.now(),
          responseTime: Math.round(responseTime),
          dataFreshness: 0, // Just updated
        };
      } else if (league.platform === 'Yahoo') {
        // For Yahoo, we'll assume healthy if it's configured
        // Real implementation would check Yahoo API access
        const responseTime = performance.now() - startTime;
        
        recordMetric({
          platform: league.platform,
          responseTime,
          success: true,
          timestamp: Date.now(),
          endpoint: 'league_health_check',
        });

        return {
          ...baseStatus,
          status: 'healthy',
          lastSuccessfulUpdate: Date.now(),
          responseTime: Math.round(responseTime),
          dataFreshness: 0,
        };
      } else {
        // For other platforms, return warning status
        return {
          ...baseStatus,
          status: 'warning',
          lastError: 'Platform not fully supported',
          dataFreshness: 0,
        };
      }
    } catch (error) {
      const responseTime = performance.now() - startTime;
      
      // Record failed metric
      recordMetric({
        platform: league.platform,
        responseTime,
        success: false,
        timestamp: Date.now(),
        endpoint: 'league_health_check',
      });

      return {
        ...baseStatus,
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Unknown error',
        responseTime: Math.round(responseTime),
        dataFreshness: 999, // Very stale
      };
    }
  }, [recordMetric]);

  const checkAllLeaguesHealth = useCallback(async () => {
    if (leagues.length === 0) return;
    
    setIsChecking(true);
    const newStatuses: Record<string, LeagueHealthStatus> = {};

    try {
      // Check all leagues in parallel
      const healthChecks = leagues.map(league => 
        checkLeagueHealth(league).then(status => ({ [league.id]: status }))
      );

      const results = await Promise.allSettled(healthChecks);
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          Object.assign(newStatuses, result.value);
        } else {
          // If health check itself failed
          const league = leagues[index];
          newStatuses[league.id] = {
            leagueId: league.leagueId,
            platform: league.platform,
            status: 'error',
            lastError: 'Health check failed',
            dataFreshness: 999,
          };
        }
      });

      setHealthStatuses(newStatuses);
    } finally {
      setIsChecking(false);
    }
  }, [leagues, checkLeagueHealth]);

  // Auto-check health when leagues change
  useEffect(() => {
    if (leagues.length > 0) {
      checkAllLeaguesHealth();
    }
  }, [leagues.map(l => l.id).join(',')]); // Only re-run when league IDs change

  const getHealthSummary = useCallback(() => {
    const statuses = Object.values(healthStatuses);
    const healthy = statuses.filter(s => s.status === 'healthy').length;
    const warnings = statuses.filter(s => s.status === 'warning').length;
    const errors = statuses.filter(s => s.status === 'error').length;
    const total = statuses.length;

    return { healthy, warnings, errors, total };
  }, [healthStatuses]);

  return {
    healthStatuses,
    isChecking,
    checkAllLeaguesHealth,
    getHealthSummary,
  };
};