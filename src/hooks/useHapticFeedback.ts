import { useCallback } from 'react';
import { useDeviceCapabilities } from './use-mobile';

interface HapticFeedbackOptions {
  pattern?: number | number[];
  intensity?: 'light' | 'medium' | 'heavy';
}

export const useHapticFeedback = () => {
  const { hasHaptics } = useDeviceCapabilities();

  const triggerHapticFeedback = useCallback((
    type: 'success' | 'error' | 'warning' | 'selection' | 'impact' | 'notification' | 'custom',
    options: HapticFeedbackOptions = {}
  ) => {
    if (!hasHaptics) return;

    const { pattern, intensity = 'medium' } = options;

    // Web Vibration API patterns
    const patterns = {
      success: [100, 50, 100],
      error: [200, 100, 200, 100, 200],
      warning: [150, 75, 150],
      selection: [50],
      impact: [75],
      notification: [100, 50, 100, 50, 100],
      custom: Array.isArray(pattern) ? pattern : [pattern || 100]
    };

    try {
      // Use the pattern for the specified type
      const vibrationPattern = patterns[type];
      
      // Adjust intensity (multiply by factor)
      const intensityMultiplier = {
        light: 0.5,
        medium: 1,
        heavy: 1.5
      }[intensity];

      const adjustedPattern = vibrationPattern.map(duration => 
        Math.round(duration * intensityMultiplier)
      );

      navigator.vibrate?.(adjustedPattern);
    } catch (error) {
      // Silently fail if vibration is not supported or fails
      console.debug('Haptic feedback failed:', error);
    }
  }, [hasHaptics]);

  // Convenience methods for common haptic patterns
  const haptic = {
    success: useCallback(() => triggerHapticFeedback('success'), [triggerHapticFeedback]),
    error: useCallback(() => triggerHapticFeedback('error'), [triggerHapticFeedback]),
    warning: useCallback(() => triggerHapticFeedback('warning'), [triggerHapticFeedback]),
    selection: useCallback(() => triggerHapticFeedback('selection'), [triggerHapticFeedback]),
    impact: useCallback(() => triggerHapticFeedback('impact'), [triggerHapticFeedback]),
    notification: useCallback(() => triggerHapticFeedback('notification'), [triggerHapticFeedback]),
    
    // Specific actions
    leagueAdded: useCallback(() => triggerHapticFeedback('success'), [triggerHapticFeedback]),
    leagueRemoved: useCallback(() => triggerHapticFeedback('warning'), [triggerHapticFeedback]),
    settingsSaved: useCallback(() => triggerHapticFeedback('success'), [triggerHapticFeedback]),
    buttonPress: useCallback(() => triggerHapticFeedback('selection'), [triggerHapticFeedback]),
    switchToggle: useCallback(() => triggerHapticFeedback('selection'), [triggerHapticFeedback]),
    pullToRefresh: useCallback(() => triggerHapticFeedback('impact'), [triggerHapticFeedback]),
    dataRefreshed: useCallback(() => triggerHapticFeedback('success', { intensity: 'light' }), [triggerHapticFeedback]),
    connectionError: useCallback(() => triggerHapticFeedback('error'), [triggerHapticFeedback]),
    connectionRestored: useCallback(() => triggerHapticFeedback('success', { intensity: 'light' }), [triggerHapticFeedback])
  };

  return {
    triggerHapticFeedback,
    haptic,
    hasHaptics
  };
};