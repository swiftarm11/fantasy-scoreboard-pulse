export interface YahooOAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface YahooTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
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