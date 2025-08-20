import { useEffect, useRef, useCallback } from 'react';
import { PollingConfig, GAME_HOURS } from '../types/config';

interface UsePollingOptions {
  callback: () => Promise<void> | void;
  config: PollingConfig;
  enabled?: boolean;
}

export const usePolling = ({ callback, config, enabled = true }: UsePollingOptions) => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(false);

  const isGameHour = useCallback((): boolean => {
    if (!config.gameHourPolling) return false;

    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 1 = Monday
    const hour = now.getHours();

    // Sunday (0) between 1 PM and 11 PM EST
    if (day === 0 && hour >= GAME_HOURS.sunday.start && hour <= GAME_HOURS.sunday.end) {
      return true;
    }

    // Monday (1) between 8 PM and 11 PM EST
    if (day === 1 && hour >= GAME_HOURS.monday.start && hour <= GAME_HOURS.monday.end) {
      return true;
    }

    return false;
  }, [config.gameHourPolling]);

  const getPollingInterval = useCallback((): number => {
    if (!config.smartPolling) {
      return config.updateFrequency * 1000;
    }

    // During game hours, use faster polling
    if (isGameHour()) {
      return Math.min(config.updateFrequency, 15) * 1000; // Max 15 seconds during games
    }

    return config.updateFrequency * 1000;
  }, [config.smartPolling, config.updateFrequency, isGameHour]);

  const executeCallback = useCallback(async () => {
    if (isRunningRef.current) {
      console.log('Polling callback already running, skipping...');
      return;
    }

    const now = Date.now();
    const minInterval = getPollingInterval();
    
    // Debounce rapid calls
    if (now - lastCallRef.current < minInterval / 2) {
      console.log('Debouncing polling call');
      return;
    }

    isRunningRef.current = true;
    lastCallRef.current = now;

    try {
      await callback();
    } catch (error) {
      console.error('Polling callback error:', error);
    } finally {
      isRunningRef.current = false;
    }
  }, [callback, getPollingInterval]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const interval = getPollingInterval();
    console.log(`Starting polling with ${interval}ms interval`);

    intervalRef.current = setInterval(() => {
      executeCallback();
    }, interval);

    // Execute immediately on start
    executeCallback();
  }, [executeCallback, getPollingInterval]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    console.log('Stopped polling');
  }, []);

  // Start/stop polling based on enabled flag and config changes
  useEffect(() => {
    if (enabled) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, startPolling, stopPolling]);

  // Restart polling when config changes
  useEffect(() => {
    if (enabled && intervalRef.current) {
      startPolling();
    }
  }, [config.updateFrequency, config.smartPolling, config.gameHourPolling, enabled, startPolling]);

  return {
    startPolling,
    stopPolling,
    isPolling: intervalRef.current !== null,
  };
};