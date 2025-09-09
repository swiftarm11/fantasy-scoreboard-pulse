// src/utils/yahooOAuth.ts

import { STORAGE_KEYS, YAHOO_CONFIG, validateYahooConfig, YahooTokens } from './config';
import { generateRandomString, generateCodeChallenge } from './pkceUtils';
import { yahooLogger } from './yahooLogger';

export class YahooOAuthService {
  private tokens: YahooTokens | null = null;
  private userInfo: any = null;

  constructor() {
    validateYahooConfig();
    yahooLogger.info('OAUTH_SERVICE', 'YahooOAuthService initialized', {
      isConfigured: YAHOO_CONFIG.isConfigured
    });
  }

  // New helper for components that call isConfigured()
  isConfigured(): boolean {
    return YAHOO_CONFIG.isConfigured;
  }

  getConfigurationStatus() {
    return {
      isValid: YAHOO_CONFIG.isConfigured,
      missing: [] as string[]
    };
  }

  isConnected() {
    const tokens = this.getStoredTokens();
    const connected = !!tokens?.access_token;
    yahooLogger.debug('OAUTH_SERVICE', 'Connection status checked', {
      connected,
      hasTokens: !!tokens,
      hasAccessToken: !!tokens?.access_token
    });
    return connected;
  }

  getStoredTokens(): YahooTokens | null {
    if (!this.tokens) {
      const raw = localStorage.getItem(STORAGE_KEYS.TOKENS);
      this.tokens = raw ? JSON.parse(raw) : null;
      yahooLogger.logLocalStorage('OAUTH_SERVICE', 'tokens retrieved from localStorage');
    }
    if (this.tokens) {
      yahooLogger.logTokens('OAUTH_SERVICE', this.tokens, 'accessed');
    }
    return this.tokens;
  }

  getStoredUserInfo(): any {
    if (!this.userInfo) {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_INFO);
      this.userInfo = raw ? JSON.parse(raw) : null;
    }
    return this.userInfo;
  }

  disconnect() {
    yahooLogger.info('OAUTH_SERVICE', 'Starting disconnect process');
    yahooLogger.logLocalStorage('OAUTH_SERVICE', 'before disconnect');
    
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    this.tokens = null;
    this.userInfo = null;
    
    yahooLogger.info('OAUTH_SERVICE', 'Disconnect completed');
    yahooLogger.logLocalStorage('OAUTH_SERVICE', 'after disconnect');
  }

  async refreshTokens(): Promise<YahooTokens> {
    yahooLogger.info('OAUTH_SERVICE', 'Starting token refresh');
    
    const tokens = this.getStoredTokens();
    if (!tokens?.refresh_token) {
      yahooLogger.error('OAUTH_SERVICE', 'No refresh token available for refresh');
      throw new Error('No refresh token available');
    }

    const requestPayload = { refreshToken: tokens.refresh_token };
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(requestPayload)
    };

    yahooLogger.logAPICall('OAUTH_SERVICE', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, requestOptions);
    
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, requestOptions);
    
    if (!response.ok) {
      const errorText = await response.text();
      yahooLogger.error('OAUTH_SERVICE', 'Token refresh failed', {
        status: response.status,
        statusText: response.statusText,
        errorResponse: errorText
      });
      throw new Error(`Refresh token exchange failed: ${errorText}`);
    }
    
    const newTokens: YahooTokens = await response.json();
    yahooLogger.logTokens('OAUTH_SERVICE', newTokens, 'refreshed');
    this.storeTokens(newTokens);
    return newTokens;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = this.getStoredTokens();
    if (!tokens || !tokens.access_token) {
      yahooLogger.error('OAUTH_SERVICE', 'No valid access token available', {
        hasTokens: !!tokens,
        hasAccessToken: !!tokens?.access_token
      });
      throw new Error('REAUTH_REQUIRED');
    }

    // Check if token is expired
    if (tokens.expires_in) {
      const expirationTime = Date.now() + (tokens.expires_in * 1000);
      if (Date.now() >= expirationTime) {
        yahooLogger.warn('OAUTH_SERVICE', 'Access token expired, attempting refresh');
        try {
          const refreshedTokens = await this.refreshTokens();
          yahooLogger.debug('OAUTH_SERVICE', 'Token refreshed successfully', refreshedTokens.access_token.substring(0, 10) + '...');
          return refreshedTokens.access_token;
        } catch (error) {
          yahooLogger.error('OAUTH_SERVICE', 'Token refresh failed', error);
          throw new Error('REAUTH_REQUIRED');
        }
      }
    }
    
    yahooLogger.debug('OAUTH_SERVICE', 'Valid access token retrieved', tokens.access_token.substring(0, 10) + '...');
    return tokens.access_token;
  }

  storeUserInfo(info: any) {
    yahooLogger.info('OAUTH_SERVICE', 'Storing user info', {
      guid: info?.guid,
      nickname: info?.nickname
    });
    localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(info));
    this.userInfo = info;
    yahooLogger.logLocalStorage('OAUTH_SERVICE', 'after storing user info');
  }

  private storeTokens(tokens: YahooTokens) {
    yahooLogger.logTokens('OAUTH_SERVICE', tokens, 'stored');
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
    this.tokens = tokens;
    yahooLogger.logLocalStorage('OAUTH_SERVICE', 'after storing tokens');
  }

  async getAuthUrl(): Promise<string> {
    yahooLogger.info('OAUTH_SERVICE', 'Generating authorization URL');
    validateYahooConfig();
    
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(32);

    yahooLogger.debug('OAUTH_SERVICE', 'PKCE parameters generated', {
      codeVerifierLength: codeVerifier.length,
      codeChallengeLength: codeChallenge.length,
      stateLength: state.length
    });

    sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
    sessionStorage.setItem(STORAGE_KEYS.STATE, state);

    const params = new URLSearchParams({
      client_id: YAHOO_CONFIG.clientId,
      redirect_uri: YAHOO_CONFIG.redirectUri,
      response_type: 'code',
      scope: YAHOO_CONFIG.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
    yahooLogger.info('OAUTH_SERVICE', 'Authorization URL generated', {
      urlLength: authUrl.length,
      clientId: YAHOO_CONFIG.clientId.substring(0, 20) + '...',
      redirectUri: YAHOO_CONFIG.redirectUri
    });
    
    return authUrl;
  }

  async exchangeCodeForTokens(code: string, returnedState: string): Promise<YahooTokens> {
    yahooLogger.info('OAUTH_SERVICE', 'Starting code exchange for tokens', {
      hasCode: !!code,
      codeLength: code?.length || 0,
      hasState: !!returnedState,
      stateLength: returnedState?.length || 0
    });

    const storedState = sessionStorage.getItem(STORAGE_KEYS.STATE);
    const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);

    yahooLogger.debug('OAUTH_SERVICE', 'PKCE validation', {
      hasStoredState: !!storedState,
      hasCodeVerifier: !!codeVerifier,
      statesMatch: storedState === returnedState
    });

    if (storedState !== returnedState || !codeVerifier) {
      yahooLogger.error('OAUTH_SERVICE', 'PKCE validation failed', {
        storedState: storedState?.substring(0, 10) + '...',
        returnedState: returnedState?.substring(0, 10) + '...',
        hasCodeVerifier: !!codeVerifier
      });
      throw new Error('Invalid PKCE flow');
    }

    sessionStorage.removeItem(STORAGE_KEYS.STATE);
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);

    yahooLogger.info('OAUTH_SERVICE', 'Using Supabase edge function for token exchange');

    const requestPayload = {
      code,
      redirectUri: YAHOO_CONFIG.redirectUri,
      codeVerifier
    };

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify(requestPayload)
    };

    yahooLogger.logAPICall('OAUTH_SERVICE', `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, requestOptions);

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, requestOptions);

    if (!response.ok) {
      const errorText = await response.text();
      yahooLogger.error('OAUTH_SERVICE', 'Token exchange failed', {
        status: response.status,
        statusText: response.statusText,
        errorResponse: errorText
      });
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const tokens: YahooTokens = await response.json();
    yahooLogger.info('OAUTH_SERVICE', 'Token exchange successful via edge function');
    yahooLogger.logTokens('OAUTH_SERVICE', tokens, 'received from exchange');

    this.storeTokens(tokens);
    return tokens;
  }
}

export const yahooOAuth = new YahooOAuthService();
