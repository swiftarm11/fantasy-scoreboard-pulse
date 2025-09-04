// src/utils/config.ts

export const STORAGE_KEYS = {
  TOKENS: 'yahoo_oauth_tokens',
  USER_INFO: 'yahoo_oauth_user_info',
  STATE: 'yahoo_oauth_state',
  CODE_VERIFIER: 'yahoo_oauth_code_verifier',
};

export interface YahooTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export interface YahooConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
  isConfigured: boolean;
}

// Load and validate environment variables
export const YAHOO_CONFIG: YahooConfig = {
  clientId: import.meta.env.VITE_YAHOO_CLIENT_ID!,
  redirectUri: import.meta.env.VITE_YAHOO_REDIRECT_URI!,
  scopes: ['fspt-r'],
  isConfigured:
    !!import.meta.env.VITE_YAHOO_CLIENT_ID &&
    !!import.meta.env.VITE_YAHOO_REDIRECT_URI,
};

// Helper to throw if misconfigured
export function validateYahooConfig(): void {
  if (!YAHOO_CONFIG.isConfigured) {
    throw new Error(
      'Yahoo OAuth not configured. Set VITE_YAHOO_CLIENT_ID and VITE_YAHOO_REDIRECT_URI.'
    );
  }
}
