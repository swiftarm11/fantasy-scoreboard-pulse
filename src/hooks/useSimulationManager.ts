import { useState, useEffect, useCallback, useRef } from 'react';
import { SimulationManager, createSimulationManager } from '@/mocks/simulation';
import { useToast } from '@/hooks/use-toast';

interface UseSimulationManagerOptions {
  autoStart?: boolean;
  onSnapshotChange?: (index: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export const useSimulationManager = (options: UseSimulationManagerOptions = {}) => {
  const { autoStart = false, onSnapshotChange, onPlayStateChange } = options;
  const { toast } = useToast();
  
  const [simulationManager, setSimulationManager] = useState<SimulationManager | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [maxSnapshots, setMaxSnapshots] = useState(25);
  
  const managerRef = useRef<SimulationManager | null>(null);

  // Initialize simulation manager
  useEffect(() => {
    const manager = createSimulationManager({
      onIndexChange: (index) => {
        setCurrentIndex(index);
        onSnapshotChange?.(index);
        
        // Trigger a data refresh by updating simulation config
        if (window.navigator.vibrate) {
          window.navigator.vibrate(50); // Haptic feedback if available
        }
      },
      onPlayStateChange: (playing) => {
        setIsPlaying(playing);
        onPlayStateChange?.(playing);
      },
      onSpeedChange: (newSpeed) => {
        setSpeed(newSpeed);
      }
    });

    setSimulationManager(manager);
    managerRef.current = manager;
    setMaxSnapshots(manager.maxSnapshots);

    if (autoStart) {
      setTimeout(() => manager.play(), 1000);
    }

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [autoStart]); // Remove callbacks from deps to prevent infinite loops

  // Control functions
  const play = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.play();
      toast({
        title: "Simulation Started",
        description: "Fantasy scores are now updating live",
      });
    }
  }, [toast]);

  const pause = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.pause();
      toast({
        title: "Simulation Paused",
        description: "Score updates have been paused",
      });
    }
  }, [toast]);

  const stop = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.stop();
      toast({
        title: "Simulation Stopped",
        description: "Reset to beginning of game simulation",
      });
    }
  }, [toast]);

  const setIndex = useCallback((index: number) => {
    if (managerRef.current) {
      managerRef.current.setIndex(index);
      toast({
        title: "Jumped to Snapshot",
        description: `Now viewing snapshot ${index + 1} of ${maxSnapshots}`,
      });
    }
  }, [maxSnapshots, toast]);

  const next = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.next();
    }
  }, []);

  const previous = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.previous();
    }
  }, []);

  const setPlaybackSpeed = useCallback((newSpeed: number) => {
    if (managerRef.current) {
      managerRef.current.setSpeed(newSpeed);
      toast({
        title: "Speed Changed",
        description: `Playback speed set to ${newSpeed}x`,
      });
    }
  }, [toast]);

  const reset = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.reset();
      toast({
        title: "Simulation Reset",
        description: "All settings restored to defaults",
      });
    }
  }, [toast]);

  // Progress calculation
  const progress = (currentIndex / maxSnapshots) * 100;

  return {
    // State
    simulationManager,
    currentIndex,
    isPlaying,
    speed,
    maxSnapshots,
    progress,
    
    // Controls
    play,
    pause,
    stop,
    setIndex,
    next,
    previous,
    setSpeed: setPlaybackSpeed,
    reset,
    
    // Utilities
    isAtEnd: currentIndex >= maxSnapshots,
    isAtStart: currentIndex === 0,
    canPlay: !isPlaying && currentIndex < maxSnapshots,
    canPause: isPlaying,
  };
};