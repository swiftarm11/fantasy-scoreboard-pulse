import { LeagueData } from '../types/fantasy'
import { EnhancedScoringEvent } from './EnhancedScoringEvent'
import { useEventAnimations } from '../hooks/useEventAnimations'
import { useEffect, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { useDeviceCapabilities } from '../hooks/use-mobile'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { useState } from 'react'

interface MobileLeagueCardProps {
  league: LeagueData
  onClick?: () => void
  onRemove?: () => void
  onLongPress?: () => void
}

export const MobileLeagueCard = ({ league, onClick, onRemove, onLongPress }: MobileLeagueCardProps) => {
  const { triggerPulseAnimation } = useEventAnimations()
  const { hasHaptics } = useDeviceCapabilities()
  const prevEventsRef = useRef<string[]>([])
  const [showActions, setShowActions] = useState(false)
  const longPressTimer = useRef<NodeJS.Timeout>()

  const getStatusClass = () => {
    switch (league.status) {
      case 'winning':
        return 'league-block-winning'
      case 'losing':
        return 'league-block-losing'
      default:
        return 'league-block-neutral'
    }
  }

  const getPlatformClass = () => {
    return `platform-${league.platform.toLowerCase().replace('.com', '')}`
  }

  // Sort events: most recent first
  const sortedEvents = [...league.scoringEvents]
    .sort((a, b) => {
      if (a.isRecent && !b.isRecent) return -1
      if (!a.isRecent && b.isRecent) return 1
      const timeA = new Date(`1970/01/01 ${a.timestamp}`).getTime()
      const timeB = new Date(`1970/01/01 ${b.timestamp}`).getTime()
      return timeB - timeA
    })
    .slice(0, 3) // Show fewer events on mobile

  // Detect new events and trigger animations
  useEffect(() => {
    const currentEventIds = league.scoringEvents.map(e => e.id)
    const prevEventIds = prevEventsRef.current
    
    const newEvents = currentEventIds.filter(id => !prevEventIds.includes(id))
    
    if (newEvents.length > 0) {
      const recentEvent = league.scoringEvents.find(e => 
        newEvents.includes(e.id) && e.isRecent
      )
      
      if (recentEvent) {
        let color: 'green' | 'red' | 'blue' = 'blue'
        if (recentEvent.scoreImpact > 0) color = 'green'
        else if (recentEvent.scoreImpact < 0) color = 'red'
        
        triggerPulseAnimation(`mobile-league-${league.id}`, { 
          color, 
          pulseCount: 2, 
          duration: 1000 
        })

        // Haptic feedback for scoring events
        if (hasHaptics) {
          navigator.vibrate?.(recentEvent.scoreImpact > 0 ? [50, 50, 50] : [100])
        }
      }
    }
    
    prevEventsRef.current = currentEventIds
  }, [league.scoringEvents, league.id, triggerPulseAnimation, hasHaptics])

  const swipeHandlers = useSwipeable({
    onSwipedRight: () => {
      if (onRemove) {
        setShowActions(true)
        if (hasHaptics) navigator.vibrate?.(50)
      }
    },
    onSwipedLeft: () => {
      setShowActions(false)
    },
    trackMouse: false,
    preventScrollOnSwipe: true,
  })

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      if (onLongPress) {
        onLongPress()
        if (hasHaptics) navigator.vibrate?.(100)
      }
    }, 500)
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
    }
  }

  return (
    <div className="relative">
      <div
        {...swipeHandlers}
        id={`mobile-league-${league.id}`}
        className={`mobile-league-card ${getStatusClass()} cursor-pointer transition-all duration-300 ${
          showActions ? 'translate-x-[-80px]' : ''
        }`}
        onClick={onClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <div className="league-overlay" />
        <div className="league-content p-4">
          {/* Header - Compact */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-white truncate">
                {league.leagueName}
              </h3>
              <p className="text-sm text-white/90 truncate">
                {league.teamName}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1 ml-2">
              <span className={`platform-badge text-xs ${getPlatformClass()}`}>
                {league.platform}
              </span>
              <div className="text-xs text-white/70 text-right">
                {league.record}
              </div>
            </div>
          </div>

          {/* Score Section - Compact */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {league.myScore}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-white/70">VS</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">
                {league.opponentScore}
              </div>
            </div>
          </div>

          <div className="text-xs text-white/70 text-center mb-3">
            vs {league.opponentName}
          </div>

          {/* Recent Activity - Compact */}
          <div>
            <h4 className="text-sm font-bold text-white mb-2">
              Recent Activity
            </h4>
            <div className="space-y-1">
              {sortedEvents.slice(0, 2).map((event) => (
                <EnhancedScoringEvent 
                  key={event.id} 
                  event={event} 
                  isRecent={event.isRecent}
                  compact={true}
                />
              ))}
              {sortedEvents.length === 0 && (
                <div className="text-xs text-white/40 p-2">
                  No recent activity
                </div>
              )}
            </div>
          </div>

          {/* Last Updated */}
          <div className="mt-3 pt-2 border-t border-white/20">
            <p className="text-xs text-white/60 text-center">
              Updated {league.lastUpdated}
            </p>
          </div>
        </div>
      </div>

      {/* Swipe Actions */}
      {showActions && onRemove && (
        <div className="absolute right-0 top-0 h-full flex items-center">
          <Button
            variant="destructive"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
              setShowActions(false)
            }}
            className="h-full rounded-l-none"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}