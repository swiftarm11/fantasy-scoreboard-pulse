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
