import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LeagueData } from '../types/fantasy';

interface WinProbabilityTrendProps {
  league: LeagueData;
  className?: string;
}

export const WinProbabilityTrend = ({ league, className }: WinProbabilityTrendProps) => {
  const winProbability = league.winProbability || 0;
  const trend = league.winProbabilityTrend || 0;
  
  // Mock historical data for demonstration
  const historicalData = [
    { time: '1:00 PM', probability: 45 },
    { time: '4:00 PM', probability: 52 },
    { time: '8:00 PM', probability: winProbability },
  ];

  const getTrendIcon = () => {
    if (trend > 5) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend < -5) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-muted-foreground" />;
  };

  const getTrendColor = () => {
    if (trend > 5) return 'text-green-600';
    if (trend < -5) return 'text-red-600';
    return 'text-muted-foreground';
  };

  const getProbabilityColor = (prob: number) => {
    if (prob >= 70) return 'text-green-600';
    if (prob >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Win Probability Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Current Probability */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current</span>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-lg ${getProbabilityColor(winProbability)}`}>
                {winProbability.toFixed(0)}%
              </span>
              {getTrendIcon()}
              <span className={`text-sm ${getTrendColor()}`}>
                {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Trend Line Visualization */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Today's Trend</div>
            <div className="flex items-end space-x-1 h-12">
              {historicalData.map((point, index) => (
                <div key={index} className="flex flex-col items-center flex-1">
                  <div 
                    className="w-full bg-primary rounded-t-sm transition-all"
                    style={{ 
                      height: `${(point.probability / 100) * 100}%`,
                      minHeight: '4px',
                      opacity: index === historicalData.length - 1 ? 1 : 0.6
                    }}
                  />
                  <span className="text-xs text-muted-foreground mt-1">
                    {point.time}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Key Stats */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Peak Today</div>
              <div className="font-medium text-sm">
                {Math.max(...historicalData.map(d => d.probability))}%
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Low Today</div>
              <div className="font-medium text-sm">
                {Math.min(...historicalData.map(d => d.probability))}%
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};