export interface YahooOAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface YahooTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // timestamp in milliseconds
  tokenType: string;
}

export interface YahooUserInfo {
  guid: string;
  nickname: string;
  profile_url: string;
}

export interface YahooOAuthState {
  isConnected: boolean;
  userInfo: YahooUserInfo | null;
  tokens: YahooTokens | null;
  isLoading: boolean;
  error: string | null;
}