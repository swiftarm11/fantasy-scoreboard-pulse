import { useState, useEffect, useRef } from 'react';
import { DashboardConfig, DEFAULT_CONFIG } from '../types/config';

const CONFIG_KEY = 'fantasy_dashboard_config';

export const useConfig = () => {
  console.log('🔥 useConfig: Hook called');
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const hasInitializedRef = useRef(false);

  // Load config from localStorage on mount only once
  useEffect(() => {
    console.log('🔥 useConfig: useEffect called');
    if (!hasInitializedRef.current) {
      try {
        const savedConfig = localStorage.getItem(CONFIG_KEY);
        if (savedConfig) {
          const parsed = JSON.parse(savedConfig);
          const newConfig = { ...DEFAULT_CONFIG, ...parsed };
          console.log('🔥 useConfig: Setting config from localStorage', newConfig);
          setConfig(newConfig);
        } else {
          console.log('🔥 useConfig: No saved config, using default');
        }
        hasInitializedRef.current = true;
      } catch (error) {
        console.error('Failed to load config from localStorage:', error);
        hasInitializedRef.current = true;
      }
    }
  }, []);

  // Save config to localStorage
  const updateConfig = (newConfig: DashboardConfig) => {
    try {
      const configToSave = { ...newConfig, version: DEFAULT_CONFIG.version };
      localStorage.setItem(CONFIG_KEY, JSON.stringify(configToSave));
      setConfig(configToSave);
    } catch (error) {
      console.error('Failed to save config to localStorage:', error);
    }
  };

  // Clear config
  const clearConfig = () => {
    try {
      localStorage.removeItem(CONFIG_KEY);
      setConfig(DEFAULT_CONFIG);
    } catch (error) {
      console.error('Failed to clear config:', error);
    }
  };

  return {
    config,
    updateConfig,
    clearConfig,
  };
};