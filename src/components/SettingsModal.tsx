import { PerformanceDashboard } from './PerformanceDashboard';
import { YahooIntegrationFlow } from './YahooIntegrationFlow';
import { YahooRateLimitStatus } from './YahooRateLimitStatus';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
import { useYahooData } from '../hooks/useYahooData';
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { toast } from './ui/use-toast';
import { Trash2, Plus, Download, Upload, Loader2, GripVertical, Check, Zap, RefreshCw } from 'lucide-react';
import { DashboardConfig, LeagueConfig, DEFAULT_CONFIG } from '../types/config';
import { Platform } from '../types/fantasy';
import { sleeperAPIEnhanced } from '../services/SleeperAPIEnhanced';
import { useConfig } from '../hooks/useConfig';
import { DraggableLeagueItem } from './DraggableLeagueItem';
import { generateMockScoringEvent } from '../utils/mockEventGenerator';
import { TestingTab } from './TestingTab';
import { ESPNTestPanel } from './ESPNTestPanel';
import { debugLogger } from '../utils/debugLogger';
import { DebugConsole } from './DebugConsole';
import { DataHealthMonitor } from './DataHealthMonitor';
import { LiveDebugPanel } from './LiveDebugPanel';
import { useSimulationContext } from '../contexts/SimulationContext';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMockEvent?: (leagueId: string, event: any) => void;
}

export const SettingsModal = ({ open, onOpenChange, onMockEvent }: SettingsModalProps) => {
  const { config, updateConfig } = useConfig();
  const { isConnected: isYahooConnected } = useYahooOAuth();
  const { isSimulationMode, setSimulationMode } = useSimulationContext();

  // Yahoo: persist selections and fetch list; aligns with FantasyDashboard expecting useYahooData persistence
  const { 
    availableLeagues = [],
    savedSelections = [],
    saveLeagueSelections,
    isLoading: yahooLoading = false,
    fetchAvailableLeagues,
  } = useYahooData() || {};

  // Sleeper: preserved behavior, including optional username for team identification
  const [localConfig, setLocalConfig] = useState<DashboardConfig>(config);
  const [validatingLeague, setValidatingLeague] = useState<string | null>(null);
  const [newLeagueId, setNewLeagueId] = useState('');
  const [newLeaguePlatform, setNewLeaguePlatform] = useState<Platform>('Sleeper');
  const [newSleeperUsername, setNewSleeperUsername] = useState('');
  const [isValidLeague, setIsValidLeague] = useState(false);
  const [showDataHealth, setShowDataHealth] = useState(false);
  const [showLiveDebug, setShowLiveDebug] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // QoL: when modal opens and Yahoo connected, auto-load leagues once
  useEffect(() => {
    if (open && isYahooConnected) {
      fetchAvailableLeagues?.();
    }
  }, [open, isYahooConnected, fetchAvailableLeagues]);

  const validateLeagueId = async (leagueId: string) => {
    if (!leagueId.trim()) {
      setIsValidLeague(false);
      return;
    }

    try {
      if (newLeaguePlatform === 'Sleeper') {
        const isValid = await sleeperAPIEnhanced.validateLeagueId(leagueId);
        setIsValidLeague(isValid);
      } else if (newLeaguePlatform === 'Yahoo') {
        if (!isYahooConnected) {
          setIsValidLeague(false);
          return;
        }
        // Yahoo validation via API would require an authenticated call; assume valid when connected
        setIsValidLeague(true);
      } else {
        setIsValidLeague(true);
      }
    } catch {
      setIsValidLeague(false);
    }
  };

  const validateAndAddLeague = async () => {
    if (!newLeagueId.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a league ID',
        variant: 'destructive',
      });
      return;
    }

    setValidatingLeague(newLeagueId);
    
    try {
      if (newLeaguePlatform === 'Sleeper') {
        const isValid = await sleeperAPIEnhanced.validateLeagueId(newLeagueId);
        if (!isValid) {
          throw new Error('Invalid league ID');
        }
        
        const league = await sleeperAPIEnhanced.getLeague(newLeagueId);
        
        const newLeague: LeagueConfig = {
          id: `league_${Date.now()}`,
          leagueId: newLeagueId,
          platform: newLeaguePlatform,
          enabled: true,
          customTeamName: league.name,
          sleeperUsername: newSleeperUsername.trim() || undefined,
        };

        setLocalConfig(prev => ({
          ...prev,
          leagues: [...prev.leagues, newLeague],
        }));

        setNewLeagueId('');
        setNewSleeperUsername('');
        setIsValidLeague(false);
        
        toast({
          title: 'Success',
          description: `Added league: ${league.name}`,
        });
      } else if (newLeaguePlatform === 'Yahoo') {
        if (!isYahooConnected) {
          throw new Error('Please connect your Yahoo account first');
        }
        
        // Minimal: allow manual Yahoo league addition (does not affect Yahoo selection flow)
        const newLeague: LeagueConfig = {
          id: `league_${Date.now()}`,
          leagueId: newLeagueId,
          platform: newLeaguePlatform,
          enabled: true,
          customTeamName: `Yahoo League ${newLeagueId}`,
        };

        setLocalConfig(prev => ({
          ...prev,
          leagues: [...prev.leagues, newLeague],
        }));

        setNewLeagueId('');
        setIsValidLeague(false);
        
        toast({
          title: 'Success',
          description: `Added Yahoo league: ${newLeagueId}`,
        });
      } else {
        const newLeague: LeagueConfig = {
          id: `league_${Date.now()}`,
          leagueId: newLeagueId,
          platform: newLeaguePlatform,
          enabled: true,
        };

        const updatedConfig = {
          ...localConfig,
          leagues: [...localConfig.leagues, newLeague],
        };
        
        setLocalConfig(updatedConfig);
        updateConfig(updatedConfig);

        setNewLeagueId('');
        setNewSleeperUsername('');
        setIsValidLeague(false);
        
        console.log('League added and saved:', newLeague);
        
        toast({
          title: 'Success',
          description: `Added ${newLeaguePlatform} league`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: `Failed to add league: ${error?.message || 'Unknown error'}`,
        variant: 'destructive',
      });
    } finally {
      setValidatingLeague(null);
    }
  };

  const removeLeague = (leagueId: string) => {
    const updatedConfig = {
      ...localConfig,
      leagues: localConfig.leagues.filter(l => l.id !== leagueId),
    };
    
    setLocalConfig(updatedConfig);
    updateConfig(updatedConfig);
    
    console.log('League removed and saved:', leagueId);
    
    toast({
      title: 'Success',
      description: 'League removed',
    });
  };

  const updateLeague = (leagueId: string, updates: Partial<LeagueConfig>) => {
    setLocalConfig(prev => ({
      ...prev,
      leagues: prev.leagues.map(l => 
        l.id === leagueId ? { ...l, ...updates } : l
      ),
    }));
  };

  // Yahoo selection persistence (no change to Sleeper paths)
  const handleYahooLeagueToggle = (leagueKey: string, leagueName: string, enabled: boolean) => {
    const currentSelections = [...(savedSelections ?? [])];
    const existingIndex = currentSelections.findIndex(s => s.leagueId === leagueKey);
    
    if (existingIndex >= 0) {
      currentSelections[existingIndex] = {
        ...currentSelections[existingIndex],
        enabled
      };
    } else {
      currentSelections.push({
        id: `yahoo_${Date.now()}_${Math.random()}`,
        leagueId: leagueKey,
        customTeamName: leagueName,
        enabled,
        platform: 'Yahoo'
      });
    }
    
    try {
      saveLeagueSelections?.(currentSelections);
      debugLogger.info('YAHOO_LEAGUES', 'League selection updated', { leagueKey, leagueName, enabled });
      toast({
        title: enabled ? 'League Added' : 'League Removed',
        description: `${leagueName} ${enabled ? 'added to' : 'removed from'} dashboard`,
      });
    } catch (e: any) {
      toast({
        title: 'Error',
        description: 'Failed to update Yahoo league selection',
        variant: 'destructive',
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalConfig(prev => {
        const oldIndex = prev.leagues.findIndex(l => l.id === active.id);
        const newIndex = prev.leagues.findIndex(l => l.id === over.id);

        return {
          ...prev,
          leagues: arrayMove(prev.leagues, oldIndex, newIndex),
        };
      });

      toast({
        title: 'Success',
        description: 'League order updated',
      });
    }
  };

  const saveConfig = () => {
    updateConfig(localConfig);
    onOpenChange(false);
    
    toast({
      title: 'Success',
      description: 'Settings saved successfully',
    });
  };

  const exportConfig = () => {
    const dataStr = JSON.stringify(localConfig, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'fantasy-dashboard-config.json';
    link.click();
    
    URL.revokeObjectURL(url);
    
    toast({
      title: 'Success',
      description: 'Configuration exported',
    });
  };

  const importConfig = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse((e.target?.result as string) ?? '');
        setLocalConfig({ ...DEFAULT_CONFIG, ...imported });
        updateConfig({ ...DEFAULT_CONFIG, ...imported }); // Auto-save
        toast({
          title: 'Success',
          description: 'Configuration imported',
        });
      } catch {
        toast({
          title: 'Error',
          description: 'Invalid configuration file',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);

    // Optional: allow selecting the same file again immediately
    event.target.value = '';
  };

  const resetToDefaults = () => {
    setLocalConfig(DEFAULT_CONFIG);
    updateConfig(DEFAULT_CONFIG);
    
    toast({
      title: 'Settings Reset',
      description: 'All settings have been restored to defaults',
    });
  };

  const toggleDemoLeague = (enabled: boolean) => {
    setLocalConfig(prev => ({
      ...prev,
      demoMode: { ...prev.demoMode, enabled }
    }));
    
    const updatedConfig = {
      ...localConfig,
      demoMode: { ...localConfig.demoMode, enabled }
    };
    updateConfig(updatedConfig);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>

        <DataHealthMonitor isVisible={showDataHealth} />

        <Tabs defaultValue="leagues" className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="leagues">Leagues</TabsTrigger>
            <TabsTrigger value="polling">Polling</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="testing">Testing</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="leagues" className="space-y-4">
            <YahooIntegrationFlow />
            
            {isYahooConnected && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Yahoo League Selection</CardTitle>
                      <CardDescription>
                        Choose which of your Yahoo leagues to display in the dashboard
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchAvailableLeagues}
                      disabled={yahooLoading}
                    >
                      {yahooLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {availableLeagues.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      {yahooLoading ? 'Loading your Yahoo leagues...' : 'No Yahoo leagues found. Make sure you have active leagues for the current season.'}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {availableLeagues.map((league: any) => {
                        const isSelected = (savedSelections ?? []).find(s => s.leagueId === league.league_key)?.enabled || false;
                        
                        return (
                          <div key={league.league_key} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex-1">
                              <h4 className="font-medium">{league.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {league.num_teams} teams • {league.league_type} league • {league.scoring_type} scoring
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                League ID: {league.league_key}
                              </p>
                            </div>
                            <Switch
                              checked={isSelected}
                              onCheckedChange={(enabled) => handleYahooLeagueToggle(league.league_key, league.name, enabled)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle>Add New League</CardTitle>
                <CardDescription>
                  Connect your fantasy leagues to the dashboard
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="platform">Platform</Label>
                      <Select value={newLeaguePlatform} onValueChange={(value: Platform) => setNewLeaguePlatform(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Sleeper">Sleeper</SelectItem>
                          <SelectItem value="Yahoo">Yahoo</SelectItem>
                          <SelectItem value="NFL.com">NFL.com (Coming Soon)</SelectItem>
                          <SelectItem value="ESPN">ESPN (Coming Soon)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="relative">
                      <Label htmlFor="leagueId">League ID</Label>
                      <div className="relative">
                        <Input
                          id="leagueId"
                          value={newLeagueId}
                          onChange={(e) => {
                            setNewLeagueId(e.target.value);
                            validateLeagueId(e.target.value);
                          }}
                          placeholder="Example: 1207878742588792832"
                          className={isValidLeague && newLeagueId ? 'pr-8' : ''}
                        />
                        {isValidLeague && newLeagueId && (
                          <Check className="absolute right-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <Button 
                        onClick={validateAndAddLeague}
                        disabled={validatingLeague !== null}
                        className="w-full"
                      >
                        {validatingLeague ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Add League
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {newLeaguePlatform === 'Sleeper' && (
                    <div>
                      <Label htmlFor="sleeperUsername">Sleeper Username (Optional)</Label>
                      <Input
                        id="sleeperUsername"
                        value={newSleeperUsername}
                        onChange={(e) => setNewSleeperUsername(e.target.value)}
                        placeholder="Your Sleeper username to identify your team"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter your Sleeper username to automatically identify your team. If not provided, we'll use the first team in the league.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Connected Leagues</CardTitle>
                <CardDescription>
                  Manage and reorder your connected fantasy leagues
                </CardDescription>
              </CardHeader>
              <CardContent>
                {localConfig.leagues.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No leagues connected yet. Add a league above to get started.
                  </p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={localConfig.leagues.map(l => l.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {localConfig.leagues.map((league) => (
                          <DraggableLeagueItem
                            key={league.id}
                            league={league}
                            onUpdate={updateLeague}
                            onRemove={removeLeague}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="polling" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Refresh Settings</CardTitle>
                <CardDescription>
                  Configure how often data is fetched from fantasy platforms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="polling-interval">Polling Interval (seconds)</Label>
                    <Input
                      id="polling-interval"
                      type="number"
                      min="5"
                      max="300"
                      value={localConfig.polling?.interval || 30}
                      onChange={(e) => setLocalConfig(prev => ({
                        ...prev,
                        polling: { ...prev.polling, interval: parseInt(e.target.value) || 30 }
                      }))}
                      className="mt-2"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      During live games, data refreshes every {localConfig.polling?.interval || 30} seconds. 
                      Lower values get fresher data but use more bandwidth.
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Auto-refresh During Live Games</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically increase refresh rate during active game times
                      </p>
                    </div>
                    <Switch
                      checked={localConfig.polling?.enableLiveMode ?? true}
                      onCheckedChange={(enableLiveMode) => setLocalConfig(prev => ({
                        ...prev,
                        polling: { ...prev.polling, enableLiveMode }
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Background Refresh</Label>
                      <p className="text-sm text-muted-foreground">
                        Continue refreshing data when app is in background (uses battery)
                      </p>
                    </div>
                    <Switch
                      checked={localConfig.polling?.backgroundRefresh ?? false}
                      onCheckedChange={(backgroundRefresh) => setLocalConfig(prev => ({
                        ...prev,
                        polling: { ...prev.polling, backgroundRefresh }
                      }))}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    💡 During live games (Thu/Sun/Mon), polling automatically increases to ensure you get real-time scoring updates.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="display" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Display Options</CardTitle>
                <CardDescription>
                  Customize how leagues and data are displayed
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Compact View</Label>
                    <p className="text-sm text-muted-foreground">
                      Show leagues in a condensed, grid-style layout
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.display?.compactView || false}
                    onCheckedChange={(compactView) => setLocalConfig(prev => ({
                      ...prev,
                      display: { ...prev.display, compactView }
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Win Probability Trends</Label>
                    <p className="text-sm text-muted-foreground">
                      Show historical win probability charts and trends
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.display?.showWinProbabilityTrends ?? true}
                    onCheckedChange={(showWinProbabilityTrends) => setLocalConfig(prev => ({
                      ...prev,
                      display: { ...prev.display, showWinProbabilityTrends }
                    }))}
                  />
                </div>

                 <div className="flex items-center justify-between">
                   <div>
                     <Label>Performance Metrics</Label>
                     <p className="text-sm text-muted-foreground">
                       Display API response times and success rates
                     </p>
                   </div>
                   <Switch
                     checked={localConfig.display?.showPerformanceMetrics || false}
                     onCheckedChange={(showPerformanceMetrics) => setLocalConfig(prev => ({
                       ...prev,
                       display: { ...prev.display, showPerformanceMetrics }
                     }))}
                   />
                 </div>

                 <Separator />

                 <div className="flex items-center justify-between">
                   <div>
                     <Label>Simulation Mode</Label>
                     <p className="text-sm text-muted-foreground">
                       Use test data snapshots to simulate live games for testing
                     </p>
                   </div>
                   <Switch
                     checked={isSimulationMode}
                     onCheckedChange={setSimulationMode}
                   />
                 </div>

                 {isSimulationMode && (
                   <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                     <h4 className="font-medium text-sm">🔬 Simulation Mode Active</h4>
                     <ul className="text-sm text-muted-foreground space-y-1">
                       <li>• Uses real Yahoo Fantasy API snapshots from a complete gameday</li>
                       <li>• Shows exactly how scores evolved during actual NFL games</li>
                       <li>• Perfect for testing dashboard accuracy and performance</li>
                       <li>• Control playback speed and jump to specific moments</li>
                       <li>• All data flows through the same systems as live games</li>
                     </ul>
                   </div>
                 )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance" className="space-y-4">
            <PerformanceDashboard />
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Choose what events trigger notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Scoring Events</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when players score points
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.notifications.scoringEvents}
                    onCheckedChange={(scoringEvents) => setLocalConfig(prev => ({
                      ...prev,
                      notifications: { ...prev.notifications, scoringEvents }
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Win Probability Changes</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify when your win probability changes significantly
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.notifications.winProbabilityChanges}
                    onCheckedChange={(winProbabilityChanges) => setLocalConfig(prev => ({
                      ...prev,
                      notifications: { ...prev.notifications, winProbabilityChanges }
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Game Start Reminders</Label>
                    <p className="text-sm text-muted-foreground">
                      Remind you when games are about to start
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.notifications.gameStartReminders}
                    onCheckedChange={(gameStartReminders) => setLocalConfig(prev => ({
                      ...prev,
                      notifications: { ...prev.notifications, gameStartReminders }
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Play Sound</Label>
                    <p className="text-sm text-muted-foreground">
                      Play notification sounds
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.notifications.playSound}
                    onCheckedChange={(playSound) => setLocalConfig(prev => ({
                      ...prev,
                      notifications: { ...prev.notifications, playSound }
                    }))}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="testing" className="space-y-4">
            <TestingTab 
              leagues={localConfig.leagues} 
              onMockEvent={(leagueId, event) => {
                console.log('Mock event triggered for league:', leagueId, event);
                toast({
                  title: 'Mock Event Generated',
                  description: `${event.playerName} scored ${event.points} points`,
                });
              }} 
            />
          </TabsContent>

          <TabsContent value="debug" className="space-y-4">
            <ESPNTestPanel />
            
            <DataHealthMonitor isVisible={showDataHealth} />
            
            <Card>
              <CardHeader>
                <CardTitle>Debug Settings</CardTitle>
                <CardDescription>
                  Configure debug logging and diagnostics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Debug Logging</Label>
                    <p className="text-sm text-muted-foreground">
                      Show detailed API calls, validation steps, and error information
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.debug.enabled}
                    onCheckedChange={(enabled) => setLocalConfig(prev => ({
                      ...prev,
                      debug: { ...prev.debug, enabled }
                    }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Data Health Monitor</Label>
                    <p className="text-sm text-muted-foreground">
                      Display real-time data validation and freshness monitoring
                    </p>
                  </div>
                  <Switch
                    checked={showDataHealth}
                    onCheckedChange={setShowDataHealth}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show in Production</Label>
                    <p className="text-sm text-muted-foreground">
                      Display debug console in production builds (not recommended)
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.debug.showInProduction}
                    onCheckedChange={(showInProduction) => setLocalConfig(prev => ({
                      ...prev,
                      debug: { ...prev.debug, showInProduction }
                    }))}
                  />
                </div>

                <div className="pt-4">
                  <Button 
                    onClick={() => setShowLiveDebug(true)}
                    variant="outline"
                    className="w-full"
                  >
                    🚀 Open Live Debug Panel
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    Advanced debugging tools for live games - connection tests, raw data viewer, emergency controls
                  </p>
                </div>
              </CardContent>
            </Card>

            <YahooRateLimitStatus />
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configuration Backup</CardTitle>
                <CardDescription>
                  Export, import, or reset your dashboard configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button onClick={exportConfig} variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Export Config
                  </Button>

                  <div className="relative">
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => document.getElementById('config-import')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import Config
                    </Button>
                    <input
                      id="config-import"
                      type="file"
                      accept=".json"
                      onChange={importConfig}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>

                  <Button 
                    onClick={resetToDefaults} 
                    variant="destructive"
                    className="w-full"
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Reset to Defaults
                  </Button>
                </div>
                
                <div className="text-sm text-muted-foreground space-y-2">
                  <p><strong>Export:</strong> Download your current settings as a JSON file</p>
                  <p><strong>Import:</strong> Load settings from a previously exported file</p>
                  <p><strong>Reset:</strong> Restore all settings to their default values</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configuration Info</CardTitle>
                <CardDescription>
                  Current configuration details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2">
                  <div className="flex justify-between">
                    <dt className="font-medium">Version:</dt>
                    <dd className="text-muted-foreground">{localConfig.version}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-medium">Connected Leagues:</dt>
                    <dd className="text-muted-foreground">{localConfig.leagues.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-medium">Yahoo Leagues Selected:</dt>
                    <dd className="text-muted-foreground">{(savedSelections ?? []).filter(s => s.enabled).length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-medium">Update Frequency:</dt>
                    <dd className="text-muted-foreground">{localConfig.polling.updateFrequency}s</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="font-medium">Smart Polling:</dt>
                    <dd className="text-muted-foreground">{localConfig.polling.smartPolling ? 'Enabled' : 'Disabled'}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Demo League
                </CardTitle>
                <CardDescription>
                  Enable a live demo league with realistic scoring events for testing UI animations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Demo League</Label>
                    <p className="text-sm text-muted-foreground">
                      Shows a fake league with auto-updating scoring events
                    </p>
                  </div>
                  <Switch
                    checked={localConfig.demoMode.enabled}
                    onCheckedChange={toggleDemoLeague}
                  />
                </div>

                {localConfig.demoMode.enabled && (
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <h4 className="font-medium text-sm">Demo League Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Auto-generates scoring events every 15-30 seconds</li>
                      <li>• Shows realistic player names and actions</li>
                      <li>• Demonstrates all UI animations and transitions</li>
                      <li>• Updates scores and league position dynamically</li>
                      <li>• Perfect for testing without affecting real leagues</li>
                    </ul>
                  </div>
                )}

                <div className="text-sm text-muted-foreground">
                  <p><strong>Note:</strong> The demo league appears as the first league in your dashboard when enabled. It's clearly marked with a 🎮 icon to distinguish it from real leagues.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <LiveDebugPanel open={showLiveDebug} onOpenChange={setShowLiveDebug} />

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={saveConfig}>
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
