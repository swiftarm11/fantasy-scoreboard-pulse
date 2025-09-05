// src/utils/yahooOAuth.ts

import { STORAGE_KEYS, YAHOO_CONFIG, validateYahooConfig, YahooTokens } from './config';
import { generateRandomString, generateCodeChallenge } from './pkceUtils';
import { yahooLogger } from './yahooLogger';

interface RequestCache {
  [key: string]: {
    promise: Promise<any>;
    timestamp: number;
  };
}

export class YahooOAuthService {
  private tokens: YahooTokens | null = null;
  private userInfo: any = null;
  private requestCache: RequestCache = {};
  private isRefreshing = false;
  private refreshPromise: Promise<YahooTokens> | null = null;
  
  // Rate limiting constants
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly CACHE_DURATION = 5000; // 5 seconds to prevent duplicate requests
  private readonly TOKEN_BUFFER_TIME = 300; // 5 minutes buffer before token expires

  constructor() {
    this.initializeFromStorage();
  }

  private initializeFromStorage(): void {
    try {
      const storedTokens = sessionStorage.getItem(STORAGE_KEYS.TOKENS);
      const storedUserInfo = sessionStorage.getItem(STORAGE_KEYS.USER_INFO);
      
      if (storedTokens) {
        this.tokens = JSON.parse(storedTokens);
        yahooLogger.debug('initializeFromStorage', 'Tokens loaded from storage');
      }
      
      if (storedUserInfo) {
        this.userInfo = JSON.parse(storedUserInfo);
        yahooLogger.debug('initializeFromStorage', 'User info loaded from storage');
      }
    } catch (error) {
      yahooLogger.error('initializeFromStorage', 'Failed to load from storage:', error);
      this.clearStorage();
    }
  }

  public async startAuthFlow(): Promise<string> {
    try {
      validateYahooConfig();
      
      const state = generateRandomString(32);
      const codeVerifier = generateRandomString(128);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      
      // Store state and code_verifier in sessionStorage
      sessionStorage.setItem(STORAGE_KEYS.STATE, state);
      sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
      
      const authUrl = new URL('https://api.login.yahoo.com/oauth2/request_auth');
      authUrl.searchParams.set('client_id', YAHOO_CONFIG.clientId);
      authUrl.searchParams.set('redirect_uri', YAHOO_CONFIG.redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', YAHOO_CONFIG.scopes.join(' '));
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      
      yahooLogger.debug('startAuthFlow', 'Starting auth flow with URL:', authUrl.toString());
      return authUrl.toString();
    } catch (error) {
      yahooLogger.error('startAuthFlow', 'Failed to start auth flow:', error);
      throw error;
    }
  }

  public async handleCallback(code: string, state: string): Promise<YahooTokens> {
    try {
      const storedState = sessionStorage.getItem(STORAGE_KEYS.STATE);
      const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
      
      if (!storedState || storedState !== state) {
        throw new Error('Invalid state parameter');
      }
      
      if (!codeVerifier) {
        throw new Error('Code verifier not found');
      }
      
      const tokens = await this.exchangeCodeForTokensInternal(code, codeVerifier);
      
      // Clean up temporary storage
      sessionStorage.removeItem(STORAGE_KEYS.STATE);
      sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
      
      // Store tokens and fetch user info
      this.tokens = tokens;
      sessionStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
      
      await this.fetchUserInfo();
      
      yahooLogger.info('handleCallback', 'OAuth callback handled successfully');
      return tokens;
    } catch (error) {
      yahooLogger.error('handleCallback', 'Failed to handle callback:', error);
      throw error;
    }
  }

  private async exchangeCodeForTokensInternal(code: string, codeVerifier: string): Promise<YahooTokens> {
    const response = await fetch('/api/yahoo-oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: YAHOO_CONFIG.redirectUri,
        client_id: YAHOO_CONFIG.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return response.json();
  }

  private async fetchUserInfo(): Promise<void> {
    if (!this.tokens?.access_token) {
      throw new Error('No access token available');
    }

    try {
      const response = await this.makeAuthenticatedRequest('/api/yahoo-api', {
        endpoint: 'users;use_login=1'
      });

      this.userInfo = response.fantasy_content?.users?.[0]?.user?.[0];
      if (this.userInfo) {
        sessionStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(this.userInfo));
        yahooLogger.debug('fetchUserInfo', 'User info fetched successfully');
      }
    } catch (error) {
      yahooLogger.error('fetchUserInfo', 'Failed to fetch user info:', error);
    }
  }

  public async makeAuthenticatedRequest(url: string, options: any = {}): Promise<any> {
    if (!this.tokens?.access_token) {
      throw new Error('No access token available');
    }

    // Check if token needs refresh
    if (this.shouldRefreshToken()) {
      await this.refreshAccessToken();
    }

    const cacheKey = `${url}-${JSON.stringify(options)}`;
    const cached = this.requestCache[cacheKey];
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      yahooLogger.debug('makeAuthenticatedRequest', 'Returning cached response');
      return cached.promise;
    }

    const requestPromise = this.performRequest(url, options);
    this.requestCache[cacheKey] = {
      promise: requestPromise,
      timestamp: Date.now()
    };

    // Clean up old cache entries
    this.cleanupCache();

    return requestPromise;
  }

  private async performRequest(url: string, options: any): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tokens!.access_token}`,
        },
        body: JSON.stringify(options),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          yahooLogger.warn('performRequest', 'Token expired, refreshing...');
          await this.refreshAccessToken();
          // Retry with new token
          return this.performRequest(url, options);
        }
        throw new Error(`Request failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  private shouldRefreshToken(): boolean {
    if (!this.tokens?.expires_in) return false;
    
    const expirationTime = (this.tokens.expires_in * 1000) - this.TOKEN_BUFFER_TIME * 1000;
    return Date.now() >= expirationTime;
  }

  private async refreshAccessToken(): Promise<YahooTokens> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    this.isRefreshing = true;
    this.refreshPromise = this.performTokenRefresh();

    try {
      const newTokens = await this.refreshPromise;
      this.tokens = newTokens;
      sessionStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(newTokens));
      yahooLogger.info('refreshAccessToken', 'Access token refreshed successfully');
      return newTokens;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<YahooTokens> {
    const response = await fetch('/api/yahoo-oauth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        refresh_token: this.tokens!.refresh_token,
        client_id: YAHOO_CONFIG.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    return response.json();
  }

  private cleanupCache(): void {
    const now = Date.now();
    Object.keys(this.requestCache).forEach(key => {
      if (now - this.requestCache[key].timestamp > this.CACHE_DURATION * 2) {
        delete this.requestCache[key];
      }
    });
  }

  public isAuthenticated(): boolean {
    return !!this.tokens?.access_token;
  }

  public getTokens(): YahooTokens | null {
    return this.tokens;
  }

  public getUserInfo(): any {
    return this.userInfo;
  }

  public logout(): void {
    this.tokens = null;
    this.userInfo = null;
    this.requestCache = {};
    this.clearStorage();
    yahooLogger.info('logout', 'User logged out');
  }

  // Additional methods expected by components
  public getConfigurationStatus(): { isValid: boolean; missing: string[]; isConfigured?: boolean; clientId?: string; redirectUri?: string } {
    const missing: string[] = [];
    
    if (!YAHOO_CONFIG.clientId) missing.push('VITE_YAHOO_CLIENT_ID');
    if (!YAHOO_CONFIG.redirectUri) missing.push('VITE_YAHOO_REDIRECT_URI');
    
    return {
      isValid: missing.length === 0,
      missing,
      isConfigured: YAHOO_CONFIG.isConfigured,
      clientId: YAHOO_CONFIG.clientId,
      redirectUri: YAHOO_CONFIG.redirectUri
    };
  }

  public isConfigured(): boolean {
    return YAHOO_CONFIG.isConfigured;
  }

  public isConnected(): boolean {
    return this.isAuthenticated();
  }

  public getStoredTokens(): YahooTokens | null {
    return this.getTokens();
  }

  public getStoredUserInfo(): any {
    return this.getUserInfo();
  }

  public disconnect(): void {
    this.logout();
  }

  public async refreshTokens(): Promise<YahooTokens> {
    return this.refreshAccessToken();
  }

  public async getAuthUrl(): Promise<string> {
    return this.startAuthFlow();
  }

  public async getValidAccessToken(): Promise<string> {
    if (!this.tokens?.access_token) {
      throw new Error('No access token available');
    }

    if (this.shouldRefreshToken()) {
      await this.refreshAccessToken();
    }

    return this.tokens.access_token;
  }

  public storeUserInfo(userInfo: any): void {
    this.userInfo = userInfo;
    if (userInfo) {
      sessionStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(userInfo));
    }
  }

  // Make exchangeCodeForTokens public
  public async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<YahooTokens> {
    const response = await fetch('/api/yahoo-oauth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        redirect_uri: YAHOO_CONFIG.redirectUri,
        client_id: YAHOO_CONFIG.clientId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    return response.json();
  }

  private clearStorage(): void {
    sessionStorage.removeItem(STORAGE_KEYS.TOKENS);
    sessionStorage.removeItem(STORAGE_KEYS.USER_INFO);
    sessionStorage.removeItem(STORAGE_KEYS.STATE);
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
  }
}

// Export singleton instance
export const yahooOAuth = new YahooOAuthService();