// src/hooks/useSimulationManager.ts
import { useState, useEffect } from 'react';

export interface SimulationConfig {
  enabled: boolean;
  currentWeek: number;
  availableWeeks: number[];
}

export const useSimulationManager = () => {
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    enabled: false,
    currentWeek: 1,
    availableWeeks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return {
    simulationConfig,
    loading,
    error,
    toggleSimulation,
    setCurrentWeek,
    refetch: fetchSimulationStatus
  };
};
