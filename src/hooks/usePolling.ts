import { useEffect, useRef, useCallback } from 'react';
import { AdvancedPollingConfig, GAME_HOURS } from '../types/config';

interface UsePollingOptions {
  callback: () => Promise<void> | void;
  config: AdvancedPollingConfig;
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

  // Enhanced debounced callback with better concurrency protection
  const debouncedCallback = useCallback(() => {
    const now = Date.now();
    
    // Prevent concurrent execution
    if (isRunningRef.current) {
      console.info('Polling callback already running, skipping...');
      return;
    }

    // Enhanced debounce with minimum 5 second gap between calls
    if (now - lastCallRef.current < 5000) {
      console.info('Debouncing polling call - minimum 5 second gap enforced');
      return;
    }

    isRunningRef.current = true;
    lastCallRef.current = now;

    Promise.resolve(callback())
      .catch(error => {
        console.error('Polling callback error:', error);
      })
      .finally(() => {
        isRunningRef.current = false;
      });
  }, [callback]);

  const startPolling = useCallback(() => {
    if (!enabled) return;
    
    // Clear any existing interval to prevent duplicates
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Enhanced game hour polling with specific intervals
    let interval: number;
    
    if (isGameHour() && config.gameHourPolling) {
      const now = new Date();
      const day = now.getDay();
      
      if (day === 0) { // Sunday
        interval = config.gameHourIntervals?.sunday * 1000 || 15000;
      } else if (day === 1) { // Monday  
        interval = config.gameHourIntervals?.monday * 1000 || 15000;
      } else {
        interval = config.updateFrequency * 1000;
      }
    } else {
      interval = config.gameHourIntervals?.normal * 1000 || config.updateFrequency * 1000;
    }

    console.info(`Starting polling with ${interval}ms interval`);

    // Start immediate callback (with debouncing protection)
    debouncedCallback();

    // Set up recurring interval with enhanced protection
    intervalRef.current = setInterval(() => {
      // Additional check to prevent runaway intervals
      if (!enabled || !intervalRef.current) {
        return;
      }
      debouncedCallback();
    }, interval);
  }, [enabled, config, isGameHour, debouncedCallback]);

  const stopPolling = useCallback(() => {
    console.info('Stopped polling');
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // Reset running state when stopping
    isRunningRef.current = false;
  }, []);

  const isPolling = intervalRef.current !== null;

  // Enhanced effect with better cleanup
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

  // Game hour change detection with enhanced logic
  useEffect(() => {
    if (!enabled || !config.gameHourPolling) return;

    const checkGameHour = () => {
      const currentlyGameHour = isGameHour();
      
      // Only restart if we're currently polling and should adjust for game hours
      if (intervalRef.current && config.gameHourPolling) {
        let expectedInterval: number;
        
        if (currentlyGameHour) {
          const now = new Date();
          const day = now.getDay();
          
          if (day === 0) { // Sunday
            expectedInterval = config.gameHourIntervals?.sunday * 1000 || 15000;
          } else if (day === 1) { // Monday
            expectedInterval = config.gameHourIntervals?.monday * 1000 || 15000;
          } else {
            expectedInterval = config.updateFrequency * 1000;
          }
        } else {
          expectedInterval = config.gameHourIntervals?.normal * 1000 || config.updateFrequency * 1000;
        }
        
        console.info(`Game hour status changed (isGameHour: ${currentlyGameHour}), restarting polling with ${expectedInterval}ms interval`);
        startPolling();
      }
    };

    // Check every minute for game hour changes
    const gameHourCheckInterval = setInterval(checkGameHour, 60000);

    return () => {
      clearInterval(gameHourCheckInterval);
    };
  }, [enabled, config, isGameHour, startPolling]);

  return {
    startPolling,
    stopPolling,
    isPolling,
  };
};