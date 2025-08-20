import { YahooOAuthConfig, YahooTokens, YahooUserInfo } from '../types/yahoo';

const YAHOO_CONFIG: YahooOAuthConfig = {
  clientId: "dj0yJmk9anVKMG9vdmJhZ0daJmQ9WVdrOVJ6UldjRWhrYkRJbWNHbzlNQT09JnM9Y29uc3VtZXJzZWNyZXQmc3Y9MCZ4PThh",
  redirectUri: `${window.location.origin}/auth/yahoo/callback`,
  scopes: ["fspt-r"]
};

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

  async exchangeCodeForTokens(code: string, state: string): Promise<YahooTokens> {
    // Validate state parameter
    const storedState = localStorage.getItem(STORAGE_KEYS.STATE);
    if (state !== storedState) {
      throw new Error('Invalid state parameter - potential CSRF attack');
    }
    
    // Clear stored state
    localStorage.removeItem(STORAGE_KEYS.STATE);

    // Exchange code for tokens via Supabase edge function for secure client secret handling
    const response = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w`
      },
      body: JSON.stringify({
        code,
        redirectUri: YAHOO_CONFIG.redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokenData = await response.json();
    const tokens: YahooTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      tokenType: tokenData.token_type || 'Bearer'
    };

    this.storeTokens(tokens);
    return tokens;
  }

  async refreshTokens(): Promise<YahooTokens> {
    const tokens = this.getStoredTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch('https://doyquitecogdnvbyiszt.supabase.co/functions/v1/yahoo-oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXF1aXRlY29nZG52Ynlpc3p0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU2ODg0OTMsImV4cCI6MjA3MTI2NDQ5M30.63TmTlCTK_jVJnG_4vuZWUwS--UcyNgOSem5tI7q_1w`
      },
      body: JSON.stringify({
        refreshToken: tokens.refreshToken,
        redirectUri: YAHOO_CONFIG.redirectUri
      })
    });

    if (!response.ok) {
      throw new Error('Token refresh failed');
    }

    const tokenData = await response.json();
    const newTokens: YahooTokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || tokens.refreshToken, // Use old refresh token if new one not provided
      expiresAt: Date.now() + (tokenData.expires_in * 1000),
      tokenType: tokenData.token_type || 'Bearer'
    };

    this.storeTokens(newTokens);
    return newTokens;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = this.getStoredTokens();
    if (!tokens) {
      throw new Error('No tokens available - user needs to authenticate');
    }

    // Check if token expires in the next 5 minutes, refresh if needed
    if (Date.now() + (5 * 60 * 1000) >= tokens.expiresAt) {
      const newTokens = await this.refreshTokens();
      return newTokens.accessToken;
    }

    return tokens.accessToken;
  }

  storeTokens(tokens: YahooTokens): void {
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
  }

  getStoredTokens(): YahooTokens | null {
    const tokensStr = localStorage.getItem(STORAGE_KEYS.TOKENS);
    if (!tokensStr) return null;
    
    try {
      return JSON.parse(tokensStr);
    } catch {
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
  }

  isConnected(): boolean {
    const tokens = this.getStoredTokens();
    return tokens !== null && Date.now() < tokens.expiresAt;
  }
}

export const yahooOAuth = YahooOAuthService.getInstance();