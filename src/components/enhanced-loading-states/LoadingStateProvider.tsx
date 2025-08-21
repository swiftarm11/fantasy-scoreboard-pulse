import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ProgressIndicator, createDataFetchSteps, createOAuthSteps } from '../ui/progress-indicator';
import { EnhancedToast } from '../ui/enhanced-toast';

interface LoadingState {
  id: string;
  type: 'oauth' | 'data-fetch' | 'general';
  platform?: string;
  currentStep?: string;
  progress?: number;
  message?: string;
  isVisible: boolean;
}

interface LoadingStateContextType {
  activeLoadings: LoadingState[];
  startLoading: (config: Omit<LoadingState, 'isVisible'>) => string;
  updateLoading: (id: string, updates: Partial<LoadingState>) => void;
  stopLoading: (id: string) => void;
  stopAllLoading: () => void;
}

const LoadingStateContext = createContext<LoadingStateContextType | null>(null);

interface LoadingStateProviderProps {
  children: ReactNode;
}

export const LoadingStateProvider: React.FC<LoadingStateProviderProps> = ({ children }) => {
  const [activeLoadings, setActiveLoadings] = useState<LoadingState[]>([]);

  const startLoading = useCallback((config: Omit<LoadingState, 'isVisible'>): string => {
    const id = config.id || `loading-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newLoading: LoadingState = {
      ...config,
      id,
      isVisible: true
    };

    setActiveLoadings(prev => [...prev, newLoading]);
    
    // Show loading toast for user feedback
    if (config.message) {
      EnhancedToast.loading(
        config.message,
        config.type === 'oauth' ? 'Please wait while we authenticate...' : 
        config.type === 'data-fetch' ? `Loading ${config.platform} data...` : undefined
      );
    }

    return id;
  }, []);

  const updateLoading = useCallback((id: string, updates: Partial<LoadingState>) => {
    setActiveLoadings(prev => 
      prev.map(loading => 
        loading.id === id ? { ...loading, ...updates } : loading
      )
    );

    // Update toast message if step changed
    if (updates.currentStep || updates.message) {
      const loading = activeLoadings.find(l => l.id === id);
      if (loading && updates.message) {
        EnhancedToast.info(updates.message);
      }
    }
  }, [activeLoadings]);

  const stopLoading = useCallback((id: string) => {
    setActiveLoadings(prev => prev.filter(loading => loading.id !== id));
  }, []);

  const stopAllLoading = useCallback(() => {
    setActiveLoadings([]);
  }, []);

  const contextValue: LoadingStateContextType = {
    activeLoadings,
    startLoading,
    updateLoading,
    stopLoading,
    stopAllLoading
  };

  return (
    <LoadingStateContext.Provider value={contextValue}>
      {children}
      
      {/* Render active loading states */}
      {activeLoadings.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2">
          {activeLoadings.map(loading => (
            <LoadingStateDisplay key={loading.id} loading={loading} />
          ))}
        </div>
      )}
    </LoadingStateContext.Provider>
  );
};

interface LoadingStateDisplayProps {
  loading: LoadingState;
}

const LoadingStateDisplay: React.FC<LoadingStateDisplayProps> = ({ loading }) => {
  const getSteps = () => {
    switch (loading.type) {
      case 'oauth':
        return createOAuthSteps(loading.currentStep);
      case 'data-fetch':
        return createDataFetchSteps(loading.platform || 'Platform', loading.currentStep);
      default:
        return [];
    }
  };

  if (!loading.isVisible) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border p-4 min-w-[300px] max-w-[400px] animate-slide-in-right">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">
          {loading.platform ? `${loading.platform} Connection` : 'Loading...'}
        </h3>
        {loading.progress !== undefined && (
          <span className="text-sm text-gray-500">
            {Math.round(loading.progress)}%
          </span>
        )}
      </div>
      
      {loading.message && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {loading.message}
        </p>
      )}

      <ProgressIndicator
        steps={getSteps()}
        currentStep={loading.currentStep}
        showProgress={loading.progress !== undefined}
        progressValue={loading.progress}
      />
    </div>
  );
};

export const useLoadingState = () => {
  const context = useContext(LoadingStateContext);
  if (!context) {
    throw new Error('useLoadingState must be used within a LoadingStateProvider');
  }
  return context;
};

// Convenience hooks for common loading scenarios
export const useOAuthLoading = (platform: string) => {
  const { startLoading, updateLoading, stopLoading } = useLoadingState();

  const startOAuth = useCallback(() => {
    const id = startLoading({
      id: `oauth-${platform.toLowerCase()}`,
      type: 'oauth',
      platform,
      currentStep: 'init',
      message: `Connecting to ${platform}...`
    });
    return id;
  }, [platform, startLoading]);

  const updateStep = useCallback((id: string, step: string, message?: string) => {
    updateLoading(id, { currentStep: step, message });
  }, [updateLoading]);

  const completeOAuth = useCallback((id: string) => {
    updateLoading(id, { currentStep: 'complete' });
    setTimeout(() => stopLoading(id), 1000);
    EnhancedToast.authenticationSuccess(platform);
  }, [platform, updateLoading, stopLoading]);

  const failOAuth = useCallback((id: string, error?: string) => {
    stopLoading(id);
    EnhancedToast.authenticationError(platform, error);
  }, [platform, stopLoading]);

  return { startOAuth, updateStep, completeOAuth, failOAuth };
};

export const useDataFetchLoading = (platform: string) => {
  const { startLoading, updateLoading, stopLoading } = useLoadingState();

  const startDataFetch = useCallback(() => {
    const id = startLoading({
      id: `data-fetch-${platform.toLowerCase()}`,
      type: 'data-fetch',
      platform,
      currentStep: 'connect',
      message: `Fetching ${platform} data...`
    });
    return id;
  }, [platform, startLoading]);

  const updateStep = useCallback((id: string, step: string, progress?: number) => {
    const messages = {
      connect: `Connecting to ${platform}...`,
      leagues: 'Loading leagues...',
      matchups: 'Fetching matchup data...',
      complete: 'Data loaded successfully!'
    };

    updateLoading(id, { 
      currentStep: step, 
      progress,
      message: messages[step as keyof typeof messages] 
    });
  }, [platform, updateLoading]);

  const completeDataFetch = useCallback((id: string) => {
    updateLoading(id, { currentStep: 'complete', progress: 100 });
    setTimeout(() => stopLoading(id), 1000);
    EnhancedToast.dataRefreshed(platform);
  }, [platform, updateLoading, stopLoading]);

  return { startDataFetch, updateStep, completeDataFetch };
};