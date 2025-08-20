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
      if (!isPulling) return

      setIsPulling(false)
      
      if (currentDistance >= distanceToRefresh) {
        setIsRefreshing(true)
        onRefresh().finally(() => {
          setTimeout(() => {
            setIsRefreshing(false)
            setPullDistance(0)
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
    }
  }, [isPulling, onRefresh, threshold, resistance, distanceToRefresh, refreshingTimeout])

  return {
    containerRef,
    isRefreshing,
    pullDistance,
    isPulling,
  }
}