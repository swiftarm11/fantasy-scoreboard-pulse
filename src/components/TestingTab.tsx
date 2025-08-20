import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Label } from './ui/label';
import { Zap, TestTube } from 'lucide-react';
import { toast } from './ui/use-toast';
import { LeagueConfig } from '../types/config';
import { generateMockScoringEvent } from '../utils/mockEventGenerator';

interface TestingTabProps {
  leagues: LeagueConfig[];
  onMockEvent: (leagueId: string, event: any) => void;
}

export const TestingTab = ({ leagues, onMockEvent }: TestingTabProps) => {
  const [selectedLeague, setSelectedLeague] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateEvent = async () => {
    if (!selectedLeague) {
      toast({
        title: 'Error',
        description: 'Please select a league first',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      // Generate mock event
        const mockEvent = generateMockScoringEvent();
      
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Trigger the event
      onMockEvent(selectedLeague, mockEvent);
      
      toast({
        title: 'Success',
        description: `Generated ${mockEvent.playerName} scoring event`,
      });
      
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate mock event',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateMultiple = async () => {
    if (!selectedLeague) {
      toast({
        title: 'Error',
        description: 'Please select a league first',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      // Generate 3 events with delays
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const mockEvent = generateMockScoringEvent();
        onMockEvent(selectedLeague, mockEvent);
      }
      
      toast({
        title: 'Success',
        description: 'Generated multiple scoring events',
      });
      
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to generate mock events',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            Mock Event Generator
          </CardTitle>
          <CardDescription>
            Generate mock scoring events to test animations and UI updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {leagues.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No leagues configured. Add a league first to test events.
            </p>
          ) : (
            <>
              <div>
                <Label htmlFor="test-league">Select League</Label>
                <Select value={selectedLeague} onValueChange={setSelectedLeague}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a league to test" />
                  </SelectTrigger>
                  <SelectContent>
                    {leagues.map((league) => (
                      <SelectItem key={league.id} value={league.id}>
                        {league.customTeamName || league.leagueId} ({league.platform})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerateEvent}
                  disabled={isGenerating || !selectedLeague}
                  className="flex-1"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {isGenerating ? 'Generating...' : 'Generate Event'}
                </Button>
                
                <Button
                  onClick={handleGenerateMultiple}
                  disabled={isGenerating || !selectedLeague}
                  variant="outline"
                  className="flex-1"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Generate Multiple
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>• Single event: Creates one random scoring event</p>
                <p>• Multiple events: Creates 3 events with 1-second delays</p>
                <p>• Events will trigger pulse animations on the selected league block</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};