/**
 * Feature Flags
 * Central configuration for enabling/disabling major features
 */

export const FEATURE_FLAGS = {
  // KILL SWITCH: Completely disables live events system
  // Set to false when you're ready to enable live events again
  LIVE_EVENTS_DISABLED: true,
  
  // Additional feature flags for future use
  DEMO_MODE_ENABLED: false,
  YAHOO_OAUTH_ENABLED: true,
  SLEEPER_ENABLED: true,
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;
