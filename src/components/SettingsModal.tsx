import { PerformanceDashboard } from './PerformanceDashboard';
import { YahooConnectionCard } from './YahooConnectionCard';
import { YahooLeagueSelector } from './YahooLeagueSelector';
import { YahooRateLimitStatus } from './YahooRateLimitStatus';
import { useYahooOAuth } from '../hooks/useYahooOAuth';
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
import { toast } from './ui/use-toast';
import { Trash2, Plus, Download, Upload, Loader2, GripVertical, Check, Zap } from 'lucide-react';
import { DashboardConfig, LeagueConfig, DEFAULT_CONFIG } from '../types/config';
import { Platform } from '../types/fantasy';
import { sleeperAPIEnhanced } from '../services/SleeperAPIEnhanced';
import { useConfig } from '../hooks/useConfig';
import { DraggableLeagueItem } from './DraggableLeagueItem';
import { generateMockScoringEvent } from '../utils/mockEventGenerator';
import { TestingTab } from './TestingTab';
import { debugLogger } from '../utils/debugLogger';
import { DebugConsole } from './DebugConsole';
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
  const [localConfig, setLocalConfig] = useState<DashboardConfig>(config);
  const [validatingLeague, setValidatingLeague] = useState<string | null>(null);
  const [newLeagueId, setNewLeagueId] = useState('');
  const [newLeaguePlatform, setNewLeaguePlatform] = useState<Platform>('Sleeper');
  const [isValidLeague, setIsValidLeague] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

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
        // For Yahoo, check if user is connected first
        if (!isYahooConnected) {
          setIsValidLeague(false);
          return;
        }
        // For now, assume valid if connected (actual validation would require Yahoo API call)
        setIsValidLeague(true);
      } else {
        // For other platforms, assume valid for now
        setIsValidLeague(true);
      }
    } catch (error) {
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
        };

        setLocalConfig(prev => ({
          ...prev,
          leagues: [...prev.leagues, newLeague],
        }));

        setNewLeagueId('');
        setIsValidLeague(false);
        
        toast({
          title: 'Success',
          description: `Added league: ${league.name}`,
        });
      } else if (newLeaguePlatform === 'Yahoo') {
        // For Yahoo, check if user is connected first
        if (!isYahooConnected) {
          throw new Error('Please connect your Yahoo account first');
        }
        
        // For now, just add without full validation (actual validation would require Yahoo API call)
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
        // For other platforms, just add without validation for now
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
        updateConfig(updatedConfig); // Auto-save to localStorage

        setNewLeagueId('');
        setIsValidLeague(false);
        
        console.log('League added and saved:', newLeague);
        
        toast({
          title: 'Success',
          description: `Added ${newLeaguePlatform} league`,
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: `Failed to add league: ${error.message}`,
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
    updateConfig(updatedConfig); // Auto-save to localStorage
    
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
        const imported = JSON.parse(e.target?.result as string);
        setLocalConfig({ ...DEFAULT_CONFIG, ...imported });
        updateConfig({ ...DEFAULT_CONFIG, ...imported }); // Auto-save to localStorage
        
        toast({
          title: 'Success',
          description: 'Configuration imported',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Invalid configuration file',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);
  };

  const resetToDefaults = () => {
    setLocalConfig(DEFAULT_CONFIG);
    updateConfig(DEFAULT_CONFIG); // Auto-save to localStorage
    
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
    
    // Auto-save when demo mode is toggled
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

        <Tabs defaultValue="leagues" className="w-full">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="leagues">Leagues</TabsTrigger>
            <TabsTrigger value="polling">Polling</TabsTrigger>
            <TabsTrigger value="display">Display</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="debug">Debug</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="leagues" className="space-y-4">
            <YahooConnectionCard />
            <YahooLeagueSelector />
            
            <Card>
              <CardHeader>
                <CardTitle>Add New League</CardTitle>
                <CardDescription>
                  Connect your fantasy leagues to the dashboard
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                <CardTitle>Enhanced Polling Settings</CardTitle>
                <CardDescription>
                  Intelligent polling with game-hour optimization
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Base Update Frequency</Label>
                  <Select 
                    value={localConfig.polling.updateFrequency.toString()} 
                    onValueChange={(value) => setLocalConfig(prev => ({
                      ...prev,
                      polling: { ...prev.polling, updateFrequency: parseInt(value) as 15 | 30 | 60 }
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">Every 15 seconds</SelectItem>
                      <SelectItem value="30">Every 30 seconds</SelectItem>
                      <SelectItem value="60">Every 60 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Smart Polling</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically adjust polling frequency during game hours
                      </p>
                    </div>
                    <Switch
                      checked={localConfig.polling.smartPolling}
                      onCheckedChange={(smartPolling) => setLocalConfig(prev => ({
                        ...prev,
                        polling: { ...prev.polling, smartPolling }
                      }))}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Game Hour Polling</Label>
                      <p className="text-sm text-muted-foreground">
                        Use faster intervals during Sunday (1-11 PM) and Monday (8-11 PM) games
                      </p>
                    </div>
                    <Switch
                      checked={localConfig.polling.gameHourPolling}
                      onCheckedChange={(gameHourPolling) => setLocalConfig(prev => ({
                        ...prev,
                        polling: { ...prev.polling, gameHourPolling }
                      }))}
                    />
                  </div>
                </div>

                {localConfig.polling.gameHourPolling && (
                  <Card className="bg-muted/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Game Hour Intervals</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className="text-xs">Sunday Games</Label>
                          <Select 
                            value={localConfig.polling.gameHourIntervals?.sunday?.toString() || '15'} 
                            onValueChange={(value) => setLocalConfig(prev => ({
                              ...prev,
                              polling: { 
                                ...prev.polling, 
                                gameHourIntervals: {
                                  ...prev.polling.gameHourIntervals,
                                  sunday: parseInt(value)
                                }
                              }
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 seconds</SelectItem>
                              <SelectItem value="15">15 seconds</SelectItem>
                              <SelectItem value="30">30 seconds</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Monday Games</Label>
                          <Select 
                            value={localConfig.polling.gameHourIntervals?.monday?.toString() || '15'} 
                            onValueChange={(value) => setLocalConfig(prev => ({
                              ...prev,
                              polling: { 
                                ...prev.polling, 
                                gameHourIntervals: {
                                  ...prev.polling.gameHourIntervals,
                                  monday: parseInt(value)
                                }
                              }
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10 seconds</SelectItem>
                              <SelectItem value="15">15 seconds</SelectItem>
                              <SelectItem value="30">30 seconds</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Off-Hours</Label>
                          <Select 
                            value={localConfig.polling.gameHourIntervals?.normal?.toString() || '60'} 
                            onValueChange={(value) => setLocalConfig(prev => ({
                              ...prev,
                              polling: { 
                                ...prev.polling, 
                                gameHourIntervals: {
                                  ...prev.polling.gameHourIntervals,
                                  normal: parseInt(value)
                                }
                              }
                            }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="30">30 seconds</SelectItem>
                              <SelectItem value="60">60 seconds</SelectItem>
                              <SelectItem value="120">2 minutes</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <p>• Sunday: 1 PM - 11 PM EST</p>
                        <p>• Monday: 8 PM - 11 PM EST</p>
                        <p>• Off-hours: All other times</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
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

          <TabsContent value="debug" className="space-y-4">
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
              </CardContent>
            </Card>

            <DebugConsole
              debugMode={localConfig.debug.enabled}
              onToggleDebug={(enabled) => setLocalConfig(prev => ({
                ...prev,
                debug: { ...prev.debug, enabled }
              }))}
            />
            
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
          </TabsContent>
           <TabsContent value="testing" className="space-y-4">
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

            <Card>
              <CardHeader>
                <CardTitle>Manual Event Testing</CardTitle>
                <CardDescription>
                  Generate test events for debugging specific scenarios
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Enable the demo league above to access manual event generation and live testing features.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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