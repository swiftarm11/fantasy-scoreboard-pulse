import { useEffect, useRef, useState } from 'react'

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number
  resistance?: number
  distanceToRefresh?: number
  refreshingTimeout?: number
}

export function usePullToRefresh({
  onRefresh,
  threshold = 120,
  resistance = 2.5,
  distanceToRefresh = 80,
  refreshingTimeout = 1000,
}: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  
  const touchStartY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Add throttling to prevent rapid consecutive refreshes
  const lastRefreshRef = useRef<number>(0)
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let touchStart = 0
    let currentDistance = 0

    const handleTouchStart = (e: TouchEvent) => {
      // Only allow pull-to-refresh at top of scroll
      if (container.scrollTop > 0) return
      
      touchStart = e.touches[0].clientY
      touchStartY.current = touchStart
      setIsPulling(true)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || container.scrollTop > 0) return

      const touchY = e.touches[0].clientY
      const distance = Math.max(0, (touchY - touchStart) / resistance)
      
      currentDistance = Math.min(distance, threshold)
      setPullDistance(currentDistance)

      if (currentDistance > 0) {
        e.preventDefault()
      }
    }

    const handleTouchEnd = () => {
      setIsPulling(false)
      
      // Throttle refreshes - minimum 3 seconds between refreshes
      const now = Date.now()
      if (now - lastRefreshRef.current < 3000) {
        console.log('Pull to refresh throttled - too frequent')
        setPullDistance(0)
        return
      }

      if (currentDistance >= distanceToRefresh && !isRefreshing) {
        lastRefreshRef.current = now
        setIsRefreshing(true)
        
        // Clear any existing timeout
        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current)
        }
        
        onRefresh()
          .catch(error => {
            console.error('Pull to refresh error:', error)
          })
          .finally(() => {
            refreshTimeoutRef.current = setTimeout(() => {
              setIsRefreshing(false)
              setPullDistance(0)
              refreshTimeoutRef.current = null
            }, refreshingTimeout)
          })
      } else {
        setPullDistance(0)
      }
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      
      // Clear timeout on cleanup
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
        refreshTimeoutRef.current = null
      }
    }
  }, [isPulling, onRefresh, threshold, resistance, distanceToRefresh, refreshingTimeout])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    isPulling,
  }
}