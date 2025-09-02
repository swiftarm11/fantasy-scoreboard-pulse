import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Activity, Clock, SkipForward, SkipBack, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useSimulationBridge } from '@/mocks/simulationBridge';
import { debugLogger } from '@/utils/debugLogger';

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
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Use the simulation bridge directly for state and control
  const simulationBridge = useSimulationBridge();
  const [bridgeState, setBridgeState] = useState(simulationBridge.getState());
  
  // Subscribe to bridge events to update UI state
  useEffect(() => {
    const unsubscribe = simulationBridge.subscribe((event) => {
      debugLogger.info('SIMULATION_CONTROLS', 'Bridge event received', {
        type: event.type,
        payload: event.payload
      });
      
      // Update local state from bridge
      setBridgeState(simulationBridge.getState());
    });
    
    return unsubscribe;
  }, [simulationBridge]);

  // Control functions that interact with the bridge
  const play = useCallback(() => {
    debugLogger.info('SIMULATION_CONTROLS', 'Play requested');
    simulationBridge.setPlayState(true);
    toast({
      title: "Simulation Started",
      description: "Fantasy scores are now updating live",
    });
  }, [simulationBridge, toast]);

  const pause = useCallback(() => {
    debugLogger.info('SIMULATION_CONTROLS', 'Pause requested');  
    simulationBridge.setPlayState(false);
    toast({
      title: "Simulation Paused", 
      description: "Score updates have been paused",
    });
  }, [simulationBridge, toast]);

  const stop = useCallback(() => {
    debugLogger.info('SIMULATION_CONTROLS', 'Stop requested');
    simulationBridge.setPlayState(false);
    simulationBridge.setCurrentSnapshot(0);
    toast({
      title: "Simulation Stopped",
      description: "Reset to beginning of game simulation",
    });
  }, [simulationBridge, toast]);

  const next = useCallback(() => {
    debugLogger.info('SIMULATION_CONTROLS', 'Next snapshot requested');
    simulationBridge.nextSnapshot();
  }, [simulationBridge]);

  const previous = useCallback(() => {
    debugLogger.info('SIMULATION_CONTROLS', 'Previous snapshot requested');
    simulationBridge.previousSnapshot();
  }, [simulationBridge]);

  const setSpeed = useCallback((speed: number) => {
    debugLogger.info('SIMULATION_CONTROLS', 'Speed change requested', { speed });
    simulationBridge.setSpeed(speed);
    toast({
      title: "Speed Changed",
      description: `Playback speed set to ${speed}x`,
    });
  }, [simulationBridge, toast]);

  const setSnapshot = useCallback((index: number) => {
    debugLogger.info('SIMULATION_CONTROLS', 'Snapshot jump requested', { index });
    simulationBridge.setCurrentSnapshot(index);
    toast({
      title: "Jumped to Snapshot",
      description: `Now viewing snapshot ${index + 1} of ${bridgeState.maxSnapshots}`,
    });
  }, [simulationBridge, bridgeState.maxSnapshots, toast]);

  // Speed presets
  const speedOptions = [0.25, 0.5, 1.0, 2.0, 5.0];

  // Check if simulation should be shown
  const isSimulationMode = 
    bridgeState.isSimulationMode ||
    new URLSearchParams(window.location.search).get('simulation') === 'true' ||
    import.meta.env.VITE_YAHOO_SIMULATION === 'true';

  if (!isSimulationMode) {
    return null;
  }

  // Computed values from bridge state
  const progress = (bridgeState.currentSnapshot / bridgeState.maxSnapshots) * 100;
  const isAtStart = bridgeState.currentSnapshot === 0;
  const isAtEnd = bridgeState.currentSnapshot >= bridgeState.maxSnapshots - 1;
  const canPlay = !bridgeState.isPlaying && !isAtEnd;

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
            {bridgeState.currentSnapshot + 1}/{bridgeState.maxSnapshots}
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
            {bridgeState.isPlaying ? (
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
                variant={bridgeState.speed === speedOption ? "default" : "outline"}
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
              Current: {bridgeState.currentSnapshot + 1}
            </Badge>
          </div>
          
          <ScrollArea className="h-20">
            <div className="grid grid-cols-6 gap-1">
              {Array.from({ length: bridgeState.maxSnapshots }, (_, i) => (
                <Button
                  key={i}
                  variant={bridgeState.currentSnapshot === i ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSnapshot(i)}
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
            <span>Speed: {bridgeState.speed}x | Progress: {Math.round(progress)}%</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`h-2 w-2 rounded-full ${bridgeState.isPlaying ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span>{bridgeState.isPlaying ? 'Live simulation active' : 'Simulation paused'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};