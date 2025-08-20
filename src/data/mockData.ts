import { LeagueData } from '../types/fantasy';

export const mockLeagueData: LeagueData[] = [
  {
    id: '1',
    leagueName: 'The Gridiron Gladiators',
    platform: 'Sleeper',
    teamName: 'Thunder Bolts',
    myScore: 127.4,
    opponentScore: 89.2,
    opponentName: 'Lightning Strikes',
    record: '7-2',
    leaguePosition: '2nd place',
    status: 'winning',
    scoringEvents: [
      {
        id: '1-1',
        playerName: 'J. Jefferson',
        position: 'WR',
        weeklyPoints: 18.6,
        action: '45-yard receiving TD',
        scoreImpact: 6.0,
        timestamp: '2:14 PM'
      },
      {
        id: '1-2',
        playerName: 'J. Allen',
        position: 'QB',
        weeklyPoints: 24.8,
        action: '12-yard rushing TD',
        scoreImpact: 6.0,
        timestamp: '1:47 PM',
        isRecent: true
      },
      {
        id: '1-3',
        playerName: 'D. Cook',
        position: 'RB',
        weeklyPoints: 11.2,
        action: '23-yard rush',
        scoreImpact: 2.3,
        timestamp: '1:23 PM'
      },
      {
        id: '1-4',
        playerName: 'T. Kelce',
        position: 'TE',
        weeklyPoints: 15.4,
        action: '34-yard reception',
        scoreImpact: 3.4,
        timestamp: '12:58 PM'
      }
    ],
    lastUpdated: '3 minutes ago'
  },
  {
    id: '2',
    leagueName: 'Sunday Funday League',
    platform: 'Yahoo',
    teamName: 'Playoff Bound',
    myScore: 82.1,
    opponentScore: 118.7,
    opponentName: 'Championship Chasers',
    record: '4-5',
    leaguePosition: '8th place',
    status: 'losing',
    scoringEvents: [
      {
        id: '2-1',
        playerName: 'C. McCaffrey',
        position: 'RB',
        weeklyPoints: 8.3,
        action: 'Fumble lost at midfield',
        scoreImpact: -2.0,
        timestamp: '3:21 PM'
      },
      {
        id: '2-2',
        playerName: 'M. Evans',
        position: 'WR',
        weeklyPoints: 5.7,
        action: '19-yard reception',
        scoreImpact: 1.9,
        timestamp: '2:45 PM'
      },
      {
        id: '2-3',
        playerName: 'L. Jackson',
        position: 'QB',
        weeklyPoints: 19.2,
        action: '8-yard rushing TD',
        scoreImpact: 6.0,
        timestamp: '2:12 PM',
        isRecent: true
      },
      {
        id: '2-4',
        playerName: 'Cowboys DEF',
        position: 'DEF',
        weeklyPoints: 2.0,
        action: 'QB sack for 7-yard loss',
        scoreImpact: 1.0,
        timestamp: '1:55 PM'
      }
    ],
    lastUpdated: '7 minutes ago'
  },
  {
    id: '3',
    leagueName: 'Office Champions',
    platform: 'NFL.com',
    teamName: 'Desk Warriors',
    myScore: 105.8,
    opponentScore: 106.1,
    opponentName: 'Coffee Crushers',
    record: '6-3',
    leaguePosition: '4th place',
    status: 'losing',
    scoringEvents: [
      {
        id: '3-1',
        playerName: 'A. Ekeler',
        position: 'RB',
        weeklyPoints: 14.6,
        action: '15-yard receiving TD',
        scoreImpact: 6.0,
        timestamp: '4:12 PM',
        isRecent: true
      },
      {
        id: '3-2',
        playerName: 'D. Adams',
        position: 'WR',
        weeklyPoints: 12.8,
        action: '42-yard reception',
        scoreImpact: 4.2,
        timestamp: '3:34 PM'
      },
      {
        id: '3-3',
        playerName: 'P. Mahomes',
        position: 'QB',
        weeklyPoints: 21.4,
        action: '28-yard passing TD',
        scoreImpact: 4.0,
        timestamp: '3:01 PM'
      },
      {
        id: '3-4',
        playerName: 'J. Tucker',
        position: 'K',
        weeklyPoints: 8.0,
        action: '47-yard field goal',
        scoreImpact: 3.0,
        timestamp: '2:47 PM'
      }
    ],
    lastUpdated: '2 minutes ago'
  },
  {
    id: '4',
    leagueName: 'Fantasy Fanatics',
    platform: 'ESPN',
    teamName: 'Touchdown Titans',
    myScore: 134.9,
    opponentScore: 95.3,
    opponentName: 'Bench Warmers',
    record: '8-1',
    leaguePosition: '1st place',
    status: 'winning',
    scoringEvents: [
      {
        id: '4-1',
        playerName: 'T. Hill',
        position: 'WR',
        weeklyPoints: 22.1,
        action: '67-yard receiving TD',
        scoreImpact: 6.0,
        timestamp: '3:45 PM'
      },
      {
        id: '4-2',
        playerName: 'J. Hurts',
        position: 'QB',
        weeklyPoints: 28.6,
        action: '3-yard rushing TD',
        scoreImpact: 6.0,
        timestamp: '3:18 PM',
        isRecent: true
      },
      {
        id: '4-3',
        playerName: 'C. Kupp',
        position: 'WR',
        weeklyPoints: 16.9,
        action: '38-yard reception',
        scoreImpact: 3.8,
        timestamp: '2:56 PM'
      },
      {
        id: '4-4',
        playerName: 'N. Chubb',
        position: 'RB',
        weeklyPoints: 19.7,
        action: '52-yard rush',
        scoreImpact: 5.2,
        timestamp: '2:29 PM'
      }
    ],
    lastUpdated: '1 minute ago'
  },
  {
    id: '5',
    leagueName: 'Dynasty Dominators',
    platform: 'Sleeper',
    teamName: 'Future Legends',
    myScore: 98.4,
    opponentScore: 98.4,
    opponentName: 'Rookie Rising',
    record: '5-4',
    leaguePosition: '6th place',
    status: 'neutral',
    scoringEvents: [
      {
        id: '5-1',
        playerName: 'B. Robinson',
        position: 'RB',
        weeklyPoints: 13.2,
        action: '5-yard rushing TD',
        scoreImpact: 6.0,
        timestamp: '4:01 PM'
      },
      {
        id: '5-2',
        playerName: 'G. Wilson',
        position: 'WR',
        weeklyPoints: 9.8,
        action: '31-yard reception',
        scoreImpact: 3.1,
        timestamp: '3:29 PM',
        isRecent: true
      },
      {
        id: '5-3',
        playerName: 'K. Murray',
        position: 'QB',
        weeklyPoints: 16.1,
        action: '18-yard completion',
        scoreImpact: 0.7,
        timestamp: '3:07 PM'
      },
      {
        id: '5-4',
        playerName: '49ers DEF',
        position: 'DEF',
        weeklyPoints: 12.0,
        action: 'Interception return',
        scoreImpact: 2.0,
        timestamp: '2:41 PM'
      }
    ],
    lastUpdated: '5 minutes ago'
  }
];