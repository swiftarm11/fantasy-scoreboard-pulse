import { YahooOAuthConfig, YahooTokens, YahooUserInfo } from '../types/yahoo';

// Yahoo OAuth Configuration Validation
export const validateYahooConfig = () => {
  const missing = [];
  if (!import.meta.env.VITE_YAHOO_CLIENT_ID) missing.push('VITE_YAHOO_CLIENT_ID');
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
    clientId: import.meta.env.VITE_YAHOO_CLIENT_ID || "dj0yJmk9dDNUTXlPRXp2WmtNJmQ9WVdrOVpHMTBhMnN6YkVrbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PTI5",
    redirectUri: import.meta.env.VITE_YAHOO_REDIRECT_URI || `${window.location.origin}/auth/yahoo/callback`,
    scopes: ["fspt-r"],
    isConfigured: validation.isValid
  };
};

const YAHOO_CONFIG = getYahooConfig();

// Debug log on startup
console.log('Yahoo OAuth Configuration Status:', {
  clientIdPresent: !!import.meta.env.VITE_YAHOO_CLIENT_ID,
  redirectUriPresent: !!import.meta.env.VITE_YAHOO_REDIRECT_URI,
  isConfigured: YAHOO_CONFIG.isConfigured
});

const STORAGE_KEYS = {
  TOKENS: 'yahoo_oauth_tokens',
  USER_INFO: 'yahoo_user_info',
  STATE: 'yahoo_oauth_state',
  CODE_VERIFIER: 'yahoo_code_verifier'
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

  // PKCE Helper Functions
  private generateRandomString(length: number): string {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, byte => 
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'[byte % 66]
    ).join('');
  }

  private async generateCodeChallenge(codeVerifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    
    // Convert to base64url
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  generateRandomState(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  async getAuthUrl(): Promise<string> {
    if (!YAHOO_CONFIG.isConfigured) {
      throw new Error('Yahoo OAuth is not properly configured. Please check environment variables.');
    }

    // Generate PKCE parameters
    const codeVerifier = this.generateRandomString(128);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateRandomState();

    // Store PKCE verifier and state
    localStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
    localStorage.setItem(STORAGE_KEYS.STATE, state);
    
    const params = new URLSearchParams({
      client_id: YAHOO_CONFIG.clientId,
      redirect_uri: YAHOO_CONFIG.redirectUri,
      response_type: 'code',
      scope: YAHOO_CONFIG.scopes.join(' '),
      state: state,
      // PKCE parameters - REQUIRED for public clients
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    console.log('Generated PKCE OAuth URL with parameters:', {
      clientId: YAHOO_CONFIG.clientId.substring(0, 20) + '...',
      redirectUri: YAHOO_CONFIG.redirectUri,
      codeChallenge: codeChallenge.substring(0, 20) + '...',
      codeChallengeMethod: 'S256'
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
    // Validate state parameter
    const storedState = localStorage.getItem(STORAGE_KEYS.STATE);
    if (state !== storedState) {
      throw new Error('Invalid state parameter - potential CSRF attack');
    }

    // Get code verifier for PKCE
    const codeVerifier = localStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
    if (!codeVerifier) {
      throw new Error('Code verifier not found - PKCE flow interrupted');
    }
    
    // Clear stored state and code verifier
    localStorage.removeItem(STORAGE_KEYS.STATE);
    localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);

    console.log('Exchanging code for tokens with PKCE...', {
      hasCode: !!code,
      hasCodeVerifier: !!codeVerifier,
      codeVerifierLength: codeVerifier.length
    });

    // Exchange code for tokens via Supabase edge function with PKCE
    const response = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        code,
        redirectUri: YAHOO_CONFIG.redirectUri,
        clientId: YAHOO_CONFIG.clientId,
        // PKCE parameter for token exchange
        codeVerifier: codeVerifier
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Token exchange failed:', error);
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    const tokens: YahooTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      tokenType: tokenData.token_type || 'Bearer'
    };

    console.log('Successfully exchanged code for tokens');
    this.storeTokens(tokens);
    return tokens;
  }

  async refreshTokens(): Promise<YahooTokens> {
    const tokens = this.getStoredTokens();
    if (!tokens?.refreshToken) {
      throw new Error('REAUTH_REQUIRED');
    }

    try {
      const response = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          refreshToken: tokens.refreshToken,
          redirectUri: YAHOO_CONFIG.redirectUri,
          clientId: YAHOO_CONFIG.clientId
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Clear invalid tokens and require re-authentication
          this.disconnect();
          throw new Error('REAUTH_REQUIRED');
        }
        
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const tokenData = await response.json();
      const newTokens: YahooTokens = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || tokens.refreshToken,
        expiresAt: Date.now() + (tokenData.expires_in * 1000),
        tokenType: tokenData.token_type || 'Bearer'
      };

      this.storeTokens(newTokens);
      return newTokens;
    } catch (error) {
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
      try {
        const newTokens = await this.refreshTokens();
        return newTokens.accessToken;
      } catch (error) {
        if (error instanceof Error && error.message === 'REAUTH_REQUIRED') {
          throw error;
        }
        // If refresh fails but token is still valid, return current token
        if (Date.now() < tokens.expiresAt) {
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
      throw error;
    }
  }

  storeTokens(tokens: YahooTokens): void {
    // Validate tokens before storing
    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new Error('Invalid tokens: missing required fields');
    }
    
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
  }

  getStoredTokens(): YahooTokens | null {
    const tokensStr = localStorage.getItem(STORAGE_KEYS.TOKENS);
    if (!tokensStr) return null;
    
    try {
      const tokens = JSON.parse(tokensStr);
      
      // Validate stored tokens
      if (!this.validateTokens(tokens)) {
        this.disconnect();
        return null;
      }
      
      return tokens;
    } catch (error) {
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
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    localStorage.removeItem(STORAGE_KEYS.STATE);
    localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
  }

  isConnected(): boolean {
    const tokens = this.getStoredTokens();
    if (!tokens) return false;
    
    // Consider token valid if it doesn't expire in the next minute
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
      return false;
    }
    
    return true;
  }
}

export const yahooOAuth = YahooOAuthService.getInstance();
