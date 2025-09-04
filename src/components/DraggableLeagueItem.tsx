import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { LeagueConfig } from '../types/config';
import { safeLower } from '../utils/strings';

interface DraggableLeagueItemProps {
  league: LeagueConfig;
  onUpdate: (leagueId: string, updates: Partial<LeagueConfig>) => void;
  onRemove: (leagueId: string) => void;
}

export const DraggableLeagueItem = ({ league, onUpdate, onRemove }: DraggableLeagueItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: league.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-4 border rounded-lg bg-card ${
        isDragging ? 'opacity-50 shadow-lg' : ''
      }`}
    >
      <div className="flex items-center gap-3 flex-1">
        <div
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-semibold text-white platform-${safeLower(league.platform)}`}>
              {league.platform}
            </span>
            <span className="font-medium">{league.leagueId}</span>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Custom Team Name</Label>
                <Input
                  value={league.customTeamName || ''}
                  onChange={(e) => onUpdate(league.id, { customTeamName: e.target.value })}
                  placeholder="Custom team name"
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  checked={league.enabled}
                  onCheckedChange={(enabled) => onUpdate(league.id, { enabled })}
                />
                <Label>Enabled</Label>
              </div>
            </div>
            
            {league.platform === 'Sleeper' && (
              <div>
                <Label>Sleeper Username</Label>
                <Input
                  value={league.sleeperUsername || ''}
                  onChange={(e) => onUpdate(league.id, { sleeperUsername: e.target.value })}
                  placeholder="Your Sleeper username"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used to identify your team in this league
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <Button
        variant="destructive"
        size="sm"
        onClick={() => onRemove(league.id)}
        className="ml-4"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
};