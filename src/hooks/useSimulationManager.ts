// src/hooks/useSimulationManager.ts
import { useState, useEffect } from 'react';

export interface SimulationConfig {
  enabled: boolean;
  currentWeek: number;
  availableWeeks: number[];
}

interface UseSimulationManagerOptions {
  onSnapshotChange?: (index: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export const useSimulationManager = (options?: UseSimulationManagerOptions) => {
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    enabled: false,
    currentWeek: 1,
    availableWeeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const maxSnapshots = 25;

  const fetchSimulationStatus = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // First try to fetch from local public directory
      const response = await fetch('/testdata/simulation-config.json');
      
      if (!response.ok) {
        // If local file doesn't exist, use environment variable
        const envSimulation = import.meta.env.VITE_YAHOO_SIMULATION === 'true';
        setSimulationConfig(prev => ({ ...prev, enabled: envSimulation }));
        console.log('Using environment simulation setting:', envSimulation);
        return;
      }

      const config = await response.json();
      setSimulationConfig(config);
      console.log('Simulation config loaded:', config);
      
    } catch (err) {
      console.error('Failed to fetch simulation status:', err);
      // Fallback to environment variable
      const envSimulation = import.meta.env.VITE_YAHOO_SIMULATION === 'true';
      setSimulationConfig(prev => ({ ...prev, enabled: envSimulation }));
      setError('Using fallback simulation config');
    } finally {
      setLoading(false);
    }
  };

  const toggleSimulation = () => {
    setSimulationConfig(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const setCurrentWeek = (week: number) => {
    setSimulationConfig(prev => ({ ...prev, currentWeek: week }));
  };

  useEffect(() => {
    fetchSimulationStatus();
  }, []);

  const play = () => {
    setIsPlaying(true);
    options?.onPlayStateChange?.(true);
  };

  const pause = () => {
    setIsPlaying(false);
    options?.onPlayStateChange?.(false);
  };

  const stop = () => {
    setIsPlaying(false);
    setCurrentIndex(0);
    options?.onPlayStateChange?.(false);
    options?.onSnapshotChange?.(0);
  };

  const next = () => {
    if (currentIndex < maxSnapshots - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      options?.onSnapshotChange?.(newIndex);
    }
  };

  const previous = () => {
    if (currentIndex > 0) {
      const newIndex = currentIndex - 1;
      setCurrentIndex(newIndex);
      options?.onSnapshotChange?.(newIndex);
    }
  };

  const setIndex = (index: number) => {
    if (index >= 0 && index < maxSnapshots) {
      setCurrentIndex(index);
      options?.onSnapshotChange?.(index);
    }
  };

  const reset = () => {
    setCurrentIndex(0);
    setIsPlaying(false);
    options?.onSnapshotChange?.(0);
    options?.onPlayStateChange?.(false);
  };

  const progress = (currentIndex / (maxSnapshots - 1)) * 100;
  const isAtStart = currentIndex === 0;
  const isAtEnd = currentIndex === maxSnapshots - 1;
  const canPlay = !isPlaying && !isAtEnd;
  const canPause = isPlaying;

  return {
    simulationConfig,
    loading,
    error,
    toggleSimulation,
    setCurrentWeek,
    refetch: fetchSimulationStatus,
    currentIndex,
    isPlaying,
    speed,
    maxSnapshots,
    progress,
    play,
    pause,
    stop,
    setIndex,
    next,
    previous,
    setSpeed,
    reset,
    isAtEnd,
    isAtStart,
    canPlay,
    canPause
  };
};
