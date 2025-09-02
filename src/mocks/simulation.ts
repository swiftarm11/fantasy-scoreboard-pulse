import { getSimulationBridge, type SimulationEventData } from './simulationBridge';

export interface SimulationState {
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  maxSnapshots: number;
}

export interface SimulationCallbacks {
  onIndexChange?: (index: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onSpeedChange?: (speed: number) => void;
}

export class SimulationManager {
  private state: SimulationState = {
    currentIndex: 0,
    isPlaying: false,
    speed: 1.0,
    maxSnapshots: 25
  };

  private timer: NodeJS.Timeout | null = null;
  private baseInterval = 2000; // 2 seconds base interval
  private callbacks: SimulationCallbacks = {};
  private bridge = getSimulationBridge();

  constructor(callbacks?: SimulationCallbacks) {
    this.callbacks = callbacks || {};
    
    // Subscribe to bridge events to stay in sync
    this.bridge.subscribe(this.handleBridgeEvent.bind(this));
    
    // Initialize from bridge state
    const bridgeState = this.bridge.getState();
    this.state.currentIndex = bridgeState.currentSnapshot;
    this.state.isPlaying = bridgeState.isPlaying;
    this.state.speed = bridgeState.speed;
    this.state.maxSnapshots = bridgeState.maxSnapshots;
    
    // Expose to global window for debugging
    if (typeof window !== 'undefined') {
      (window as any).simulationManager = this;
    }

    console.log('[SimulationManager] Initialized with bridge integration', {
      currentIndex: this.state.currentIndex,
      bridgeSnapshot: bridgeState.currentSnapshot,
      simulationMode: bridgeState.isSimulationMode
    });
  }

  private handleBridgeEvent(event: SimulationEventData): void {
    console.log('[SimulationManager] Bridge event received:', event.type, event.payload);
    
    // Update local state from bridge events (avoids loops since we initiated most of them)
    switch (event.type) {
      case 'INDEX_CHANGE':
        if (event.payload.currentSnapshot !== undefined) {
          this.state.currentIndex = event.payload.currentSnapshot;
        }
        break;
      case 'PLAY_STATE_CHANGE':
        if (event.payload.isPlaying !== undefined) {
          this.state.isPlaying = event.payload.isPlaying;
        }
        break;
      case 'SPEED_CHANGE':
        if (event.payload.speed !== undefined) {
          this.state.speed = event.payload.speed;
        }
        break;
    }
  }

  // Getters
  get currentIndex(): number {
    return this.state.currentIndex;
  }

  get isPlaying(): boolean {
    return this.state.isPlaying;
  }

  get speed(): number {
    return this.state.speed;
  }

  get maxSnapshots(): number {
    return this.state.maxSnapshots;
  }

  get progress(): number {
    return (this.state.currentIndex / this.state.maxSnapshots) * 100;
  }

  get currentInterval(): number {
    return this.baseInterval / this.state.speed;
  }

  // Core playback controls - now updates bridge
  play(): void {
    if (this.state.isPlaying) return;
    
    console.log('[SimulationManager] Starting playback');
    
    this.state.isPlaying = true;
    this.bridge.setPlayState(true);
    this.callbacks.onPlayStateChange?.(true);
    this.startTimer();
  }

  pause(): void {
    if (!this.state.isPlaying) return;
    
    console.log('[SimulationManager] Pausing playback');
    
    this.state.isPlaying = false;
    this.bridge.setPlayState(false);
    this.callbacks.onPlayStateChange?.(false);
    this.stopTimer();
  }

  toggle(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  stop(): void {
    console.log('[SimulationManager] Stopping playback');
    this.pause();
    this.setIndex(0);
  }

  // Index management - now updates bridge
  setIndex(index: number): void {
    const clampedIndex = Math.max(0, Math.min(index, this.state.maxSnapshots - 1));
    
    if (clampedIndex !== this.state.currentIndex) {
      const oldIndex = this.state.currentIndex;
      
      console.log(`[SimulationManager] Index change: ${oldIndex} → ${clampedIndex}`);
      
      this.state.currentIndex = clampedIndex;
      
      // Update bridge (this will trigger MSW handlers to serve new snapshot)
      this.bridge.setCurrentSnapshot(clampedIndex);
      
      // Notify local callbacks
      this.callbacks.onIndexChange?.(clampedIndex);
    }
  }

  next(): void {
    console.log('[SimulationManager] Advancing to next snapshot');
    this.setIndex(this.state.currentIndex + 1);
  }

  previous(): void {
    console.log('[SimulationManager] Going to previous snapshot');
    this.setIndex(this.state.currentIndex - 1);
  }

  // Speed controls - now updates bridge
  setSpeed(speed: number): void {
    const clampedSpeed = Math.max(0.1, Math.min(speed, 10.0));
    
    if (clampedSpeed !== this.state.speed) {
      console.log(`[SimulationManager] Speed change: ${this.state.speed} → ${clampedSpeed}`);
      
      this.state.speed = clampedSpeed;
      this.bridge.setSpeed(clampedSpeed);
      this.callbacks.onSpeedChange?.(clampedSpeed);
      
      // Restart timer with new speed if playing
      if (this.state.isPlaying) {
        this.stopTimer();
        this.startTimer();
      }
    }
  }

  increaseSpeed(): void {
    const speeds = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0];
    const currentSpeedIndex = speeds.findIndex(s => s >= this.state.speed);
    const nextIndex = Math.min(currentSpeedIndex + 1, speeds.length - 1);
    this.setSpeed(speeds[nextIndex]);
  }

  decreaseSpeed(): void {
    const speeds = [0.25, 0.5, 1.0, 2.0, 5.0, 10.0];
    const currentSpeedIndex = speeds.findIndex(s => s >= this.state.speed);
    const prevIndex = Math.max(currentSpeedIndex - 1, 0);
    this.setSpeed(speeds[prevIndex]);
  }

  // Timer management
  private startTimer(): void {
    this.stopTimer();
    
    console.log(`[SimulationManager] Starting timer with ${this.currentInterval}ms interval (${this.state.speed}x speed)`);
    
    this.timer = setInterval(() => {
      if (this.state.currentIndex >= this.state.maxSnapshots - 1) {
        console.log('[SimulationManager] Reached end of snapshots, pausing');
        this.pause(); // Auto-pause at end
        return;
      }
      
      this.next();
    }, this.currentInterval);
  }

  private stopTimer(): void {
    if (this.timer) {
      console.log('[SimulationManager] Stopping timer');
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Utility methods
  reset(): void {
    console.log('[SimulationManager] Resetting to initial state');
    this.stop();
    this.setSpeed(1.0);
    this.bridge.reset();
  }

  getState(): SimulationState {
    return { ...this.state };
  }

  // Bridge synchronization
  syncWithBridge(): void {
    const bridgeState = this.bridge.getState();
    console.log('[SimulationManager] Syncing with bridge state', bridgeState);
    
    this.state.currentIndex = bridgeState.currentSnapshot;
    this.state.isPlaying = bridgeState.isPlaying;
    this.state.speed = bridgeState.speed;
    this.state.maxSnapshots = bridgeState.maxSnapshots;
    
    // Notify callbacks of sync
    this.callbacks.onIndexChange?.(this.state.currentIndex);
    this.callbacks.onPlayStateChange?.(this.state.isPlaying);
    this.callbacks.onSpeedChange?.(this.state.speed);
  }

  // Cleanup
  destroy(): void {
    console.log('[SimulationManager] Destroying manager');
    this.stopTimer();
    
    if (typeof window !== 'undefined') {
      delete (window as any).simulationManager;
    }
  }

  // Debug helpers (exposed via window)
  debug = {
    getState: () => this.getState(),
    getBridgeState: () => this.bridge.getState(),
    setIndex: (index: number) => this.setIndex(index),
    setSpeed: (speed: number) => this.setSpeed(speed),
    play: () => this.play(),
    pause: () => this.pause(),
    reset: () => this.reset(),
    sync: () => this.syncWithBridge(),
    info: () => {
      console.log('[SimulationManager] Debug Info:', {
        managerState: this.state,
        bridgeState: this.bridge.getState(),
        timerActive: !!this.timer,
        interval: this.currentInterval,
        timestamp: new Date().toISOString()
      });
    }
  };
}

// Global instance for easy debugging
let globalSimulationManager: SimulationManager | null = null;

export const createSimulationManager = (callbacks?: SimulationCallbacks): SimulationManager => {
  if (globalSimulationManager) {
    globalSimulationManager.destroy();
  }
  
  globalSimulationManager = new SimulationManager(callbacks);
  return globalSimulationManager;
};

export const getGlobalSimulationManager = (): SimulationManager | null => {
  return globalSimulationManager;
};
