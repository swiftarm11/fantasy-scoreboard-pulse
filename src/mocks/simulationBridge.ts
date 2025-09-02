/**
 * SimulationBridge: Coordinates state between SimulationManager, MSW handlers, and React hooks
 * This solves the core issue where UI controls don't communicate with data serving
 */

export interface SimulationState {
  currentSnapshot: number;
  isPlaying: boolean;
  speed: number;
  maxSnapshots: number;
  isSimulationMode: boolean;
}

export interface SimulationEventData {
  type: 'INDEX_CHANGE' | 'PLAY_STATE_CHANGE' | 'SPEED_CHANGE' | 'MODE_CHANGE';
  payload: {
    currentSnapshot?: number;
    isPlaying?: boolean;
    speed?: number;
    isSimulationMode?: boolean;
    timestamp?: string;
  };
}

type SimulationListener = (event: SimulationEventData) => void;

class SimulationBridge {
  private state: SimulationState = {
    currentSnapshot: 0,
    isPlaying: false,
    speed: 1.0,
    maxSnapshots: 25,
    isSimulationMode: false,
  };

  private listeners: Set<SimulationListener> = new Set();
  private isInitialized = false;

  constructor() {
    // Check if simulation mode should be enabled
    this.state.isSimulationMode = this.checkSimulationMode();
    
    // Expose to global window for debugging
    if (typeof window !== 'undefined') {
      (window as any).simulationBridge = this;
    }

    console.log('[SimulationBridge] Initialized', {
      simulationMode: this.state.isSimulationMode,
      currentSnapshot: this.state.currentSnapshot
    });
    
    this.isInitialized = true;
  }

  private checkSimulationMode(): boolean {
    // Check URL parameter first
    const urlParams = new URLSearchParams(window.location.search);
    const urlParam = urlParams.get('simulation');
    if (urlParam === 'true') return true;
    if (urlParam === 'false') return false;

    // Check environment variable
    const envVar = import.meta.env.VITE_YAHOO_SIMULATION;
    return envVar === 'true';
  }

  // State getters
  getState(): SimulationState {
    return { ...this.state };
  }

  getCurrentSnapshot(): number {
    return this.state.currentSnapshot;
  }

  isInSimulationMode(): boolean {
    return this.state.isSimulationMode;
  }

  // State setters with event emission
  setCurrentSnapshot(index: number): boolean {
    const clampedIndex = Math.max(0, Math.min(index, this.state.maxSnapshots - 1));
    
    if (clampedIndex !== this.state.currentSnapshot) {
      const oldIndex = this.state.currentSnapshot;
      this.state.currentSnapshot = clampedIndex;
      
      console.log(`[SimulationBridge] Snapshot changed: ${oldIndex} → ${clampedIndex}`);
      
      this.emit({
        type: 'INDEX_CHANGE',
        payload: {
          currentSnapshot: clampedIndex,
          timestamp: new Date().toISOString(),
        },
      });
      
      return true;
    }
    
    return false;
  }

  setPlayState(isPlaying: boolean): void {
    if (isPlaying !== this.state.isPlaying) {
      this.state.isPlaying = isPlaying;
      
      console.log(`[SimulationBridge] Play state changed: ${isPlaying ? 'PLAYING' : 'PAUSED'}`);
      
      this.emit({
        type: 'PLAY_STATE_CHANGE',
        payload: {
          isPlaying,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  setSpeed(speed: number): void {
    const clampedSpeed = Math.max(0.1, Math.min(speed, 10.0));
    
    if (clampedSpeed !== this.state.speed) {
      this.state.speed = clampedSpeed;
      
      console.log(`[SimulationBridge] Speed changed: ${clampedSpeed}x`);
      
      this.emit({
        type: 'SPEED_CHANGE',
        payload: {
          speed: clampedSpeed,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  setSimulationMode(enabled: boolean): void {
    if (enabled !== this.state.isSimulationMode) {
      this.state.isSimulationMode = enabled;
      
      console.log(`[SimulationBridge] Simulation mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
      
      this.emit({
        type: 'MODE_CHANGE',
        payload: {
          isSimulationMode: enabled,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  // Event system
  subscribe(listener: SimulationListener): () => void {
    this.listeners.add(listener);
    
    // Send current state to new subscriber
    if (this.isInitialized) {
      listener({
        type: 'MODE_CHANGE',
        payload: {
          isSimulationMode: this.state.isSimulationMode,
          currentSnapshot: this.state.currentSnapshot,
          isPlaying: this.state.isPlaying,
          speed: this.state.speed,
          timestamp: new Date().toISOString(),
        },
      });
    }
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: SimulationEventData): void {
    console.log('[SimulationBridge] Emitting event:', event.type, event.payload);
    
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[SimulationBridge] Listener error:', error);
      }
    });
  }

  // Utility methods
  nextSnapshot(): boolean {
    return this.setCurrentSnapshot(this.state.currentSnapshot + 1);
  }

  previousSnapshot(): boolean {
    return this.setCurrentSnapshot(this.state.currentSnapshot - 1);
  }

  reset(): void {
    console.log('[SimulationBridge] Resetting to initial state');
    this.setCurrentSnapshot(0);
    this.setPlayState(false);
    this.setSpeed(1.0);
  }

  // Debug helpers
  debug = {
    getState: () => this.getState(),
    getListenerCount: () => this.listeners.size,
    setSnapshot: (index: number) => this.setCurrentSnapshot(index),
    triggerEvent: (type: SimulationEventData['type'], payload: any) => {
      this.emit({ type, payload });
    },
    logState: () => {
      console.log('[SimulationBridge] Current State:', {
        ...this.state,
        listenerCount: this.listeners.size,
        timestamp: new Date().toISOString(),
      });
    },
  };
}

// Global singleton instance
let globalBridge: SimulationBridge | null = null;

export const getSimulationBridge = (): SimulationBridge => {
  if (!globalBridge) {
    globalBridge = new SimulationBridge();
  }
  return globalBridge;
};

// Helper hook for easy React integration
export const useSimulationBridge = () => {
  return getSimulationBridge();
};

// Export types
export type { SimulationListener };