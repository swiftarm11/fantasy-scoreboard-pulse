// src/utils/yahooOAuth.ts

import { STORAGE_KEYS, YAHOO_CONFIG, validateYahooConfig, YahooTokens } from './config';
import { generateRandomString, generateCodeChallenge } from './pkceUtils';

export class YahooOAuthService {
  private tokens: YahooTokens | null = null;
  private userInfo: any = null;

  constructor() {
    validateYahooConfig();
  }

  getConfigurationStatus() {
    return {
      isValid: YAHOO_CONFIG.isConfigured,
      missing: [] as string[]
    };
  }

  isConnected() {
    return !!this.getStoredTokens()?.access_token;
  }

  getStoredTokens(): YahooTokens | null {
    if (!this.tokens) {
      const raw = localStorage.getItem(STORAGE_KEYS.TOKENS);
      this.tokens = raw ? JSON.parse(raw) : null;
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
    localStorage.removeItem(STORAGE_KEYS.TOKENS);
    localStorage.removeItem(STORAGE_KEYS.USER_INFO);
    this.tokens = null;
    this.userInfo = null;
  }

  async refreshTokens(): Promise<YahooTokens> {
    const tokens = this.getStoredTokens();
    if (!tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }
    // Implement refresh via your edge function or direct server call
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        refreshToken: tokens.refresh_token
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Refresh token exchange failed: ${errorText}`);
    }
    const newTokens: YahooTokens = await response.json();
    this.storeTokens(newTokens);
    return newTokens;
  }

  async getValidAccessToken(): Promise<string> {
    const tokens = this.getStoredTokens();
    if (!tokens) throw new Error('Not authenticated');
    return tokens.access_token;
  }

  storeUserInfo(info: any) {
    localStorage.setItem(STORAGE_KEYS.USER_INFO, JSON.stringify(info));
    this.userInfo = info;
  }

  private storeTokens(tokens: YahooTokens) {
    localStorage.setItem(STORAGE_KEYS.TOKENS, JSON.stringify(tokens));
    this.tokens = tokens;
  }

  async getAuthUrl(): Promise<string> {
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

    return `https://api.login.yahoo.com/oauth2/request_auth?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, returnedState: string): Promise<YahooTokens> {
    const storedState = sessionStorage.getItem(STORAGE_KEYS.STATE);
    const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);

    if (storedState !== returnedState || !codeVerifier) {
      throw new Error('Invalid PKCE flow');
    }

    sessionStorage.removeItem(STORAGE_KEYS.STATE);
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);

    console.log('[YAHOO DEBUG] Using Supabase edge function for token exchange');

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        code,
        redirectUri: YAHOO_CONFIG.redirectUri,
        codeVerifier
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[YAHOO DEBUG] Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const tokens: YahooTokens = await response.json();
    console.log('[YAHOO DEBUG] Token exchange successful via edge function');

    this.storeTokens(tokens);
    return tokens;
  }
}

export const yahooOAuth = new YahooOAuthService();
