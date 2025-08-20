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
        scoreImpact: 8.2,
        timestamp: '2:14 PM'
      },
      {
        id: '1-2',
        playerName: 'J. Allen',
        position: 'QB',
        weeklyPoints: 24.8,
        action: '2 passing TDs',
        scoreImpact: 12.4,
        timestamp: '1:47 PM',
        isRecent: true
      },
      {
        id: '1-3',
        playerName: 'D. Cook',
        position: 'RB',
        weeklyPoints: 11.2,
        action: '67 rushing yards',
        scoreImpact: 6.7,
        timestamp: '1:23 PM'
      },
      {
        id: '1-4',
        playerName: 'T. Kelce',
        position: 'TE',
        weeklyPoints: 15.4,
        action: '89 receiving yards',
        scoreImpact: 8.9,
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
        action: 'Fumble lost',
        scoreImpact: -2.0,
        timestamp: '3:21 PM'
      },
      {
        id: '2-2',
        playerName: 'M. Evans',
        position: 'WR',
        weeklyPoints: 5.7,
        action: '34 receiving yards',
        scoreImpact: 3.4,
        timestamp: '2:45 PM'
      },
      {
        id: '2-3',
        playerName: 'L. Jackson',
        position: 'QB',
        weeklyPoints: 19.2,
        action: '1 rushing TD',
        scoreImpact: 6.0,
        timestamp: '2:12 PM',
        isRecent: true
      },
      {
        id: '2-4',
        playerName: 'Cowboys DEF',
        position: 'DEF',
        weeklyPoints: 2.0,
        action: '28 points allowed',
        scoreImpact: -3.0,
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
        action: '1 receiving TD',
        scoreImpact: 6.0,
        timestamp: '4:12 PM',
        isRecent: true
      },
      {
        id: '3-2',
        playerName: 'D. Adams',
        position: 'WR',
        weeklyPoints: 12.8,
        action: '78 receiving yards',
        scoreImpact: 7.8,
        timestamp: '3:34 PM'
      },
      {
        id: '3-3',
        playerName: 'P. Mahomes',
        position: 'QB',
        weeklyPoints: 21.4,
        action: '3 passing TDs',
        scoreImpact: 18.0,
        timestamp: '3:01 PM'
      },
      {
        id: '3-4',
        playerName: 'J. Tucker',
        position: 'K',
        weeklyPoints: 8.0,
        action: '2 field goals made',
        scoreImpact: 6.0,
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
        action: '2 receiving TDs',
        scoreImpact: 12.0,
        timestamp: '3:45 PM'
      },
      {
        id: '4-2',
        playerName: 'J. Hurts',
        position: 'QB',
        weeklyPoints: 28.6,
        action: '1 rushing, 2 passing TDs',
        scoreImpact: 18.0,
        timestamp: '3:18 PM',
        isRecent: true
      },
      {
        id: '4-3',
        playerName: 'C. Kupp',
        position: 'WR',
        weeklyPoints: 16.9,
        action: '103 receiving yards',
        scoreImpact: 10.3,
        timestamp: '2:56 PM'
      },
      {
        id: '4-4',
        playerName: 'N. Chubb',
        position: 'RB',
        weeklyPoints: 19.7,
        action: '127 rushing yards',
        scoreImpact: 12.7,
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
        action: '1 rushing TD',
        scoreImpact: 6.0,
        timestamp: '4:01 PM'
      },
      {
        id: '5-2',
        playerName: 'G. Wilson',
        position: 'WR',
        weeklyPoints: 9.8,
        action: '62 receiving yards',
        scoreImpact: 6.2,
        timestamp: '3:29 PM',
        isRecent: true
      },
      {
        id: '5-3',
        playerName: 'K. Murray',
        position: 'QB',
        weeklyPoints: 16.1,
        action: '251 passing yards',
        scoreImpact: 10.1,
        timestamp: '3:07 PM'
      },
      {
        id: '5-4',
        playerName: '49ers DEF',
        position: 'DEF',
        weeklyPoints: 12.0,
        action: '2 sacks, 1 INT',
        scoreImpact: 8.0,
        timestamp: '2:41 PM'
      }
    ],
    lastUpdated: '5 minutes ago'
  },
  {
    id: '6',
    leagueName: 'Weekend Warriors',
    platform: 'Yahoo',
    teamName: 'Gridiron Giants',
    myScore: 142.7,
    opponentScore: 109.8,
    opponentName: 'Field Goal Flops',
    record: '7-2',
    leaguePosition: '3rd place',
    status: 'winning',
    scoringEvents: [
      {
        id: '6-1',
        playerName: 'S. Barkley',
        position: 'RB',
        weeklyPoints: 26.4,
        action: '2 rushing TDs',
        scoreImpact: 12.0,
        timestamp: '4:23 PM',
        isRecent: true
      },
      {
        id: '6-2',
        playerName: 'M. Andrews',
        position: 'TE',
        weeklyPoints: 18.7,
        action: '1 receiving TD',
        scoreImpact: 6.0,
        timestamp: '3:52 PM'
      },
      {
        id: '6-3',
        playerName: 'A. Brown',
        position: 'WR',
        weeklyPoints: 15.3,
        action: '91 receiving yards',
        scoreImpact: 9.1,
        timestamp: '3:15 PM'
      },
      {
        id: '6-4',
        playerName: 'D. Prescott',
        position: 'QB',
        weeklyPoints: 23.9,
        action: '2 passing TDs',
        scoreImpact: 12.0,
        timestamp: '2:58 PM'
      }
    ],
    lastUpdated: '4 minutes ago'
  },
  {
    id: '7',
    leagueName: 'Championship Chase',
    platform: 'NFL.com',
    teamName: 'Victory Vipers',
    myScore: 76.3,
    opponentScore: 125.9,
    opponentName: 'Title Takers',
    record: '3-6',
    leaguePosition: '10th place',
    status: 'losing',
    scoringEvents: [
      {
        id: '7-1',
        playerName: 'A. Jones',
        position: 'RB',
        weeklyPoints: 4.2,
        action: '23 rushing yards',
        scoreImpact: 2.3,
        timestamp: '4:15 PM'
      },
      {
        id: '7-2',
        playerName: 'D. Johnson',
        position: 'WR',
        weeklyPoints: 3.8,
        action: '28 receiving yards',
        scoreImpact: 2.8,
        timestamp: '3:43 PM',
        isRecent: true
      },
      {
        id: '7-3',
        playerName: 'R. Wilson',
        position: 'QB',
        weeklyPoints: 12.7,
        action: '189 passing yards',
        scoreImpact: 7.6,
        timestamp: '3:22 PM'
      },
      {
        id: '7-4',
        playerName: 'Eagles DEF',
        position: 'DEF',
        weeklyPoints: 6.0,
        action: '1 fumble recovery',
        scoreImpact: 2.0,
        timestamp: '2:33 PM'
      }
    ],
    lastUpdated: '8 minutes ago'
  },
  {
    id: '8',
    leagueName: 'Elite Eight League',
    platform: 'ESPN',
    teamName: 'Power Players',
    myScore: 118.6,
    opponentScore: 92.1,
    opponentName: 'Bench Buddies',
    record: '6-3',
    leaguePosition: '5th place',
    status: 'winning',
    scoringEvents: [
      {
        id: '8-1',
        playerName: 'D. Henry',
        position: 'RB',
        weeklyPoints: 21.8,
        action: '1 rushing TD',
        scoreImpact: 6.0,
        timestamp: '4:08 PM'
      },
      {
        id: '8-2',
        playerName: 'J. Chase',
        position: 'WR',
        weeklyPoints: 17.4,
        action: '116 receiving yards',
        scoreImpact: 11.6,
        timestamp: '3:35 PM',
        isRecent: true
      },
      {
        id: '8-3',
        playerName: 'J. Burrow',
        position: 'QB',
        weeklyPoints: 25.2,
        action: '3 passing TDs',
        scoreImpact: 18.0,
        timestamp: '3:11 PM'
      },
      {
        id: '8-4',
        playerName: 'G. Kittle',
        position: 'TE',
        weeklyPoints: 13.9,
        action: '84 receiving yards',
        scoreImpact: 8.4,
        timestamp: '2:49 PM'
      }
    ],
    lastUpdated: '6 minutes ago'
  },
  {
    id: '9',
    leagueName: 'Rookie Rush',
    platform: 'Sleeper',
    teamName: 'Fresh Faces',
    myScore: 89.7,
    opponentScore: 113.4,
    opponentName: 'Veteran Victors',
    record: '2-7',
    leaguePosition: '11th place',
    status: 'losing',
    scoringEvents: [
      {
        id: '9-1',
        playerName: 'B. Young',
        position: 'QB',
        weeklyPoints: 8.9,
        action: '1 interception',
        scoreImpact: -2.0,
        timestamp: '4:31 PM'
      },
      {
        id: '9-2',
        playerName: 'J. Addison',
        position: 'WR',
        weeklyPoints: 11.6,
        action: '73 receiving yards',
        scoreImpact: 7.3,
        timestamp: '3:54 PM',
        isRecent: true
      },
      {
        id: '9-3',
        playerName: 'K. Walker',
        position: 'RB',
        weeklyPoints: 14.2,
        action: '88 rushing yards',
        scoreImpact: 8.8,
        timestamp: '3:27 PM'
      },
      {
        id: '9-4',
        playerName: 'D. Waller',
        position: 'TE',
        weeklyPoints: 7.1,
        action: '45 receiving yards',
        scoreImpact: 4.5,
        timestamp: '2:51 PM'
      }
    ],
    lastUpdated: '9 minutes ago'
  },
  {
    id: '10',
    leagueName: 'Final Four Fantasy',
    platform: 'Yahoo',
    teamName: 'Playoff Push',
    myScore: 111.3,
    opponentScore: 108.9,
    opponentName: 'Last Stand',
    record: '5-4',
    leaguePosition: '7th place',
    status: 'winning',
    scoringEvents: [
      {
        id: '10-1',
        playerName: 'D. Swift',
        position: 'RB',
        weeklyPoints: 16.8,
        action: '1 receiving TD',
        scoreImpact: 6.0,
        timestamp: '4:17 PM'
      },
      {
        id: '10-2',
        playerName: 'C. Lamb',
        position: 'WR',
        weeklyPoints: 19.3,
        action: '124 receiving yards',
        scoreImpact: 12.4,
        timestamp: '3:41 PM',
        isRecent: true
      },
      {
        id: '10-3',
        playerName: 'A. Rodgers',
        position: 'QB',
        weeklyPoints: 22.1,
        action: '2 passing TDs',
        scoreImpact: 12.0,
        timestamp: '3:09 PM'
      },
      {
        id: '10-4',
        playerName: 'Bills DEF',
        position: 'DEF',
        weeklyPoints: 14.0,
        action: '3 sacks, 1 TD',
        scoreImpact: 12.0,
        timestamp: '2:37 PM'
      }
    ],
    lastUpdated: '3 minutes ago'
  }
];