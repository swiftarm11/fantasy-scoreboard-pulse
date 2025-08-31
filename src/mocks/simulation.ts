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
    maxSnapshots: 30
  };

  private timer: NodeJS.Timeout | null = null;
  private baseInterval = 2000; // 2 seconds base interval
  private callbacks: SimulationCallbacks = {};

  constructor(callbacks?: SimulationCallbacks) {
    this.callbacks = callbacks || {};
    
    // Expose to global window for debugging
    if (typeof window !== 'undefined') {
      (window as any).simulationManager = this;
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

  // Core playback controls
  play(): void {
    if (this.state.isPlaying) return;
    
    this.state.isPlaying = true;
    this.callbacks.onPlayStateChange?.(true);
    this.startTimer();
  }

  pause(): void {
    if (!this.state.isPlaying) return;
    
    this.state.isPlaying = false;
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
    this.pause();
    this.setIndex(0);
  }

  // Index management
  setIndex(index: number): void {
    const clampedIndex = Math.max(0, Math.min(index, this.state.maxSnapshots));
    
    if (clampedIndex !== this.state.currentIndex) {
      this.state.currentIndex = clampedIndex;
      this.callbacks.onIndexChange?.(clampedIndex);
    }
  }

  next(): void {
    this.setIndex(this.state.currentIndex + 1);
  }

  previous(): void {
    this.setIndex(this.state.currentIndex - 1);
  }

  // Speed controls
  setSpeed(speed: number): void {
    const clampedSpeed = Math.max(0.1, Math.min(speed, 10.0));
    
    if (clampedSpeed !== this.state.speed) {
      this.state.speed = clampedSpeed;
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
    
    this.timer = setInterval(() => {
      if (this.state.currentIndex >= this.state.maxSnapshots) {
        this.pause(); // Auto-pause at end
        return;
      }
      
      this.next();
    }, this.currentInterval);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Utility methods
  reset(): void {
    this.stop();
    this.setSpeed(1.0);
  }

  getState(): SimulationState {
    return { ...this.state };
  }

  // Cleanup
  destroy(): void {
    this.stopTimer();
    
    if (typeof window !== 'undefined') {
      delete (window as any).simulationManager;
    }
  }

  // Debug helpers (exposed via window)
  debug = {
    getState: () => this.getState(),
    setIndex: (index: number) => this.setIndex(index),
    setSpeed: (speed: number) => this.setSpeed(speed),
    play: () => this.play(),
    pause: () => this.pause(),
    reset: () => this.reset(),
    info: () => {
      console.log('Simulation Manager State:', {
        currentIndex: this.state.currentIndex,
        isPlaying: this.state.isPlaying,
        speed: this.state.speed,
        progress: this.progress,
        interval: this.currentInterval
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