import React from 'react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LeagueData } from '../types/fantasy';

interface CompactLeagueViewProps {
  league: LeagueData;
  className?: string;
  onClick?: () => void;
}

export const CompactLeagueView = ({ league, className, onClick }: CompactLeagueViewProps) => {
  const getTrendIcon = (trend: number) => {
    if (trend > 5) return <TrendingUp className="h-3 w-3 text-green-500" />;
    if (trend < -5) return <TrendingDown className="h-3 w-3 text-red-500" />;
    return <Minus className="h-3 w-3 text-muted-foreground" />;
  };

  const getWinProbabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-green-600 bg-green-50';
    if (prob >= 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  return (
    <Card 
      className={`transition-all hover:shadow-md ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <CardContent className="p-4">
        <div className="grid grid-cols-4 gap-4 items-center">
          {/* League Info */}
          <div className="space-y-1">
            <h3 className="font-semibold text-sm truncate">{league.leagueName}</h3>
            <div className="text-xs text-muted-foreground">
              Week {league.week || 'N/A'} • {league.platform}
            </div>
          </div>

          {/* Score */}
          <div className="text-center">
            <div className="text-lg font-bold">
              {league.myScore?.toFixed(1) || '0.0'}
            </div>
            <div className="text-xs text-muted-foreground">
              vs {league.opponentScore?.toFixed(1) || '0.0'}
            </div>
          </div>

          {/* Win Probability */}
          <div className="text-center">
            <Badge 
              variant="outline" 
              className={`${getWinProbabilityColor(league.winProbability || 0)} border-0`}
            >
              {league.winProbability?.toFixed(0) || '0'}%
            </Badge>
            <div className="flex items-center justify-center mt-1">
              {getTrendIcon(league.winProbabilityTrend || 0)}
            </div>
          </div>

          {/* Record & Rank */}
          <div className="text-center">
            <div className="font-medium text-sm">
              {league.record || '0-0'}
            </div>
            <div className="text-xs text-muted-foreground">
              {league.leaguePosition || 'N/A'}
            </div>
          </div>
        </div>

        {/* Recent Events - Compact */}
        {league.scoringEvents && league.scoringEvents.length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">Latest:</span>
              <span className="text-muted-foreground truncate">
                {league.scoringEvents[0].playerName} {league.scoringEvents[0].action} 
                {league.scoringEvents[0].scoreImpact > 0 && ` (+${league.scoringEvents[0].scoreImpact})`}
              </span>
              {league.scoringEvents.length > 1 && (
                <Badge variant="secondary" className="text-xs">
                  +{league.scoringEvents.length - 1} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};