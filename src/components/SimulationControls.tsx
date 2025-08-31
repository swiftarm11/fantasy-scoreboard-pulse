import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Activity, Clock, SkipForward, SkipBack, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useSimulationManager } from '@/hooks/useSimulationManager';

interface SimulationStatus {
  enabled: boolean;
  currentSnapshot: number;
  totalSnapshots: number;
  latencyMin: number;
  latencyMax: number;
  simulation: boolean;
  timestamp: string;
}

interface ControlAction {
  action: 'enable' | 'disable' | 'set_snapshot' | 'reset';
  snapshot?: number;
}

export const SimulationControls: React.FC = () => {
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Use the simulation manager hook
  const {
    currentIndex,
    isPlaying,
    speed,
    maxSnapshots,
    progress,
    play,
    pause,
    stop,
    setIndex,
    next,
    previous,
    setSpeed,
    reset,
    isAtEnd,
    isAtStart,
    canPlay,
    canPause
  } = useSimulationManager({
    onSnapshotChange: (index) => {
      // Update MSW handler snapshot
      sendControlAction({ action: 'set_snapshot', snapshot: index });
    }
  });

  // Fetch current simulation status
  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/simulation/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch simulation status:', error);
    }
  }, []);

  // Send control action to simulation API (MSW handler)
  const sendControlAction = useCallback(async (action: ControlAction) => {
    setLoading(true);
    try {
      const response = await fetch('/api/simulation/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(action),
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data.config);
      } else {
        throw new Error('Control action failed');
      }
    } catch (error) {
      console.error('Failed to execute simulation control action:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Speed presets
  const speedOptions = [0.25, 0.5, 1.0, 2.0, 5.0];
  const currentSpeedIndex = speedOptions.findIndex(s => s === speed);

  // Auto-refresh status periodically
  useEffect(() => {
    fetchStatus(); // Initial fetch
    
    const interval = setInterval(fetchStatus, 5000); // Less frequent polling
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Check if simulation should be shown
  const isSimulationMode = status?.enabled || 
    new URLSearchParams(window.location.search).get('simulation') === 'true' ||
    import.meta.env.VITE_YAHOO_SIMULATION === 'true';

  if (!isSimulationMode) {
    return null;
  }

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg border bg-background/95 backdrop-blur-sm z-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          Yahoo Fantasy Simulation
          <Badge variant="secondary" className="ml-auto">
            {currentIndex + 1}/{maxSnapshots}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-secondary rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={previous}
            disabled={loading || isAtStart}
          >
            <SkipBack className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={canPlay ? play : pause}
            disabled={loading}
            className="flex-1"
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Play
              </>
            )}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={next}
            disabled={loading || isAtEnd}
          >
            <SkipForward className="h-4 w-4" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={stop}
            disabled={loading}
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Speed:</span>
          <div className="flex gap-1 flex-1">
            {speedOptions.map((speedOption) => (
              <Button
                key={speedOption}
                variant={speed === speedOption ? "default" : "outline"}
                size="sm"
                onClick={() => setSpeed(speedOption)}
                disabled={loading}
                className="h-7 px-2 text-xs flex-1"
              >
                {speedOption}x
              </Button>
            ))}
          </div>
        </div>

        {/* Snapshot Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Jump to Snapshot</span>
            <Badge variant="outline" className="text-xs">
              Current: {currentIndex + 1}
            </Badge>
          </div>
          
          <ScrollArea className="h-20">
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: maxSnapshots }, (_, i) => (
                <Button
                  key={i}
                  variant={currentIndex === i ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIndex(i)}
                  disabled={loading}
                  className="h-8 w-full text-xs"
                >
                  {i + 1}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Status Information */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Speed: {speed}x | Progress: {Math.round(progress)}%</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`h-2 w-2 rounded-full ${isPlaying ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span>{isPlaying ? 'Live simulation active' : 'Simulation paused'}</span>
          </div>
          
          {status && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>API Latency: {status.latencyMin}-{status.latencyMax}ms</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};