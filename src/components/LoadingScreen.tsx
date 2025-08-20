import { useEffect, useState } from 'react';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';

interface LoadingScreenProps {
  isLoading: boolean;
  loadingStage?: string;
  progress?: number;
  leagues?: any[];
}

const teamLogos = [
  '🏈', '⚡', '🔥', '🌟', '💎', '🚀', '⭐', '🏆', '💪', '🎯'
];

export const LoadingScreen = ({ 
  isLoading, 
  loadingStage = 'Initializing...', 
  progress = 0,
  leagues = []
}: LoadingScreenProps) => {
  const [currentLogoIndex, setCurrentLogoIndex] = useState(0);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    if (!isLoading) return;

    const logoInterval = setInterval(() => {
      setCurrentLogoIndex((prev) => (prev + 1) % teamLogos.length);
    }, 200);

    return () => clearInterval(logoInterval);
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading) return;

    const progressInterval = setInterval(() => {
      setAnimatedProgress((prev) => {
        if (prev < progress) {
          return Math.min(prev + 2, progress);
        }
        return prev;
      });
    }, 50);

    return () => clearInterval(progressInterval);
  }, [isLoading, progress]);

  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <Card className="w-full max-w-md mx-4">
        <div className="p-8 text-center space-y-6">
          {/* Animated Logo */}
          <div className="relative">
            <div className="text-6xl mb-4 transition-all duration-200 transform hover:scale-110">
              {teamLogos[currentLogoIndex]}
            </div>
            <div className="absolute inset-0 animate-pulse bg-primary/20 rounded-full blur-xl"></div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              Fantasy Football Dashboard
            </h2>
            <p className="text-muted-foreground">
              Loading your leagues and data...
            </p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress value={animatedProgress} className="w-full" />
            <p className="text-sm text-muted-foreground">
              {loadingStage}
            </p>
          </div>

          {/* Connected Leagues */}
          {leagues.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Connected Leagues:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {leagues.map((league, index) => (
                  <Badge 
                    key={league.id || index} 
                    variant="secondary"
                    className="text-xs"
                  >
                    {league.platform || 'Unknown'}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Loading Animation */}
          <div className="flex justify-center space-x-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 bg-primary rounded-full animate-bounce"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '0.6s'
                }}
              />
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};