import { LeagueData } from '../types/fantasy';
import { ScoringEvent } from './ScoringEvent';

interface LeagueBlockProps {
  league: LeagueData;
  onClick?: () => void;
}

export const LeagueBlock = ({ league, onClick }: LeagueBlockProps) => {
  const getStatusClass = () => {
    switch (league.status) {
      case 'winning':
        return 'league-block-winning';
      case 'losing':
        return 'league-block-losing';
      default:
        return 'league-block-neutral';
    }
  };

  const getPlatformClass = () => {
    return `platform-${league.platform.toLowerCase().replace('.com', '')}`;
  };

  // Sort events to show most recent first, limit to 4
  const sortedEvents = [...league.scoringEvents]
    .sort((a, b) => {
      if (a.isRecent && !b.isRecent) return -1;
      if (!a.isRecent && b.isRecent) return 1;
      return 0;
    })
    .slice(0, 4);

  return (
    <div 
      className={`league-block ${getStatusClass()} cursor-pointer`}
      onClick={onClick}
    >
      <div className="league-overlay" />
      <div className="league-content">
        {/* Header Section - 60px */}
        <div className="h-[60px] flex flex-col justify-between mb-4">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white leading-tight">
                {league.leagueName}
              </h3>
              <p className="text-sm font-semibold text-white/90">
                {league.teamName}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`platform-badge ${getPlatformClass()}`}>
                {league.platform}
              </span>
            </div>
          </div>
        </div>

        {/* Score Section - 100px */}
        <div className="h-[100px] flex flex-col mb-4">
          {/* Record and position at top */}
          <div className="flex justify-end mb-2">
            <div className="text-right">
              <div className="text-xs font-semibold text-white/90">
                {league.record}
              </div>
              <div className="text-xs text-white/70">
                {league.leaguePosition}
              </div>
            </div>
          </div>
          
          {/* Scores centered */}
          <div className="flex-1 flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-white">
                {league.myScore}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm text-white/70 mb-1">VS</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-white">
                {league.opponentScore}
              </div>
            </div>
          </div>
          
          {/* Opponent name at bottom */}
          <div className="text-xs text-white/70 text-center">
            vs {league.opponentName}
          </div>
        </div>

        {/* Scoring Events Section - 290px */}
        <div className="flex-1 flex flex-col">
          <h4 className="text-sm font-bold text-white mb-3">
            Recent Activity
          </h4>
          <div className="flex-1 overflow-y-auto space-y-2">
            {sortedEvents.map((event) => (
              <ScoringEvent key={event.id} event={event} />
            ))}
          </div>
          
          {/* Last Updated */}
          <div className="mt-3 pt-2 border-t border-white/20">
            <p className="text-xs text-white/60 text-center">
              Updated {league.lastUpdated}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};