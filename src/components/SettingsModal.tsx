// src/components/SettingsModal.tsx

import { PerformanceDashboard } from './PerformanceDashboard';
import { YahooIntegrationFlow } from './YahooIntegrationFlow';
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
import { SleeperTeamSelector } from './SleeperTeamSelector';
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

  // Local state
  const [localConfig, setLocalConfig] = useState<DashboardConfig>(config);
  const [newLeagueId, setNewLeagueId] = useState('');
  const [newLeaguePlatform, setNewLeaguePlatform] = useState<Platform>('Sleeper');
  const [isValidLeague, setIsValidLeague] = useState(false);
  const [validatingLeague, setValidatingLeague] = useState<string | null>(null);

  // SHOW TEAM SELECTOR
  const [showTeamSelector, setShowTeamSelector] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // Validate League ID input
  const validateLeagueId = async (leagueId: string) => {
    setIsValidLeague(false);
    if (!leagueId.trim()) return;

    if (newLeaguePlatform === 'Sleeper') {
      const isValid = await sleeperAPIEnhanced.validateLeagueId(leagueId);
      setIsValidLeague(isValid);
    } else if (newLeaguePlatform === 'Yahoo') {
      // Only check presence of connection
      setIsValidLeague(isYahooConnected);
    } else {
      setIsValidLeague(true);
    }
  };

  // Handle league addition
  const validateAndAddLeague = async () => {
    if (!newLeagueId.trim()) {
      toast({ title: 'Error', description: 'Please enter a league ID', variant: 'destructive' });
      return;
    }

    setValidatingLeague(newLeagueId);

    try {
      if (newLeaguePlatform === 'Sleeper') {
        const isValid = await sleeperAPIEnhanced.validateLeagueId(newLeagueId);
        if (!isValid) throw new Error('Invalid league ID');
        // Show team selector instead of immediate add
        setShowTeamSelector(newLeagueId);
        return;
      }

      if (newLeaguePlatform === 'Yahoo') {
        if (!isYahooConnected) throw new Error('Please connect your Yahoo account first');
        // Add immediately for now
        const newLeague: LeagueConfig = {
          id: `league_${Date.now()}`,
          leagueId: newLeagueId,
          platform: 'Yahoo',
          enabled: true,
          customTeamName: `Yahoo League ${newLeagueId}`,
        };
        setLocalConfig(prev => ({ ...prev, leagues: [...prev.leagues, newLeague] }));
        setNewLeagueId('');
        setIsValidLeague(false);
        toast({ title: 'Success', description: `Added Yahoo league: ${newLeagueId}` });
        return;
      }

      // Other platforms
      const newLeague: LeagueConfig = {
        id: `league_${Date.now()}`,
        leagueId: newLeagueId,
        platform: newLeaguePlatform,
        enabled: true,
      };
      setLocalConfig(prev => ({ ...prev, leagues: [...prev.leagues, newLeague] }));
      setNewLeagueId('');
      setIsValidLeague(false);
      toast({ title: 'Success', description: `Added ${newLeaguePlatform} league` });
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to add league: ${error.message}`, variant: 'destructive' });
    } finally {
      setValidatingLeague(null);
    }
  };

  // Remove a league
  const removeLeague = (leagueId: string) => {
    const updated = localConfig.leagues.filter(l => l.id !== leagueId);
    setLocalConfig({ ...localConfig, leagues: updated });
    updateConfig({ ...localConfig, leagues: updated });
    toast({ title: 'Success', description: 'League removed' });
  };

  // Save final config
  const saveConfig = () => {
    updateConfig(localConfig);
    onOpenChange(false);
    toast({ title: 'Success', description: 'Settings saved successfully' });
  };

  // Drag-and-drop end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localConfig.leagues.findIndex(l => l.id === active.id);
      const newIndex = localConfig.leagues.findIndex(l => l.id === over.id);
      const reordered = arrayMove(localConfig.leagues, oldIndex, newIndex);
      setLocalConfig({ ...localConfig, leagues: reordered });
      toast({ title: 'Success', description: 'League order updated' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
        </DialogHeader>

        {/* Leagues Tab */}
        <Tabs defaultValue="leagues">
          <TabsList>
            <TabsTrigger value="leagues">Leagues</TabsTrigger>
            <TabsTrigger value="polling">Polling</TabsTrigger>
            {/* other tabs omitted */}
          </TabsList>

          <TabsContent value="leagues">
            {/* Add New League */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Add New League</CardTitle>
                <CardDescription>Connect your fantasy leagues to the dashboard</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label>Platform</Label>
                <Select value={newLeaguePlatform} onValueChange={value => { setNewLeaguePlatform(value as Platform); validateLeagueId(newLeagueId); }}>
                  <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sleeper">Sleeper</SelectItem>
                    <SelectItem value="Yahoo">Yahoo</SelectItem>
                    <SelectItem value="NFL.com">NFL.com (Coming Soon)</SelectItem>
                    <SelectItem value="ESPN">ESPN (Coming Soon)</SelectItem>
                  </SelectContent>
                </Select>

                <Label>League ID</Label>
                <div className="relative">
                  <Input
                    value={newLeagueId}
                    onChange={e => { setNewLeagueId(e.target.value); validateLeagueId(e.target.value); }}
                    placeholder="Example: 1207878742588792832"
                    className={isValidLeague && newLeagueId ? 'pr-8' : ''}
                  />
                  {isValidLeague && newLeagueId && (
                    <Button size="icon" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={validateAndAddLeague}>
                      <Check size={16} />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Connected Leagues */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Connected Leagues</CardTitle>
              </CardHeader>
              <CardContent>
                {localConfig.leagues.length === 0 ? (
                  <p>No leagues connected yet. Add a league above to get started.</p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={localConfig.leagues.map(l => l.id)} strategy={verticalListSortingStrategy}>
                      {localConfig.leagues.map(league => (
                        <DraggableLeagueItem
                          key={league.id}
                          league={league}
                          onRemove={() => removeLeague(league.id)}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                )}
              </CardContent>
            </Card>

            {/* Team Selector Modal */}
            {showTeamSelector && (
              <SleeperTeamSelector
                leagueId={showTeamSelector}
                selectedUserId={localConfig.leagues.find(l => l.leagueId === showTeamSelector)?.sleeperUserId}
                onTeamSelected={(userId, teamName) => {
                  const league = localConfig.leagues.find(l => l.leagueId === showTeamSelector);
                  if (!league) return;
                  const updated = localConfig.leagues.map(l =>
                    l.leagueId === showTeamSelector
                      ? { ...l, customTeamName: teamName, sleeperUserId: userId }
                      : l
                  );
                  setLocalConfig({ ...localConfig, leagues: updated });
                  setShowTeamSelector(null);
                  setNewLeagueId('');
                  toast({ title: 'Success', description: `Added league: ${teamName}` });
                }}
              />
            )}
          </TabsContent>

          {/* Polling Tab */}
          <TabsContent value="polling">
            {/* existing polling settings omitted */}
          </TabsContent>

          {/* other tabs omitted */}

        </Tabs>

        <div className="mt-6 text-right">
          <Button onClick={saveConfig}>Save Settings</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
