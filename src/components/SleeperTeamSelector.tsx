import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { sleeperAPIEnhanced } from '../services/SleeperAPIEnhanced';
import { toast } from './ui/use-toast';

interface SleeperTeamSelectorProps {
  leagueId: string;
  onTeamSelected: (userId: string, teamName: string) => void;
  selectedUserId?: string;
}

export const SleeperTeamSelector = ({ leagueId, onTeamSelected, selectedUserId }: SleeperTeamSelectorProps) => {
  const [users, setUsers] = useState([]);
  const [rosters, setRosters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeagueData = async () => {
      try {
        const [usersData, rostersData] = await Promise.all([
          sleeperAPIEnhanced.getUsers(leagueId),
          sleeperAPIEnhanced.getRosters(leagueId)
        ]);
        setUsers(usersData);
        setRosters(rostersData);
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to load league teams',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    };
    fetchLeagueData();
  }, [leagueId]);

  const handleTeamSelection = (userId: string) => {
    const user = users.find(u => u.user_id === userId);
    const roster = rosters.find(r => r.owner_id === userId);
    const teamName = user?.metadata?.team_name || user?.display_name || user?.username || `Team ${roster?.roster_id}`;
    onTeamSelected(userId, teamName);
  };

  if (loading) return <div>Loading teams...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Your Team</CardTitle>
      </CardHeader>
      <CardContent>
        <Select value={selectedUserId} onValueChange={handleTeamSelection}>
          <SelectTrigger>
            <SelectValue placeholder="Choose your team..." />
          </SelectTrigger>
          <SelectContent>
            {users.map((user) => {
              const roster = rosters.find(r => r.owner_id === user.user_id);
              const teamName = user.metadata?.team_name || user.display_name || user.username;
              const record = roster ? `${roster.settings.wins}-${roster.settings.losses}` : '';
              return (
                <SelectItem key={user.user_id} value={user.user_id}>
                  {teamName} {record && `(${record})`}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
};
