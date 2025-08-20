import { ScoringEvent } from '../types/fantasy';

const MOCK_PLAYERS = [
  { name: 'J. Jefferson', position: 'WR' },
  { name: 'C. McCaffrey', position: 'RB' },
  { name: 'J. Allen', position: 'QB' },
  { name: 'T. Kelce', position: 'TE' },
  { name: 'D. Henry', position: 'RB' },
  { name: 'S. Diggs', position: 'WR' },
  { name: 'L. Jackson', position: 'QB' },
  { name: 'A. Ekeler', position: 'RB' },
  { name: 'T. Hill', position: 'WR' },
  { name: 'M. Andrews', position: 'TE' },
  { name: 'J. Tucker', position: 'K' },
  { name: 'SF DST', position: 'DST' },
];

const SCORING_ACTIONS = {
  QB: [
    { action: 'yard TD pass', points: [4, 6] },
    { action: 'yard rushing TD', points: [6] },
    { action: 'passing yards', points: [0.5, 1, 1.5, 2] },
    { action: 'interception', points: [-2] },
    { action: 'fumble lost', points: [-2] },
  ],
  RB: [
    { action: 'yard rushing TD', points: [6] },
    { action: 'yard receiving TD', points: [6] },
    { action: 'rushing yards', points: [1, 2, 3] },
    { action: 'yard reception', points: [0.5, 1] },
    { action: 'fumble lost', points: [-2] },
  ],
  WR: [
    { action: 'yard TD catch', points: [6, 6.2, 6.5] },
    { action: 'yard reception', points: [0.5, 1, 1.5, 2] },
    { action: 'yard rushing TD', points: [6] },
    { action: 'fumble lost', points: [-2] },
  ],
  TE: [
    { action: 'yard TD catch', points: [6, 6.2] },
    { action: 'yard reception', points: [0.5, 1, 1.5] },
    { action: 'fumble lost', points: [-2] },
  ],
  K: [
    { action: 'yard FG', points: [3, 4, 5] },
    { action: 'extra point', points: [1] },
    { action: 'missed FG', points: [-1] },
  ],
  DST: [
    { action: 'interception TD', points: [8] },
    { action: 'fumble recovery TD', points: [8] },
    { action: 'sack', points: [1, 2] },
    { action: 'interception', points: [2] },
    { action: 'fumble recovery', points: [2] },
    { action: 'safety', points: [2] },
  ],
};

export const generateMockScoringEvent = (): ScoringEvent => {
  const player = MOCK_PLAYERS[Math.floor(Math.random() * MOCK_PLAYERS.length)];
  const actions = SCORING_ACTIONS[player.position as keyof typeof SCORING_ACTIONS];
  const selectedAction = actions[Math.floor(Math.random() * actions.length)];
  
  // Generate random yardage for applicable actions
  const yardage = Math.floor(Math.random() * 50) + 1;
  const actionText = selectedAction.action.includes('yard') 
    ? `${yardage}-${selectedAction.action}` 
    : selectedAction.action;
  
  // Select random points from the action's possible points
  const scoreImpact = selectedAction.points[Math.floor(Math.random() * selectedAction.points.length)];
  
  // Generate current time
  const now = new Date();
  const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Calculate weekly points (mock data)
  const weeklyPoints = Number((Math.random() * 25 + 5).toFixed(1));

  return {
    id: `mock_${Date.now()}_${Math.random()}`,
    playerName: player.name,
    position: player.position,
    action: actionText,
    scoreImpact: Number(scoreImpact.toFixed(1)),
    timestamp,
    weeklyPoints,
    isRecent: true,
  };
};

export const generateMultipleMockEvents = (count: number = 4): ScoringEvent[] => {
  const events: ScoringEvent[] = [];
  
  for (let i = 0; i < count; i++) {
    const event = generateMockScoringEvent();
    // Make only the first event recent, others are older
    event.isRecent = i === 0;
    // Adjust timestamp to simulate different times
    const baseTime = new Date();
    baseTime.setMinutes(baseTime.getMinutes() - (i * 15));
    event.timestamp = baseTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    events.push(event);
  }
  
  return events;
};