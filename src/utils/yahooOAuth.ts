// src/utils/yahooOAuth.ts

import { STORAGE_KEYS, YAHOO_CONFIG, validateYahooConfig, YahooTokens } from './config';
import { generateRandomString, generateCodeChallenge } from './pkceUtils';

export class YahooOAuthService {
  private tokens: YahooTokens | null = null;
  private userInfo: any = null;

  constructor() {
    validateYahooConfig();
  }

  // 1. Configuration status
  getConfigurationStatus() {
    return {
      isValid: YAHOO_CONFIG.isConfigured,
      missing: [] as string[]
    };
  }

  // 2. Connection status
  isConnected() {
    return !!this.getStoredTokens()?.access_token;
  }

  // 3. Get stored tokens
  getStoredTokens(): YahooTokens | null {
    if (!this.tokens) {
      const raw = localStorage.getItem(STORAGE_KEYS.TOKENS);
      this.tokens = raw ? JSON.parse(raw) : null;
    }
    return this.tokens;
  }

  // 4. Get stored user info
  getStoredUserInfo(): any {
    if (!this.userInfo) {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_INFO);
      this.userInfo = raw ? JSON.parse(raw) : null;
    }
    return this.userInfo;
  }

  // 5. Disconnect (clear everything)
  disconnect() {
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    this.tokens = null;
    this.userInfo = null;
  }

  // 6. Refresh tokens
  async refreshTokens(): Promise<YahooTokens> {
    const tokens = this.getStoredTokens();
    if (!tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }
    // Exchange refresh token on server or directly here
    const response = await fetch('/api/refresh-yahoo-token', { /* ... */ });
    const newTokens = await response.json();
    this.storeTokens(newTokens);
    return newTokens;
  }

  // 7. Get valid access token
  async getValidAccessToken(): Promise<string> {
    const tokens = this.getStoredTokens();
    if (!tokens) throw new Error('Not authenticated');
    // Optionally check expiry and refresh
    return tokens.access_token;
  }

  // 8. Store user info
  storeUserInfo(info: any) {
    localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(info));
    this.userInfo = info;
  }

  // 9. Store tokens helper
  private storeTokens(tokens: YahooTokens) {
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
    this.tokens = tokens;
  }

  // PKCE flow methods
  async getAuthUrl(): Promise<string> {
    // (same as before, but await generateCodeChallenge)
    validateYahooConfig();
    const codeVerifier = generateRandomString(128);
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateRandomString(32);
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
    return `https://api.login.yahoo.com/oauth2/request_auth?${params}`;
  }

  async exchangeCodeForTokens(code: string, returnedState: string): Promise<YahooTokens> {
    const storedState = sessionStorage.getItem(STORAGE_KEYS.STATE);
    const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
    if (storedState !== returnedState || !codeVerifier) throw new Error('Invalid PKCE flow');
    sessionStorage.removeItem(STORAGE_KEYS.STATE);
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: YAHOO_CONFIG.clientId,
      code,
      redirect_uri: YAHOO_CONFIG.redirectUri,
      code_verifier: codeVerifier
    });
    const res = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: params
    });
    if (!res.ok) throw new Error('Token exchange failed');
    const tokens = await res.json();
    this.storeTokens(tokens);
    return tokens;
  }
}

export const yahooOAuth = new YahooOAuthService();
