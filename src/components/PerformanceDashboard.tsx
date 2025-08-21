import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Activity, Clock, CheckCircle, AlertTriangle, XCircle, RefreshCw, Database } from 'lucide-react';
import { usePerformanceMonitor } from '../hooks/usePerformanceMonitor';
import { useLeagueHealth } from '../hooks/useLeagueHealth';
import { useConfig } from '../hooks/useConfig';

interface PerformanceDashboardProps {
  className?: string;
}

export const PerformanceDashboard = ({ className }: PerformanceDashboardProps) => {
  const { config } = useConfig();
  const { getAllPlatformStats, getCacheStats, clearMetrics } = usePerformanceMonitor();
  const { healthStatuses, isChecking, checkAllLeaguesHealth, getHealthSummary } = useLeagueHealth(config.leagues);

  const platformStats = getAllPlatformStats();
  const cacheStats = getCacheStats();
  const healthSummary = getHealthSummary();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'healthy': return 'default';
      case 'warning': return 'secondary';
      case 'error': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Health Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5" />
                League Health Status
              </CardTitle>
              <CardDescription>
                Monitor API connectivity and data freshness
              </CardDescription>
            </div>
            <Button
              onClick={checkAllLeaguesHealth}
              disabled={isChecking}
              size="sm"
              variant="outline"
            >
              {isChecking ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{healthSummary.healthy}</div>
              <div className="text-xs text-muted-foreground">Healthy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{healthSummary.warnings}</div>
              <div className="text-xs text-muted-foreground">Warnings</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{healthSummary.errors}</div>
              <div className="text-xs text-muted-foreground">Errors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{healthSummary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
          </div>

          {Object.entries(healthStatuses).length > 0 && (
            <div className="space-y-2">
              {Object.entries(healthStatuses).map(([leagueId, status]) => (
                <div key={leagueId} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(status.status)}
                    <div>
                      <div className="font-medium text-sm">{status.platform} League</div>
                      <div className="text-xs text-muted-foreground">
                        ID: {status.leagueId.slice(0, 8)}...
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {status.responseTime && (
                      <span className="text-xs text-muted-foreground">
                        {status.responseTime}ms
                      </span>
                    )}
                    <Badge variant={getStatusVariant(status.status)}>
                      {status.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Platform Performance
          </CardTitle>
          <CardDescription>
            Response times and success rates by platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(platformStats).length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              No performance data yet. Data will appear after API calls are made.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(platformStats).map(([platform, stats]) => (
                <div key={platform} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">{platform}</h4>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{stats.averageResponseTime}ms avg</span>
                      <span>{stats.totalRequests} requests</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Success Rate</span>
                      <span>{stats.successRate.toFixed(1)}%</span>
                    </div>
                    <Progress value={stats.successRate} className="h-2" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cache Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Cache Performance
          </CardTitle>
          <CardDescription>
            Data caching efficiency and freshness metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Hit Rate</span>
                <span>{cacheStats.hitRate}%</span>
              </div>
              <Progress value={cacheStats.hitRate} className="h-2" />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Cache Stats</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Hits: {cacheStats.totalHits}</div>
                <div>Misses: {cacheStats.totalMisses}</div>
                <div>Entries: {cacheStats.size}</div>
                <div>Avg Age: {cacheStats.freshness.toFixed(1)}m</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance Actions</CardTitle>
          <CardDescription>
            Manage performance monitoring and data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={clearMetrics} variant="outline" size="sm">
              Clear Metrics
            </Button>
            <Button onClick={checkAllLeaguesHealth} disabled={isChecking} variant="outline" size="sm">
              Refresh Health
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};