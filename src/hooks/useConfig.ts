import { useState, useEffect } from 'react';
import { DashboardConfig, DEFAULT_CONFIG } from '../types/config';

const CONFIG_KEY = 'fantasy_dashboard_config';
const INIT_KEY = 'fantasy_dashboard_config_init';

export const useConfig = () => {
  const [config, setConfig] = useState<DashboardConfig>(() => {
    // Initialize with stored config if available, otherwise use default
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (error) {
      console.error('Failed to load config during initialization:', error);
    }
    return DEFAULT_CONFIG;
  });

  // Only run effect once, and only if not already initialized
  useEffect(() => {
    const isInitialized = localStorage.getItem(INIT_KEY);
    
    if (!isInitialized) {
      localStorage.setItem(INIT_KEY, 'true');
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
      localStorage.removeItem(INIT_KEY);
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