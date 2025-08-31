import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Activity, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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

  // Send control action to simulation API
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
        
        toast({
          title: "Simulation Updated",
          description: `Action: ${action.action}${action.snapshot !== undefined ? ` to snapshot ${action.snapshot}` : ''}`,
        });
      } else {
        throw new Error('Control action failed');
      }
    } catch (error) {
      toast({
        title: "Control Error",
        description: "Failed to execute simulation control action",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Control handlers
  const handlePlay = () => {
    setIsPlaying(true);
    // In real implementation, this would integrate with the SimulationManager
    toast({
      title: "Simulation Playing",
      description: "Auto-advancing through snapshots",
    });
  };

  const handlePause = () => {
    setIsPlaying(false);
    toast({
      title: "Simulation Paused",
      description: "Snapshot progression stopped",
    });
  };

  const handleReset = () => {
    setIsPlaying(false);
    sendControlAction({ action: 'reset' });
  };

  const handleSnapshotSelect = (snapshot: number) => {
    sendControlAction({ action: 'set_snapshot', snapshot });
  };

  // Auto-refresh status every second
  useEffect(() => {
    fetchStatus(); // Initial fetch
    
    const interval = setInterval(fetchStatus, 1000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Don't render if simulation is not enabled
  if (!status?.enabled) {
    return null;
  }

  const progress = ((status.currentSnapshot + 1) / status.totalSnapshots) * 100;

  return (
    <Card className="fixed bottom-4 right-4 w-80 shadow-lg border bg-background/95 backdrop-blur-sm z-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4 text-primary" />
          Simulation Controls
          <Badge variant="secondary" className="ml-auto">
            {status.currentSnapshot + 1}/{status.totalSnapshots}
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
            onClick={isPlaying ? handlePause : handlePlay}
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
            onClick={handleReset}
            disabled={loading}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {/* Snapshot Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Snapshots</span>
            <Badge variant="outline" className="text-xs">
              Current: {status.currentSnapshot + 1}
            </Badge>
          </div>
          
          <ScrollArea className="h-20">
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: status.totalSnapshots }, (_, i) => (
                <Button
                  key={i}
                  variant={status.currentSnapshot === i ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSnapshotSelect(i)}
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
            <span>Latency: {status.latencyMin}-{status.latencyMax}ms</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span>Last updated: {new Date(status.timestamp).toLocaleTimeString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};