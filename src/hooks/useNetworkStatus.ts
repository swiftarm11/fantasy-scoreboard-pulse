import { useState, useEffect, useCallback } from 'react';
import { connectionStatus } from '../utils/errorHandling';

interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  reconnectAttempts: number;
  lastConnected: Date | null;
}

export const useNetworkStatus = () => {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: connectionStatus.getStatus(),
    isSlowConnection: false,
    reconnectAttempts: 0,
    lastConnected: connectionStatus.getStatus() ? new Date() : null,
  });

  const [reconnectTimer, setReconnectTimer] = useState<NodeJS.Timeout | null>(null);

  const testConnectionSpeed = useCallback(async () => {
    if (!navigator.onLine) return false;
    
    try {
      const start = performance.now();
      await fetch('/favicon.ico', { 
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });
      const duration = performance.now() - start;
      return duration < 2000; // Consider slow if takes more than 2 seconds
    } catch {
      return false;
    }
  }, []);

  const attemptReconnection = useCallback(async () => {
    if (!navigator.onLine) return;

    const isSlowConnection = !(await testConnectionSpeed());
    
    setStatus(prev => ({
      ...prev,
      isSlowConnection,
      reconnectAttempts: prev.reconnectAttempts + 1,
      lastConnected: navigator.onLine ? new Date() : prev.lastConnected,
    }));
  }, [testConnectionSpeed]);

  useEffect(() => {
    const unsubscribe = connectionStatus.subscribe((online) => {
      setStatus(prev => ({
        ...prev,
        isOnline: online,
        lastConnected: online ? new Date() : prev.lastConnected,
        reconnectAttempts: online ? 0 : prev.reconnectAttempts,
      }));

      // Clear any existing reconnect timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        setReconnectTimer(null);
      }

      // If offline, start attempting reconnection
      if (!online) {
        const timer = setInterval(() => {
          attemptReconnection();
        }, 5000);
        setReconnectTimer(timer);
      }
    });

    // Test initial connection speed
    testConnectionSpeed().then(isFast => {
      setStatus(prev => ({ ...prev, isSlowConnection: !isFast }));
    });

    return () => {
      unsubscribe();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [attemptReconnection, testConnectionSpeed]); // Remove reconnectTimer dependency

  const resetReconnectAttempts = useCallback(() => {
    setStatus(prev => ({ ...prev, reconnectAttempts: 0 }));
  }, []);

  return {
    ...status,
    resetReconnectAttempts,
  };
};