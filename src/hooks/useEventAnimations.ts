import { useCallback, useRef } from 'react';

interface AnimationOptions {
  pulseCount?: number;
  duration?: number;
  color?: 'green' | 'red' | 'blue';
}

export const useEventAnimations = () => {
  const animationTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastAnimationTime = useRef<Map<string, number>>(new Map());

  const triggerPulseAnimation = useCallback((
    elementId: string, 
    options: AnimationOptions = {}
  ) => {
    const { pulseCount = 2, duration = 1000, color = 'green' } = options;
    const now = Date.now();
    const lastTime = lastAnimationTime.current.get(elementId) || 0;
    
    // Debounce: max 1 animation per 2 seconds per element
    if (now - lastTime < 2000) {
      return;
    }

    lastAnimationTime.current.set(elementId, now);

    // Clear any existing timeout for this element
    const existingTimeout = animationTimeouts.current.get(elementId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const element = document.getElementById(elementId);
    if (!element) return;

    // Add pulse animation class
    const pulseClass = `pulse-animation-${color}`;
    element.classList.add(pulseClass);

    // Remove animation class after duration
    const timeout = setTimeout(() => {
      element.classList.remove(pulseClass);
      animationTimeouts.current.delete(elementId);
    }, duration);

    animationTimeouts.current.set(elementId, timeout);
  }, []);

  const triggerScrollInAnimation = useCallback((elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Add scroll-in animation
    element.classList.add('event-scroll-in');
    
    // Remove animation class after completion
    setTimeout(() => {
      element.classList.remove('event-scroll-in');
    }, 500);
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    animationTimeouts.current.forEach(timeout => clearTimeout(timeout));
    animationTimeouts.current.clear();
    lastAnimationTime.current.clear();
  }, []);

  return {
    triggerPulseAnimation,
    triggerScrollInAnimation,
    cleanup,
  };
};