import { LeagueData } from '../types/fantasy'
import { ChevronRight } from 'lucide-react'
import { Card } from './ui/card'

interface CompactLeagueSummaryProps {
  leagues: LeagueData[]
  onLeagueSelect: (league: LeagueData) => void
}

export const CompactLeagueSummary = ({ leagues, onLeagueSelect }: CompactLeagueSummaryProps) => {
  if (leagues.length === 0) return null

  return (
    <Card className="mx-4 mb-4 p-4 bg-card/50 backdrop-blur-sm">
      <h2 className="text-sm font-semibold text-muted-foreground mb-3">League Scores</h2>
      <div className="space-y-2">
        {leagues.slice(0, 4).map((league) => (
          <div
            key={league.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onLeagueSelect(league)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{league.leagueName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  league.status === 'winning' 
                    ? 'bg-green-500/20 text-green-400' 
                    : league.status === 'losing'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {league.record}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">
                {league.myScore}-{league.opponentScore}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ))}
        {leagues.length > 4 && (
          <div className="text-xs text-muted-foreground text-center pt-2">
            +{leagues.length - 4} more leagues
          </div>
        )}
      </div>
    </Card>
  )
}