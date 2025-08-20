import { useState, useEffect } from 'react';
import { DashboardConfig, DEFAULT_CONFIG } from '../types/config';

const CONFIG_KEY = 'fantasy_dashboard_config';

export const useConfig = () => {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(CONFIG_KEY);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      }
    } catch (error) {
      console.error('Failed to load config from localStorage:', error);
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