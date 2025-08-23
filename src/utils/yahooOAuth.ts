import { STORAGE_KEYS, YAHOO_CONFIG, YahooTokens } from './config';
import { generateRandomString, generateCodeChallenge } from './pkceUtils';

export class YahooOAuthService {
  // Generate the Yahoo OAuth authorization URL with PKCE
  getAuthUrl(): string {
    if (!YAHOO_CONFIG.isConfigured) {
      throw new Error('Yahoo OAuth is not properly configured. Please check environment variables.');
    }

    // Generate PKCE parameters
    const codeVerifier = generateRandomString(128);
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateRandomString(32);

    console.log('Generated PKCE parameters:', {
      codeVerifierLength: codeVerifier.length,
      codeChallengeLength: codeChallenge.length,
      state: state.substring(0, 10) + '...'
    });

    // Store PKCE verifier and state in sessionStorage to survive redirects
    try {
      sessionStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);
      sessionStorage.setItem(STORAGE_KEYS.STATE, state);

      // Verify storage
      const storedVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);
      console.log('Code verifier storage verified:', storedVerifier === codeVerifier);
      if (!storedVerifier) {
        throw new Error('Failed to store code verifier in sessionStorage');
      }
    } catch (error) {
      console.error('sessionStorage error:', error);
      throw new Error('Cannot store OAuth state - sessionStorage may be disabled');
    }

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
    console.log('✅ OAuth URL generated with stored verifier');
    return authUrl;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code: string, returnedState: string): Promise<YahooTokens> {
    // Retrieve stored state and verifier
    const storedState = sessionStorage.getItem(STORAGE_KEYS.STATE);
    const codeVerifier = sessionStorage.getItem(STORAGE_KEYS.CODE_VERIFIER);

    if (!storedState || !codeVerifier) {
      throw new Error('Missing PKCE parameters in sessionStorage');
    }
    if (storedState !== returnedState) {
      throw new Error('Invalid state parameter');
    }

    // Clean up storage
    sessionStorage.removeItem(STORAGE_KEYS.STATE);
    sessionStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);

    console.log('PKCE parameters verified, proceeding with token exchange');

    // Prepare token request for PKCE (public client)
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: YAHOO_CONFIG.clientId,
      code,
      redirect_uri: YAHOO_CONFIG.redirectUri,
      code_verifier: codeVerifier
    });

    const response = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Yahoo token exchange error:', errorText);
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const tokenData: YahooTokens = await response.json();
    console.log('Yahoo token exchange successful');
    return tokenData;
  }

  // Check if configured
  isConfigured() {
    return YAHOO_CONFIG.isConfigured;
  }
}

export const yahooOAuth = new YahooOAuthService();
