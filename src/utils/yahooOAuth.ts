import { YahooOAuthConfig, YahooTokens, YahooUserInfo } from '../types/yahoo';
import { yahooLogger } from './yahooLogger';

// Yahoo OAuth Configuration Validation
export const validateYahooConfig = () => {
  const missing = [];
  if (!import.meta.env.VITE_YAHOO_CLIENT_ID) missing.push('VITE_YAHOO_CLIENT_ID');
  if (!import.meta.env.VITE_YAHOO_CLIENT_SECRET) missing.push('VITE_YAHOO_CLIENT_SECRET');
  if (!import.meta.env.VITE_YAHOO_REDIRECT_URI) missing.push('VITE_YAHOO_REDIRECT_URI');

  if (missing.length > 0) {
    console.error('Missing Yahoo OAuth environment variables:', missing);
    return { isValid: false, missing };
  }
  return { isValid: true, missing: [] };
};

// Yahoo OAuth Configuration with Environment Variables
const getYahooConfig = (): YahooOAuthConfig & { isConfigured: boolean } => {
  const validation = validateYahooConfig();
  
  return {
    clientId: import.meta.env.VITE_YAHOO_CLIENT_ID || "dj0yJmk9anVKMG9vdmJhZ0daJmQ9WVdrOVJ6UldqRWhrYkJWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3M9Y29uc3VtZXJzZWNyZXQ-",
    redirectUri: import.meta.env.VITE_YAHOO_REDIRECT_URI || `${window.location.origin}/auth/yahoo/callback`,
    scopes: ["fspt-r"],
    isConfigured: validation.isValid
  };
};

const YAHOO_CONFIG = getYahooConfig();

// Debug logging for environment variable status
console.log('Yahoo OAuth Configuration Status:', {
  clientIdPresent: !!import.meta.env.VITE_YAHOO_CLIENT_ID,
  clientSecretPresent: !!import.meta.env.VITE_YAHOO_CLIENT_SECRET,
  redirectUriPresent: !!import.meta.env.VITE_YAHOO_REDIRECT_URI,
  fallbackClientId: "dj0yJmk9anVKMG9vdmJhZ0daJmQ9WVdrOVJ6UldqRWhrYkJWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3M9Y29uc3VtZXJzZWNyZXQ-",
  isConfigured: YAHOO_CONFIG.isConfigured
});

const STORAGE_KEYS = {
  TOKENS: 'yahoo_oauth_tokens',
  USER_INFO: 'yahoo_user_info',
  STATE: 'yahoo_oauth_state'
};

export class YahooOAuthService {
  private static instance: YahooOAuthService;

  private constructor() {}

  static getInstance(): YahooOAuthService {
    if (!YahooOAuthService.instance) {
      YahooOAuthService.instance = new YahooOAuthService();
    }
    return YahooOAuthService.instance;
  }

  generateRandomState(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  getAuthUrl(): string {
    if (!YAHOO_CONFIG.isConfigured) {
      throw new Error('Yahoo OAuth is not properly configured. Please check environment variables.');
    }

    const state = this.generateRandomState();
    localStorage.setItem(STORAGE_KEYS.STATE, state);
    
    const params = new URLSearchParams({
      client_id: YAHOO_CONFIG.clientId,
      redirect_uri: YAHOO_CONFIG.redirectUri,
      response_type: 'code',
      scope: YAHOO_CONFIG.scopes.join(' '),
      state: state
    });

    return `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  }

  isConfigured(): boolean {
    return YAHOO_CONFIG.isConfigured;
  }

  getConfigurationStatus(): { isValid: boolean; missing: string[] } {
    return validateYahooConfig();
  }

  async exchangeCodeForTokens(code: string, state: string): Promise<YahooTokens> {
    yahooLogger.info('OAUTH', 'Starting token exchange', { 
      hasCode: !!code, 
      hasState: !!state,
      codePreview: code?.substring(0, 10) + '...'
    });

    // Validate state parameter
    const storedState = localStorage.getItem(STORAGE_KEYS.STATE);
    if (state !== storedState) {
      yahooLogger.error('OAUTH', 'State parameter validation failed', {
        providedState: state?.substring(0, 10) + '...',
        storedState: storedState?.substring(0, 10) + '...'
      });
      throw new Error('Invalid state parameter - potential CSRF attack');
    }
    
    // Clear stored state
    localStorage.removeItem(STORAGE_KEYS.STATE);
    yahooLogger.debug('OAUTH', 'State validation passed, cleared stored state');

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        code,
        redirectUri: YAHOO_CONFIG.redirectUri
      })
    };

    yahooLogger.logAPICall('OAUTH', 'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions);

    // Exchange code for tokens via Supabase edge function for secure client secret handling
    const response = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions);

    yahooLogger.logAPICall('OAUTH', 'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions, response);

    if (!response.ok) {
      const error = await response.text();
      yahooLogger.error('OAUTH', 'Token exchange failed', {
        status: response.status,
        statusText: response.statusText,
        error
      });
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    yahooLogger.info('OAUTH', 'Token exchange successful', {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type
    });

    const tokens: YahooTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      tokenType: tokenData.token_type || 'Bearer'
    };

    yahooLogger.logTokens('OAUTH', tokens, 'exchanged');
    this.storeTokens(tokens);
    return tokens;
  }

  async refreshTokens(): Promise<YahooTokens> {
    const tokens = this.getStoredTokens();
    yahooLogger.logTokens('OAUTH_REFRESH', tokens, 'current before refresh');
    
    if (!tokens?.refreshToken) {
      yahooLogger.error('OAUTH_REFRESH', 'No refresh token available', { hasTokens: !!tokens });
      throw new Error('REAUTH_REQUIRED');
    }

    yahooLogger.info('OAUTH_REFRESH', 'Starting token refresh');

    try {
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          refreshToken: tokens.refreshToken,
          redirectUri: YAHOO_CONFIG.redirectUri
        })
      };

      yahooLogger.logAPICall('OAUTH_REFRESH', 'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions);

      const response = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions);

      yahooLogger.logAPICall('OAUTH_REFRESH', 'https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', requestOptions, response);

      if (!response.ok) {
        const errorText = await response.text();
        yahooLogger.error('OAUTH_REFRESH', 'Token refresh failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
        if (response.status === 401) {
          yahooLogger.warn('OAUTH_REFRESH', 'Received 401, clearing tokens and requiring re-auth');
          // Clear invalid tokens and require re-authentication
          this.disconnect();
          throw new Error('REAUTH_REQUIRED');
        }
        
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const tokenData = await response.json();
      yahooLogger.info('OAUTH_REFRESH', 'Token refresh successful', {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresIn: tokenData.expires_in
      });

      const newTokens: YahooTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || tokens.refreshToken,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        tokenType: tokenData.token_type || 'Bearer'
      };

      yahooLogger.logTokens('OAUTH_REFRESH', newTokens, 'refreshed');
      this.storeTokens(newTokens);
      yahooLogger.info('OAUTH_REFRESH', 'Successfully refreshed Yahoo OAuth tokens');
      return newTokens;
    } catch (error) {
      yahooLogger.error('OAUTH_REFRESH', 'Token refresh error', { 
        error: error instanceof Error ? error.message : error,
        currentRefreshToken: tokens?.refreshToken?.substring(0, 15) + '...'
      });
      if (error instanceof Error && error.message === 'REAUTH_REQUIRED') {
        throw error;
      }
      throw new Error('Token refresh failed');
    }
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = this.getStoredTokens();
    if (!tokens) {
      throw new Error('REAUTH_REQUIRED');
    }

    // Proactive refresh: Check if token expires in the next 5 minutes
    const fiveMinutesFromNow = Date.now() + (5 * 60 * 1000);
    
    if (tokens.expiresAt <= fiveMinutesFromNow) {
      console.log('Access token expires soon, refreshing proactively...');
      try {
        const newTokens = await this.refreshTokens();
        return newTokens.accessToken;
      } catch (error) {
        console.error('Proactive token refresh failed:', error);
        if (error instanceof Error && error.message === 'REAUTH_REQUIRED') {
          throw error;
        }
        // If refresh fails but token is still valid, return current token
        if (Date.now() < tokens.expiresAt) {
          console.warn('Using potentially expiring token due to refresh failure');
          return tokens.accessToken;
        }
        throw error;
      }
    }

    return tokens.accessToken;
  }

  // Method to handle API call with automatic 401 recovery
  async makeAuthenticatedRequest(url: string, options: RequestInit = {}): Promise<Response> {
    try {
      const accessToken = await this.getValidAccessToken();
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      // Handle 401 errors with token refresh retry
      if (response.status === 401) {
        console.log('Received 401, attempting token refresh...');
        try {
          const newTokens = await this.refreshTokens();
          
          // Retry the request with new token
          const retryResponse = await fetch(url, {
            ...options,
            headers: {
              ...options.headers,
              'Authorization': `Bearer ${newTokens.accessToken}`,
              'Accept': 'application/json'
            }
          });

          if (retryResponse.status === 401) {
            // Still getting 401 after refresh, require re-authentication
            this.disconnect();
            throw new Error('REAUTH_REQUIRED');
          }

          return retryResponse;
        } catch (refreshError) {
          console.error('Token refresh failed after 401:', refreshError);
          if (refreshError instanceof Error && refreshError.message === 'REAUTH_REQUIRED') {
            throw refreshError;
          }
          throw new Error('REAUTH_REQUIRED');
        }
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.message === 'REAUTH_REQUIRED') {
        throw error;
      }
      console.error('Authenticated request failed:', error);
      throw error;
    }
  }

  storeTokens(tokens: YahooTokens): void {
    yahooLogger.logTokens('STORAGE', tokens, 'storing');
    
    // Validate tokens before storing
    if (!tokens.accessToken || !tokens.refreshToken) {
      yahooLogger.error('STORAGE', 'Invalid tokens: missing required fields', tokens);
      throw new Error('Invalid tokens: missing required fields');
    }
    
    // Ensure expiresAt is properly calculated
    if (!tokens.expiresAt || tokens.expiresAt <= Date.now()) {
      yahooLogger.warn('STORAGE', 'Invalid or past expiry time for tokens', {
        expiresAt: tokens.expiresAt,
        now: Date.now(),
        isPast: tokens.expiresAt <= Date.now()
      });
    }
    
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
    yahooLogger.logLocalStorage('STORAGE', 'after storing tokens');
    yahooLogger.info('STORAGE', 'Stored Yahoo OAuth tokens', {
      expiresAt: new Date(tokens.expiresAt).toISOString()
    });
  }

  getStoredTokens(): YahooTokens | null {
    const tokensStr = localStorage.getItem(STORAGE_KEYS.TOKENS);
    yahooLogger.debug('STORAGE', 'Retrieving stored tokens', { hasTokensString: !!tokensStr });
    
    if (!tokensStr) {
      yahooLogger.debug('STORAGE', 'No tokens found in localStorage');
      return null;
    }
    
    try {
      const tokens = JSON.parse(tokensStr);
      yahooLogger.logTokens('STORAGE', tokens, 'retrieved');
      
      // Validate stored tokens
      if (!this.validateTokens(tokens)) {
        yahooLogger.warn('STORAGE', 'Stored tokens are invalid, clearing...');
        this.disconnect();
        return null;
      }
      
      return tokens;
    } catch (error) {
      yahooLogger.error('STORAGE', 'Failed to parse stored tokens', { 
        error: error instanceof Error ? error.message : error,
        tokensStringLength: tokensStr.length 
      });
      localStorage.removeItem(STORAGE_KEYS.TOKENS);
      return null;
    }
  }

  storeUserInfo(userInfo: YahooUserInfo): void {
    localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo));
  }

  getStoredUserInfo(): YahooUserInfo | null {
    const userInfoStr = localStorage.getItem(STORAGE_KEYS.USER_INFO);
    if (!userInfoStr) return null;
    
    try {
      return JSON.parse(userInfoStr);
    } catch {
      return null;
    }
  }

  disconnect(): void {
    yahooLogger.info('OAUTH', 'Disconnecting - clearing all stored data');
    yahooLogger.logLocalStorage('OAUTH', 'before disconnect');
    
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    localStorage.removeItem(STORAGE_KEYS.STATE);
    
    yahooLogger.logLocalStorage('OAUTH', 'after disconnect');
    yahooLogger.info('OAUTH', 'Successfully disconnected and cleared all data');
  }

  isConnected(): boolean {
    const tokens = this.getStoredTokens();
    if (!tokens) return false;
    
    // Consider token valid if it doesn't expire in the next minute
    // This gives us buffer time for API calls
    const oneMinuteFromNow = Date.now() + (60 * 1000);
    return tokens.expiresAt > oneMinuteFromNow;
  }

  // Validate token format and expiry
  validateTokens(tokens: YahooTokens): boolean {
    if (!tokens.accessToken || !tokens.refreshToken) {
      return false;
    }
    
    // Check if token is expired
    if (Date.now() >= tokens.expiresAt) {
      console.warn('Stored tokens are expired');
      return false;
    }
    
    return true;
  }
}

export const yahooOAuth = YahooOAuthService.getInstance();