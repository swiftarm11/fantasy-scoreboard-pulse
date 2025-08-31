import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useSimulationManager } from '@/hooks/useSimulationManager';
import { debugLogger } from '@/utils/debugLogger';

interface SimulationContextType {
  isSimulationMode: boolean;
  currentSnapshot: number;
  isPlaying: boolean;
  progress: number;
  maxSnapshots: number;
  triggerDataRefresh: () => void;
  setSimulationMode: (enabled: boolean) => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

interface SimulationProviderProps {
  children: ReactNode;
}

export const SimulationProvider: React.FC<SimulationProviderProps> = ({ children }) => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [localSimulationMode, setLocalSimulationMode] = useState(() => {
    return localStorage.getItem('simulation-mode') === 'true';
  });
  
  // Check if simulation mode is enabled
  const isSimulationMode = 
    localSimulationMode ||
    new URLSearchParams(window.location.search).get('simulation') === 'true' ||
    import.meta.env.VITE_YAHOO_SIMULATION === 'true';

  const setSimulationMode = useCallback((enabled: boolean) => {
    debugLogger.info('SIMULATION', `Simulation mode ${enabled ? 'enabled' : 'disabled'}`, { enabled });
    setLocalSimulationMode(enabled);
    localStorage.setItem('simulation-mode', enabled.toString());
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Only use simulation manager if in simulation mode
  const simulationManager = useSimulationManager({
    onSnapshotChange: useCallback((index) => {
      debugLogger.info('SIMULATION', `Snapshot changed to ${index + 1}`, { index, timestamp: Date.now() });
      // Trigger data refresh when snapshot changes
      setRefreshTrigger(prev => prev + 1);
    }, []),
    onPlayStateChange: useCallback((isPlaying) => {
      debugLogger.info('SIMULATION', `Play state changed to ${isPlaying}`, { isPlaying, timestamp: Date.now() });
    }, [])
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
    triggerDataRefresh,
    setSimulationMode
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