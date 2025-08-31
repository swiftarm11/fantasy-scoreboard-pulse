import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSimulationManager } from '@/hooks/useSimulationManager';

interface SimulationContextType {
  isSimulationMode: boolean;
  currentSnapshot: number;
  isPlaying: boolean;
  progress: number;
  maxSnapshots: number;
  triggerDataRefresh: () => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

interface SimulationProviderProps {
  children: ReactNode;
}

export const SimulationProvider: React.FC<SimulationProviderProps> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Check if simulation mode is enabled
  const isSimulationMode = 
    new URLSearchParams(window.location.search).get('simulation') === 'true' ||
    import.meta.env.VITE_YAHOO_SIMULATION === 'true';

  // Only use simulation manager if in simulation mode
  const simulationManager = useSimulationManager({
    onSnapshotChange: (index) => {
      console.log(`[SimulationContext] Snapshot changed to ${index + 1}`);
      // Trigger data refresh when snapshot changes
      setRefreshTrigger(prev => prev + 1);
    },
    onPlayStateChange: (isPlaying) => {
      console.log(`[SimulationContext] Play state changed to ${isPlaying}`);
    }
  });

  const triggerDataRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Expose refresh trigger via window for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).triggerSimulationRefresh = triggerDataRefresh;
      (window as any).simulationRefreshTrigger = refreshTrigger;
    }
  }, [refreshTrigger]);

  const contextValue: SimulationContextType = {
    isSimulationMode,
    currentSnapshot: isSimulationMode ? simulationManager.currentIndex : 0,
    isPlaying: isSimulationMode ? simulationManager.isPlaying : false,
    progress: isSimulationMode ? simulationManager.progress : 0,
    maxSnapshots: isSimulationMode ? simulationManager.maxSnapshots : 25,
    triggerDataRefresh
  };

  return (
    <SimulationContext.Provider value={contextValue}>
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulationContext = () => {
  const context = useContext(SimulationContext);
  if (context === undefined) {
    throw new Error('useSimulationContext must be used within a SimulationProvider');
  }
  return context;
};

// Hook for components that need to react to simulation data changes
export const useSimulationRefresh = () => {
  const { triggerDataRefresh } = useSimulationContext();
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 100); // Check for changes every 100ms when simulation is active

    return () => clearInterval(interval);
  }, []);

  return {
    refreshKey,
    triggerRefresh: triggerDataRefresh
  };
};