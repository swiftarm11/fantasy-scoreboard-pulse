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
import { Trash2, Plus, Download, Upload, Loader2, GripVertical, Check } from 'lucide-react';
import { DashboardConfig, LeagueConfig, DEFAULT_CONFIG } from '../types/config';
import { Platform } from '../types/fantasy';
import { sleeperAPI } from '../services/SleeperAPI';
import { useConfig } from '../hooks/useConfig';
import { DraggableLeagueItem } from './DraggableLeagueItem';
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
}

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const { config, updateConfig } = useConfig();
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
        const isValid = await sleeperAPI.validateLeagueId(leagueId);
        setIsValidLeague(isValid);
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
        const isValid = await sleeperAPI.validateLeagueId(newLeagueId);
        if (!isValid) {
          throw new Error('Invalid league ID');
        }
        
        const league = await sleeperAPI.getLeague(newLeagueId);
        
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
      } else {
        // For other platforms, just add without validation for now
        const newLeague: LeagueConfig = {
          id: `league_${Date.now()}`,
          leagueId: newLeagueId,
          platform: newLeaguePlatform,
          enabled: true,
        };

        setLocalConfig(prev => ({
          ...prev,
          leagues: [...prev.leagues, newLeague],
        }));

        setNewLeagueId('');
        setIsValidLeague(false);
        
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
    setLocalConfig(prev => ({
      ...prev,
      leagues: prev.leagues.filter(l => l.id !== leagueId),
    }));
    
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="leagues" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="leagues">Leagues</TabsTrigger>
            <TabsTrigger value="polling">Polling</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>

          <TabsContent value="leagues" className="space-y-4">
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
                        <SelectItem value="Yahoo">Yahoo (Coming Soon)</SelectItem>
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
                        placeholder="Enter league ID"
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
                <CardTitle>Polling Settings</CardTitle>
                <CardDescription>
                  Configure how often the dashboard updates
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label>Update Frequency</Label>
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
                        Poll more frequently on Sundays (1-11 PM) and Mondays (8-11 PM)
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
              </CardContent>
            </Card>
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

          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Management</CardTitle>
                <CardDescription>
                  Import and export your configuration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <Button onClick={exportConfig} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export Config
                  </Button>
                  
                  <div>
                    <Input
                      type="file"
                      accept=".json"
                      onChange={importConfig}
                      className="hidden"
                      id="import-config"
                    />
                    <Button 
                      variant="outline"
                      onClick={() => document.getElementById('import-config')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import Config
                    </Button>
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  <p>Export your configuration to back up your settings.</p>
                  <p>Import a previously exported configuration file.</p>
                </div>
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