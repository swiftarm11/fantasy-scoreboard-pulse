import * as React from "react"

// Responsive breakpoints
const BREAKPOINTS = {
  mobile: 768,
  tablet: 992,
  laptop: 1200,
} as const

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINTS.mobile - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < BREAKPOINTS.mobile)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < BREAKPOINTS.mobile)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}

export function useResponsiveBreakpoint() {
  const [breakpoint, setBreakpoint] = React.useState<'mobile' | 'tablet' | 'laptop' | 'desktop'>('desktop')

  React.useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth
      if (width < BREAKPOINTS.mobile) {
        setBreakpoint('mobile')
      } else if (width < BREAKPOINTS.tablet) {
        setBreakpoint('tablet')
      } else if (width < BREAKPOINTS.laptop) {
        setBreakpoint('laptop')
      } else {
        setBreakpoint('desktop')
      }
    }

    updateBreakpoint()
    window.addEventListener('resize', updateBreakpoint)
    return () => window.removeEventListener('resize', updateBreakpoint)
  }, [])

  return breakpoint
}

export function useDeviceCapabilities() {
  const [capabilities, setCapabilities] = React.useState({
    hasHaptics: false,
    isTouch: false,
    prefersReducedMotion: false,
  })

  React.useEffect(() => {
    setCapabilities({
      hasHaptics: 'vibrate' in navigator,
      isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
      prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
  }, [])

  return capabilities
}
