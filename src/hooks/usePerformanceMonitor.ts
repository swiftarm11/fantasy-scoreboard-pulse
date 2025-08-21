import { useState, useRef, useCallback, useEffect } from 'react';

export interface PerformanceMetrics {
  platform: string;
  responseTime: number;
  success: boolean;
  timestamp: number;
  endpoint?: string;
}

export interface PlatformStats {
  totalRequests: number;
  successfulRequests: number;
  averageResponseTime: number;
  successRate: number;
  lastRequest?: number;
}

export interface CacheStats {
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  size: number;
  freshness: number; // Average age of cache entries in minutes
}

export const usePerformanceMonitor = () => {
  const [metrics, setMetrics] = useState<PerformanceMetrics[]>([]);
  const [isRecording, setIsRecording] = useState(true);
  const metricsRef = useRef<PerformanceMetrics[]>([]);

  const recordMetric = useCallback((metric: PerformanceMetrics) => {
    if (!isRecording) return;

    const newMetric = { ...metric, timestamp: Date.now() };
    metricsRef.current = [...metricsRef.current.slice(-99), newMetric]; // Keep last 100 metrics
    setMetrics(metricsRef.current);
  }, [isRecording]);

  const getPlatformStats = useCallback((platform: string): PlatformStats => {
    const platformMetrics = metricsRef.current.filter(m => m.platform === platform);
    const successfulRequests = platformMetrics.filter(m => m.success).length;
    const averageResponseTime = platformMetrics.length > 0 
      ? platformMetrics.reduce((sum, m) => sum + m.responseTime, 0) / platformMetrics.length 
      : 0;

    return {
      totalRequests: platformMetrics.length,
      successfulRequests,
      averageResponseTime: Math.round(averageResponseTime),
      successRate: platformMetrics.length > 0 ? (successfulRequests / platformMetrics.length) * 100 : 0,
      lastRequest: platformMetrics.length > 0 ? platformMetrics[platformMetrics.length - 1].timestamp : undefined,
    };
  }, []);

  const getAllPlatformStats = useCallback((): Record<string, PlatformStats> => {
    const platforms = [...new Set(metricsRef.current.map(m => m.platform))];
    return platforms.reduce((stats, platform) => {
      stats[platform] = getPlatformStats(platform);
      return stats;
    }, {} as Record<string, PlatformStats>);
  }, [getPlatformStats]);

  const clearMetrics = useCallback(() => {
    metricsRef.current = [];
    setMetrics([]);
  }, []);

  const getCacheStats = useCallback((): CacheStats => {
    // This would be enhanced to get actual cache stats from the API services
    // For now, return mock data that can be replaced with real implementation
    return {
      hitRate: 85,
      totalHits: 340,
      totalMisses: 60,
      size: 45,
      freshness: 3.2,
    };
  }, []);

  // Clean up old metrics periodically
  useEffect(() => {
    const cleanup = setInterval(() => {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      metricsRef.current = metricsRef.current.filter(m => m.timestamp > oneHourAgo);
      setMetrics(metricsRef.current);
    }, 5 * 60 * 1000); // Clean up every 5 minutes

    return () => clearInterval(cleanup);
  }, []);

  return {
    metrics,
    recordMetric,
    getPlatformStats,
    getAllPlatformStats,
    getCacheStats,
    clearMetrics,
    isRecording,
    setIsRecording,
  };
};