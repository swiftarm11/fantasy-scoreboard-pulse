/**
 * Feature Flags
 * Central configuration for enabling/disabling major features
 */

export const FEATURE_FLAGS = {
  // ✅ ENABLED - Live events system is ready to go
  LIVE_EVENTS_DISABLED: false, // Changed from true
  
  // Additional feature flags
  DEMO_MODE_ENABLED: false,
  YAHOO_OAUTH_ENABLED: true,
  SLEEPER_ENABLED: true,
} as const;

export type FeatureFlags = typeof FEATURE_FLAGS;
